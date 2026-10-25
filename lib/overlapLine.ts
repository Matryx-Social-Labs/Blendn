/**
 * Matching v2's overlap, as a card draws it (Flow 14 · 14.1): one sentence and
 * the labels under it. Pure, so the three cards that show it say the same thing.
 *
 * Nothing here is computed from the room: the server already withholds Tier B
 * (language, home state, sign) in a room under 8 and budgets the sentences
 * (`lib/matching.ts` MAX_DISPLAY_LINES). This only picks which of what it sent
 * is the line, and which are the labels. Positive only, never a number.
 */
export interface OverlapLabelOut {
  text: string
  shared?: boolean
}

export interface OverlapSource {
  overlaps?: readonly { kind?: string; text: string }[]
  /** The shared subset only; `dating` only when the server checked both ways. */
  sharedIntents?: readonly string[]
  /** Shared interest names, strongest first. */
  interests?: readonly string[]
  /** Their sign, when they chose to show it and the card's budget allows. */
  sign?: string | null
}

/** The sentence an intent says on its own, and the label it wears. */
export const INTENT_LINE: Record<string, string> = {
  dating: 'Both open to dating',
  networking: 'Both here to network',
  friends: 'Both here to make friends',
}
const INTENT_LABEL: Record<string, string> = { dating: 'Dating', networking: 'Networking', friends: 'Friendship' }
const INTENT_ORDER = ['dating', 'friends', 'networking'] as const

/**
 * `line` is the server's strongest overlap (`overlaps[0]`); with none, the
 * strongest shared intent says so ("Both here to make friends": never empty
 * when something is shared), and with nothing shared it is null and the card
 * draws no line at all. `labels` are every shared thing, in the order the
 * design draws them; `OverlapLine` caps them at 2 before a reveal, 4 after.
 */
export function overlapOf(p: OverlapSource): { line: string | null; labels: OverlapLabelOut[] } {
  const intents = INTENT_ORDER.filter((i) => p.sharedIntents?.includes(i))
  const line = p.overlaps?.[0]?.text || (intents[0] ? INTENT_LINE[intents[0]] : null)
  const seen = new Set<string>()
  const labels: OverlapLabelOut[] = []
  const add = (text: string | null | undefined, shared: boolean) => {
    const t = text?.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    labels.push({ text: t, shared })
  }
  for (const i of intents) add(INTENT_LABEL[i], true)
  for (const i of p.interests ?? []) add(i, true)
  // Their sign is a fact about them; it is "shared" only when the server said you share it.
  add(p.sign, !!p.overlaps?.some((o) => o.kind === 'sign'))
  return { line, labels }
}
