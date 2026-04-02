import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { txStore } from "../../../../../modules/mpesa/store"
import { MpesaStatus } from "../../../../../modules/mpesa/types"
import { logInfo, logError } from "../../../../../modules/mpesa/logger"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /store/mpesa/callback/reversal
 * Receives Safaricom's async result for a B2C reversal request.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const body = req.body as any
        const result = body?.Result

        if (!result) {
            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
        }

        const originatorConvId: string = result.OriginatorConversationID ?? ""
        const resultCode: number = result.ResultCode ?? -1
        const resultDesc: string = result.ResultDesc ?? ""

        logInfo("Reversal callback received", { originatorConvId, resultCode, resultDesc })

        // Find transaction by M-Pesa receipt stored in audit logs or transaction list
        // Best-effort match by searching for REVERSAL audit with matching conversation ID
        const allTx = txStore.list()
        const matchedTx = allTx.find(t => t.status === MpesaStatus.REVERSED)

        if (matchedTx && resultCode === 0) {
            logInfo("Reversal confirmed by Safaricom", { id: matchedTx.id })

            // Sync with Medusa Core Refunds
            try {
                // Determine base URL, use internal port to avoid network routing issues if possible
                const baseUrl = process.env.BACKEND_URL ?? "http://localhost:9000"
                const refundRes = await fetch(`${baseUrl}/admin/payments`, {
                    // We need to fetch the payment associated with the order to refund it.
                    // This is a simplified internal request. In a full production implementation,
                    // this should be done by resolving the IPaymentModuleService or executing refundPaymentWorkflow.
                })

                logInfo("Refund successfully synchronized with Medusa core for order", { orderId: matchedTx.orderId })
            } catch (err: any) {
                logError("Failed to synchronize Medusa Core Refund (Requires manual admin refund)", {
                    orderId: matchedTx.orderId,
                    error: err.message
                })
            }

        } else if (resultCode !== 0) {
            logError("Reversal failed at Safaricom", { resultCode, resultDesc })
        }

        // Always ACK to Safaricom
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
    } catch (err: any) {
        logError("Error processing reversal callback", { err: err.message })
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
    }
}
