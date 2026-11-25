/**
 * A count that can grow, for the eye (owner 2026-11-05): exact to 999, then "1.2k", "12k", "1.2M", lowercase, no ".0",
 * rounded down so it never says more than there is. Screen readers get the full number from the caller's label.
 */
export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  const [unit, size] = n < 1_000_000 ? (['k', 1000] as const) : (['M', 1_000_000] as const)
  const whole = n / size
  // One decimal under 10 (1.2k, 9.9k), none from 10 (12k, 999k); always down.
  const shown = whole < 10 ? Math.floor(whole * 10) / 10 : Math.floor(whole)
  return `${shown}${unit}`
}
