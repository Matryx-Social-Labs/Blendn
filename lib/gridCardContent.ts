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
 *   SHARED INTERESTS     `1141:5038`  a comma-joined sentence, not chips
 *   ATTENDING LIVE       `1141:5067`  what they are doing here
 *
 * One at a time, strongest first, and each is a fact the server sent or it is
 * skipped. Nothing is invented and no overlap is claimed that is not there.
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
}

export type GridBoxKind = 'interests' | 'field' | 'live'

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
