import IORedis from "ioredis"
import {
    RiskScoreResult,
    MpesaTransactionRecord,
    DarajaCallbackBody,
} from "./types"
import { extractMetaValue } from "./utils"
import { getRedisConnection } from "./queue"

// ─────────────────────────────────────────────
//  RiskService – Fraud Scoring Engine
// ─────────────────────────────────────────────
export class RiskService {
    private redis: IORedis

    constructor(redisUrl: string) {
        this.redis = getRedisConnection(redisUrl)
    }

    // ── Main Scorer ───────────────────────────────
    async score(params: {
        transaction: MpesaTransactionRecord | null
        callback: DarajaCallbackBody
        sessionPhone: string
        sessionAmount: number
    }): Promise<RiskScoreResult> {
        const { transaction, callback, sessionPhone, sessionAmount } = params
        const stkCallback = callback.Body.stkCallback
        const items = stkCallback.CallbackMetadata?.Item ?? []

        const callbackPhone = String(extractMetaValue(items, "PhoneNumber") ?? "")
        const callbackAmount = Number(extractMetaValue(items, "Amount") ?? 0)

        let score = 0
        const flags: string[] = []

        // 1. Phone mismatch (+40)
        const sessionPhoneClean = sessionPhone.replace(/\D/g, "")
        const callbackPhoneClean = callbackPhone.replace(/\D/g, "")
        if (
            sessionPhoneClean &&
            callbackPhoneClean &&
            !callbackPhoneClean.endsWith(sessionPhoneClean.slice(-9))
        ) {
            score += 40
            flags.push("PHONE_MISMATCH")
        }

        // 2. Amount mismatch > 1 KES (+50 = auto-block)
        const amountDiff = Math.abs(callbackAmount - sessionAmount)
        if (amountDiff > 1) {
            score += 50
            flags.push(`AMOUNT_MISMATCH:session=${sessionAmount},callback=${callbackAmount}`)
        }

        // 3. Velocity: >3 payments from same phone in last 60s (+30)
        const recentKey = `mpesa:velocity:60s:${sessionPhoneClean}`
        const recentCount = parseInt((await this.redis.get(recentKey)) ?? "0", 10)
        if (recentCount > 3) {
            score += 30
            flags.push(`VELOCITY_60S:count=${recentCount}`)
        }
        // Increment 60s counter
        await this.redis.multi()
            .incr(recentKey)
            .expire(recentKey, 60)
            .exec()

        // 4. Velocity: >10 STK same phone per hour (+20)
        const hourKey = `mpesa:velocity:1h:${sessionPhoneClean}`
        const hourCount = parseInt((await this.redis.get(hourKey)) ?? "0", 10)
        if (hourCount > 10) {
            score += 20
            flags.push(`VELOCITY_1H:count=${hourCount}`)
        }
        await this.redis.multi()
            .incr(hourKey)
            .expire(hourKey, 3600)
            .exec()

        // 5. Same phone, different customer account (+25)
        if (transaction) {
            const custKey = `mpesa:customer:${sessionPhoneClean}`
            const knownCustomer = await this.redis.get(custKey)
            if (knownCustomer && knownCustomer !== (transaction.customerId ?? "")) {
                score += 25
                flags.push("MULTI_CUSTOMER_SAME_PHONE")
            }
            // Record customer -> phone binding (24h)
            if (transaction.customerId) {
                await this.redis.set(custKey, transaction.customerId, "EX", 86400)
            }
        }

        // ── Determine action ──────────────────────
        let action: "approve" | "review" | "block"
        if (score <= 20) {
            action = "approve"
        } else if (score <= 50) {
            action = "review"
        } else {
            action = "block"
        }

        return { score, flags, action }
    }
}
