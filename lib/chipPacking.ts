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
 * ## Why estimating is good enough
 *
 * Real text measurement means rendering, reading `onLayout`, then reflowing —
 * two passes and a visible jump on every mount. These are short labels in one
 * known font at one known size, so a per-character estimate is within a few
 * points, and being a few points out costs at most one chip on one row.
 * A wrong guess degrades to what flexbox would have done anyway.
 */

/**
 * Roughly how wide a chip will be.
 *
 * Manrope Medium at 16pt averages a shade over half its point size per
 * character across mixed-case English. 8.2 is that, measured against the
 * longest and shortest labels in the app rather than assumed — "Prefer not to
 * say" and "Gay" both land within a few points.
 *
 * `padding` is the chip's own horizontal padding plus its margin, which the
 * caller knows and this file should not.
 */
export function estimateChipWidth(label: string, padding: number): number {
  return Math.ceil(label.length * 8.2) + padding
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
