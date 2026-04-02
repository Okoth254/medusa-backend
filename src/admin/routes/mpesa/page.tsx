import { useState } from "react"
import { Container, Heading, Table, Badge, Text, Button } from "@medusajs/ui"
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { ArrowDownTray, ArrowPath, CurrencyDollar } from "@medusajs/icons"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useMpesaTransactions, useMpesaMetrics, MpesaTransaction } from "../../hooks/api"

// ── Config ────────────────────────────────────

export const config = defineRouteConfig({
    label: "M-Pesa",
    icon: CurrencyDollar,
})

// ── Status badge colours ──────────────────────

const STATUS_COLORS: Record<string, "green" | "orange" | "red" | "purple" | "grey" | "blue"> = {
    captured: "green",
    authorized: "green",
    pending: "grey",
    under_review: "orange",
    failed: "red",
    expired: "red",
    cancelled: "red",
    reversed: "purple",
}

// ── CSV export helper ─────────────────────────

function exportCSV(transactions: MpesaTransaction[]) {
    const headers = ["ID", "Order ID", "Phone", "Amount (KES)", "Receipt", "Risk Score", "Status", "Date"]
    const rows = transactions.map(tx => [
        tx.id,
        tx.orderId,
        tx.phoneNumber,
        tx.amount,
        tx.mpesaReceipt ?? "",
        tx.riskScore,
        tx.status,
        new Date(tx.createdAt).toLocaleString(),
    ])
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mpesa-transactions-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ── Dashboard ─────────────────────────────────

export default function MpesaDashboard() {
    const [page, setPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState("")
    const [phoneSearch, setPhoneSearch] = useState("")
    const [receiptSearch, setReceiptSearch] = useState("")

    const { data: metricsData } = useMpesaMetrics()
    const { data: txData, isLoading, isError, refetch } = useMpesaTransactions({
        page,
        limit: 25,
        status: statusFilter || undefined,
        phone: phoneSearch || undefined,
        receipt: receiptSearch || undefined,
    })

    const transactions = txData?.transactions ?? []
    const totalPages = txData?.totalPages ?? 1
    const metrics = metricsData

    return (
        <div className="flex flex-col gap-y-6">
            <div className="flex items-center justify-between">
                <Heading level="h1">M-Pesa Payments</Heading>
                <div className="flex gap-x-2">
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => refetch()}
                    >
                        <ArrowPath className="mr-1" />
                        Refresh
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => transactions.length > 0 && exportCSV(transactions)}
                        disabled={transactions.length === 0}
                    >
                        <ArrowDownTray className="mr-1" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                {[
                    { label: "Total Volume", value: metrics ? `KES ${metrics.totalVolume.toLocaleString()}` : "—" },
                    { label: "Today Revenue", value: metrics ? `KES ${metrics.capturedToday.toLocaleString()}` : "—" },
                    { label: "Success Rate", value: metrics ? `${metrics.successRate}%` : "—" },
                    { label: "Captured", value: String(metrics?.byStatus?.captured ?? "—") },
                    { label: "Pending Review", value: String(metrics?.byStatus?.under_review ?? "—") },
                    { label: "Failed", value: String((metrics?.byStatus?.failed ?? 0) + (metrics?.byStatus?.expired ?? 0)) },
                ].map((card) => (
                    <Container key={card.label} className="p-4">
                        <Text className="text-ui-fg-subtle text-small mb-1">{card.label}</Text>
                        <Heading level="h2" className="text-xl">{card.value}</Heading>
                    </Container>
                ))}
            </div>

            {/* Chart */}
            {metrics?.dailyVolume && metrics.dailyVolume.length > 1 && (
                <Container className="p-6">
                    <Heading level="h2" className="mb-4">Daily Volume — Last 30 Days</Heading>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={metrics.dailyVolume}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
                            <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                            <Tooltip
                                formatter={(val: number | undefined | string) => [`KES ${Number(val || 0).toLocaleString()}`, "Volume"]}
                                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                            />
                            <Line type="monotone" dataKey="amount" stroke="#4ade80" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </Container>
            )}

            {/* Filters */}
            <Container className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div>
                        <Text className="text-small text-ui-fg-subtle mb-1">Status</Text>
                        <select
                            className="px-3 py-1.5 rounded border border-ui-border-base bg-ui-bg-field text-sm"
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                        >
                            <option value="">All</option>
                            {["pending", "authorized", "captured", "failed", "reversed", "under_review", "expired", "cancelled"].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <Text className="text-small text-ui-fg-subtle mb-1">Phone</Text>
                        <input
                            className="px-3 py-1.5 rounded border border-ui-border-base bg-ui-bg-field text-sm"
                            placeholder="254712..."
                            value={phoneSearch}
                            onChange={e => { setPhoneSearch(e.target.value); setPage(1) }}
                        />
                    </div>
                    <div>
                        <Text className="text-small text-ui-fg-subtle mb-1">Receipt</Text>
                        <input
                            className="px-3 py-1.5 rounded border border-ui-border-base bg-ui-bg-field text-sm"
                            placeholder="QJD..."
                            value={receiptSearch}
                            onChange={e => { setReceiptSearch(e.target.value); setPage(1) }}
                        />
                    </div>
                    <Button variant="transparent" size="small" onClick={() => { setStatusFilter(""); setPhoneSearch(""); setReceiptSearch(""); setPage(1) }}>
                        Clear
                    </Button>
                </div>
            </Container>

            {/* Transactions Table */}
            <Container className="p-0 overflow-hidden">
                <div className="p-6 border-b border-ui-border-base flex justify-between items-center">
                    <Heading level="h2">All Transactions</Heading>
                    {txData && <Text className="text-ui-fg-subtle text-small">{txData.total} total</Text>}
                </div>

                {isLoading && <div className="p-8 text-center text-ui-fg-subtle">Loading transactions...</div>}
                {isError && <div className="p-8 text-center text-ui-fg-error">Failed to load transactions.</div>}

                {!isLoading && transactions.length === 0 && (
                    <div className="p-8 text-center text-ui-fg-subtle">No transactions match your filters.</div>
                )}

                {transactions.length > 0 && (
                    <>
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Receipt</Table.HeaderCell>
                                    <Table.HeaderCell>Order ID</Table.HeaderCell>
                                    <Table.HeaderCell>Phone</Table.HeaderCell>
                                    <Table.HeaderCell>Amount</Table.HeaderCell>
                                    <Table.HeaderCell>Risk</Table.HeaderCell>
                                    <Table.HeaderCell>Status</Table.HeaderCell>
                                    <Table.HeaderCell>Date</Table.HeaderCell>
                                    <Table.HeaderCell>Actions</Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {transactions.map((tx) => (
                                    <Table.Row key={tx.id}>
                                        <Table.Cell className="font-mono text-small text-ui-fg-subtle">
                                            {tx.mpesaReceipt ?? "Pending..."}
                                        </Table.Cell>
                                        <Table.Cell className="font-mono text-small">
                                            {tx.orderId ? `${tx.orderId.substring(0, 14)}…` : "—"}
                                        </Table.Cell>
                                        <Table.Cell>{tx.phoneNumber}</Table.Cell>
                                        <Table.Cell>KES {tx.amount.toLocaleString()}</Table.Cell>
                                        <Table.Cell>
                                            <Text className={tx.riskScore > 20 ? "text-ui-fg-error font-medium" : ""}>
                                                {tx.riskScore}
                                            </Text>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Badge color={STATUS_COLORS[tx.status] ?? "grey"}>
                                                {tx.status}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell className="text-small">
                                            {new Date(tx.createdAt).toLocaleDateString()}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <a
                                                href={`/app/mpesa/${tx.id}`}
                                                className="text-ui-fg-interactive text-small hover:underline"
                                            >
                                                View
                                            </a>
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>

                        {/* Pagination */}
                        <div className="p-4 flex justify-between items-center border-t border-ui-border-base">
                            <Text className="text-small text-ui-fg-subtle">
                                Page {page} of {totalPages}
                            </Text>
                            <div className="flex gap-2">
                                <Button
                                    size="small"
                                    variant="secondary"
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    Previous
                                </Button>
                                <Button
                                    size="small"
                                    variant="secondary"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </Container>
        </div>
    )
}
