/**
 * Persistent store for M-Pesa transactions, reconciliation logs, and audit logs.
 *
 * This replaces the previous in-memory Map/arrays with a file-backed JSON store
 * (dev/staging) and exposes the same interface MpesaService uses, making a
 * future swap to a MikroORM/PostgreSQL repository a single-file change.
 *
 * For production: swap the implementations below with a proper ORM repository.
 */

import * as fs from "fs"
import * as path from "path"
import {
    MpesaTransactionRecord,
    ReconciliationLogRecord,
    AuditLogRecord,
    MpesaStatus,
} from "./types"
import { generateId, nowEAT } from "./utils"
import { logInfo, logError } from "./logger"

// ── Storage file paths ────────────────────────
const DATA_DIR = path.join(process.cwd(), ".mpesa-store")
const TX_FILE = path.join(DATA_DIR, "transactions.json")
const RECON_FILE = path.join(DATA_DIR, "reconciliation-logs.json")
const AUDIT_FILE = path.join(DATA_DIR, "audit-logs.json")

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true })
    }
}

function readJSON<T>(file: string): T[] {
    try {
        if (!fs.existsSync(file)) return []
        const raw = fs.readFileSync(file, "utf-8")
        return JSON.parse(raw) as T[]
    } catch {
        return []
    }
}

function writeJSON<T>(file: string, data: T[]) {
    try {
        ensureDir()
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8")
    } catch (err) {
        logError("Failed to write store file", { file, err })
    }
}

// ─────────────────────────────────────────────
//  Transaction Store
// ─────────────────────────────────────────────
export class TransactionStore {
    private get all(): MpesaTransactionRecord[] {
        return readJSON<MpesaTransactionRecord>(TX_FILE).map(tx => ({
            ...tx,
            createdAt: new Date(tx.createdAt),
            updatedAt: new Date(tx.updatedAt),
        }))
    }

    private save(records: MpesaTransactionRecord[]) {
        writeJSON(TX_FILE, records)
    }

    set(tx: MpesaTransactionRecord) {
        const records = this.all.filter(r => r.id !== tx.id)
        records.push(tx)
        this.save(records)
        logInfo("Transaction saved", { id: tx.id, status: tx.status })
    }

    get(id: string): MpesaTransactionRecord | undefined {
        return this.all.find(tx => tx.id === id)
    }

    findByCheckoutRequestId(crq: string): MpesaTransactionRecord | undefined {
        return this.all.find(tx => tx.checkoutRequestId === crq)
    }

    findByMpesaReceipt(receipt: string): MpesaTransactionRecord | undefined {
        return this.all.find(tx => tx.mpesaReceipt === receipt)
    }

    findByOrderId(orderId: string): MpesaTransactionRecord | undefined {
        return this.all.find(tx => tx.orderId === orderId)
    }

    findPendingOlderThan(minutes: number): MpesaTransactionRecord[] {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000)
        return this.all.filter(
            tx => tx.status === MpesaStatus.PENDING && tx.createdAt < cutoff
        )
    }

    list(): MpesaTransactionRecord[] {
        return this.all.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
    }

    update(id: string, patch: Partial<MpesaTransactionRecord>): MpesaTransactionRecord | null {
        const tx = this.get(id)
        if (!tx) return null
        const updated = { ...tx, ...patch, updatedAt: nowEAT() }
        this.set(updated)
        return updated
    }

    // Stats helpers for metrics endpoint
    countByStatus(status: MpesaStatus): number {
        return this.all.filter(tx => tx.status === status).length
    }

    totalCapturedToday(): number {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return this.all
            .filter(tx => tx.status === MpesaStatus.CAPTURED && tx.updatedAt >= start)
            .reduce((sum, tx) => sum + tx.amount, 0)
    }

    dailyVolume(days: number): Array<{ date: string; amount: number; count: number }> {
        const result: Record<string, { amount: number; count: number }> = {}
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

        this.all
            .filter(tx => tx.createdAt >= cutoff && tx.status === MpesaStatus.CAPTURED)
            .forEach(tx => {
                const date = tx.createdAt.toISOString().split("T")[0]
                if (!result[date]) result[date] = { amount: 0, count: 0 }
                result[date].amount += tx.amount
                result[date].count += 1
            })

        return Object.entries(result)
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date))
    }
}

// ─────────────────────────────────────────────
//  Reconciliation Log Store
// ─────────────────────────────────────────────
export class ReconciliationLogStore {
    private get all(): ReconciliationLogRecord[] {
        return readJSON<ReconciliationLogRecord>(RECON_FILE).map(l => ({
            ...l,
            reconciledAt: new Date(l.reconciledAt),
        }))
    }

    add(log: Omit<ReconciliationLogRecord, "id" | "reconciledAt">) {
        const records = this.all
        records.push({ ...log, id: generateId(), reconciledAt: nowEAT() })
        writeJSON(RECON_FILE, records)
    }

    list(): ReconciliationLogRecord[] {
        return this.all.sort(
            (a, b) => b.reconciledAt.getTime() - a.reconciledAt.getTime()
        )
    }
}

// ─────────────────────────────────────────────
//  Audit Log Store
// ─────────────────────────────────────────────
export class AuditLogStore {
    private get all(): AuditLogRecord[] {
        return readJSON<AuditLogRecord>(AUDIT_FILE).map(l => ({
            ...l,
            createdAt: new Date(l.createdAt),
        }))
    }

    add(log: Omit<AuditLogRecord, "id" | "createdAt">) {
        const records = this.all
        records.push({ ...log, id: generateId(), createdAt: nowEAT() })
        writeJSON(AUDIT_FILE, records)
    }

    list(): AuditLogRecord[] {
        return this.all.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
    }

    listByTransaction(transactionId: string): AuditLogRecord[] {
        return this.all
            .filter(l => l.transactionId === transactionId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }
}

// ── Singleton instances ───────────────────────
export const txStore = new TransactionStore()
export const reconLogStore = new ReconciliationLogStore()
export const auditLogStore = new AuditLogStore()
