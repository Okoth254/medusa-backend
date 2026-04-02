import { useState } from "react"
import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useMpesaTransaction, useTransactionAction } from "../../../hooks/api"

const STATUS_COLORS: Record<string, "green" | "orange" | "red" | "purple" | "grey"> = {
    captured: "green", authorized: "green", pending: "grey",
    under_review: "orange", failed: "red", expired: "red",
    cancelled: "red", reversed: "purple",
}

const RISK_FLAG_LABELS: Record<string, string> = {
    PHONE_MISMATCH: "Phone number in callback doesn't match session",
    VELOCITY_60S: "More than 3 payments in last 60 seconds from this phone",
    VELOCITY_1H: "More than 10 STK attempts in last hour",
    MULTI_CUSTOMER_SAME_PHONE: "Same phone linked to multiple customer accounts",
    RECONCILED: "Resolved via reconciliation (not original callback)",
}

const TABS = ["Overview", "Raw Payload", "Risk Signals", "Audit Log", "Recon History"]

type Props = { params: { id: string } }

export default function TransactionDetailPage({ params }: Props) {
    const { id } = params
    const [activeTab, setActiveTab] = useState("Overview")
    const [reverseReason, setReverseReason] = useState("")
    const { data, isLoading, isError, refetch } = useMpesaTransaction(id)
    const actionMutation = useTransactionAction(id)

    if (isLoading) return <div className="p-8 text-center text-ui-fg-subtle">Loading transaction...</div>
    if (isError || !data) return <div className="p-8 text-center text-ui-fg-error">Transaction not found.</div>

    const { transaction: tx, auditLog, reconHistory } = data
    const isFlagged = tx.riskScore >= 21
    const canReverse = tx.status === "captured" && !!tx.mpesaReceipt
    const canReview = tx.status === "under_review"

    const doAction = (action: "approve" | "reject" | "reverse", reason?: string) => {
        actionMutation.mutate(
            { action, reason },
            {
                onSuccess: () => {
                    toast.success("Action completed", { description: `${action} applied successfully.` })
                    refetch()
                },
                onError: (err: any) => {
                    toast.error("Action failed", { description: err?.message ?? "Unknown error" })
                },
            }
        )
    }

    return (
        <div className="flex flex-col gap-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Heading level="h1">Transaction Detail</Heading>
                    <Text className="text-ui-fg-subtle font-mono text-small mt-1">{tx.id}</Text>
                </div>
                <div className="flex items-center gap-x-3">
                    {isFlagged && <Badge color="orange">⚠ High Risk</Badge>}
                    <Badge color={STATUS_COLORS[tx.status] ?? "grey"}>{tx.status}</Badge>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Order ID", value: tx.orderId, mono: true },
                    { label: "Phone", value: tx.phoneNumber },
                    { label: "Amount", value: `KES ${tx.amount.toLocaleString()}` },
                    { label: "M-Pesa Receipt", value: tx.mpesaReceipt ?? "Pending", mono: true },
                    { label: "Risk Score", value: String(tx.riskScore), highlight: isFlagged },
                    { label: "Merchant Req ID", value: tx.merchantRequestId, mono: true },
                    { label: "Checkout Req ID", value: tx.checkoutRequestId, mono: true },
                    { label: "Created", value: new Date(tx.createdAt).toLocaleString() },
                ].map(card => (
                    <Container key={card.label} className="p-4">
                        <Text className="text-ui-fg-subtle text-small mb-1">{card.label}</Text>
                        <Text className={`font-medium ${card.mono ? "font-mono text-small" : ""} ${card.highlight ? "text-ui-fg-error" : ""}`}>
                            {card.value}
                        </Text>
                    </Container>
                ))}
            </div>

            {/* Tabs */}
            <Container className="p-0 overflow-hidden">
                <div className="flex border-b border-ui-border-base px-4">
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-small font-medium border-b-2 transition-colors ${activeTab === tab
                                    ? "border-ui-fg-base text-ui-fg-base"
                                    : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {/* Overview Tab */}
                    {activeTab === "Overview" && (
                        <div className="space-y-4">
                            <table className="w-full text-small">
                                <tbody className="divide-y divide-ui-border-base">
                                    {[
                                        ["Internal Status", tx.status],
                                        ["Phone Number", tx.phoneNumber],
                                        ["Customer ID", tx.customerId ?? "—"],
                                        ["Currency", tx.currency],
                                        ["Updated At", new Date(tx.updatedAt).toLocaleString()],
                                    ].map(([k, v]) => (
                                        <tr key={k}>
                                            <td className="py-2 text-ui-fg-subtle w-40">{k}</td>
                                            <td className="py-2">{v}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Actions */}
                            <div className="pt-4 border-t border-ui-border-base space-y-3">
                                {canReview && (
                                    <div className="flex gap-x-2">
                                        <Button variant="primary" size="small" isLoading={actionMutation.isPending}
                                            onClick={() => doAction("approve", "Manual review approved")}>
                                            ✓ Approve
                                        </Button>
                                        <Button variant="danger" size="small" isLoading={actionMutation.isPending}
                                            onClick={() => doAction("reject", "Rejected after fraud review")}>
                                            ✗ Reject
                                        </Button>
                                    </div>
                                )}
                                {canReverse && (
                                    <div>
                                        <Text className="text-ui-fg-subtle text-small mb-2">Reversal Reason</Text>
                                        <input
                                            className="w-full px-3 py-2 border border-ui-border-base rounded bg-ui-bg-field text-small mb-2"
                                            placeholder="e.g. Customer requested refund"
                                            value={reverseReason}
                                            onChange={e => setReverseReason(e.target.value)}
                                        />
                                        <Button
                                            variant="danger"
                                            size="small"
                                            isLoading={actionMutation.isPending}
                                            onClick={() => {
                                                if (reverseReason.trim().length < 5) {
                                                    toast.error("Please enter a reason (at least 5 characters)")
                                                    return
                                                }
                                                doAction("reverse", reverseReason)
                                            }}
                                        >
                                            Initiate B2C Reversal
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Raw Payload Tab */}
                    {activeTab === "Raw Payload" && (
                        <pre className="bg-ui-bg-subtle rounded p-4 text-small font-mono overflow-auto max-h-96 text-ui-fg-subtle">
                            {tx.rawCallbackPayload
                                ? JSON.stringify(tx.rawCallbackPayload, null, 2)
                                : "No callback payload received yet."}
                        </pre>
                    )}

                    {/* Risk Signals Tab */}
                    {activeTab === "Risk Signals" && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-x-3 mb-4">
                                <Text className="text-ui-fg-subtle">Score:</Text>
                                <span className={`text-2xl font-bold ${tx.riskScore > 50 ? "text-ui-fg-error" : tx.riskScore > 20 ? "text-orange-400" : "text-ui-fg-base"}`}>
                                    {tx.riskScore}
                                </span>
                                <Badge color={tx.riskScore > 50 ? "red" : tx.riskScore > 20 ? "orange" : "green"}>
                                    {tx.riskScore > 50 ? "Block" : tx.riskScore > 20 ? "Review" : "Approve"}
                                </Badge>
                            </div>
                            {tx.riskFlags.length === 0 ? (
                                <Text className="text-ui-fg-subtle">No risk flags detected.</Text>
                            ) : (
                                tx.riskFlags.map(flag => (
                                    <Container key={flag} className="p-3 border-l-4 border-orange-400">
                                        <Text className="font-medium">{flag}</Text>
                                        <Text className="text-ui-fg-subtle text-small">
                                            {RISK_FLAG_LABELS[flag.split(":")[0]] ?? flag}
                                        </Text>
                                    </Container>
                                ))
                            )}
                        </div>
                    )}

                    {/* Audit Log Tab */}
                    {activeTab === "Audit Log" && (
                        <div>
                            {auditLog.length === 0 ? (
                                <Text className="text-ui-fg-subtle">No admin actions yet.</Text>
                            ) : (
                                <table className="w-full text-small">
                                    <thead>
                                        <tr className="border-b border-ui-border-base">
                                            <th className="text-left py-2 text-ui-fg-subtle">Action</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Admin</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Reason</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ui-border-base">
                                        {auditLog.map(log => (
                                            <tr key={log.id}>
                                                <td className="py-2"><Badge color="grey">{log.action}</Badge></td>
                                                <td className="py-2 font-mono">{log.adminId}</td>
                                                <td className="py-2 text-ui-fg-subtle">{log.reason}</td>
                                                <td className="py-2 text-ui-fg-subtle">{new Date(log.createdAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* Recon History Tab */}
                    {activeTab === "Recon History" && (
                        <div>
                            {reconHistory.length === 0 ? (
                                <Text className="text-ui-fg-subtle">No reconciliation history for this transaction.</Text>
                            ) : (
                                <table className="w-full text-small">
                                    <thead>
                                        <tr className="border-b border-ui-border-base">
                                            <th className="text-left py-2 text-ui-fg-subtle">Daraja Status</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Internal Status</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Action Taken</th>
                                            <th className="text-left py-2 text-ui-fg-subtle">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ui-border-base">
                                        {reconHistory.map(log => (
                                            <tr key={log.id}>
                                                <td className="py-2">{log.darajaStatus}</td>
                                                <td className="py-2">{log.internalStatus}</td>
                                                <td className="py-2"><Badge color="grey">{log.actionTaken}</Badge></td>
                                                <td className="py-2 text-ui-fg-subtle">{new Date(log.reconciledAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </Container>
        </div>
    )
}
