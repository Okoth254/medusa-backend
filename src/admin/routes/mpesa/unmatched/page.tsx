import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useUnmatchedC2B, MpesaTransaction } from "../../../hooks/api"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"

export const config = defineRouteConfig({
    label: "Unmatched C2B",
    icon: DocumentText,
})

export default function UnmatchedC2BPage() {
    const { data, isLoading, refetch } = useUnmatchedC2B()

    const unmatched = data?.unmatched ?? []

    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Heading level="h1">Unmatched C2B Payments</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Paybill transactions (C2B) that couldn't be automatically matched to a Medusa Order ID.
                    </Text>
                </div>
                <Button variant="secondary" size="small" onClick={() => refetch()}>
                    Refresh
                </Button>
            </div>

            <Container className="p-0 overflow-hidden">
                <div className="p-6 border-b border-ui-border-base flex justify-between items-center">
                    <Heading level="h2">Pending Assignment</Heading>
                    <Badge color={unmatched.length > 0 ? "orange" : "grey"}>
                        {unmatched.length} pending
                    </Badge>
                </div>

                {isLoading && <div className="p-8 text-center text-ui-fg-subtle">Loading...</div>}

                {!isLoading && unmatched.length === 0 && (
                    <div className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="bg-ui-bg-subtle rounded-full p-4 mb-4">
                            <span className="text-2xl">✅</span>
                        </div>
                        <Heading level="h2" className="mb-2">All Caught Up</Heading>
                        <Text className="text-ui-fg-subtle max-w-sm">
                            There are no unmatched Paybill or Till number payments pending manual assignment.
                        </Text>
                    </div>
                )}

                {unmatched.length > 0 && (
                    <table className="w-full text-left text-small">
                        <thead>
                            <tr className="border-b border-ui-border-base bg-ui-bg-subtle">
                                <th className="p-4 font-medium">Receipt</th>
                                <th className="p-4 font-medium">Phone</th>
                                <th className="p-4 font-medium">Amount</th>
                                <th className="p-4 font-medium">Date</th>
                                <th className="p-4 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ui-border-base">
                            {unmatched.map((tx: MpesaTransaction) => (
                                <tr key={tx.id}>
                                    <td className="p-4 font-mono">{tx.mpesaReceipt ?? "—"}</td>
                                    <td className="p-4">{tx.phoneNumber}</td>
                                    <td className="p-4 font-medium text-ui-fg-base">KES {tx.amount.toLocaleString()}</td>
                                    <td className="p-4 text-ui-fg-subtle">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                    <td className="p-4">
                                        <a href={`/app/mpesa/${tx.id}`} className="text-ui-fg-interactive hover:underline">
                                            Match Order →
                                        </a>
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
