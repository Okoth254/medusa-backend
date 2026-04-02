import { createLogger, format, transports } from "winston"

// ─────────────────────────────────────────────
//  Structured JSON logger for M-Pesa module
// ─────────────────────────────────────────────
export const mpesaLogger = createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: { service: "mpesa" },
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message, service, ...rest }) => {
                    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""
                    return `${timestamp} [${service}] ${level}: ${message}${meta}`
                })
            ),
        }),
    ],
})

// Convenience helpers
export const logInfo = (msg: string, meta?: Record<string, unknown>) =>
    mpesaLogger.info(msg, meta)

export const logWarn = (msg: string, meta?: Record<string, unknown>) =>
    mpesaLogger.warn(msg, meta)

export const logError = (msg: string, meta?: Record<string, unknown>) =>
    mpesaLogger.error(msg, meta)

export const logDebug = (msg: string, meta?: Record<string, unknown>) =>
    mpesaLogger.debug(msg, meta)
