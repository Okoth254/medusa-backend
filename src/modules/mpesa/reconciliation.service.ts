import { DarajaClient } from "./daraja.client"
import { MpesaService } from "./mpesa.service"
import { RiskService } from "./risk.service"
import { MpesaModuleOptions, MpesaStatus, DarajaCallbackBody } from "./types"
import { nowEAT } from "./utils"

// ─────────────────────────────────────────────
//  ReconciliationService
//  Daily cron: cross-checks DB state vs Daraja
// ─────────────────────────────────────────────
export class ReconciliationService {
    private daraja: DarajaClient
    private mpesaService: MpesaService
    private riskService: RiskService
    private opts: MpesaModuleOptions

    constructor(
        daraja: DarajaClient,
        mpesaService: MpesaService,
        riskService: RiskService,
        opts: MpesaModuleOptions
    ) {
        this.daraja = daraja
        this.mpesaService = mpesaService
        this.riskService = riskService
        this.opts = opts
    }

    // ── Main reconciliation run ───────────────────
    async run(): Promise<{ processed: number; fixed: number; flagged: number }> {
        console.log(`[MPESA RECONCILIATION] Starting run at ${nowEAT().toISOString()}`)

        // Find all pending transactions (excluding very recent < 2 min)
        const pending = this.mpesaService.findPendingOlderThan(2)

        let fixed = 0
        let flagged = 0

        for (const tx of pending) {
            try {
                const darajaStatus = await this.daraja.queryTransactionStatus(
                    tx.checkoutRequestId
                )

                const darajaResultCode = darajaStatus.ResultCode
                const isDarajaSuccess = darajaResultCode === "0"

                if (isDarajaSuccess && tx.status === MpesaStatus.PENDING) {
                    // ── Case 1: Daraja successful, we show pending → fix it
                    const fakeCallback: DarajaCallbackBody = {
                        Body: {
                            stkCallback: {
                                MerchantRequestID: tx.merchantRequestId,
                                CheckoutRequestID: tx.checkoutRequestId,
                                ResultCode: 0,
                                ResultDesc: "Reconciled",
                            },
                        },
                    }
                    await this.mpesaService.confirmFromCallback(fakeCallback, 0, ["RECONCILED"])
                    await this.mpesaService.capture(tx.id)

                    this.mpesaService.addReconciliationLog({
                        transactionId: tx.id,
                        darajaStatus: "success",
                        internalStatus: "pending",
                        actionTaken: "COMPLETED_ORDER_VIA_RECONCILIATION",
                    })
                    fixed++
                    console.log(`[RECONCILIATION] Fixed tx ${tx.id} — was pending, Daraja shows success`)

                } else if (!isDarajaSuccess && tx.status === MpesaStatus.PENDING) {
                    // ── Case 2: Daraja failed, mark expired
                    const txRecord = this.mpesaService.getTransaction(tx.id)!
                    txRecord.status = MpesaStatus.EXPIRED
                    txRecord.updatedAt = nowEAT()

                    this.mpesaService.addReconciliationLog({
                        transactionId: tx.id,
                        darajaStatus: darajaResultCode,
                        internalStatus: "pending",
                        actionTaken: "MARKED_EXPIRED",
                    })
                    fixed++
                    console.log(`[RECONCILIATION] Expired tx ${tx.id} — Daraja code ${darajaResultCode}`)

                } else if (isDarajaSuccess && tx.status === MpesaStatus.FAILED) {
                    // ── Case 3: CRITICAL — we have it as failed but Daraja shows success
                    this.mpesaService.addReconciliationLog({
                        transactionId: tx.id,
                        darajaStatus: "success",
                        internalStatus: "failed",
                        actionTaken: "FLAGGED_CRITICAL_MISMATCH",
                    })
                    flagged++
                    console.error(
                        `[RECONCILIATION][CRITICAL] tx ${tx.id} is FAILED internally but SUCCESS on Daraja!`
                    )
                    await this.notifyAdmin(
                        `CRITICAL: Transaction ${tx.id} is failed internally but successful on Daraja!`
                    )
                }
            } catch (err) {
                console.error(`[RECONCILIATION] Error processing tx ${tx.id}:`, err)
            }
        }

        console.log(
            `[MPESA RECONCILIATION] Done pending check. Processed=${pending.length} Fixed=${fixed} Flagged=${flagged}`
        )

        // ── Phase 2: Medusa Core Discrepancy Check ─────────────────
        // Check recently captured or reversed transactions against Medusa Core Orders
        const recentCompleted = this.mpesaService.listTransactions()
            .filter(tx =>
                (tx.status === MpesaStatus.CAPTURED || tx.status === MpesaStatus.REVERSED) &&
                tx.updatedAt > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            )

        console.log(`[MPESA RECONCILIATION] Checking ${recentCompleted.length} recent transactions against Medusa Core...`)

        const baseUrl = process.env.BACKEND_URL ?? "http://localhost:9000"
        let coreDiscrepancies = 0

        for (const tx of recentCompleted) {
            if (!tx.orderId) continue

            try {
                // We're inside the backend, but we still need the API key for internal admin calls
                const res = await fetch(`${baseUrl}/admin/orders/${tx.orderId}`, {
                    headers: { "x-medusa-api-key": process.env.MEDUSA_API_KEY ?? "" }
                })

                if (!res.ok) {
                    // Order might be deleted or not found, a different kind of discrepancy
                    console.warn(`[RECONCILIATION] Could not fetch Medusa Order ${tx.orderId} for tx ${tx.id}`)
                    continue
                }

                const data = await res.json()
                const order = data.order

                // Discrepancy 1: M-Pesa is Captured, but Medusa Order is still awaiting payment/canceled
                if (tx.status === MpesaStatus.CAPTURED && order.payment_status !== "captured") {
                    this.mpesaService.addReconciliationLog({
                        transactionId: tx.id,
                        darajaStatus: "success",
                        internalStatus: `core_mismatch_${order.payment_status}`,
                        actionTaken: "FLAGGED_CORE_MISMATCH",
                    })
                    coreDiscrepancies++
                    await this.notifyAdmin(`CORE MISMATCH: M-Pesa tx ${tx.id} is CAPTURED, but Medusa Order ${tx.orderId} is ${order.payment_status}. Manual review needed.`)
                }

                // Discrepancy 2: M-Pesa is Reversed, but Medusa Order hasn't been refunded
                if (tx.status === MpesaStatus.REVERSED && order.payment_status !== "refunded" && order.payment_status !== "partially_refunded") {
                    this.mpesaService.addReconciliationLog({
                        transactionId: tx.id,
                        darajaStatus: "reversed",
                        internalStatus: `core_mismatch_${order.payment_status}`,
                        actionTaken: "FLAGGED_CORE_MISMATCH",
                    })
                    coreDiscrepancies++
                    await this.notifyAdmin(`CORE MISMATCH: M-Pesa tx ${tx.id} was REVERSED, but Medusa Order ${tx.orderId} is still ${order.payment_status}. Initiate Medusa refund.`)
                }

            } catch (err) {
                console.error(`[RECONCILIATION] Error checking Medusa Core for tx ${tx.id}:`, err)
            }
        }

        console.log(
            `[MPESA RECONCILIATION] Core check done. Found ${coreDiscrepancies} discrepancies.`
        )

        return { processed: pending.length, fixed, flagged: flagged + coreDiscrepancies }
    }

    // ── Admin alert ───────────────────────────────
    private async notifyAdmin(message: string): Promise<void> {
        // Slack webhook (if configured)
        if (this.opts.slackWebhookUrl) {
            try {
                const { default: axios } = await import("axios")
                await axios.post(this.opts.slackWebhookUrl, {
                    text: `🚨 *M-Pesa Reconciliation Alert*\n${message}`,
                })
            } catch (err) {
                console.error("[RECONCILIATION] Slack alert failed:", err)
            }
        }
        // Additional: email, PagerDuty, etc.
        console.error(`[ADMIN ALERT] ${message}`)
    }
}
