import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DarajaClient } from "../../../../../modules/mpesa/daraja.client"
import { MpesaService } from "../../../../../modules/mpesa/mpesa.service"
import { MpesaModuleOptions } from "../../../../../modules/mpesa/types"
import { txStore, auditLogStore, reconLogStore } from "../../../../../modules/mpesa/store"
import { logError } from "../../../../../modules/mpesa/logger"

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
 * GET /admin/mpesa/transactions/:id
 * Returns full transaction detail including audit log and recon history
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params
    const tx = txStore.get(id)
    if (!tx) {
        return res.status(404).json({ message: "Transaction not found" })
    }

    let auditLog = auditLogStore.listByTransaction(id)
    const reconHistory = reconLogStore.list().filter(l => l.transactionId === id)

    // Enrich Audit Log with actual Admin identities
    try {
        const userModule = req.scope.resolve("user")

        // Fetch users in bulk
        const userIds = [...new Set(auditLog.map(log => log.adminId).filter(id => id && id !== "system"))]
        if (userIds.length > 0) {
            const users = await userModule.listUsers({ id: userIds }, { select: ["id", "email", "first_name", "last_name"] })
            const userMap = new Map(users.map((u: any) => [u.id, u]))

            auditLog = auditLog.map(log => {
                const user = userMap.get(log.adminId)
                if (user) {
                    return {
                        ...log,
                        adminName: user.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : user.email
                    }
                }
                return log
            })
        }
    } catch (err) {
        logError("Failed to enrich admin identities in audit log", { error: err })
    }

    return res.json({
        transaction: tx,
        auditLog,
        reconHistory,
    })
}

/**
 * POST /admin/mpesa/transactions/:id/action
 * Body: { action: "approve" | "reject" | "reverse", reason?: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const { id } = req.params
    const body = req.body as { action: string; reason?: string }
    const adminId = (req as any).auth_context?.actor_id ?? "admin"

    const service = getService()

    switch (body.action) {
        case "approve": {
            const tx = await service.approve(id, adminId, body.reason)
            if (!tx) return res.status(404).json({ message: "Transaction not found" })
            return res.json({ transaction: tx })
        }
        case "reject": {
            if (!body.reason) return res.status(400).json({ message: "Reason is required for rejection" })
            const tx = await service.reject(id, adminId, body.reason)
            if (!tx) return res.status(404).json({ message: "Transaction not found" })
            return res.json({ transaction: tx })
        }
        case "reverse": {
            if (!body.reason) return res.status(400).json({ message: "Reason is required for reversal" })
            await service.reverseTransaction({ transactionId: id, adminId, reason: body.reason })
            return res.json({ message: "Reversal initiated. Awaiting Safaricom confirmation." })
        }
        default:
            return res.status(400).json({ message: `Unknown action: ${body.action}` })
    }
}
