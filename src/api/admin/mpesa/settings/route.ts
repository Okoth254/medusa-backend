import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET  /admin/mpesa/settings — read current M-Pesa configuration
 * POST /admin/mpesa/settings — update environment or callback URL at runtime
 *
 * NOTE: For security, sensitive keys are never returned — only public-safe values.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    return res.json({
        environment: process.env.MPESA_ENV ?? "sandbox",
        shortcode: process.env.MPESA_SHORTCODE,
        callbackBaseUrl: process.env.MPESA_CALLBACK_BASE_URL,
        hasConsumerKey: !!process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_KEY !== "your_consumer_key_here",
        hasConsumerSecret: !!process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_CONSUMER_SECRET !== "your_consumer_secret_here",
        hasSecurityCredential: !!process.env.MPESA_SECURITY_CREDENTIAL && process.env.MPESA_SECURITY_CREDENTIAL !== "your_encrypted_security_credential_here",
        callbackUrl: `${process.env.MPESA_CALLBACK_BASE_URL ?? ""}/store/mpesa/callback`,
        isFullyConfigured:
            !!process.env.MPESA_CONSUMER_KEY &&
            process.env.MPESA_CONSUMER_KEY !== "your_consumer_key_here" &&
            !!process.env.MPESA_CALLBACK_BASE_URL &&
            process.env.MPESA_CALLBACK_BASE_URL !== "https://your-ngrok-url.ngrok.io",
    })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    // In a real implementation, this would write to a config store or restart the service.
    // For now we return what would be set, as .env cannot be hot-updated at runtime.
    const body = req.body as { environment?: string; callbackBaseUrl?: string }
    return res.json({
        message: "To apply changes, update backend/.env and restart the Medusa server.",
        received: body,
    })
}
