import { DarajaClient } from "./daraja.client"
import {
    MpesaStatus,
    MpesaModuleOptions,
    MpesaTransactionRecord,
    ReconciliationLogRecord,
    DarajaCallbackBody,
} from "./types"
import {
    generateId,
    extractMetaValue,
    nowEAT,
} from "./utils"
import { txStore, reconLogStore, auditLogStore } from "./store"
import { logInfo, logError } from "./logger"

// ─────────────────────────────────────────────
//  MpesaService – Business Logic Layer
//  Persistence: file-backed store (swap to DB in prod)
// ─────────────────────────────────────────────
export class MpesaService {
    private daraja: DarajaClient
    private opts: MpesaModuleOptions

    constructor(daraja: DarajaClient, opts: MpesaModuleOptions) {
        this.daraja = daraja
        this.opts = opts
    }

    // ── Initiate STK Push (idempotent) ───────────
    async initiateSTKPush(params: {
        orderId: string
        customerId?: string
        phone: string
        amount: number
        reference: string
    }): Promise<MpesaTransactionRecord> {
        const existing = this.findByOrderId(params.orderId)
        if (existing && existing.status === MpesaStatus.PENDING) {
            logInfo("Returning existing pending transaction", { orderId: params.orderId, id: existing.id })
            return existing
        }

        const stkResp = await this.daraja.initiateSTKPush({
            amount: params.amount,
            phone: params.phone,
            reference: params.reference,
        })

        const tx: MpesaTransactionRecord = {
            id: generateId(),
            orderId: params.orderId,
            customerId: params.customerId,
            phoneNumber: params.phone,
            merchantRequestId: stkResp.MerchantRequestID,
            checkoutRequestId: stkResp.CheckoutRequestID,
            amount: params.amount,
            currency: "KES",
            status: MpesaStatus.PENDING,
            riskScore: 0,
            riskFlags: [],
            createdAt: nowEAT(),
            updatedAt: nowEAT(),
        }

        txStore.set(tx)
        logInfo("STK Push initiated", { id: tx.id, phone: params.phone, amount: params.amount })
        return tx
    }

    // ── Confirm Payment from Callback ─────────────
    async confirmFromCallback(
        callback: DarajaCallbackBody,
        riskScore: number,
        riskFlags: string[]
    ): Promise<MpesaTransactionRecord | null> {
        const stk = callback.Body.stkCallback
        const items = stk.CallbackMetadata?.Item ?? []
        const receipt = String(extractMetaValue(items, "MpesaReceiptNumber") ?? "")

        const tx = this.findByCheckoutRequestId(stk.CheckoutRequestID)
        if (!tx) {
            logError("No transaction found for CheckoutRequestID", { crq: stk.CheckoutRequestID })
            return null
        }

        let newStatus: MpesaStatus
        if (stk.ResultCode === 0) {
            newStatus = riskScore > 50 ? MpesaStatus.UNDER_REVIEW : MpesaStatus.AUTHORIZED
        } else {
            newStatus = MpesaStatus.FAILED
        }

        const updated = txStore.update(tx.id, {
            status: newStatus,
            mpesaReceipt: receipt || undefined,
            riskScore,
            riskFlags,
            rawCallbackPayload: callback as unknown as Record<string, unknown>,
        })

        logInfo("Callback confirmed", { id: tx.id, status: newStatus, receipt, riskScore })
        return updated
    }

    // ── Capture ───────────────────────────────────
    async capture(transactionId: string): Promise<MpesaTransactionRecord | null> {
        const updated = txStore.update(transactionId, { status: MpesaStatus.CAPTURED })
        if (updated) logInfo("Transaction captured", { id: transactionId })
        return updated
    }

    // ── Approve (admin fraud review) ──────────────
    async approve(transactionId: string, adminId: string, note?: string): Promise<MpesaTransactionRecord | null> {
        const updated = txStore.update(transactionId, { status: MpesaStatus.AUTHORIZED })
        auditLogStore.add({ adminId, action: "APPROVED", transactionId, reason: note ?? "Manual approval" })
        logInfo("Transaction approved by admin", { id: transactionId, adminId })
        return updated
    }

    // ── Reject (admin fraud review) ───────────────
    async reject(transactionId: string, adminId: string, reason: string): Promise<MpesaTransactionRecord | null> {
        const updated = txStore.update(transactionId, { status: MpesaStatus.CANCELLED })
        auditLogStore.add({ adminId, action: "REJECTED", transactionId, reason })
        logInfo("Transaction rejected by admin", { id: transactionId, adminId, reason })
        return updated
    }

    // ── Reverse Transaction ──────────────────────
    async reverseTransaction(params: {
        transactionId: string
        adminId: string
        reason: string
    }): Promise<void> {
        const tx = txStore.get(params.transactionId)
        if (!tx || !tx.mpesaReceipt) {
            throw new Error(`Transaction ${params.transactionId} not found or has no receipt`)
        }

        await this.daraja.reverseTransaction({
            transactionId: tx.mpesaReceipt,
            amount: tx.amount,
            reason: params.reason,
            receiverParty: tx.phoneNumber,
        })

        txStore.update(tx.id, { status: MpesaStatus.REVERSED })
        auditLogStore.add({
            adminId: params.adminId,
            action: "REVERSAL",
            transactionId: params.transactionId,
            reason: params.reason,
        })

        logInfo("Reversal initiated", { id: tx.id, adminId: params.adminId })
    }

    // ── C2B Matching ──────────────────────────────
    matchC2BPayment(accountRef: string, amount: number, receipt: string): MpesaTransactionRecord | null {
        const tx = txStore.findByOrderId(accountRef)
        if (!tx) return null
        txStore.update(tx.id, { status: MpesaStatus.AUTHORIZED, mpesaReceipt: receipt })
        logInfo("C2B payment matched", { orderId: accountRef, receipt, amount })
        return txStore.get(tx.id) ?? null
    }

    // ── Getters ───────────────────────────────────
    findByCheckoutRequestId(crq: string) { return txStore.findByCheckoutRequestId(crq) }
    findByMpesaReceipt(receipt: string) { return txStore.findByMpesaReceipt(receipt) }
    findByOrderId(orderId: string) { return txStore.findByOrderId(orderId) }
    findPendingOlderThan(minutes: number) { return txStore.findPendingOlderThan(minutes) }
    getTransaction(id: string) { return txStore.get(id) }
    listTransactions() { return txStore.list() }

    getMetrics() {
        return {
            totalVolume: txStore.list().reduce((s, t) => s + t.amount, 0),
            capturedToday: txStore.totalCapturedToday(),
            byStatus: {
                pending: txStore.countByStatus(MpesaStatus.PENDING),
                authorized: txStore.countByStatus(MpesaStatus.AUTHORIZED),
                captured: txStore.countByStatus(MpesaStatus.CAPTURED),
                failed: txStore.countByStatus(MpesaStatus.FAILED),
                reversed: txStore.countByStatus(MpesaStatus.REVERSED),
                under_review: txStore.countByStatus(MpesaStatus.UNDER_REVIEW),
                expired: txStore.countByStatus(MpesaStatus.EXPIRED),
            },
            dailyVolume: txStore.dailyVolume(30),
        }
    }

    // ── Reconciliation helpers ────────────────────
    addReconciliationLog(log: Omit<ReconciliationLogRecord, "id" | "reconciledAt">): void {
        reconLogStore.add(log)
    }
    getReconciliationLogs() { return reconLogStore.list() }
    getAuditLogs() { return auditLogStore.list() }
    getAuditLogsByTransaction(transactionId: string) { return auditLogStore.listByTransaction(transactionId) }
}
