/**
 * M-Pesa Payment Timeout Job
 * Runs every 3 minutes via Medusa's job scheduler.
 *
 * Finds pending transactions older than 2 minutes,
 * queries Daraja for their status, and expires them if still pending.
 */
import { MedusaContainer } from "@medusajs/framework/types"
import { DarajaClient } from "../modules/mpesa/daraja.client"
import { MpesaService } from "../modules/mpesa/mpesa.service"
import { MpesaStatus, MpesaModuleOptions } from "../modules/mpesa/types"
import { nowEAT } from "../modules/mpesa/utils"

function getMpesaOpts(): MpesaModuleOptions {
    return {
        consumerKey: process.env.MPESA_CONSUMER_KEY!,
        consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
        shortcode: process.env.MPESA_SHORTCODE!,
        passkey: process.env.MPESA_PASSKEY!,
        initiatorName: process.env.MPESA_INITIATOR_NAME!,
        securityCredential: process.env.MPESA_SECURITY_CREDENTIAL!,
        callbackBaseUrl: process.env.MPESA_CALLBACK_BASE_URL!,
        environment: (process.env.MPESA_ENV as "sandbox" | "production") ?? "sandbox",
        redisUrl: process.env.REDIS_URL!,
        slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    }
}

// Medusa job — exported as default function
export default async function mpesaTimeoutJob(container: MedusaContainer) {
    const opts = getMpesaOpts()
    const daraja = new DarajaClient(opts)
    const service = new MpesaService(daraja, opts)

    // Find transactions pending for >2 minutes
    const stalePending = service.findPendingOlderThan(2)

    if (stalePending.length === 0) {
        console.log("[MPESA TIMEOUT] No stale pending transactions found")
        return
    }

    console.log(`[MPESA TIMEOUT] Found ${stalePending.length} stale pending transactions`)

    for (const tx of stalePending) {
        try {
            const darajaStatus = await daraja.queryTransactionStatus(tx.checkoutRequestId)

            if (darajaStatus.ResultCode !== "0") {
                // Daraja confirms not successful — expire it
                const txRecord = service.getTransaction(tx.id)
                if (txRecord) {
                    txRecord.status = MpesaStatus.EXPIRED
                    txRecord.updatedAt = nowEAT()
                    console.log(`[MPESA TIMEOUT] Expired tx ${tx.id} (Daraja code: ${darajaStatus.ResultCode})`)
                }
            } else {
                // Daraja says success but we have pending — this is a missed callback scenario
                // Let reconciliation handle it, or manually trigger capture here
                console.warn(
                    `[MPESA TIMEOUT] tx ${tx.id} is pending but Daraja shows success — check reconciliation`
                )
            }
        } catch (err) {
            console.error(`[MPESA TIMEOUT] Error querying tx ${tx.id}:`, err)
        }
    }
}

// Medusa cron expression — every 3 minutes
export const config = {
    name: "mpesa-payment-timeout",
    schedule: "*/3 * * * *",
}
