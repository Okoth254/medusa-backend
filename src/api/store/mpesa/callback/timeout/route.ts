import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { txStore } from "../../../../../modules/mpesa/store"
import { MpesaStatus } from "../../../../../modules/mpesa/types"
import { logWarn } from "../../../../../modules/mpesa/logger"

/**
 * POST /store/mpesa/callback/timeout
 * Daraja calls this when an STK Push or B2B/C2B request times out.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const body = req.body as any
        const checkoutRequestId: string =
            body?.Body?.stkCallback?.CheckoutRequestID ??
            body?.CheckoutRequestID ?? ""

        if (checkoutRequestId) {
            const tx = txStore.findByCheckoutRequestId(checkoutRequestId)
            if (tx && tx.status === MpesaStatus.PENDING) {
                txStore.update(tx.id, { status: MpesaStatus.EXPIRED })
                logWarn("Transaction expired via timeout callback", {
                    id: tx.id,
                    checkoutRequestId,
                })
            }
        }

        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
    } catch {
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })
    }
}
