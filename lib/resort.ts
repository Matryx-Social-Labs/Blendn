import { DURATION, STAGGER } from './design/tokens'

/**
 * Filter re-sort (motion #38): tap a chip and the list jumps to the top; the rows that leave fade over `quick`, the ones that
 * arrive fade and rise 8 pt over `base` with an 18 ms stagger down the first six; up to twelve rows reflow on `M.settle`, more
 * crossfade. Reduce Motion: a quick crossfade. The rules are here so they are tested without a render.
 */

/** The rows that are staggered; below them arrive together with the last of them. */
export const RESORT_STAGGER_ROWS = 6
/** At or under this many rows the list reflows on `M.settle`; over it, the rows crossfade instead. */
export const RESORT_REFLOW_MAX = 12

/** When the row at `index` (0 = the first row under the search) starts to arrive, in ms. */
export const resortDelay = (index: number): number => STAGGER.tight * Math.max(0, Math.min(index, RESORT_STAGGER_ROWS))

/** How long a re-sort is under way: the last staggered row's start and its `base`, and a frame of margin. */
export const RESORT_WINDOW_MS = resortDelay(RESORT_STAGGER_ROWS) + DURATION.base + 50

/** Whether a list of this many rows reflows on a spring (and not under Reduce Motion), or crossfades. */
export const reflowsOnSpring = (rowCount: number, reduceMotion: boolean): boolean => !reduceMotion && rowCount <= RESORT_REFLOW_MAX
