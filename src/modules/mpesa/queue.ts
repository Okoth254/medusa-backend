import { Queue } from "bullmq"
import IORedis from "ioredis"
import { CallbackJobData } from "./types"

// ── Redis Connection ──────────────────────────
// Single shared connection reused across Queue + Worker
let redisConnection: IORedis | null = null

export function getRedisConnection(redisUrl: string): IORedis {
    if (!redisConnection) {
        redisConnection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,    // required by BullMQ
            enableReadyCheck: false,
        })
    }
    return redisConnection
}

// ── Queue Factory ─────────────────────────────
let mpesaQueue: Queue<CallbackJobData> | null = null

export function getMpesaQueue(redisUrl: string): Queue<CallbackJobData> {
    if (!mpesaQueue) {
        mpesaQueue = new Queue<CallbackJobData>("mpesa-callback", {
            connection: getRedisConnection(redisUrl),
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: "exponential",
                    delay: 500,               // 500ms → 1s → 2s → 4s → 8s
                },
                removeOnComplete: { count: 500 },
                removeOnFail: { count: 1000 },
            },
        })
    }
    return mpesaQueue
}

// ── Rate-limit helpers (Redis INCR + EXPIRE) ──
export async function incrementPhoneCounter(
    redis: IORedis,
    phone: string,
    windowSeconds: number
): Promise<number> {
    const key = `mpesa:rate:${phone}`
    const count = await redis.incr(key)
    if (count === 1) {
        // Set TTL only on first increment so window is fixed
        await redis.expire(key, windowSeconds)
    }
    return count
}

export async function getPhoneCounter(
    redis: IORedis,
    phone: string
): Promise<number> {
    const key = `mpesa:rate:${phone}`
    const val = await redis.get(key)
    return parseInt(val ?? "0", 10)
}

// ── Replay-protection set ─────────────────────
export async function isProcessed(
    redis: IORedis,
    hash: string
): Promise<boolean> {
    const key = `mpesa:processed:${hash}`
    const set = await redis.set(key, "1", "EX", 86400, "NX")  // 24h window
    return set === null  // null = already existed
}
