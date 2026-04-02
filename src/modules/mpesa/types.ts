// ─────────────────────────────────────────────
//  M-Pesa Module – Shared Types & Interfaces
// ─────────────────────────────────────────────

// ── Status Enum ──────────────────────────────
export enum MpesaStatus {
    PENDING = "pending",
    AUTHORIZED = "authorized",
    CAPTURED = "captured",
    FAILED = "failed",
    REVERSED = "reversed",
    UNDER_REVIEW = "under_review",
    EXPIRED = "expired",
    CANCELLED = "cancelled",
}

// ── Module Options (from medusa-config.ts) ───
export interface MpesaModuleOptions {
    consumerKey: string
    consumerSecret: string
    shortcode: string
    passkey: string
    initiatorName: string
    securityCredential: string
    callbackBaseUrl: string
    environment: "sandbox" | "production"
    redisUrl: string
    slackWebhookUrl?: string
    financeAdminEmail?: string
    /**
     * Daraja transaction type.
     * "CustomerPayBillOnline" for Paybill numbers (default)
     * "CustomerBuyGoodsOnline" for Till numbers
     */
    transactionType?: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline"
}


// ── Daraja STK Push Payload ───────────────────
export interface STKPushPayload {
    BusinessShortCode: string
    Password: string
    Timestamp: string
    TransactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline"
    Amount: number
    PartyA: string
    PartyB: string
    PhoneNumber: string
    CallBackURL: string
    AccountReference: string
    TransactionDesc: string
}

// ── Daraja STK Response ───────────────────────
export interface STKPushResponse {
    MerchantRequestID: string
    CheckoutRequestID: string
    ResponseCode: string
    ResponseDescription: string
    CustomerMessage: string
}

// ── Daraja Callback Body ──────────────────────
export interface DarajaCallbackBody {
    Body: {
        stkCallback: {
            MerchantRequestID: string
            CheckoutRequestID: string
            ResultCode: number        // 0 = success
            ResultDesc: string
            CallbackMetadata?: {
                Item: Array<{ Name: string; Value: string | number }>
            }
        }
    }
}

// ── Daraja Query Response ─────────────────────
export interface DarajaQueryResponse {
    ResponseCode: string
    ResponseDescription: string
    MerchantRequestID: string
    CheckoutRequestID: string
    ResultCode: string
    ResultDesc: string
}

// ── Daraja Reversal Response ──────────────────
export interface DarajaReversalResponse {
    OriginatorConversationID: string
    ConversationID: string
    ResponseCode: string
    ResponseDescription: string
}

// ── Daraja Account Balance Response ──────────
export interface DarajaBalanceResponse {
    OriginatorConversationID: string
    ConversationID: string
    ResponseCode: string
    ResponseDescription: string
}

// ── Internal Transaction Record ───────────────
export interface MpesaTransactionRecord {
    id: string
    orderId: string
    customerId?: string
    phoneNumber: string
    merchantRequestId: string
    checkoutRequestId: string
    mpesaReceipt?: string
    amount: number
    currency: string
    status: MpesaStatus
    rawCallbackPayload?: Record<string, unknown>
    riskScore: number
    riskFlags: string[]
    callbackHash?: string
    createdAt: Date
    updatedAt: Date
}

// ── Reconciliation Log Record ─────────────────
export interface ReconciliationLogRecord {
    id: string
    transactionId: string
    darajaStatus: string
    internalStatus: string
    actionTaken: string
    reconciledAt: Date
}

// ── Audit Log Record ──────────────────────────
export interface AuditLogRecord {
    id: string
    adminId: string
    action: string
    transactionId: string
    reason: string
    createdAt: Date
}

// ── Risk Score Result ─────────────────────────
export interface RiskScoreResult {
    score: number
    flags: string[]
    action: "approve" | "review" | "block"
}

// ── Queue Job Data ────────────────────────────
export interface CallbackJobData {
    payload: DarajaCallbackBody
    receivedAt: string
    sourceIp: string
    payloadHash: string
}

// ── Safaricom Allowlisted IP Ranges ───────────
export const SAFARICOM_IPS = [
    "196.201.214.200",
    "196.201.214.206",
    "196.201.213.114",
    "196.201.214.207",
    "196.201.214.208",
    "196.201.213.44",
    "196.201.212.127",
    "196.201.212.138",
    "196.201.212.129",
    "196.201.212.136",
    "196.201.212.74",
    "196.201.212.69",
]

// ── Payment Session Data (stored by Medusa) ──
export interface MpesaSessionData {
    status: MpesaStatus
    transactionId?: string
    checkoutRequestId?: string
    merchantRequestId?: string
    phone?: string
    amount?: number
    mpesaReceipt?: string
    errorMessage?: string
}
