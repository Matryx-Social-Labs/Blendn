/*
 * Reordering chips so they fill their rows.
 *
 * Flexbox wraps **greedily, in order**: it takes the next chip, and if it does
 * not fit it starts a new line — even when a later, shorter chip would have
 * fitted in the space left behind. With labels of wildly different lengths
 * ("Gay" beside "Prefer not to say", or a work-field list from the server) that
 * leaves rows half empty and the column looking broken.
 *
 * Filling those gaps means changing the order, which flexbox cannot do. So this
 * does it first, and the row renders the result.
 *
 * ## Widths come from the chips, not from arithmetic
 *
 * Two rounds of estimating from character counts were not close enough. A
 * per-character average cannot know that "Prefer not to say" is mostly narrow
 * letters while "Web3 APIs" is mostly wide ones, and being wrong by a few
 * points is exactly the difference between a chip fitting a row and being held
 * back from it. Each correction to the coefficient only moved which labels it
 * was wrong about.
 *
 * `EmberChipRow` measures the rendered chips with `onLayout` and passes the
 * real numbers in. This file just does the ordering.
 */

/**
 * Roughly how wide a chip will be. **Unused by the row**, which measures.
 *
 * Kept because it is the only way to reason about packing in a test without a
 * renderer, and the ordering tests are worth more than the function costs.
 *
 * Manrope Medium at 16pt averages a little under half its point size per
 * character across mixed-case English. 7.6 rather than the 8.2 first used: the
 * longer labels are full of narrow letters — "Prefer not to say" is mostly f,
 * t, i and spaces — so a flat average tuned on short words overestimates them
 * badly, and overestimating is the direction that wastes space. A chip judged
 * too wide is held back from a row it would have fitted.
 *
 * `padding` is the chip's own horizontal padding plus its margin, which the
 * caller knows and this file should not.
 */
export function estimateChipWidth(label: string, padding: number): number {
  return Math.ceil(label.length * 7.6) + padding
}

/**
 * Catch-all options belong at the end, whatever packs best.
 *
 * "Prefer not to say", "Other", "Something else" — these are the answer you
 * give when none of the others fit, so reading them before the real options is
 * backwards, and a packer that hoists one into row one because it happens to
 * fill a gap makes the list actively harder to scan.
 *
 * Order is a meaning here, not a layout, so it wins over packing.
 */
export function isCatchAll(label: string): boolean {
  return /^(other|something else|prefer not to say|none of these)$/i.test(label.trim())
}

/**
 * Reorder so each row is filled as fully as possible.
 *
 * First-fit with a look-ahead: lay chips down in order, and whenever the next
 * one will not fit, look for the widest remaining chip that *will* rather than
 * breaking the line immediately.
 *
 * Widest-that-fits rather than first-that-fits, because the goal is a full row
 * — grabbing the narrowest leaves a gap that the next pass has to solve again.
 *
 * Stable for anything that already packs perfectly: if every chip fits in
 * order, the order does not change. That matters because reordering is
 * *visible*, and a list that shuffles for no gain is worse than a small gap.
 */
export function packChips<T>(
  items: readonly T[],
  widthOf: (item: T) => number,
  containerWidth: number
): T[] {
  const remaining = items.map((item, index) => ({ item, index, width: widthOf(item) }))
  const packed: T[] = []
  let lineLeft = containerWidth

  while (remaining.length > 0) {
    // The widest one still on this line. -1 when nothing fits.
    let pick = -1
    for (let i = 0; i < remaining.length; i += 1) {
      if (remaining[i].width <= lineLeft) {
        if (pick === -1 || remaining[i].width > remaining[pick].width) pick = i
      }
    }

    if (pick === -1) {
      // Nothing fits: start a new line and take the original next one. Taking
      // the widest here instead would reorder the whole list on every wrap,
      // which is churn with no packing benefit.
      lineLeft = containerWidth
      pick = 0
      // A chip wider than an empty row cannot be helped by ordering; it takes
      // its own line and `flexShrink` on the chip handles the overflow.
    }

    const [chosen] = remaining.splice(pick, 1)
    packed.push(chosen.item)
    lineLeft -= chosen.width
  }

  return packed
}
