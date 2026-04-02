import { MpesaModuleOptions, MpesaTransactionRecord } from "./types"
import { logInfo, logError } from "./logger"

// ── Slack Block Kit helpers ───────────────────
function buildBlocks(event: string, lines: Array<{ label: string; value: string }>, color: "danger" | "warning" | "good") {
    const emoji = color === "danger" ? "🚨" : color === "warning" ? "⚠️" : "✅"
    const fields = lines.map(({ label, value }) => ({
        type: "mrkdwn",
        text: `*${label}*\n${value}`,
    }))

    return {
        attachments: [
            {
                color: color === "danger" ? "#FF0000" : color === "warning" ? "#FFA500" : "#36A64F",
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `${emoji} M-Pesa Alert: ${event}`,
                            emoji: true,
                        },
                    },
                    { type: "divider" },
                    {
                        type: "section",
                        fields,
                    },
                    {
                        type: "context",
                        elements: [
                            {
                                type: "mrkdwn",
                                text: `Timestamp: ${new Date().toISOString()}`,
                            },
                        ],
                    },
                ],
            },
        ],
    }
}

// ─────────────────────────────────────────────
//  NotificationService
// ─────────────────────────────────────────────
export class NotificationService {
    constructor(private readonly options: MpesaModuleOptions) { }

    /**
     * Notify administrators of critical M-Pesa events.
     * Sends Slack Block Kit messages if SLACK_WEBHOOK_URL is configured,
     * otherwise falls back to structured logger output.
     */
    async notifyAdmin(
        event: "FRAUD_BLOCK" | "RECON_DISCREPANCY" | "HIGH_RISK_REVIEW",
        context: { txId: string; score?: number; flags?: string[]; notes?: string }
    ): Promise<void> {
        const lines: Array<{ label: string; value: string }> = [
            { label: "Transaction ID", value: context.txId },
        ]
        if (context.score !== undefined) lines.push({ label: "Risk Score", value: String(context.score) })
        if (context.flags?.length) lines.push({ label: "Flags", value: context.flags.join(", ") })
        if (context.notes) lines.push({ label: "Notes", value: context.notes })

        const color = event === "FRAUD_BLOCK" ? "danger" : "warning" as const

        await this._sendSlack(
            buildBlocks(event, lines, color),
            `[${event}] TX ${context.txId}`
        )
    }

    /**
     * Notify admins of a successful M-Pesa capture.
     */
    async notifySuccess(context: {
        txId: string
        orderId: string
        amount: number
        receipt?: string
    }): Promise<void> {
        const lines: Array<{ label: string; value: string }> = [
            { label: "Order ID", value: context.orderId },
            { label: "Amount", value: `KES ${context.amount.toLocaleString()}` },
            { label: "Transaction ID", value: context.txId },
        ]
        if (context.receipt) lines.push({ label: "Receipt", value: context.receipt })

        await this._sendSlack(
            buildBlocks("PAYMENT CAPTURED", lines, "good"),
            `✅ M-Pesa captured KES ${context.amount.toLocaleString()} | Order ${context.orderId}`
        )
    }

    /**
     * Send customer a success SMS (stubbed — requires Africa's Talking or similar).
     */
    async notifyCustomer(transaction: MpesaTransactionRecord): Promise<void> {
        logInfo("Customer SMS notification stub", { phone: transaction.phoneNumber, amount: transaction.amount })
    }

    // ── Internal Slack sender ─────────────────
    private async _sendSlack(body: object, fallbackText: string): Promise<void> {
        if (this.options.slackWebhookUrl) {
            try {
                const { default: axios } = await import("axios")
                await axios.post(this.options.slackWebhookUrl, body)
                logInfo("Slack notification sent", { text: fallbackText })
            } catch (error: any) {
                logError("Failed to send Slack notification", { error: error.message })
            }
        } else {
            logError("Admin Alert (No Slack URL configured)", { message: fallbackText })
        }
    }
}
