/**
 * The one labelled block on a Grid card, and which of three things fills it.
 *
 * ## The frame's model, which is two data sets and not one
 *
 * Cards `1141:4978`, `1141:5020` and `1141:5049` differ only in this block, and
 * the split is the point:
 *
 *   CORE EXPERTISE tags   their attributes
 *   the labelled box      what you SHARE, or what they are doing right now
 *
 * Collapsing both onto `sharedInterests` is what made a card say the same thing
 * twice — "You both picked Techno and Board games" directly above chips reading
 * *Techno, Board games*.
 *
 * ## The box is a priority slot
 *
 *   MUTUAL CONNECTIONS   `1141:5002`  the friend graph — deferred (#86)
 *   ALSO GOING                         a future event you are both going to
 *   SAME EVENTS                        nights you were both at, before this one
 *   SHARED INTERESTS     `1141:5038`  a comma-joined sentence, not chips
 *   ATTENDING LIVE       `1141:5067`  what they are doing here
 *
 * One at a time, strongest first, and each is a fact the server sent or it is
 * skipped. Nothing is invented and no overlap is claimed that is not there.
 *
 * ## The two the server has always sent and the card never drew
 *
 * `sharedEvents` and `sharedPlans` have been on the wire since matching learned
 * to compute them, and nothing read either. They go **above** shared interests
 * because the server's own reasoning ranks them there:
 *
 *   sharedPlans   "the rarest thing a room can offer: a reason to talk that has
 *                  somewhere to go afterwards"
 *   sharedEvents  "the one line here that could not be written by a product
 *                  without verified attendance"
 *
 * Rarest and most actionable first. Plans fire seldom, so leading with them
 * costs the interests line almost nothing, and when they do fire they are the
 * best sentence on the card.
 *
 * **Both are already suppressed server-side** below the disclosure floor — a
 * small room narrows "was at those specific nights" to a name — and arrive as
 * `0`. The client renders what it is given and skips zero; it does not
 * re-derive a floor it cannot see the room size for.
 *
 * ## No verdict chip
 *
 * An earlier version put "Strong match" above the box. With the box labelled it
 * is a verdict derived from the line directly beneath it — and a verdict is
 * worth less than the fact it came from. A card with nothing to share now says
 * nothing rather than grading the silence.
 */

export interface GridCardSource {
  /** Names, already intersected by the server. */
  sharedInterests?: string[]
  /** You are both in this field. Computed server-side for ranking already. */
  sharedWorkField?: boolean
  workField?: string | null
  insideNow?: boolean
  /** Nights you were both at, before this one. Zero when suppressed or none. */
  sharedEvents?: number
  /** Future events you are both going to, excluding this one. Same suppression. */
  sharedPlans?: number
}

export type GridBoxKind = 'interests' | 'field' | 'live' | 'plans' | 'history'

export interface GridBox {
  /** The uppercase label. Frame: Manrope Bold 12/16, tracking 0.3, white. */
  label: string
  /** The line under it. Frame: Manrope Regular 14/20, `#AEAAAA`. */
  value: string
  kind: GridBoxKind
}

/**
 * What the box says, or `null` when there is nothing true to put in it.
 *
 * Null is a real answer: an empty room of strangers with no interest graph
 * yields cards that are a name, a field of work and two buttons, and inventing
 * a line to fill the space would be worse than the space.
 */
export function gridCardBox(source: GridCardSource): GridBox | null {
  const shared = source.sharedInterests ?? []
  const plans = source.sharedPlans ?? 0
  const history = source.sharedEvents ?? 0

  /*
   * A reason to talk that has somewhere to go afterwards.
   *
   * "also" is load-bearing: both counts exclude the event you are currently at,
   * and without it the line reads as though it were describing tonight.
   */
  if (plans > 0) {
    return {
      label: 'ALSO GOING',
      value:
        plans === 1
          ? "You're both also going to the same event"
          : `You're both also going to ${plans} of the same events`,
      kind: 'plans',
    }
  }

  /*
   * The line no competitor can write, because nobody else verifies attendance.
   * It says you were in the same rooms — never that you met, which is the thing
   * this product exists because people do not do.
   */
  if (history > 0) {
    return {
      label: 'SAME EVENTS',
      value:
        history === 1
          ? "You've both been to the same event before"
          : `You've both been to ${history} of the same events`,
      kind: 'history',
    }
  }

  /*
   * Frame `1141:5038`: a comma-joined sentence rather than chips. Chips here
   * would repeat the CORE EXPERTISE row's shape directly beneath it, and the
   * eye reads two rows of pills as one list broken in half.
   */
  if (shared.length > 0) {
    return { label: 'SHARED INTERESTS', value: shared.join(', '), kind: 'interests' }
  }

  /*
   * Both in the same field.
   *
   * `lib/matching.ts` has always computed this — it moves the ranking — and has
   * never shown it. "Design" under a name is an attribute; "You both work in
   * Design" is a reason to walk over, and it is the same fact either way.
   */
  if (source.sharedWorkField && source.workField) {
    return {
      label: 'SAME FIELD',
      value: `You both work in ${source.workField}`,
      kind: 'field',
    }
  }

  /*
   * Frame `1141:5067` reads "Currently in the Main Stage Lounge. Open for
   * collaborations." We have neither a sub-venue nor a status line — only
   * whether presence says they are inside — so this says the part that is true.
   */
  if (source.insideNow) {
    return { label: 'ATTENDING LIVE', value: 'In the room right now', kind: 'live' }
  }

  return null
}
