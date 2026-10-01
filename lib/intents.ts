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
