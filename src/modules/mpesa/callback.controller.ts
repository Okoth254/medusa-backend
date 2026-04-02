import { z } from "zod"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMpesaQueue, isProcessed, getRedisConnection } from "./queue"
import { hashPayload } from "./utils"
import { SAFARICOM_IPS, CallbackJobData, MpesaModuleOptions } from "./types"

// ── Zod schema for Daraja callback ───────────
const CallbackMetaItemSchema = z.object({
    Name: z.string(),
    Value: z.union([z.string(), z.number()]),
})

const DarajaCallbackSchema = z.object({
    Body: z.object({
        stkCallback: z.object({
            MerchantRequestID: z.string(),
            CheckoutRequestID: z.string(),
            ResultCode: z.number(),
            ResultDesc: z.string(),
            CallbackMetadata: z
                .object({ Item: z.array(CallbackMetaItemSchema) })
                .optional(),
        }),
    }),
})

// ─────────────────────────────────────────────
//  Callback Controller
//  Used by the route handler (NOT a class method)
// ─────────────────────────────────────────────
export async function handleDarajaCallback(
    req: MedusaRequest,
    res: MedusaResponse,
    opts: MpesaModuleOptions
): Promise<void> {
    const sourceIp = (req.ip ?? req.socket?.remoteAddress ?? "").replace("::ffff:", "")

    // 1. IP allowlist (only in production)
    if (opts.environment === "production" && !SAFARICOM_IPS.includes(sourceIp)) {
        console.warn(`[MPESA CALLBACK] Rejected request from non-Safaricom IP: ${sourceIp}`)
        res.status(403).send("Forbidden")
        return
    }

    // 2. Validate payload structure
    const parsed = DarajaCallbackSchema.safeParse(req.body)
    if (!parsed.success) {
        console.warn("[MPESA CALLBACK] Schema validation failed:", parsed.error.flatten())
        // Still 200 to prevent Daraja retries for genuinely malformed payloads
        res.status(200).json({ ResultCode: 1, ResultDesc: "Invalid payload" })
        return
    }

    const payload = parsed.data

    // 3. Replay-attack protection via payload hash
    const payloadHash = hashPayload(payload)
    const redis = getRedisConnection(opts.redisUrl)
    const alreadySeen = await isProcessed(redis, payloadHash)
    if (alreadySeen) {
        console.log(`[MPESA CALLBACK] Duplicate callback hash=${payloadHash}, 200 OK (ignored)`)
        res.status(200).json({ ResultCode: 0, ResultDesc: "Already accepted" })
        return
    }

    // 4. Enqueue for async processing
    const queue = getMpesaQueue(opts.redisUrl)
    const jobData: CallbackJobData = {
        payload,
        receivedAt: new Date().toISOString(),
        sourceIp,
        payloadHash,
    }
    await queue.add("process-callback", jobData, {
        jobId: payloadHash,          // Deduplicate queue entries by hash
    })

    console.log(
        `[MPESA CALLBACK] ✅ Enqueued job hash=${payloadHash} ` +
        `CRQ=${payload.Body.stkCallback.CheckoutRequestID}`
    )

    // 5. Always ACK to Safaricom within 2 seconds
    res.status(200).json({ ResultCode: 0, ResultDesc: "Success" })
}
