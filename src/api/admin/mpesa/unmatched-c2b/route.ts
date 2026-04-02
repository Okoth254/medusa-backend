import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { txStore } from "../../../../modules/mpesa/store"

export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    // Find transactions that have no associated orderId (unmatched C2B payments)
    const all = txStore.list()
    const unmatched = all.filter(tx => !tx.orderId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)

    res.json({ unmatched })
}
