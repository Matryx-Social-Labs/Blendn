/**
 * The seed rules behind a person's creature (`components/ds/Creature`): which string seeds the mark, and the hashes that
 * turn it into a species and a hue.
 *
 * Feed it the pseudonym, never a user id. `pseudonymsForEvent` scopes a pseudonym to one event, so a creature is stable
 * within an event (the same person is recognisable across the roster and the room) and different across events (nobody
 * can be followed around the city by their face). A user id is stable forever and would rebuild exactly that identity.
 * Nothing derived from a photograph is ever used: a blur still carries skin tone, hair and build.
 */

/**
 * FNV-1a, as a signed 32-bit int. Small and stable across engines. Not
 * cryptographic — it picks a colour or spreads ids, and the only property
 * that matters is that the same string always gives the same number.
 */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h
}

/**
 * Which of a `size`-strong cast a seed's hash `h` draws: a second mix of `h`,
 * so the creature does not follow the hue (`h % 8`). `components/ds/Creature`
 * picks with it too, so a name that is not an animal keeps its creature.
 */
export function castIndex(h: number, size: number): number {
  return Math.abs(Math.imul(h ^ 0x9e3779b9, 2654435761)) % size
}

/** "Cosmic Panda" → "panda"; "Cosmic Panda 2" (a collision suffix) → "panda". */
export function nounOf(pseudonym: string): string | null {
  const words = pseudonym.split(/\s+/).filter((w) => /^[A-Za-z]+$/.test(w))
  return words.length > 1 ? words[words.length - 1].toLowerCase() : null
}

/**
 * Names that are not a pseudonym: what a surface shows before one resolves,
 * or when the server withheld it. Seeding on these would give everybody so
 * labelled the same mark.
 */
const PLACEHOLDER_NAMES = new Set(['', 'attendee', 'someone', 'them', 'you', 'anonymous', 'unknown'])

/**
 * The one seed rule for a person's mark, on every surface.
 *
 * **The pseudonym itself.** It is what the Room grid (`components/blendn/Face`),
 * the Banter row, the room's bubbles, Room info and the profile hero all have
 * in hand, it is unique inside a room (`@@unique([chat_group_id,
 * anonymous_name])`), and it changes between events — so one person is one
 * colour and one creature everywhere they appear under that name, and nobody
 * can be followed across events by their disc. It used to be `roomId:senderId`
 * in the chat and the name on the grid, so the same person was a dolphin on
 * one screen and a hedgehog on the next.
 *
 * `fallback` is for a placeholder name ("Attendee" before the pseudonym
 * resolves): something per-person and per-room — never a bare user id.
 */
export function markSeed(name: string | null | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim()
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? fallback : trimmed
}
