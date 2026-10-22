/**
 * How long each profile text may be: the server's own caps (`lib/validations/profile.ts` in admin, `z.string().max()`),
 * in one place for the onboarding steps and Edit profile. Edit profile held its own copies, tighter than the server's
 * (name 50, location 100), and cut a longer stored value on the first keystroke (SCRUM-745).
 *
 * A zod `max()` counts UTF-16 units, so `serverLength` is `.length`, not what a person sees as characters.
 */
export const PROFILE_LIMITS = { name: 100, location: 200, occupation: 100, education: 100, phone: 20, bio: 500 } as const

export type LimitedField = keyof typeof PROFILE_LIMITS

export const serverLength = (value: string): number => value.length

/** The counter shows from here (a fraction of the cap): a field far from its limit stays quiet. */
const COUNTER_FROM = 0.8

/** The limit to hand the DS field's counter, or undefined while the value is nowhere near it. */
export const counterLimit = (value: string, limit: number): number | undefined =>
  serverLength(value) >= Math.floor(limit * COUNTER_FROM) ? limit : undefined

/** Never cut for the person: an over-long paste stays on screen, says by how much, and Save waits. */
export const overCapMessage = (limit: number, length: number): string => `Keep it under ${limit} characters · ${length} now.`

/** The sentence under each field that is over its cap; a field within it has no entry. */
export function limitErrors(values: Record<LimitedField, string>): Partial<Record<LimitedField, string>> {
  const errors: Partial<Record<LimitedField, string>> = {}
  for (const field of Object.keys(PROFILE_LIMITS) as LimitedField[]) {
    const length = serverLength(values[field])
    if (length > PROFILE_LIMITS[field]) errors[field] = overCapMessage(PROFILE_LIMITS[field], length)
  }
  return errors
}
