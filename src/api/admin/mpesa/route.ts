import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../modules/mpesa/daraja.client"
import { MpesaService } from "../../../modules/mpesa/mpesa.service"
import { MpesaModuleOptions } from "../../../modules/mpesa/types"

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

function getService(): MpesaService {
    const opts = getMpesaOpts()
    const daraja = new DarajaClient(opts)
    return new MpesaService(daraja, opts)
}

/**
 * GET /admin/mpesa/transactions
 * Lists all M-Pesa transactions (admin only — Medusa auth middleware handles auth).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const service = getService()
    const transactions = service.listTransactions()

    res.json({
        transactions,
        count: transactions.length,
    })
}
