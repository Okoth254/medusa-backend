import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useMpesaBalance } from "../../../hooks/api"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"

export const config = defineRouteConfig({
    label: "Balance",
    icon: CurrencyDollar,
})

export default function MpesaBalancePage() {
    const { data, isFetching, isError, refetch } = useMpesaBalance()

    const handleRefresh = () => {
        refetch().catch(() => {
            toast.error("Failed to query balance", {
                description: "Check that Daraja credentials are configured.",
            })
        })
    }

    const formatBalance = (raw: string): string => {
        // Daraja returns e.g. "Working Account|KES|2345000.00|Current|0|KES|0.00|Current"
        try {
            const parts = raw.split("|")
            const type = parts[0]
            const currency = parts[1]
            const amount = parseFloat(parts[2]).toLocaleString("en-KE", { minimumFractionDigits: 2 })
            return `${type}: ${currency} ${amount}`
        } catch {
            return raw
        }
    }

    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
                <Heading level="h1">Shortcode Balance</Heading>
                <Button variant="secondary" size="small" onClick={handleRefresh} isLoading={isFetching}>
                    ↻ Refresh Balance
                </Button>
            </div>

            {!data && !isFetching && (
                <Container className="p-8 text-center">
                    <Text className="text-ui-fg-subtle">
                        Click "Refresh Balance" to query the Daraja Account Balance API.
                    </Text>
                </Container>
            )}

            {isFetching && (
                <Container className="p-8 text-center">
                    <Text className="text-ui-fg-subtle">Querying Daraja...</Text>
                </Container>
            )}

            {isError && (
                <Container className="p-6 border border-red-700">
                    <Text className="text-ui-fg-error">Failed to retrieve balance. Ensure credentials are configured.</Text>
                </Container>
            )}

            {data && !isFetching && (
                <>
                    <Container className="p-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <Text className="text-ui-fg-subtle text-small mb-1">Shortcode</Text>
                                <Heading level="h2" className="font-mono">{data.shortcode}</Heading>
                            </div>
                            <Badge color={data.environment === "production" ? "green" : "orange"}>
                                {data.environment}
                            </Badge>
                        </div>
                        <Text className="text-ui-fg-subtle text-small mt-3">
                            Last checked: {new Date(data.checkedAt).toLocaleString()}
                        </Text>
                    </Container>

                    {/* Balance result */}
                    <Container className="p-6">
                        <Heading level="h2" className="mb-4">Account Balances</Heading>
                        {data.darajaResponse?.ResponseCode === "0" ? (
                            <div className="space-y-2">
                                {(data.darajaResponse?.Result?.ResultParameters?.ResultParameter ?? [])
                                    .filter((p: any) => p.Key === "AccountBalance")
                                    .flatMap((p: any) => String(p.Value).split("&").map(formatBalance))
                                    .map((balance: string, i: number) => (
                                        <div key={i} className="bg-ui-bg-subtle px-4 py-3 rounded font-mono text-sm">
                                            {balance}
                                        </div>
                                    ))
                                }
                                {(!data.darajaResponse?.Result?.ResultParameters) && (
                                    <Text className="text-ui-fg-subtle">
                                        Balance request accepted. Result will be delivered to the callback URL asynchronously.
                                    </Text>
                                )}
                            </div>
                        ) : (
                            <div>
                                <Badge color="grey">
                                    Response Code: {data.darajaResponse?.ResponseCode ?? "—"}
                                </Badge>
                                <Text className="text-ui-fg-subtle text-small mt-2">
                                    {data.darajaResponse?.ResponseDescription ?? "No response description"}
                                </Text>
                            </div>
                        )}
                    </Container>
                </>
            )}
        </div>
    )
}
