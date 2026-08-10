import type { MatchCard } from './apiClient'

/**
 * Strong / Good / Some — the coarse band that replaced a match percentage.
 *
 * ## Why not a percentage
 *
 * The Figma asked for `Match Percentage`. A number implies a precision the data
 * cannot support and invites gaming, and it degrades dishonestly: a room where
 * nobody shares anything would still produce "34%", which is fabrication.
 *
 * ## Why the band is not a threshold on the score
 *
 * The server's score is IDF-weighted, so its scale depends on how rare the
 * room's interests happen to be. A fixed cut would mean different things at a
 * techno night and a conference. The band is computed from the *facts on the
 * card* instead — how many interests are shared — which is stable across rooms.
 *
 * ## Rarity
 *
 * "At least one rare in that room" was the original definition of Strong. The
 * card does not carry rarity, and asking the server for it would leak how
 * unusual someone's interests are, which is a re-identification hint in a small
 * room. Two or more shared interests is the honest approximation available
 * client-side; if Strong needs true rarity later, the server should return the
 * band rather than the inputs.
 *
 * ## It must degrade honestly
 *
 * With no shared interests the answer is "Some", not a number and not nothing.
 * `user_interests` was empty in production for weeks, so this path is the live
 * one until interest coverage climbs.
 */
export type MatchBand = 'strong' | 'good' | 'some'

export function matchBand(card: Pick<MatchCard, 'sharedInterests' | 'sharedIntents'>): MatchBand {
  const shared = card.sharedInterests?.length ?? 0
  if (shared >= 2) return 'strong'
  if (shared >= 1) return 'good'
  return 'some'
}

/**
 * What the band says on screen.
 *
 * Deliberately not a score, a percentage or a rank. "Some" must not read as a
 * failure: in a room where the interest graph is empty, everyone is "Some", and
 * the copy has to be true rather than discouraging.
 */
export function matchBandLabel(band: MatchBand): string {
  switch (band) {
    case 'strong':
      return 'Strong match'
    case 'good':
      return 'Good match'
    case 'some':
      return 'Worth saying hello'
  }
}

/**
 * The card's real content: what you actually share, named.
 *
 * "You both picked Techno and Board games" is the whole product. Withholding
 * someone's name costs almost nothing when the useful part is the overlap, and
 * this is the sentence that makes that true.
 *
 * Returns null when there is nothing to claim, so the caller renders nothing
 * rather than an empty phrase. Never invent an overlap.
 */
export function sharedInterestSentence(card: Pick<MatchCard, 'sharedInterests'>): string | null {
  const items = card.sharedInterests ?? []
  if (items.length === 0) return null
  if (items.length === 1) return `You both picked ${items[0]}`
  if (items.length === 2) return `You both picked ${items[0]} and ${items[1]}`
  return `You both picked ${items.slice(0, 2).join(', ')} and ${items.length - 2} more`
}

/**
 * The shared intent, said out loud.
 *
 * `sharedIntents` is the **overlap only** — the server intersects the viewer's
 * social intents with theirs, so "Both here to network" is literally true and
 * never states what either person wants on their own. It also never contains
 * `dating` unless compatibility has already been checked, which is what lets
 * the card say it without ever mentioning anyone's gender.
 *
 * `just_here` is deliberately absent from the map. The server excludes it from
 * the shared set — "we are both merely present" is not a thing to say to
 * anybody — and this returns null rather than inventing a phrase for it.
 */
const INTENT_PHRASES: Record<string, string> = {
  dating: 'Both open to dating',
  networking: 'Both here to network',
  friendship: 'Both here to make friends',
}

export function intentSentence(sharedIntents: readonly string[] | undefined): string | null {
  const phrase = (sharedIntents ?? []).map((i) => INTENT_PHRASES[i]).find(Boolean)
  return phrase ?? null
}
