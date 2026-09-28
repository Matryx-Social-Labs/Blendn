/**
 * A message's reaction tally, as the room shows it: counts, and whether one
 * of them is yours — never who else (docs/CHAT.md, "Reply quotes, edits,
 * reactions").
 */
export type Tally = { emoji: string; count: number; mine?: boolean }[]

/**
 * What the tally looks like once your tap on `emoji` lands, drawn before the
 * server answers. The server toggles too — one tap adds, the next removes —
 * so this mirrors it, and its answer replaces this either way.
 */
export function toggleReaction(tally: Tally | null | undefined, emoji: string): Tally {
  const list = tally ?? []
  const hit = list.find((r) => r.emoji === emoji)
  if (hit?.mine) {
    return list
      .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r))
      .filter((r) => r.count > 0)
  }
  if (hit) return list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r))
  return [...list, { emoji, count: 1, mine: true }]
}

/**
 * A tally from the socket, which is the same for everybody in the room and so
 * cannot say which one is yours. Replaced whole, as before, keeping `mine`
 * from what this phone already knew.
 */
export function withMine(next: { emoji: string; count: number }[], known: Tally | null | undefined): Tally {
  const mine = new Set((known ?? []).filter((r) => r.mine).map((r) => r.emoji))
  return next.map((r) => ({ ...r, mine: mine.has(r.emoji) }))
}
