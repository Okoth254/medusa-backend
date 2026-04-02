import { useState } from "react"
import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useMpesaFraudReview, useTransactionAction, MpesaTransaction } from "../../../hooks/api"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ExclamationCircle } from "@medusajs/icons"

export const config = defineRouteConfig({
    label: "Fraud Review",
    icon: ExclamationCircle,
})

const RISK_FLAG_LABELS: Record<string, string> = {
    PHONE_MISMATCH: "Phone mismatch",
    VELOCITY_60S: "Velocity (60s)",
    VELOCITY_1H: "Velocity (1h)",
    MULTI_CUSTOMER_SAME_PHONE: "Multi-customer phone",
}

export default function FraudReviewPage() {
    const { data, isLoading, isError, refetch } = useMpesaFraudReview()
    const transactions = data?.transactions ?? []

    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Heading level="h1">Fraud Review Queue</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        {isLoading ? "Loading..." : `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""} pending review`}
                    </Text>
                </div>
                <Button variant="secondary" size="small" onClick={() => refetch()}>
                    Refresh
                </Button>
            </div>

            {isLoading && <div className="p-8 text-center text-ui-fg-subtle">Loading flagged transactions...</div>}
            {isError && <div className="p-8 text-center text-ui-fg-error">Failed to load fraud queue.</div>}

            {!isLoading && transactions.length === 0 && (
                <Container className="p-8 text-center">
                    <Text className="text-ui-fg-subtle">✅ No transactions pending review. Great!</Text>
                </Container>
            )}

            <div className="flex flex-col gap-y-3">
                {transactions.map(tx => (
                    <FraudRow key={tx.id} tx={tx} onAction={refetch} />
                ))}
            </div>
        </div>
    )
}

function FraudRow({ tx, onAction }: { tx: MpesaTransaction; onAction: () => void }) {
    const actionMutation = useTransactionAction(tx.id)
    const [note, setNote] = useState("")

    const doAction = (action: "approve" | "reject" | "reverse") => {
        if ((action === "reject" || action === "reverse") && note.trim().length < 3) {
            toast.error("Please enter a reason")
            return
        }
        actionMutation.mutate(
            { action, reason: note || `${action} via fraud review panel` },
            {
                onSuccess: () => {
                    toast.success(`Transaction ${action}d`, {
                        description: `TX ${tx.id.substring(0, 8)}... has been ${action}d.`
                    })
                    onAction()
                },
                onError: (err: any) => {
                    toast.error("Action failed", { description: err?.message ?? "Unknown error" })
                },
            }
        )
    }

    return (
        <Container className="p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-x-3">
                        <Badge color="orange">⚠ Risk Score: {tx.riskScore}</Badge>
                        <Text className="font-mono text-small text-ui-fg-subtle">{tx.id.substring(0, 16)}...</Text>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-small">
                        <div><Text className="text-ui-fg-subtle">Phone:</Text> <Text>{tx.phoneNumber}</Text></div>
                        <div><Text className="text-ui-fg-subtle">Amount:</Text> <Text>KES {tx.amount.toLocaleString()}</Text></div>
                        <div><Text className="text-ui-fg-subtle">Order:</Text> <Text className="font-mono">{tx.orderId ? `${tx.orderId.substring(0, 12)}...` : "—"}</Text></div>
                        <div><Text className="text-ui-fg-subtle">Date:</Text> <Text>{new Date(tx.createdAt).toLocaleDateString()}</Text></div>
                    </div>
                    {/* Risk flags */}
                    <div className="flex flex-wrap gap-2 mt-2">
                        {tx.riskFlags.map(flag => (
                            <span key={flag} className="px-2 py-0.5 rounded text-xs bg-orange-900/40 text-orange-300 border border-orange-700">
                                {RISK_FLAG_LABELS[flag.split(":")[0]] ?? flag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-y-2 min-w-60">
                    <input
                        className="px-3 py-2 border border-ui-border-base rounded bg-ui-bg-field text-small"
                        placeholder="Escalation note / reason..."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button size="small" variant="primary" isLoading={actionMutation.isPending}
                            onClick={() => doAction("approve")}>
                            ✓ Approve
                        </Button>
                        <Button size="small" variant="danger" isLoading={actionMutation.isPending}
                            onClick={() => doAction("reject")}>
                            ✗ Reject
                        </Button>
                        <a href={`/app/mpesa/${tx.id}`}
                            className="px-3 py-1.5 rounded border border-ui-border-base text-small text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
                            View
                        </a>
                    </div>
                </div>
            </div>
        </Container>
    )
}
