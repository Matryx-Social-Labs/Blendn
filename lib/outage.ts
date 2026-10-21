/**
 * Why the server could not be reached, as the "Can't reach Blend'n" screen needs it (Flow 15 15.13).
 *
 * A server that is simply down, or one that says it is being worked on and when it will be back. The second needs the
 * server to say so: a 503 with `errorCode: 'MAINTENANCE'` and a `Retry-After` in seconds (see the report). Until it does,
 * every outage is `down`, which is today's screen.
 */
export type Outage = { kind: 'down' } | { kind: 'maintenance'; until: number | null }

/** The screen tries again on its own this often (Flow 15 15.13: "retries on its own every 30 s"). */
export const AUTO_RETRY_MS = 30_000

export const MAINTENANCE_CODE = 'MAINTENANCE'

export function outageFrom(failure: { errorCode?: string; retryAfter?: number } | null | undefined, now = Date.now()): Outage {
  if (failure?.errorCode !== MAINTENANCE_CODE) return { kind: 'down' }
  const seconds = failure.retryAfter
  return { kind: 'maintenance', until: typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null }
}

/** The line under the body: how many times it has tried, and that it keeps going by itself. */
export function outageNote(tries: number): string {
  const every = `retries on its own every ${AUTO_RETRY_MS / 1000} s`
  return tries > 0 ? `Tried ${tries}× · ${every}` : `${every[0].toUpperCase()}${every.slice(1)}`
}

/** "2:30 AM" for the time the server named, in the phone's own clock; null when it named none. */
export function backByLabel(until: number | null): string | null {
  if (until === null) return null
  return new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The wait before the next automatic try: `ms` within ±20%, so phones that lost the server together do not return together. */
export const AUTO_RETRY_JITTER = 0.2
export function jittered(ms: number, random: number = Math.random()): number {
  return Math.round(ms * (1 - AUTO_RETRY_JITTER + 2 * AUTO_RETRY_JITTER * random))
}
