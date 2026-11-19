/*
 * The photo grid's arithmetic (Flow 6 edit 01 · 02): where a slot is, which slot a dragged tile is over, and how the others make room.
 * Plain functions marked as worklets so the gesture reads them on the UI thread and a test reads them as functions.
 */

/** The grid's inside width and its gap: board A 03's layout is derived from them (`slotRect`). */
export type GridSpec = { width: number; gap: number }

/** Board A 03's top block: the main photo and the two slots beside it are 240 pt tall at any width. */
export const PHOTO_TOP = 240

/**
 * Slot `slot`'s box (Me + settings A 03, owner approved 2026-11-18): the main photo 2fr wide over two rows, slots 2 and 3
 * at 1fr beside it, and 4–6 under them, the first two halving the main's width so every edge lines up. S = (width − gap) / 3
 * wide; a row is (PHOTO_TOP − gap) / 2 tall.
 */
export function slotRect(slot: number, grid: GridSpec) {
  'worklet'
  const { gap } = grid
  const s = (grid.width - gap) / 3
  const row = (PHOTO_TOP - gap) / 2
  const main = 2 * s
  const half = (main - gap) / 2
  if (slot === 0) return { x: 0, y: 0, w: main, h: PHOTO_TOP }
  if (slot <= 2) return { x: main + gap, y: (slot - 1) * (row + gap), w: s, h: row }
  const y = PHOTO_TOP + gap
  if (slot === 5) return { x: main + gap, y, w: s, h: row }
  return { x: (slot - 3) * (half + gap), y, w: half, h: row }
}

/** The top-left of slot `slot`. */
export function slotXY(slot: number, grid: GridSpec) {
  'worklet'
  const r = slotRect(slot, grid)
  return { x: r.x, y: r.y }
}

/** How tall the grid is with `slots` slots showing: the top block, plus a row once a fourth shows. */
export function gridHeight(slots: number, grid: GridSpec) {
  'worklet'
  return slots > 3 ? PHOTO_TOP + grid.gap + (PHOTO_TOP - grid.gap) / 2 : PHOTO_TOP
}

/** The slot under the point (cx, cy) of the tile being dragged: the photo slot holding it, else the one whose centre is nearest. */
export function slotAt(cx: number, cy: number, grid: GridSpec, count: number) {
  'worklet'
  let best = 0
  let bestDistance = Infinity
  for (let slot = 0; slot < Math.max(count, 1); slot++) {
    const r = slotRect(slot, grid)
    if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return slot
    const distance = (cx - (r.x + r.w / 2)) ** 2 + (cy - (r.y + r.h / 2)) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = slot
    }
  }
  return best
}

/**
 * `positions[i]` is the slot tile `i` sits in. Lifting tile `active` into `to` moves it there and slides the tiles between its old
 * slot and the new one a place along, so the grid stays a list with no gap and no two tiles in a slot. A new array: the shared
 * value it came from is replaced, never edited.
 */
export function moveInto(positions: readonly number[], active: number, to: number): number[] {
  'worklet'
  const from = positions[active]
  if (from === to) return positions.slice()
  return positions.map((slot, i) => {
    if (i === active) return to
    if (from < to && slot > from && slot <= to) return slot - 1
    if (from > to && slot >= to && slot < from) return slot + 1
    return slot
  })
}

/** The items in the order the slots say: `items[i]` goes to `positions[i]`. */
export function inSlotOrder<T>(items: readonly T[], positions: readonly number[]): T[] {
  const out = new Array<T>(items.length)
  items.forEach((item, i) => {
    out[positions[i]] = item
  })
  return out
}

/** Whether a drag changed anything: the identity order is no write. */
export const reordered = (positions: readonly number[]) => positions.some((slot, i) => slot !== i)

/** The list with the item at `from` moved to `to`: a new array, the same photos. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice()
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
