/**
 * "Slow down — try again in 0:17" (Flow 15 #15): a read the server refused with a 429. The wait is the server's
 * (`retryAfter`, seconds); it is never "check your connection", because the connection is fine.
 */
export const RATE_LIMITED_CODE = 'RATE_LIMITED'
/** When the server names no wait: a minute. */
export const DEFAULT_WAIT_S = 60
/**
 * The banner's words, which its Geist Mono clock finishes ("… try again in 0:17"). It said "in a minute" beside a clock
 * reading 0:17 (RC drive 4 D-9b): the clock is the server's real wait, so the words leave the time to it.
 */
export const RATE_LIMITED_TEXT = 'Slow down — try again in'

export const isRateLimited = (result: { errorCode?: string } | null | undefined): boolean => result?.errorCode === RATE_LIMITED_CODE

/** The longest wait among refused reads, in whole seconds; null when none was refused. */
export function rateLimitWait(results: ({ errorCode?: string; retryAfter?: number } | null | undefined)[]): number | null {
  const refused = results.filter(isRateLimited) as { retryAfter?: number }[]
  if (refused.length === 0) return null
  return Math.max(...refused.map((r) => (typeof r.retryAfter === 'number' && r.retryAfter > 0 ? Math.ceil(r.retryAfter) : DEFAULT_WAIT_S)))
}

/** "0:52", "1:05": minutes and seconds, in the Geist Mono the count is drawn in. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The wait for one refused read (`rateLimitWait` of a single result), or null when it was not a refusal for asking too fast. */
export const rateLimitWaitOf = (result: { errorCode?: string; retryAfter?: number } | null | undefined): number | null => rateLimitWait([result])
