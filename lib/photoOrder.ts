/*
 * The photo grid's arithmetic (Flow 6 edit 01 · 02): where a slot is, which slot a dragged tile is over, and how the others make room.
 * Plain functions marked as worklets so the gesture reads them on the UI thread and a test reads them as functions.
 */

export type GridSpec = { itemSize: number; gap: number; columns: number }

/** The top-left of slot `slot`, row by row, left to right. */
export function slotXY(slot: number, grid: GridSpec) {
  'worklet'
  const pitch = grid.itemSize + grid.gap
  return { x: (slot % grid.columns) * pitch, y: Math.floor(slot / grid.columns) * pitch }
}

/** The slot under the point (cx, cy) of the tile being dragged, held inside the `count` slots that hold a photo. */
export function slotAt(cx: number, cy: number, grid: GridSpec, count: number) {
  'worklet'
  const pitch = grid.itemSize + grid.gap
  const col = Math.max(0, Math.min(grid.columns - 1, Math.floor(cx / pitch)))
  const row = Math.max(0, Math.floor(cy / pitch))
  return Math.max(0, Math.min(count - 1, row * grid.columns + col))
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
