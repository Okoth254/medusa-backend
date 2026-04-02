import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useState } from "react"
import { useReconciliationLogs, useTriggerReconciliation } from "../../../hooks/api"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Clock } from "@medusajs/icons"

export const config = defineRouteConfig({
    label: "Reconciliation",
    icon: Clock,
})

const ACTION_COLOR: Record<string, "green" | "orange" | "red" | "grey"> = {
    COMPLETED_ORDER_VIA_RECONCILIATION: "green",
    MARKED_EXPIRED: "grey",
    FLAGGED_CRITICAL_MISMATCH: "red",
}

export default function ReconciliationLogs() {
    const { data, isLoading, isError, refetch } = useReconciliationLogs()
    const triggerMutation = useTriggerReconciliation()
    const logs = data?.logs ?? []

    // Summary stats
    const corrected = logs.filter(l => l.actionTaken === "COMPLETED_ORDER_VIA_RECONCILIATION").length
    const expired = logs.filter(l => l.actionTaken === "MARKED_EXPIRED").length
    const critical = logs.filter(l => l.actionTaken === "FLAGGED_CRITICAL_MISMATCH").length

    const handleRun = () => {
        triggerMutation.mutate(undefined, {
            onSuccess: (res: any) => {
                toast.success("Reconciliation run complete", {
                    description: `Processed: ${res.processed} | Fixed: ${res.fixed} | Flagged: ${res.flagged}`,
                })
                refetch()
            },
            onError: (err: any) => {
                toast.error("Reconciliation failed", { description: err?.message ?? "Unknown error" })
            },
        })
    }

    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
                <Heading level="h1">Reconciliation Logs</Heading>
                <Button
                    variant="secondary"
                    size="small"
                    onClick={handleRun}
                    isLoading={triggerMutation.isPending}
                >
                    ▶ Run Now
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Container className="p-4">
                    <Text className="text-ui-fg-subtle text-small mb-1">Orders Corrected</Text>
                    <Heading level="h2" className="text-green-400">{corrected}</Heading>
                </Container>
                <Container className="p-4">
                    <Text className="text-ui-fg-subtle text-small mb-1">Marked Expired</Text>
                    <Heading level="h2">{expired}</Heading>
                </Container>
                <Container className="p-4">
                    <Text className="text-ui-fg-subtle text-small mb-1">Critical Mismatches</Text>
                    <Heading level="h2" className="text-ui-fg-error">{critical}</Heading>
                </Container>
            </div>

            {/* Logs Table */}
            <Container className="p-0 overflow-hidden">
                <div className="p-6 border-b border-ui-border-base flex justify-between items-center">
                    <Heading level="h2">Nightly Cron Reports</Heading>
                    <Text className="text-ui-fg-subtle text-small">{logs.length} entries</Text>
                </div>

                {isLoading && <div className="p-8 text-center text-ui-fg-subtle">Fetching logs...</div>}
                {isError && <div className="p-8 text-center text-ui-fg-error">Failed to load reconciliation logs.</div>}

                {!isLoading && logs.length === 0 && (
                    <div className="p-6 text-center text-ui-fg-subtle">
                        No reconciliation discrepancies recorded yet. ✅
                    </div>
                )}

                {logs.length > 0 && (
                    <table className="w-full text-small">
                        <thead className="border-b border-ui-border-base">
                            <tr>
                                {["Transaction ID", "Daraja Status", "Internal DB Status", "System Action", "Date"].map(h => (
                                    <th key={h} className="text-left px-6 py-3 text-ui-fg-subtle font-medium">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ui-border-base">
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td className="px-6 py-3 font-mono text-ui-fg-subtle">
                                        {log.transactionId.substring(0, 13)}...
                                    </td>
                                    <td className="px-6 py-3">
                                        <Badge color={log.darajaStatus === "success" ? "green" : "red"}>
                                            {log.darajaStatus}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-3">{log.internalStatus}</td>
                                    <td className="px-6 py-3">
                                        <Badge color={ACTION_COLOR[log.actionTaken] ?? "grey"}>
                                            {log.actionTaken}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-3 text-ui-fg-subtle">
                                        {new Date(log.reconciledAt).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Container>
        </div>
    )
}
