import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MpesaService } from "../../../../modules/mpesa/mpesa.service"
import { DarajaClient } from "../../../../modules/mpesa/daraja.client"
import { MpesaModuleOptions } from "../../../../modules/mpesa/types"
import { txStore } from "../../../../modules/mpesa/store"
import { logInfo, logWarn } from "../../../../modules/mpesa/logger"

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
 * POST /store/mpesa/c2b
 * Handles C2B (Paybill / Till Number) confirmation from Daraja.
 * AccountReference should match the Medusa Order ID.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const body = req.body as {
        TransID?: string
        TransAmount?: string | number
        BillRefNumber?: string  // AccountReference = OrderID
        MSISDN?: string
    }

    const receipt = body.TransID ?? ""
    const amount = Number(body.TransAmount ?? 0)
    const accountRef = body.BillRefNumber ?? ""
    const phone = body.MSISDN ?? ""

    logInfo("C2B confirmation received", { receipt, amount, accountRef, phone })

    if (!accountRef || !receipt) {
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
    }

    const opts = getMpesaOpts()
    const service = new MpesaService(new DarajaClient(opts), opts)
    const matched = service.matchC2BPayment(accountRef, amount, receipt)

    if (!matched) {
        logWarn("C2B payment unmatched — no order found", { accountRef, receipt, amount })
        // Store as unmatched for admin review
        const unmatched = txStore.list().find(t => false) // placeholder — would store separately
    } else {
        logInfo("C2B payment matched to order", { orderId: accountRef, txId: matched.id })
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
}
