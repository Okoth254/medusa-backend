import axios, { AxiosInstance } from "axios"
import {
    MpesaModuleOptions,
    STKPushPayload,
    STKPushResponse,
    DarajaQueryResponse,
    DarajaReversalResponse,
    DarajaBalanceResponse,
} from "./types"
import { buildPassword, generateTimestamp, withRetry } from "./utils"

// ── Base URLs ─────────────────────────────────
const BASE_URLS = {
    sandbox: "https://sandbox.safaricom.co.ke",
    production: "https://api.safaricom.co.ke",
}

// Token cache bucket
interface TokenCache {
    token: string
    expiresAt: number  // ms timestamp
}

// ─────────────────────────────────────────────
//  DarajaClient – All Daraja HTTP calls
//  Business logic NEVER calls Daraja directly.
// ─────────────────────────────────────────────
export class DarajaClient {
    private http: AxiosInstance
    private options: MpesaModuleOptions
    private tokenCache: TokenCache | null = null

    constructor(options: MpesaModuleOptions) {
        this.options = options
        this.http = axios.create({
            baseURL: BASE_URLS[options.environment] ?? BASE_URLS.sandbox,
            timeout: 30_000,
        })
    }

    // ── OAuth2 Token (cached 55 min) ─────────────
    async getAccessToken(): Promise<string> {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
            return this.tokenCache.token
        }

        const auth = Buffer.from(
            `${this.options.consumerKey}:${this.options.consumerSecret}`
        ).toString("base64")

        const response = await withRetry(
            () =>
                this.http.get<{ access_token: string; expires_in: string }>(
                    "/oauth/v1/generate?grant_type=client_credentials",
                    { headers: { Authorization: `Basic ${auth}` } }
                ),
            3,
            500
        )

        const token = response.data.access_token
        // Cache for 55 minutes (token lives 60 min)
        this.tokenCache = {
            token,
            expiresAt: Date.now() + 55 * 60 * 1000,
        }

        return token
    }

    // ── STK Push ─────────────────────────────────
    async initiateSTKPush(params: {
        amount: number
        phone: string
        reference: string
        description?: string
    }): Promise<STKPushResponse> {
        const token = await this.getAccessToken()
        const timestamp = generateTimestamp()
        const password = buildPassword(
            this.options.shortcode,
            this.options.passkey,
            timestamp
        )

        const payload: STKPushPayload = {
            BusinessShortCode: this.options.shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: this.options.transactionType || "CustomerPayBillOnline",
            Amount: Math.ceil(params.amount),                     // Daraja requires integer
            PartyA: params.phone,
            PartyB: this.options.shortcode,
            PhoneNumber: params.phone,
            CallBackURL: `${this.options.callbackBaseUrl}/store/mpesa/callback`,
            AccountReference: params.reference.slice(0, 12),     // max 12 chars
            TransactionDesc: params.description ?? "Order Payment",
        }

        const response = await withRetry(
            () =>
                this.http.post<STKPushResponse>(
                    "/mpesa/stkpush/v1/processrequest",
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
            3,
            500
        )

        return response.data
    }

    // ── Query Transaction Status ──────────────────
    async queryTransactionStatus(
        checkoutRequestId: string
    ): Promise<DarajaQueryResponse> {
        const token = await this.getAccessToken()
        const timestamp = generateTimestamp()
        const password = buildPassword(
            this.options.shortcode,
            this.options.passkey,
            timestamp
        )

        const response = await withRetry(
            () =>
                this.http.post<DarajaQueryResponse>(
                    "/mpesa/stkpushquery/v1/query",
                    {
                        BusinessShortCode: this.options.shortcode,
                        Password: password,
                        Timestamp: timestamp,
                        CheckoutRequestID: checkoutRequestId,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
            3,
            1000
        )

        return response.data
    }

    // ── Initiate Reversal ─────────────────────────
    async reverseTransaction(params: {
        transactionId: string     // Mpesa receipt number
        amount: number
        reason: string
        receiverParty: string     // Phone or shortcode
    }): Promise<DarajaReversalResponse> {
        const token = await this.getAccessToken()

        const response = await withRetry(
            () =>
                this.http.post<DarajaReversalResponse>(
                    "/mpesa/reversal/v1/request",
                    {
                        Initiator: this.options.initiatorName,
                        SecurityCredential: this.options.securityCredential,
                        CommandID: "TransactionReversal",
                        TransactionID: params.transactionId,
                        Amount: Math.ceil(params.amount),
                        ReceiverParty: this.options.shortcode,
                        RecieverIdentifierType: "11",
                        ResultURL: `${this.options.callbackBaseUrl}/store/mpesa/callback/reversal`,
                        QueueTimeOutURL: `${this.options.callbackBaseUrl}/store/mpesa/callback/timeout`,
                        Remarks: params.reason.slice(0, 100),
                        Occasion: params.reason.slice(0, 100),
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
            3,
            1000
        )

        return response.data
    }

    // ── Account Balance ───────────────────────────
    // Queries the Daraja Account Balance API for the configured shortcode.
    // NOTE: Daraja responds immediately with an OriginatorConversationID;
    // the actual balance arrives asynchronously via the ResultURL callback.
    async getAccountBalance(): Promise<DarajaBalanceResponse> {
        const token = await this.getAccessToken()

        const response = await withRetry(
            () =>
                this.http.post<DarajaBalanceResponse>(
                    "/mpesa/accountbalance/v1/query",
                    {
                        Initiator: this.options.initiatorName,
                        SecurityCredential: this.options.securityCredential,
                        CommandID: "AccountBalance",
                        PartyA: this.options.shortcode,
                        IdentifierType: "4",
                        Remarks: "Balance Query",
                        QueueTimeOutURL: `${this.options.callbackBaseUrl}/store/mpesa/callback/timeout`,
                        ResultURL: `${this.options.callbackBaseUrl}/store/mpesa/callback/balance`,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
            3,
            1000
        )

        return response.data
    }
}
