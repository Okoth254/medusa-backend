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

function getService() {
    const opts = getMpesaOpts()
    return new MpesaService(new DarajaClient(opts), opts)
}

/**
 * GET  /admin/mpesa/transactions
 * POST /admin/mpesa/transactions (reserved)
 * Returns all transactions with optional filters
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const service = getService()
    let transactions = service.listTransactions()

    // Optional query filters: ?status=&phone=&receipt=&orderId=
    const { status, phone, receipt, orderId } = req.query as Record<string, string>
    if (status) transactions = transactions.filter(t => t.status === status)
    if (phone) transactions = transactions.filter(t => t.phoneNumber.includes(phone))
    if (receipt) transactions = transactions.filter(t => t.mpesaReceipt?.includes(receipt))
    if (orderId) transactions = transactions.filter(t => t.orderId.includes(orderId))

    // Pagination: ?page=1&limit=25
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1"))
    const limit = Math.min(100, parseInt((req.query.limit as string) ?? "25"))
    const total = transactions.length
    const paginated = transactions.slice((page - 1) * limit, page * limit)

    res.json({
        transactions: paginated,
        count: paginated.length,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    })
}
