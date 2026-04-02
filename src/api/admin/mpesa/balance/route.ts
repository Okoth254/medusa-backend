import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../../modules/mpesa/daraja.client"
import { MpesaModuleOptions } from "../../../../modules/mpesa/types"

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
 * GET /admin/mpesa/balance
 * Queries the Daraja Account Balance API for the configured shortcode.
 * Daraja acknowledges immediately; the actual balance arrives via the ResultURL callback.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const opts = getMpesaOpts()
    const daraja = new DarajaClient(opts)

    try {
        const darajaResponse = await daraja.getAccountBalance()
        return res.json({
            shortcode: opts.shortcode,
            environment: opts.environment,
            darajaResponse,
            checkedAt: new Date().toISOString(),
        })
    } catch (err: any) {
        return res.status(502).json({ message: "Failed to query Daraja balance", error: err.message })
    }
}
