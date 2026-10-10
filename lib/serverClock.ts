/**
 * The server's clock, as far as this phone can tell.
 *
 * A Go Live counts down to the server's `expiresAt`, and a phone whose clock
 * is a minute fast says "0:00" while the server still has the person live (or
 * the reverse). Every API response carries a `Date` header; the offset from
 * the newest one is good to about a second, which is all a countdown needs.
 *
 * ponytail: last sample wins, no latency correction; average samples if a
 * one-second error ever matters.
 */
let offsetMs = 0

export function noteServerDate(dateHeader: string | null | undefined, receivedAt: number = Date.now()): void {
  if (!dateHeader) return
  const server = Date.parse(dateHeader)
  if (Number.isNaN(server)) return
  offsetMs = server - receivedAt
}

/** Now, by the server's clock. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** For tests. */
export function resetServerClock(): void {
  offsetMs = 0
}
