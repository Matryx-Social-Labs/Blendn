/**
 * The home screen's pure parts: where the drawer rests, and how a place reads
 * in the Places list (plan v2 step 2). Separate from the components so they run
 * in a plain node test.
 */

import { nextUpLabel } from './pulse'

export type DrawerSnap = 'full' | 'half' | 'peek'

/** Top to bottom: the order a drag passes them in. */
export const DRAWER_SNAPS: readonly DrawerSnap[] = ['full', 'half', 'peek']

/** The handle's touch target: 44pt tall, the platform minimum (step 2 review). */
export const DRAWER_HANDLE_HEIGHT = 44
/** The Events | Places control: 44pt segments inside a 4pt inset. */
export const DRAWER_SEGMENTED_HEIGHT = 52
/** Space under the control, before the pane. */
const DRAWER_HEADER_GAP = 8

/**
 * The drawer's header: the handle, then the Events | Places control — what is
 * left showing at `peek`, so the control can always be reached.
 */
export const DRAWER_HEADER_HEIGHT = DRAWER_HANDLE_HEIGHT + DRAWER_SEGMENTED_HEIGHT + DRAWER_HEADER_GAP

/**
 * How far ahead a release is projected, in seconds of its velocity. A flick
 * travels on to the next snap; a slow release settles on the nearest.
 */
const FLING_PROJECTION_S = 0.12

/**
 * Where the drawer's top edge sits at each snap, in screen points.
 *
 * - `full`: just under the top bar, so the bell stays reachable.
 * - `half`: the middle of the screen — map above, list below.
 * - `peek`: only the header, resting on the tab bar.
 */
export function drawerSnapPoints(screen: {
  height: number
  /** The safe area plus the top bar. */
  topChrome: number
  /** Where the tab bar's top edge is (`tabBarTop`). */
  tabBarTop: number
}): Record<DrawerSnap, number> {
  const full = screen.topChrome
  const peek = Math.max(full, screen.tabBarTop - DRAWER_HEADER_HEIGHT)
  const half = Math.min(peek, Math.max(full, Math.round(screen.height / 2)))
  return { full, half, peek }
}

/** The snap a released drag settles on: the nearest to where its velocity would carry it. */
export function settleSnap(y: number, velocityY: number, points: Record<DrawerSnap, number>): DrawerSnap {
  'worklet'
  const projected = y + velocityY * FLING_PROJECTION_S
  let best: DrawerSnap = 'half'
  let bestDistance = Infinity
  for (const snap of DRAWER_SNAPS) {
    const distance = Math.abs(points[snap] - projected)
    if (distance < bestDistance) {
      best = snap
      bestDistance = distance
    }
  }
  return best
}

/** The next snap a tap on the handle (or a screen reader's swipe) moves to. */
export function stepSnap(snap: DrawerSnap, direction: 'up' | 'down'): DrawerSnap {
  const i = DRAWER_SNAPS.indexOf(snap)
  const next = direction === 'up' ? Math.max(0, i - 1) : Math.min(DRAWER_SNAPS.length - 1, i + 1)
  return DRAWER_SNAPS[next]
}

/**
 * How tall the pane under the header is at a settled snap: exactly what shows
 * above the screen's bottom, so a list's last row can be scrolled into view
 * at half as at full. Set when a snap settles, never per frame.
 */
export function drawerContentHeight(points: Record<DrawerSnap, number>, snap: DrawerSnap, screenHeight: number): number {
  return Math.max(0, screenHeight - points[snap] - DRAWER_HEADER_HEIGHT)
}

/**
 * The keyboard and the drawer: typing in the Pulse's search opens the drawer
 * fully, so the field is not under the keyboard, and closing the keyboard puts
 * it back where it was — unless the person moved it meanwhile.
 */
export function snapOnKeyboard(
  state: { snap: DrawerSnap; restore: DrawerSnap | null },
  event: 'show' | 'hide'
): { snap: DrawerSnap; restore: DrawerSnap | null } {
  if (event === 'show') return state.snap === 'full' ? state : { snap: 'full', restore: state.snap }
  return state.restore ? { snap: state.restore, restore: null } : state
}

export const DRAWER_SNAP_LABEL: Record<DrawerSnap, string> = {
  full: 'Expanded',
  half: 'Half open',
  peek: 'Collapsed',
}

/** The server's live-count bucket (`GET /venues`, D-19). Never a number. */
export type LiveNow = 'quiet' | '5-9' | '10-19' | '20+'

/**
 * How many are live at a place, as the list says it. `quiet` is fewer than 5,
 * none included — the dashboard's wording (`liveCountLabel`), so the two never
 * describe one room differently.
 */
export function liveNowLabel(bucket: LiveNow | null | undefined): string {
  switch (bucket) {
    case '5-9':
      return '5–9 live'
    case '10-19':
      return '10–19 live'
    case '20+':
      return '20+ live'
    default:
      return 'Under 5 live'
  }
}

/**
 * The venue's event tonight, or null when its next event is another day.
 * "Happening now · Jazz Night", "Tonight · 9:00 PM · Jazz Night".
 */
export function tonightLine(
  next: { title: string; startTime: string; endTime: string } | null | undefined,
  now: Date = new Date()
): string | null {
  if (!next) return null
  const start = new Date(next.startTime)
  const end = new Date(next.endTime)
  if (Number.isNaN(start.getTime())) return null
  const running = start <= now && now < end
  // Today by the calendar, not by what the label happens to say.
  const today = start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth() && start.getDate() === now.getDate()
  return running || today ? `${nextUpLabel(next.startTime, next.endTime, now)} · ${next.title}` : null
}
