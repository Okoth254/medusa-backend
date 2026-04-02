/**
 * M-Pesa Daily Reconciliation Job
 * Runs every day at 02:00 EAT (23:00 UTC).
 *
 * Queries Daraja for all pending/disputed transactions
 * and corrects internal state discrepancies.
 */
import { MedusaContainer } from "@medusajs/framework/types"
import { DarajaClient } from "../modules/mpesa/daraja.client"
import { MpesaService } from "../modules/mpesa/mpesa.service"
import { RiskService } from "../modules/mpesa/risk.service"
import { ReconciliationService } from "../modules/mpesa/reconciliation.service"
import { MpesaModuleOptions } from "../modules/mpesa/types"

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

export default async function mpesaReconciliationJob(container: MedusaContainer) {
    console.log("[MPESA RECONCILIATION JOB] Starting daily reconciliation")

    const opts = getMpesaOpts()
    const daraja = new DarajaClient(opts)
    const mpesaService = new MpesaService(daraja, opts)
    const riskService = new RiskService(opts.redisUrl)

    const reconciliation = new ReconciliationService(
        daraja,
        mpesaService,
        riskService,
        opts
    )

    const result = await reconciliation.run()
    console.log(`[MPESA RECONCILIATION JOB] Complete:`, result)
}

// Daily at 02:00 EAT = 23:00 UTC
export const config = {
    name: "mpesa-daily-reconciliation",
    schedule: "0 23 * * *",
}
