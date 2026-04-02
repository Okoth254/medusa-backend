import { Worker, Job } from "bullmq"
import { DarajaClient } from "./daraja.client"
import { MpesaService } from "./mpesa.service"
import { RiskService } from "./risk.service"
import { NotificationService } from "./notification.service"
import { MpesaModuleOptions, CallbackJobData } from "./types"
import { getRedisConnection, isProcessed } from "./queue"
import { logInfo, logWarn, logError } from "./logger"

// ─────────────────────────────────────────────
//  Callback Worker – BullMQ job processor
//  Runs as a separate process from the API
// ─────────────────────────────────────────────
export function startCallbackWorker(opts: MpesaModuleOptions): Worker {
    const connection = getRedisConnection(opts.redisUrl)
    const daraja = new DarajaClient(opts)
    const mpesaService = new MpesaService(daraja, opts)
    const riskService = new RiskService(opts.redisUrl)
    const notifier = new NotificationService(opts)

    const worker = new Worker<CallbackJobData>(
        "mpesa-callback",
        async (job: Job<CallbackJobData>) => {
            await processCallback(job.data, mpesaService, riskService, notifier, opts)
        },
        {
            connection,
            concurrency: 5,
        }
    )

    worker.on("completed", (job) => {
        logInfo("Callback job completed", { jobId: job.id })
    })

    worker.on("failed", (job, err) => {
        logError("Callback job failed", { jobId: job?.id, error: err.message })
    })

    return worker
}

// ── Core processing logic ─────────────────────
async function processCallback(
    jobData: CallbackJobData,
    mpesaService: MpesaService,
    riskService: RiskService,
    notifier: NotificationService,
    opts: MpesaModuleOptions
): Promise<void> {
    const { payload, payloadHash } = jobData
    const stkCallback = payload.Body?.stkCallback

    if (!stkCallback) {
        logError("Invalid callback payload structure", { payloadHash })
        return
    }

    // 1. Final idempotency check (race condition safety via Redis)
    const redis = getRedisConnection(opts.redisUrl)
    const alreadyProcessed = await isProcessed(redis, payloadHash)
    if (alreadyProcessed) {
        logInfo("Duplicate callback — skipping", { payloadHash })
        return
    }

    // 2. Find session via CheckoutRequestID
    const tx = mpesaService.findByCheckoutRequestId(stkCallback.CheckoutRequestID)

    // 3. Handle non-success result codes
    if (stkCallback.ResultCode !== 0) {
        logWarn("STK rejected by user or expired", {
            code: stkCallback.ResultCode,
            desc: stkCallback.ResultDesc,
            txId: tx?.id,
        })
        if (tx) {
            const updated = await mpesaService.confirmFromCallback(payload, 0, [])
            logInfo("Transaction marked as FAILED", { txId: updated?.id })
        }
        return
    }

    // 4. Risk scoring
    const riskResult = await riskService.score({
        transaction: tx ?? null,
        callback: payload,
        sessionPhone: tx?.phoneNumber ?? "",
        sessionAmount: tx?.amount ?? 0,
    })

    logInfo("Risk assessment complete", {
        score: riskResult.score,
        action: riskResult.action,
        flags: riskResult.flags,
    })

    // 5. Confirm in persistent store
    const updated = await mpesaService.confirmFromCallback(
        payload,
        riskResult.score,
        riskResult.flags
    )

    if (!updated) {
        logError("No transaction found for CheckoutRequestID", {
            crq: stkCallback.CheckoutRequestID,
        })
        return
    }

    // 6. Act on risk decision
    if (riskResult.action === "block") {
        logError("Transaction BLOCKED by fraud engine", {
            txId: updated.id,
            score: riskResult.score,
            flags: riskResult.flags,
        })
        await notifier.notifyAdmin("FRAUD_BLOCK", {
            txId: updated.id,
            score: riskResult.score,
            flags: riskResult.flags,
        })
        return
    }

    if (riskResult.action === "review") {
        logWarn("Transaction flagged for fraud review", {
            txId: updated.id,
            score: riskResult.score,
            flags: riskResult.flags,
        })
        await notifier.notifyAdmin("HIGH_RISK_REVIEW", {
            txId: updated.id,
            score: riskResult.score,
            flags: riskResult.flags,
            notes: "Awaiting admin action — not auto-captured",
        })
        // Do NOT capture — leave as under_review for admin to action
        return
    }

    // 7. Auto-approve: capture in our store
    await mpesaService.capture(updated.id)

    logInfo("Payment captured successfully", {
        txId: updated.id,
        orderId: updated.orderId,
        receipt: updated.mpesaReceipt,
        amount: updated.amount,
    })

    // 8. Tell Medusa to advance the order's payment status → captured
    //    This triggers Medusa's internal payment.captured lifecycle event,
    //    which our payment-captured.subscriber.ts listens to.
    await triggerMedusaCapture(updated.orderId, opts)

    // 9. Slack success alert
    if (opts.slackWebhookUrl) {
        await notifier.notifySuccess({
            txId: updated.id,
            orderId: updated.orderId,
            amount: updated.amount,
            receipt: updated.mpesaReceipt,
        })
    }
}

// ── Trigger Medusa payment capture ────────────
// Steps:
//   a) GET /admin/orders/{orderId} to find the payment collection ID.
//   b) GET /admin/payment-collections/{id} to find the pending payment ID.
//   c) POST /admin/payments/{paymentId}/capture to finalize capture in Medusa core.
async function triggerMedusaCapture(
    orderId: string,
    opts: MpesaModuleOptions
): Promise<void> {
    const baseUrl = process.env.BACKEND_URL ?? "http://localhost:9000"
    const apiKey = process.env.MEDUSA_API_KEY ?? ""
    const headers = {
        "x-medusa-api-key": apiKey,
        "Content-Type": "application/json",
    }

    try {
        // a) Fetch the Medusa order to get the payment_collection_id
        const orderRes = await fetch(`${baseUrl}/admin/orders/${orderId}`, { headers })

        if (!orderRes.ok) {
            logWarn("Could not fetch Medusa order for capture", {
                orderId,
                status: orderRes.status,
            })
            return
        }

        const { order } = await orderRes.json() as {
            order: { payment_collection_id?: string }
        }

        const paymentCollectionId = order?.payment_collection_id
        if (!paymentCollectionId) {
            logWarn("Medusa order has no payment_collection_id — skipping capture trigger", { orderId })
            return
        }

        // b) Fetch the payment collection to find the payment ID
        const collRes = await fetch(
            `${baseUrl}/admin/payment-collections/${paymentCollectionId}`,
            { headers }
        )

        if (!collRes.ok) {
            logWarn("Could not fetch payment collection", {
                paymentCollectionId,
                status: collRes.status,
            })
            return
        }

        const { payment_collection } = await collRes.json() as {
            payment_collection: {
                payments?: Array<{ id: string; captured_at?: string | null }>
            }
        }

        // Find the first payment that hasn't been captured yet
        const pending = payment_collection.payments?.find((p) => !p.captured_at)
        if (!pending) {
            logWarn("No uncaptured payment found in collection — may already be captured", {
                paymentCollectionId,
            })
            return
        }

        // c) POST to capture the payment in Medusa core
        const captureRes = await fetch(
            `${baseUrl}/admin/payments/${pending.id}/capture`,
            { method: "POST", headers }
        )

        if (!captureRes.ok) {
            logWarn("Medusa payment capture POST failed", {
                paymentId: pending.id,
                status: captureRes.status,
            })
        } else {
            logInfo("Medusa order capture triggered successfully", {
                orderId,
                paymentId: pending.id,
            })
        }
    } catch (err: any) {
        // Non-fatal — the reconciliation job will catch any mismatch on its next run
        logWarn("Could not trigger Medusa payment capture", { orderId, error: err.message })
    }
}
