import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../../modules/mpesa/daraja.client"
import { MpesaService } from "../../../../modules/mpesa/mpesa.service"
import { ReconciliationService } from "../../../../modules/mpesa/reconciliation.service"
import { RiskService } from "../../../../modules/mpesa/risk.service"
import { MpesaModuleOptions } from "../../../../modules/mpesa/types"
import { reconLogStore } from "../../../../modules/mpesa/store"

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

/**
 * GET  /admin/mpesa/reconciliation-logs — list all reconciliation logs
 * POST /admin/mpesa/reconciliation-logs — trigger a manual reconciliation run
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const logs = reconLogStore.list()
    return res.json({ logs, count: logs.length })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const opts = getMpesaOpts()
    const daraja = new DarajaClient(opts)
    const mpesaService = new MpesaService(daraja, opts)
    const riskService = new RiskService(opts.redisUrl)
    const reconciliation = new ReconciliationService(daraja, mpesaService, riskService, opts)

    const result = await reconciliation.run()
    return res.json({
        message: "Reconciliation run complete",
        ...result,
    })
}
