/**
 * What the app offers as a reason to be out (`intent_default`, an event's intent). Dating is not one in 1.0 (register D-002,
 * SCRUM-1192): the server's enum still holds it, so a stored `dating` is read as not there (`normaliseIntents`).
 */
export type Intent = 'networking' | 'friendship' | 'just_here'
const OFFERED: readonly string[] = ['networking', 'friendship', 'just_here'] satisfies Intent[]

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
 * Anything the app does not offer is dropped on read: a stored `dating` (D-002) is neither shown nor turned into friendship,
 * which would put someone into matching they never chose. A form compares its save with this, so the dropped value is never
 * sent back either; it goes only when the person changes their answer.
 *
 * Rows written before the server refused the mix still hold "Just here" next
 * to other intents (16 of 280 profiles on staging). Shown as-is, the form lit
 * them all, and every save — a name change included — resent the mix and came
 * back 400 with no way out. The opt-out wins: a contradiction is not consent
 * to be matched.
 */
export function normaliseIntents(stored: readonly string[]): Intent[] {
  const offered = stored.filter((i): i is Intent => OFFERED.includes(i))
  return offered.includes('just_here') ? ['just_here'] : offered
}
