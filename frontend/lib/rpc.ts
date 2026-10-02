/**
 * Shared guardrails for public-RPC reads (testnet-rpc.monad.xyz rate-limits aggressively):
 * - per-key TTL cache (repeat mounts/navigation don't re-hit the RPC)
 * - in-flight dedupe (StrictMode double-mounts + concurrent callers share one request)
 * - global concurrency cap + single retry with backoff on 429
 */

const cache = new Map<string, { at: number; value: unknown }>()
const inflight = new Map<string, Promise<unknown>>()

const MAX_CONCURRENT = 4
let running = 0
const queue: Array<() => void> = []

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1
    return Promise.resolve()
  }
  return new Promise(resolve => queue.push(resolve))
}

function release() {
  running -= 1
  const next = queue.shift()
  if (next) {
    running += 1
    next()
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function isRateLimit(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e)
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')
}

async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    try {
      return await fn()
    } catch (e) {
      if (!isRateLimit(e)) throw e
      await sleep(1500)
      return await fn()
    }
  } finally {
    release()
  }
}

export async function cachedRpc<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const p = runLimited(fn)
    .then(value => {
      cache.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function bustRpcCache(prefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
