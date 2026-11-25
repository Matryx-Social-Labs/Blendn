import { useAnimatedScrollHandler, useSharedValue, makeMutable, type ScrollEvent, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { SIZE, SPACE } from './design/tokens'

/**
 * The tab bar settling into its compact pill as you read (SCRUM-1023; tab-bar board, option B, owner's pick 2026-11-03).
 *
 * Two things ask it to, each a UI-thread value (1 compact, 0 full), so a scroll never crosses to JS to move the bar:
 * - `scroll`: the focused list's own scroll, on Going, Banter and Me (`trackTabBarScroll`);
 * - `drawer`: on the Pulse, the drawer's snap only (full settles it, half or peek brings it back), never the list inside
 *   it, so the drawer's drag and the bar never fight (`HomeShell`).
 * The bar takes the Pulse's from `drawer` and every other tab's from `scroll` (`app/(tabs)/_layout.tsx`).
 */
export const TAB_BAR_SETTLE = { scroll: makeMutable(0), drawer: makeMutable(0) }

/** The bar's live progress, 0 full … 1 compact, for what rides on its top edge (the Android snackbar). Written by the bar. */
export const TAB_BAR_PROGRESS = makeMutable(0)

/** Back to the full bar: a tap on it, the keyboard going, the app returning, Blend'n closing. */
export function expandTabBar() {
  TAB_BAR_SETTLE.scroll.set(0)
  TAB_BAR_SETTLE.drawer.set(0)
}

/** It settles after this much downward scroll in one go … */
export const SETTLE_RUN = 48
/** … once the list is this far from its top. */
export const SETTLE_FROM = 120
/** It comes back on this much upward scroll … */
export const RETURN_RUN = 16
/** … or under this offset, the top of the list. */
export const TOP = 24

/** Where the list is, where the current run (one direction) began, and which way it is going. */
export type ScrollRun = { y: number; from: number; down: boolean }
export const RUN_START: ScrollRun = { y: 0, from: 0, down: true }

/**
 * One scroll offset in. Not tied to the finger: two states with a gap between them, so small reversals while reading never
 * make the bar twitch, and stopping (the same offset again) never brings it back: stopping is reading.
 */
export function nextRun(run: ScrollRun, y: number, compact: boolean): { run: ScrollRun; compact: boolean } {
  'worklet'
  if (y < TOP) return { run: { y, from: y, down: true }, compact: false }
  const down = y > run.y ? true : y < run.y ? false : run.down
  const next = { y, from: down === run.down ? run.from : run.y, down }
  if (!compact && down && y - next.from >= SETTLE_RUN && y >= SETTLE_FROM) return { run: next, compact: true }
  if (compact && !down && next.from - y >= RETURN_RUN) return { run: next, compact: false }
  return { run: next, compact }
}

/**
 * A list's scroll event into the shared request. The offset is clamped to the list's ends, so iOS's bounce past the
 * bottom (down, then back up) is not read as scrolling up, and a pull past the top is the top.
 */
export function trackTabBarScroll(run: SharedValue<ScrollRun>, e: ScrollEvent) {
  'worklet'
  const end = Math.max(0, e.contentSize.height - e.layoutMeasurement.height)
  const y = Math.min(Math.max(e.contentOffset.y, 0), end)
  const now = TAB_BAR_SETTLE.scroll.get() === 1
  const next = nextRun(run.get(), y, now)
  run.set(next.run)
  if (next.compact !== now) TAB_BAR_SETTLE.scroll.set(next.compact ? 1 : 0)
}

/** The run state a list keeps for `trackTabBarScroll`. */
export function useTabBarRun() {
  return useSharedValue<ScrollRun>(RUN_START)
}

type Pull = { wantsOffset: (y: number) => boolean; onOffset: (y: number) => void }

/**
 * A tab list's `onScroll` (Going, Banter): the bar's request on the UI thread, and the pull its offset only while it is
 * the pull's (`usePullToRefresh`). Set after `{...pull.listProps}`, as Me does with its own handler.
 */
export function useTabListScroll({ wantsOffset, onOffset }: Pull) {
  const run = useTabBarRun()
  return useAnimatedScrollHandler((e) => {
    trackTabBarScroll(run, e)
    if (wantsOffset(e.contentOffset.y)) scheduleOnRN(onOffset, e.contentOffset.y)
  })
}

/** The compact pill: five 56 pt cells in the bar's 4 pt of padding (288 pt), whatever the phone. */
const COMPACT_WIDTH = 5 * SIZE.primary + 2 * SPACE.xs
/** Labels fade as `1 − 2.2p`: gone before the pill is half-shrunk, back from about halfway home (the board's barB). */
const LABEL_FADE = 2.2

const lerp = (a: number, b: number, p: number) => {
  'worklet'
  return a + (b - a) * p
}

/**
 * The bar at progress `p` (0 full, 1 compact) on a screen `screenWidth` wide: the board's `barB()`. `left` is in screen
 * space; `drop` is how far the row's centre comes down, as the top edge falls and the bottom edge stays.
 */
export function tabBarShape(p: number, screenWidth: number) {
  'worklet'
  const width = lerp(screenWidth - 2 * SPACE.tabBarInset, COMPACT_WIDTH, p)
  const height = lerp(SIZE.tabBar, SIZE.tabBarCompact, p)
  return {
    width,
    height,
    left: (screenWidth - width) / 2,
    radius: height / 2,
    cell: (width - 2 * SPACE.xs) / 5,
    disc: lerp(SIZE.disc, SIZE.discCompact, p),
    labels: Math.min(1, Math.max(0, 1 - p * LABEL_FADE)),
    drop: (SIZE.tabBar - height) / 2,
  }
}
