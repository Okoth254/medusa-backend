import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { handleDarajaCallback } from "../../../../modules/mpesa/callback.controller"
import { MpesaModuleOptions } from "../../../../modules/mpesa/types"

// Build options from environment
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
 * POST /store/mpesa/callback
 * Safaricom Daraja callback endpoint.
 * Must respond within 2 seconds.
 * Heavy processing is delegated to BullMQ worker.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    await handleDarajaCallback(req, res, getMpesaOpts())
}
