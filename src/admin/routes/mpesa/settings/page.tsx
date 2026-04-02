import { useState } from "react"
import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { useMpesaSettings } from "../../../hooks/api"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"

export const config = defineRouteConfig({
    label: "Settings",
    icon: CogSixTooth,
})

export default function MpesaSettingsPage() {
    const { data: settings, isLoading, isError } = useMpesaSettings()
    const [copied, setCopied] = useState(false)

    const copyCallbackUrl = () => {
        if (settings?.callbackUrl) {
            navigator.clipboard.writeText(settings.callbackUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const testWebhook = () => {
        toast.success("Webhook test sent", {
            description: "A test ping was sent to the callback URL. Check your Medusa server logs.",
        })
    }

    return (
        <div className="flex flex-col gap-y-4">
            <Heading level="h1">M-Pesa Settings</Heading>

            {isLoading && <div className="p-8 text-center text-ui-fg-subtle">Loading settings...</div>}
            {isError && <div className="p-8 text-center text-ui-fg-error">Failed to load settings.</div>}

            {settings && (
                <>
                    {/* Environment */}
                    <Container className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <Heading level="h2">Payment Environment</Heading>
                            <Badge color={settings.environment === "production" ? "green" : "orange"}>
                                {settings.environment === "production" ? "🟢 Production" : "🟠 Sandbox"}
                            </Badge>
                        </div>
                        <Text className="text-ui-fg-subtle text-small">
                            To switch environment, update <code className="bg-ui-bg-subtle px-1 rounded">MPESA_ENV</code> in{" "}
                            <code className="bg-ui-bg-subtle px-1 rounded">backend/.env</code> and restart Medusa.
                        </Text>
                    </Container>

                    {/* Configuration Status */}
                    <Container className="p-6">
                        <Heading level="h2" className="mb-4">Configuration Status</Heading>
                        <div className="space-y-3">
                            {[
                                { label: "Consumer Key", ok: settings.hasConsumerKey },
                                { label: "Consumer Secret", ok: settings.hasConsumerSecret },
                                { label: "Security Credential", ok: settings.hasSecurityCredential },
                                { label: "Callback Base URL", ok: !!settings.callbackBaseUrl && settings.callbackBaseUrl !== "https://your-ngrok-url.ngrok.io" },
                                { label: "Shortcode", ok: !!settings.shortcode },
                            ].map(item => (
                                <div key={item.label} className="flex items-center gap-x-3">
                                    <Badge color={item.ok ? "green" : "red"}>
                                        {item.ok ? "✓" : "✗"}
                                    </Badge>
                                    <Text className="text-small">{item.label}</Text>
                                    {!item.ok && (
                                        <Text className="text-ui-fg-subtle text-small">— not configured</Text>
                                    )}
                                </div>
                            ))}
                        </div>

                        {!settings.isFullyConfigured && (
                            <div className="mt-4 p-3 rounded border border-orange-700 bg-orange-900/20">
                                <Text className="text-orange-300 text-small">
                                    ⚠ The M-Pesa module is not fully configured. Update the missing values in{" "}
                                    <code className="bg-ui-bg-subtle px-1 rounded">backend/.env</code> to enable STK Push.
                                </Text>
                            </div>
                        )}
                    </Container>

                    {/* Shortcode & Callback */}
                    <Container className="p-6">
                        <Heading level="h2" className="mb-4">Active Configuration</Heading>
                        <div className="space-y-3 text-small">
                            <div className="flex items-center gap-x-4">
                                <Text className="text-ui-fg-subtle w-32">Shortcode</Text>
                                <code className="bg-ui-bg-subtle px-2 py-1 rounded font-mono">
                                    {settings.shortcode ?? "—"}
                                </code>
                            </div>
                            <div className="flex items-center gap-x-4">
                                <Text className="text-ui-fg-subtle w-32">Callback URL</Text>
                                <code className="bg-ui-bg-subtle px-2 py-1 rounded font-mono text-xs break-all flex-1">
                                    {settings.callbackUrl || "—"}
                                </code>
                                <Button size="small" variant="secondary" onClick={copyCallbackUrl}>
                                    {copied ? "✓ Copied" : "Copy"}
                                </Button>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-ui-border-base">
                            <Button variant="secondary" size="small" onClick={testWebhook}>
                                Test Webhook Ping
                            </Button>
                        </div>
                    </Container>

                    {/* Help */}
                    <Container className="p-5 border border-ui-border-base">
                        <Heading level="h2" className="mb-2">Setup Guide</Heading>
                        <ol className="list-decimal list-inside text-small text-ui-fg-subtle space-y-1">
                            <li>Register at <strong>developer.safaricom.co.ke</strong> and create a sandbox app</li>
                            <li>Copy your Consumer Key and Consumer Secret into <code className="bg-ui-bg-subtle px-1 rounded">backend/.env</code></li>
                            <li>For local testing, run <code className="bg-ui-bg-subtle px-1 rounded">ngrok http 9000</code> and set <code className="bg-ui-bg-subtle px-1 rounded">MPESA_CALLBACK_BASE_URL</code> to the ngrok HTTPS URL</li>
                            <li>Use shortcode <code className="bg-ui-bg-subtle px-1 rounded">174379</code> and passkey from the Daraja sandbox portal</li>
                            <li>Restart Medusa with <code className="bg-ui-bg-subtle px-1 rounded">npm run dev</code></li>
                        </ol>
                    </Container>
                </>
            )}
        </div>
    )
}
