/**
 * A face-shaped thing that is not a face.
 *
 * ## Why not a blurred photograph
 *
 * The frame draws an avatar stack on The Scene, and the obvious cheap version
 * is the real photograph with a blur over it. It is wrong twice.
 *
 * **Blurring in the app does not hide anything.** The original still travels in
 * the payload and lands in the device cache, so a proxy, a network inspector or
 * a rooted device has the unblurred file. That is the same leak `#229` closed,
 * with a cosmetic layer on top.
 *
 * **Blurring on the server still leaks.** A heavily blurred face carries skin
 * tone, hair colour and build. Attached to "124 interested" under an 18+
 * nightlife event, that is a demographic inference about identifiable people —
 * and the harvest-by-topic attack that removed `interestedPreview` works just as
 * well on a blur.
 *
 * So nothing derived from the photograph is sent at all. This generates a mark
 * from the **pseudonym**, which is already the thing the product shows.
 *
 * ## Scoped per event, on purpose
 *
 * `pseudonymsForEvent` keys off `chat_group.event_id`, so somebody is "Cosmic
 * Panda" at one event and somebody else at the next. The avatar inherits that
 * by taking the pseudonym as its seed: **stable within an event**, so the same
 * person is recognisable across the roster, the stack and the room — which is
 * the entire point of a product about approaching someone you have seen — and
 * **different across events**, so nobody can be followed around the city by
 * their colour.
 *
 * Feed it the pseudonym. Never feed it a user id: that is stable forever and
 * would rebuild exactly the cross-event identity the pseudonyms exist to
 * prevent.
 */

/**
 * A palette that stays legible on `EMBER.surface` and never reads as the
 * accent — the accent means "live" or "selected" everywhere else, and an avatar
 * that borrowed it would look like a state rather than a person.
 */
const HUES = [
  ['#3E5C76', '#5C89A8'],
  ['#5B4B8A', '#8B6FB8'],
  ['#2F6B5E', '#4E9C88'],
  ['#7A4A55', '#B0707E'],
  ['#4A5D3A', '#7A9463'],
  ['#6B5033', '#A2794E'],
  ['#38566B', '#5E87A3'],
  ['#5A3F63', '#8C6699'],
] as const

/**
 * A small, stable hash. Not cryptographic — it picks a colour, and the only
 * property that matters is that the same string always picks the same one.
 */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * The cast. One of these rides on each disc.
 *
 * **Animals, because the product already speaks in animals.** The pseudonyms
 * this app hands out are adjective-plus-creature — "Cosmic Panda", "Velvet
 * Heron" — so a panda on a disc is the same convention the label beside it uses,
 * not a new one invented for the avatar.
 *
 * **Not people.** A human character carries skin tone, hair, gender and age, and
 * three of those under "124 interested" at an 18+ nightlife event is a
 * demographic claim about identifiable people — the same inference the header of
 * this file explains we refuse to make from a blurred photograph. A fox implies
 * nothing about anybody.
 *
 * Emoji rather than bundled art: it costs no asset, no network and no
 * dependency, renders at any size, and every one of these has had a colour
 * glyph on iOS and Android for years. The list avoids anything whose meaning
 * shifts by platform or which renders monochrome on either.
 */
const CHARACTERS = [
  '🦊', '🐼', '🦉', '🐙', '🦁', '🐝', '🦋', '🐢',
  '🦜', '🐺', '🐬', '🦩', '🐨', '🦄', '🐡', '🦔',
] as const

export interface PseudonymAvatar {
  /** Two stops, drawn as a gradient disc. */
  colors: readonly [string, string]
  /** One character, taken from the pseudonym itself. */
  initial: string
  /** A creature, for surfaces that draw a face rather than a letter. */
  character: string
}

/**
 * The mark for one pseudonym.
 *
 * `initial` comes from the pseudonym rather than the real name, so it says "C"
 * for Cosmic Panda — a letter that identifies nobody, and that matches the label
 * shown beside it.
 */
export function pseudonymAvatar(pseudonym: string): PseudonymAvatar {
  const trimmed = pseudonym.trim()
  /*
   * An empty seed still has to produce something. A person with no pseudonym
   * yet is a real state — the roster renders before the names resolve — and a
   * crash or a blank hole there is worse than a neutral disc.
   */
  const seed = trimmed.length > 0 ? trimmed : 'anonymous'
  const h = hash(seed)
  /*
   * Colour and creature are drawn from *different* mixes of the same hash.
   *
   * Taking both from `h` directly correlates them — with 8 hues and 16
   * creatures, every panda would be the same blue — and a row of three would
   * repeat a pairing far more often than chance. `h` for the hue and a second
   * cheap mix for the creature gives 128 usable combinations.
   */
  const colors = HUES[h % HUES.length]
  const character = CHARACTERS[Math.abs(Math.imul(h ^ 0x9e3779b9, 2654435761)) % CHARACTERS.length]
  return { colors, initial: seed[0].toUpperCase(), character }
}

/**
 * How many marks to draw, and what the overflow pill says.
 *
 * The frame shows two faces and "+121" against a total of 124. Drawing every
 * avatar is not an option — the row is 366pt wide and the count is unbounded —
 * so this is the only decision the stack has.
 *
 * Returns the number to draw and the remainder. `remainder` is 0 rather than
 * negative when the total is small, so a two-person event draws two marks and
 * no pill instead of "+-1".
 */
export function avatarStack(
  total: number,
  max = 3
): { shown: number; remainder: number } {
  const safe = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const shown = Math.min(safe, max)
  return { shown, remainder: Math.max(safe - shown, 0) }
}
