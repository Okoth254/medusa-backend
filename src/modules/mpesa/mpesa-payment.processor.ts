import { AbstractPaymentProvider, BigNumber } from "@medusajs/framework/utils"
import {
    InitiatePaymentInput,
    InitiatePaymentOutput,
    UpdatePaymentInput,
    UpdatePaymentOutput,
    AuthorizePaymentInput,
    AuthorizePaymentOutput,
    CapturePaymentInput,
    CapturePaymentOutput,
    CancelPaymentInput,
    CancelPaymentOutput,
    RefundPaymentInput,
    RefundPaymentOutput,
    RetrievePaymentInput,
    RetrievePaymentOutput,
    DeletePaymentInput,
    DeletePaymentOutput,
    GetPaymentStatusInput,
    GetPaymentStatusOutput,
    ProviderWebhookPayload,
    WebhookActionResult,
} from "@medusajs/framework/types"
import { DarajaClient } from "./daraja.client"
import { MpesaService } from "./mpesa.service"
import { MpesaStatus, MpesaSessionData, MpesaModuleOptions } from "./types"
import { formatPhone, isValidKenyanPhone, extractMetaValue } from "./utils"

// ─────────────────────────────────────────────
//  MpesaPaymentProcessor
//  Medusa v2 AbstractPaymentProvider implementation
// ─────────────────────────────────────────────
class MpesaPaymentProcessor extends AbstractPaymentProvider<MpesaModuleOptions> {
    /**
     * Final provider ID stored by Medusa will be: pp_mpesa_<id>
     * where <id> comes from medusa-config.ts providers[].id = "mpesa"
     */
    static identifier = "mpesa"

    private daraja: DarajaClient
    private mpesaService: MpesaService
    private opts: MpesaModuleOptions

    constructor(
        container: Record<string, unknown>,
        options: MpesaModuleOptions
    ) {
        super(container, options)
        this.opts = options

        // ── Environment Validation ────────────────────
        const isProd = options.environment === "production"
        if (isProd) {
            const missing: string[] = []
            if (!options.consumerKey) missing.push("consumerKey")
            if (!options.consumerSecret) missing.push("consumerSecret")
            if (!options.shortcode) missing.push("shortcode")
            if (!options.passkey) missing.push("passkey")
            if (!options.securityCredential) missing.push("securityCredential")

            if (missing.length > 0) {
                throw new Error(
                    `[M-Pesa] CRITICAL: Environment is set to "production" but the following required credentials are missing in medusa-config/env: ${missing.join(", ")}`
                )
            }
        }

        this.daraja = new DarajaClient(options)
        this.mpesaService = new MpesaService(this.daraja, options)
    }

    // ── Map internal status → Medusa status string ─
    private mapStatus(
        status: MpesaStatus
    ): GetPaymentStatusOutput["status"] {
        const map: Record<MpesaStatus, GetPaymentStatusOutput["status"]> = {
            [MpesaStatus.PENDING]: "pending",
            [MpesaStatus.AUTHORIZED]: "authorized",
            [MpesaStatus.CAPTURED]: "captured",
            [MpesaStatus.FAILED]: "error",
            [MpesaStatus.REVERSED]: "canceled",
            [MpesaStatus.UNDER_REVIEW]: "requires_more",
            [MpesaStatus.EXPIRED]: "error",
            [MpesaStatus.CANCELLED]: "canceled",
        }
        return map[status] ?? "pending"
    }

    // ── initiatePayment ───────────────────────────
    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
        const { amount, currency_code, context } = input
        // Phone from customer context
        const customer = context?.customer
        const phone = customer?.phone

        if (!phone) {
            throw new Error("Phone number is required for M-Pesa payment. Ensure customer.phone is set.")
        }

        const formatted = formatPhone(phone)
        if (!isValidKenyanPhone(formatted)) {
            throw new Error(`Invalid Kenyan phone number: ${phone}`)
        }

        // Order ID is passed via idempotency_key, or from session data
        const orderId = input.context?.idempotency_key ?? customer?.id ?? "unknown"
        const customerId = customer?.id

        // Amount from Medusa is in smallest currency unit — convert to KES
        const amountInKes = Number(amount) / 100

        const tx = await this.mpesaService.initiateSTKPush({
            orderId,
            customerId,
            phone: formatted,
            amount: amountInKes,
            reference: orderId,
        })

        const sessionData: MpesaSessionData = {
            status: MpesaStatus.PENDING,
            transactionId: tx.id,
            checkoutRequestId: tx.checkoutRequestId,
            merchantRequestId: tx.merchantRequestId,
            phone: formatted,
            amount: tx.amount,
        }

        return {
            id: tx.id,
            data: sessionData as unknown as Record<string, unknown>,
        }
    }

    // ── updatePayment ─────────────────────────────
    async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
        // Re-initiate because Daraja STK sessions cannot be updated mid-flow
        return this.initiatePayment(input as unknown as InitiatePaymentInput)
    }

    // ── authorizePayment ──────────────────────────
    async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
        const data = input.data as unknown as MpesaSessionData | undefined
        const tx = data?.transactionId
            ? this.mpesaService.getTransaction(data.transactionId)
            : undefined

        const currentStatus = tx?.status ?? data?.status ?? MpesaStatus.PENDING

        return {
            data: input.data ?? {},
            status: this.mapStatus(currentStatus) as AuthorizePaymentOutput["status"],
        }
    }

    // ── capturePayment ────────────────────────────
    async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
        const data = input.data as unknown as MpesaSessionData | undefined
        if (data?.transactionId) {
            await this.mpesaService.capture(data.transactionId)
        }
        return {
            data: { ...(input.data ?? {}), status: MpesaStatus.CAPTURED },
        }
    }

    // ── cancelPayment ─────────────────────────────
    async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
        return {
            data: { ...(input.data ?? {}), status: MpesaStatus.CANCELLED },
        }
    }

    // ── refundPayment ─────────────────────────────
    async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
        const data = input.data as unknown as MpesaSessionData | undefined
        if (!data?.transactionId) {
            throw new Error("Missing transactionId in payment data for refund")
        }

        await this.mpesaService.reverseTransaction({
            transactionId: data.transactionId,
            adminId: "system",
            reason: `Refund of ${Number(input.amount) / 100} KES`,
        })

        return {
            data: { ...(input.data ?? {}), status: MpesaStatus.REVERSED },
        }
    }

    // ── retrievePayment ───────────────────────────
    async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
        const data = input.data as unknown as MpesaSessionData | undefined
        if (data?.checkoutRequestId) {
            const result = await this.daraja.queryTransactionStatus(data.checkoutRequestId)
            return {
                data: {
                    ...(input.data ?? {}),
                    darajaResultCode: result.ResultCode,
                    darajaResultDesc: result.ResultDesc,
                },
            }
        }
        return { data: input.data ?? {} }
    }

    // ── deletePayment ─────────────────────────────
    async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
        return {
            data: { ...(input.data ?? {}), status: MpesaStatus.CANCELLED },
        }
    }

    // ── getPaymentStatus ──────────────────────────
    async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
        const data = input.data as unknown as MpesaSessionData | undefined
        const tx = data?.transactionId
            ? this.mpesaService.getTransaction(data.transactionId)
            : undefined
        const status = tx?.status ?? data?.status ?? MpesaStatus.PENDING
        return { status: this.mapStatus(status) }
    }

    // ── getWebhookActionAndData ───────────────────
    // Daraja uses a dedicated callback route, not Medusa's generic webhook endpoint.
    // This method handles any Medusa-level webhook forwarding if configured.
    async getWebhookActionAndData(
        payload: ProviderWebhookPayload["payload"]
    ): Promise<WebhookActionResult> {
        try {
            const data = payload.data as Record<string, unknown>
            const body = data?.Body as Record<string, unknown> | undefined
            const stkCallback = body?.stkCallback as Record<string, unknown> | undefined

            if (!stkCallback) {
                return {
                    action: "not_supported",
                    data: { session_id: "", amount: new BigNumber(0) },
                }
            }

            const resultCode = stkCallback.ResultCode as number
            const checkoutRequestId = stkCallback.CheckoutRequestID as string
            const metaItems = (
                (stkCallback.CallbackMetadata as Record<string, unknown>)?.Item ?? []
            ) as Array<{ Name: string; Value: string | number }>

            const amount = Number(extractMetaValue(metaItems, "Amount") ?? 0)

            if (resultCode === 0) {
                return {
                    action: "authorized",
                    data: {
                        session_id: checkoutRequestId,
                        amount: new BigNumber(amount),
                    },
                }
            }

            return {
                action: "failed",
                data: {
                    session_id: checkoutRequestId,
                    amount: new BigNumber(0),
                },
            }
        } catch {
            return {
                action: "failed",
                data: { session_id: "", amount: new BigNumber(0) },
            }
        }
    }

    // ── Expose service for use by route handlers ──
    getService(): MpesaService {
        return this.mpesaService
    }
}

export default MpesaPaymentProcessor
