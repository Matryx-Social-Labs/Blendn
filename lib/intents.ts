/**
 * One tap on an intent chip.
 *
 * "Just here" is exclusive: it means not looking, so it cannot sit alongside an
 * answer that says you are. Choosing it clears the rest, and choosing anything
 * else clears it. The server refuses the mix (admin `lib/validations/profile.ts`),
 * so a form that can build it can only fail at Save — Edit profile did, with a
 * "Try again." no retry could fix (SCRUM-518). Every intent picker uses this.
 */
export function toggleIntent<T extends string>(prev: readonly T[], value: T): T[] {
  if (value === 'just_here') return prev.includes(value) ? [] : [value]
  const withoutJustHere = prev.filter((i) => i !== 'just_here')
  return withoutJustHere.includes(value)
    ? withoutJustHere.filter((i) => i !== value)
    : [...withoutJustHere, value]
}

/**
 * A stored answer, made coherent before a form shows it.
 *
 * Rows written before the server refused the mix still hold "Just here" next
 * to other intents (16 of 280 profiles on staging). Shown as-is, the form lit
 * them all; with Dating then dropped for age, every save — a name change
 * included — resent the mix and came back 400 with no way out. The opt-out
 * wins: a contradiction is not consent to be matched.
 */
export function normaliseIntents<T extends string>(stored: readonly T[]): T[] {
  return stored.includes('just_here' as T) ? (['just_here'] as T[]) : [...stored]
}
