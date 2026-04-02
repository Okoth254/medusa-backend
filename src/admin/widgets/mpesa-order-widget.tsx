import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Badge, Button, toast, usePrompt } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useReverseMpesaTransaction, MpesaTransaction } from "../hooks/api"
import { sdk } from "../lib/sdk"
import { useState } from "react"

type OrderWidgetProps = {
    data: {
        id: string
        payment_collections?: Array<{
            payment_providers?: Array<{ id: string }>
            payments?: Array<{ provider_id: string }>
        }>
    }
}

const isMpesaOrder = (props: OrderWidgetProps) => {
    return props.data.payment_collections?.some(pc =>
        pc.payment_providers?.some(prov => prov.id === "mpesa") ||
        pc.payments?.some(pay => pay.provider_id === "mpesa")
    ) ?? false
}

const fetchTransactionByOrderId = async (orderId: string) => {
    const { transactions } = await sdk.client.fetch<{ transactions: MpesaTransaction[] }>(
        `/admin/mpesa/transactions`,
        { method: "GET" }
    )
    return transactions.find(t => t.orderId === orderId) || null
}

const RISK_FLAG_LABELS: Record<string, string> = {
    PHONE_MISMATCH: "Phone mismatch detected",
    VELOCITY_60S: "High velocity in 60s",
    VELOCITY_1H: "High velocity in 1h",
    MULTI_CUSTOMER_SAME_PHONE: "Multi-customer same phone",
}

const STATUS_COLORS: Record<string, "green" | "orange" | "red" | "purple" | "grey"> = {
    captured: "green", authorized: "green", pending: "grey",
    under_review: "orange", failed: "red", expired: "red",
    cancelled: "red", reversed: "purple",
}

const MpesaOrderWidget = (props: OrderWidgetProps) => {
    if (!isMpesaOrder(props)) return null

    const dialog = usePrompt()
    const [isReversing, setIsReversing] = useState(false)
    const [reason, setReason] = useState("")


    const { data: tx, isLoading, refetch } = useQuery({
        queryFn: () => fetchTransactionByOrderId(props.data.id),
        queryKey: ["mpesa_tx_for_order", props.data.id],
    })

    const reverseMutation = useReverseMpesaTransaction(tx?.id ?? "unknown")

    const handleReverseClick = async () => {
        if (reason.trim().length < 5) {
            toast.error("Reason required", { description: "Please enter at least 5 characters." })
            return
        }

        const confirmed = await dialog({
            title: "Initiate M-Pesa Reversal",
            description: "This contacts Safaricom Daraja immediately. Reversals take up to 48 hours to complete. Are you sure?",
            confirmText: "Yes, Reverse",
            cancelText: "Cancel",
        })
        if (!confirmed) return

        setIsReversing(true)
        reverseMutation.mutate({ reason }, {
            onSuccess: () => {
                toast.success("Reversal initiated", {
                    description: "Awaiting Safaricom confirmation. This may take up to 48 hours.",
                })
                refetch()
                setIsReversing(false)
                setReason("")
            },
            onError: (err: any) => {
                toast.error("Reversal failed", { description: err?.message ?? "Unknown error" })
                setIsReversing(false)
            },
        })
    }

    if (isLoading) return null

    if (!tx) return (
        <Container className="p-6 mb-4">
            <Heading level="h2">M-Pesa Payment Info</Heading>
            <Text className="text-ui-fg-subtle mt-2">
                No detailed transaction logs found for this order.
            </Text>
        </Container>
    )

    const isFlagged = tx.riskScore >= 21
    const canReverse = tx.status === "captured" && !!tx.mpesaReceipt

    return (
        <Container className="p-6 mb-4 flex flex-col gap-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Heading level="h2">M-Pesa Payment Details</Heading>
                {isFlagged && <Badge color="orange">⚠ Flagged for Review</Badge>}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                    <Text className="text-ui-fg-subtle text-small">M-Pesa Receipt</Text>
                    <Text className="font-mono">{tx.mpesaReceipt ?? "N/A"}</Text>
                </div>
                <div>
                    <Text className="text-ui-fg-subtle text-small">Phone Number</Text>
                    <Text>{tx.phoneNumber}</Text>
                </div>
                <div>
                    <Text className="text-ui-fg-subtle text-small">Risk Score</Text>
                    <Text className={isFlagged ? "text-ui-fg-error font-medium" : ""}>{tx.riskScore}</Text>
                </div>
                <div>
                    <Text className="text-ui-fg-subtle text-small">Status</Text>
                    <Badge color={STATUS_COLORS[tx.status] ?? "grey"}>{tx.status}</Badge>
                </div>
            </div>

            {/* Risk Flags */}
            {tx.riskFlags && tx.riskFlags.length > 0 && (
                <div>
                    <Text className="text-ui-fg-subtle text-small mb-2">Risk Flags</Text>
                    <div className="flex flex-wrap gap-2">
                        {tx.riskFlags.map(flag => (
                            <span
                                key={flag}
                                className="px-2 py-0.5 rounded text-xs bg-orange-900/30 text-orange-300 border border-orange-700"
                                title={RISK_FLAG_LABELS[flag.split(":")[0]] ?? flag}
                            >
                                {flag.split(":")[0]}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Reversal */}
            {canReverse && (
                <div className="pt-4 border-t border-ui-border-base">
                    <Text className="text-ui-fg-subtle text-small mb-2">Reversal Reason</Text>
                    <select
                        className="w-full px-3 py-2 border border-ui-border-base rounded bg-ui-bg-field text-small mb-2"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    >
                        <option value="">Select a reason…</option>
                        <option value="Customer requested refund">Customer requested refund</option>
                        <option value="Duplicate payment detected">Duplicate payment detected</option>
                        <option value="Fraud confirmed">Fraud confirmed</option>
                        <option value="Order cancelled">Order cancelled</option>
                    </select>
                    <Button variant="danger" onClick={handleReverseClick} isLoading={isReversing}>
                        Initiate B2C Reversal
                    </Button>
                </div>
            )}

            {/* View full detail link */}
            <div className="pt-2 border-t border-ui-border-base">
                <a href={`/app/mpesa/${tx.id}`} className="text-small text-ui-fg-interactive hover:underline">
                    View full transaction detail →
                </a>
            </div>
        </Container>
    )
}

export const config = defineWidgetConfig({
    zone: "order.details.before",
})

export default MpesaOrderWidget
