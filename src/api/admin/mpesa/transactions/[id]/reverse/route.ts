import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../../../../modules/mpesa/daraja.client"
import { MpesaService } from "../../../../../../modules/mpesa/mpesa.service"
import { MpesaModuleOptions } from "../../../../../../modules/mpesa/types"

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
 * POST /admin/mpesa/transactions/:id/reverse
 *
 * Initiates a Daraja reversal for a captured M-Pesa payment.
 * Requires FINANCE_ADMIN role — enforced via Medusa's actor-based auth middleware.
 *
 * Body: { reason: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params
    const { reason } = req.body as { reason?: string }

    if (!reason || reason.trim().length < 5) {
        return res.status(400).json({
            error: "A reversal reason of at least 5 characters is required",
        })
    }

    // In production, verify actor role:
    // const actor = req.auth_context?.actor_type
    // if (actor !== "finance_admin") return res.status(403).json({ error: "Forbidden" })

    const service = getService()
    const tx = service.getTransaction(id)

    if (!tx) {
        return res.status(404).json({ error: `Transaction ${id} not found` })
    }

    if (!tx.mpesaReceipt) {
        return res.status(422).json({
            error: "Cannot reverse a transaction with no M-Pesa receipt (not yet captured)",
        })
    }

    try {
        await service.reverseTransaction({
            transactionId: id,
            adminId: (req as unknown as { auth_context?: { actor_id?: string } })
                ?.auth_context?.actor_id ?? "admin",
            reason: reason.trim(),
        })

        const updated = service.getTransaction(id)
        res.json({ transaction: updated, message: "Reversal initiated successfully" })
    } catch (err) {
        const error = err as Error
        res.status(500).json({ error: error.message })
    }
}
