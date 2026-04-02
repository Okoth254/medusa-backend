import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../../modules/mpesa/daraja.client"
import { MpesaService } from "../../../../modules/mpesa/mpesa.service"
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
 * GET /admin/mpesa/metrics
 * Returns KPI metrics: total volume, success rate, daily series (30 days)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const opts = getMpesaOpts()
    const service = new MpesaService(new DarajaClient(opts), opts)
    const metrics = service.getMetrics()

    const total = Object.values(metrics.byStatus).reduce((a, b) => a + b, 0)
    const successRate = total > 0
        ? Math.round((metrics.byStatus.captured / total) * 100)
        : 0

    return res.json({
        ...metrics,
        successRate,
        total,
    })
}
