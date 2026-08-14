/*
 * Reordering chips to fill their rows.
 *
 * The property that matters is not "packs optimally" — that is bin packing and
 * NP-hard — but "never worse than doing nothing". A reorder that shuffles a
 * list without gaining a row is pure churn, and on a screen full of choices
 * that reads as instability.
 */

import { estimateChipWidth, packChips } from '../lib/chipPacking'

const w = (n: number) => () => n
const widths = (items: readonly number[]) => packChips(items, (n) => n, 100)

describe('estimateChipWidth', () => {
  it('grows with the label and includes the padding', () => {
    expect(estimateChipWidth('Gay', 40)).toBeLessThan(estimateChipWidth('Prefer not to say', 40))
    expect(estimateChipWidth('', 40)).toBe(40)
  })
})

describe('packChips', () => {
  it('leaves a list that already fits exactly alone', () => {
    // Reordering is visible. A list that shuffles for no gain is worse than the
    // gap it was trying to close.
    expect(widths([50, 50, 50, 50])).toEqual([50, 50, 50, 50])
  })

  it('pulls a later chip forward to fill a gap', () => {
    /*
     * 60 then 50 leaves 40 idle and pushes 30 to the next row. Taking 30 first
     * fills the row and costs nothing — this is the whole point.
     */
    expect(widths([60, 50, 30])).toEqual([60, 30, 50])
  })

  it('takes the widest that fits, not the first', () => {
    // Grabbing the narrowest leaves a gap the next pass has to solve again.
    expect(widths([70, 10, 30])).toEqual([70, 30, 10])
  })

  it('keeps everything, exactly once', () => {
    // The one property a reordering must never break.
    const input = [80, 30, 45, 20, 60, 15]
    const out = widths(input)
    expect(out.length).toBe(input.length)
    expect([...out].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b))
  })

  it('never uses more rows than the original order would', () => {
    /*
     * The real guarantee. Packing is allowed to be imperfect; it is not allowed
     * to be worse than the flexbox behaviour it replaces.
     */
    const rows = (order: readonly number[]) => {
      let lines = 1
      let left = 100
      for (const n of order) {
        if (n > left) {
          lines += 1
          left = 100
        }
        left -= n
      }
      return lines
    }
    for (const input of [
      [60, 50, 30],
      [70, 10, 30],
      [80, 30, 45, 20, 60, 15],
      [40, 40, 40, 40, 40],
      [90, 90, 90],
    ]) {
      expect([input, rows(widths(input))]).toEqual([input, expect.any(Number)])
      expect(rows(widths(input))).toBeLessThanOrEqual(rows(input))
    }
  })

  it('survives a chip wider than the row', () => {
    /*
     * Ordering cannot rescue an oversized chip — `flexShrink` on the chip deals
     * with the overflow. What matters here is that it does not loop, does not
     * drop anything, and still fills the row it can: the 40 goes first because
     * it fits, and the 150 takes its own line either way.
     */
    expect(widths([150, 40])).toEqual([40, 150])
  })

  it('handles an empty list', () => {
    expect(packChips([], w(10), 100)).toEqual([])
  })
})
