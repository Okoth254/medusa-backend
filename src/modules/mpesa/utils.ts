import crypto from "crypto"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

// ── Phone Number Formatting ───────────────────
// Converts 07xx, +2547xx, or 2547xx → E.164 (2547xx)
export function formatPhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "")

    if (cleaned.startsWith("+254")) return cleaned.slice(1)          // +2547xx → 2547xx
    if (cleaned.startsWith("254")) return cleaned                    // already E.164
    if (cleaned.startsWith("07") || cleaned.startsWith("01")) {
        return "254" + cleaned.slice(1)                                 // 07xx → 2547xx
    }
    if (cleaned.startsWith("7") || cleaned.startsWith("1")) {
        return "254" + cleaned                                          // 7xx → 2547xx
    }

    throw new Error(`Invalid Kenyan phone number: ${phone}`)
}

// ── Validate Kenyan Phone ─────────────────────
export function isValidKenyanPhone(phone: string): boolean {
    try {
        const formatted = formatPhone(phone)
        return /^254[71]\d{8}$/.test(formatted)
    } catch {
        return false
    }
}

// ── Daraja Timestamp ──────────────────────────
// Format: YYYYMMDDHHmmss (EAT / UTC+3)
export function generateTimestamp(): string {
    return dayjs().tz("Africa/Nairobi").format("YYYYMMDDHHmmss")
}

// ── Daraja Password ───────────────────────────
// Base64(shortcode + passkey + timestamp)
export function buildPassword(
    shortcode: string,
    passkey: string,
    timestamp: string
): string {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64")
}

// ── Payload Hash (Replay Protection) ─────────
export function hashPayload(body: unknown): string {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(body))
        .digest("hex")
}

// ── Generate UUID ─────────────────────────────
export function generateId(): string {
    return crypto.randomUUID()
}

// ── Extract STK Callback Metadata ────────────
// Safely pull a named value from Daraja callback metadata items
export function extractMetaValue(
    items: Array<{ Name: string; Value: string | number }>,
    name: string
): string | number | undefined {
    return items.find((i) => i.Name === name)?.Value
}

// ── Safe JSON Stringify ───────────────────────
export function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value)
    } catch {
        return "{}"
    }
}

// ── EAT Now ──────────────────────────────────
export function nowEAT(): Date {
    return dayjs().tz("Africa/Nairobi").toDate()
}

// ── Minutes Ago ───────────────────────────────
export function minutesAgo(n: number): Date {
    return dayjs().subtract(n, "minute").toDate()
}

// ── Hours Ago ─────────────────────────────────
export function hoursAgo(n: number): Date {
    return dayjs().subtract(n, "hour").toDate()
}

// ── Exponential Backoff Retry ─────────────────
export async function withRetry<T>(
    fn: () => Promise<T>,
    attempts = 3,
    baseDelayMs = 500
): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastError = err
            if (attempt < attempts - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt)  // 500 → 1000 → 2000
                await new Promise((r) => setTimeout(r, delay))
            }
        }
    }

    throw lastError
}
