import { intentSentence, matchBand, matchBandLabel, sharedInterestSentence } from './matchBand'

/**
 * What a Grid card actually says about somebody.
 *
 * ## The problem this exists for
 *
 * A card can be reduced to a name, a field of work and two buttons — and
 * "why would someone want to like someone else with no details shown" is the
 * right question to ask of it.
 *
 * It is also the **common** case rather than an edge one. `lib/matchBand.ts`
 * says so directly:
 *
 * > `user_interests` was empty in production for weeks, so this path is the
 * > live one until interest coverage climbs.
 *
 * And the roster is small by design. `MatchCard` carries eight fields, of which
 * `workField` is null in any room under eight people and `sharedInterests` is
 * empty whenever the interest graph is thin. So the card has to be built out of
 * what is left, and it has to degrade in a defined order rather than by
 * accident.
 *
 * ## The chain
 *
 * Each rung is true or it is skipped. Nothing is invented, and no rung claims
 * an overlap that is not there:
 *
 *   1. shared interests   "You both picked Techno and Board games"
 *   2. shared intent      "Both here to network"
 *   3. the band           "Worth saying hello"
 *   4. presence           "Here now"
 *
 * The band is deliberately last-but-one rather than first: "Strong match" is a
 * verdict, and a verdict is worth less than the fact it was derived from. When
 * the facts are there, they speak; when they are not, the band is the honest
 * summary of a thin overlap rather than a silent card.
 */

export interface GridCardSource {
  sharedInterests?: string[]
  sharedIntents?: string[]
  insideNow?: boolean
}

export interface GridCardContent {
  /** The chip above the name. Always present — the band always resolves. */
  band: string
  /** The sentence in the box, or null when there is nothing true to say. */
  line: string | null
  /** Whether the line came from a real overlap, for styling the box. */
  kind: 'interests' | 'intent' | 'presence' | null
}

export function gridCardContent(source: GridCardSource): GridCardContent {
  const shared = source.sharedInterests ?? []

  const band = matchBandLabel(
    matchBand({ sharedInterests: shared, sharedIntents: (source.sharedIntents ?? []) as never })
  )

  const interests = sharedInterestSentence({ sharedInterests: shared })
  if (interests) return { band, line: interests, kind: 'interests' }

  /*
   * The shared *intent*, which is an overlap even when no interest is.
   *
   * Safe to say without qualification: the server sends only the intersection,
   * never either person's own intents, and `dating` reaches this list only
   * after compatibility has already been checked — so "Both open to dating"
   * states a fact about the pair without ever stating anyone's gender.
   */
  const intent = intentSentence(source.sharedIntents)
  if (intent) return { band, line: intent, kind: 'intent' }

  /*
   * Standing in the room right now, which is the last thing the roster knows
   * that is worth acting on — and on this screen it is a strong one, because
   * the whole product is about walking over to somebody.
   */
  if (source.insideNow) return { band, line: 'Here now', kind: 'presence' }

  return { band, line: null, kind: null }
}
