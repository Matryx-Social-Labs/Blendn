/**
 * The home screen's pure parts: where the drawer rests, and how a place reads
 * in the Places list (plan v2 step 2; the list's own strata are `lib/placesPane.ts`). Separate from the components so they run
 * in a plain node test.
 */

import { SIZE, SPACE } from './design/tokens'

export type DrawerSnap = 'full' | 'half' | 'peek'

/** Top to bottom: the order a drag passes them in. */
export const DRAWER_SNAPS: readonly DrawerSnap[] = ['full', 'half', 'peek']

/** The handle's touch target: 44pt tall, the platform minimum (step 2 review). */
export const DRAWER_HANDLE_HEIGHT = 44
/** The drawer's title tabs, Events | Places: one 48 pt row. */
export const DRAWER_SEGMENTED_HEIGHT = SIZE.control
/** Space under the control, before the pane. */
const DRAWER_HEADER_GAP = 8

/**
 * The drawer's header: the handle, then the Events | Places control — what is
 * left showing at `peek`, so the control can always be reached.
 */
export const DRAWER_HEADER_HEIGHT = DRAWER_HANDLE_HEIGHT + DRAWER_SEGMENTED_HEIGHT + DRAWER_HEADER_GAP

/** The one-line summary Places keeps at `peek` under the control ("3 places live · 31 open tonight"): a 20 pt line and its 8 pt margin. */
export const DRAWER_PEEK_LINE = 28

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
  /** Extra room at `peek` for a summary line under the control (`DRAWER_PEEK_LINE`); none for a pane without one. */
  peekExtra?: number
  /** Where the drawer rests (`pulseRest`); the middle of the screen when not given. */
  half?: number
}): Record<DrawerSnap, number> {
  const full = screen.topChrome
  const peek = Math.max(full, screen.tabBarTop - DRAWER_HEADER_HEIGHT - (screen.peekExtra ?? 0))
  const half = Math.min(peek, Math.max(full, screen.half ?? Math.round(screen.height / 2)))
  return { full, half, peek }
}

/** The Pulse's lead card (Flow 3 · Pulse, Option C): 256 pt on a 393 × 852 phone, the biggest photo on the screen. */
export const LEAD_CARD_HEIGHT = 256
/** The shortest it gets on a small phone, where the map keeps its share instead. */
export const LEAD_CARD_MIN = 180
/** The chip row under the header: the 36 pt header chip (`SIZE.tagHeader`, board `.qc`), which its 1.3 text cap still fits. */
export const CHIP_ROW_HEIGHT = 36
/** The chips sit 10 pt under the header (board: header ends +100, chips at +110): `StickyBar`'s 8 and the row's own 2. */
export const CHIP_ROW_LEAD = SPACE.xxs
/** The chip row as the list pins it: `StickyBar`'s 8 pt above and below, and the row's own 2 above. */
export const CHIP_BLOCK = SPACE.sm + CHIP_ROW_LEAD + CHIP_ROW_HEIGHT + SPACE.sm
/** From the chip block to the lead card (board: chips end +146, card at +172). */
export const LEAD_GAP = SPACE.md + SPACE.xs + SPACE.xxs
/** The board runs the card's foot 10 pt under the floating tab bar (card 508–764, bar from 754); its words stay clear. */
const LEAD_UNDER_BAR = 10
/** At rest the drawer covers at most this share of the screen above the tab bar, so the map is never a strip. */
export const REST_MAX_SHARE = 0.55

/**
 * Where the Pulse's drawer rests, and how tall its lead card is (Option C): one whole card above the tab bar, under the
 * header and the chips: 336 pt on a 393 × 852 phone, the board's frame to the point (map 39%); a taller phone shows more map, never a taller card; a
 * short one keeps its share of map and the card gives way, down to `LEAD_CARD_MIN`. The text inside the card and the
 * chips stops growing at its cap (1.5× and 1.3×), so the largest text size rests at the same point.
 */
export function pulseRest(screen: { height: number; topChrome: number; tabBarTop: number }): { half: number; lead: number } {
  const chrome = DRAWER_HEADER_HEIGHT + CHIP_BLOCK + LEAD_GAP - LEAD_UNDER_BAR
  const highest = Math.max(screen.topChrome, screen.tabBarTop - Math.round(screen.height * REST_MAX_SHARE))
  const half = Math.max(highest, screen.tabBarTop - chrome - LEAD_CARD_HEIGHT)
  const lead = Math.max(LEAD_CARD_MIN, Math.min(LEAD_CARD_HEIGHT, screen.tabBarTop - chrome - half))
  return { half, lead }
}

/** A flick of the lead pager carries on to the next page past this speed (pt/s). */
const PAGE_FLICK = 500

/**
 * The page a released drag of the lead pager settles on: the nearest to where it was let go, or the next one on a flick,
 * never more than one page from where the drag began, never past the ends. A worklet: it runs in the gesture's end.
 */
export function settlePage(offset: number, velocityX: number, width: number, count: number, from?: number): number {
  'worklet'
  const at = -offset / width
  const start = from ?? Math.round(at)
  let page = Math.round(at)
  if (velocityX <= -PAGE_FLICK) page = Math.ceil(at)
  else if (velocityX >= PAGE_FLICK) page = Math.floor(at)
  page = Math.min(start + 1, Math.max(start - 1, page))
  return Math.min(count - 1, Math.max(0, page))
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

/**
 * A hide event that is the keyboard actually leaving: its end frame at or
 * below the window's bottom. iOS also reports a hide while the keyboard only
 * changes frame as you type (drive 3: the first character closed the search);
 * that one ends on screen and is not a hide.
 */
export function keyboardLeft(event: { endCoordinates?: { screenY: number; height: number } } | undefined, windowHeight: number): boolean {
  const end = event?.endCoordinates
  if (!end) return true
  return end.height === 0 || end.screenY >= windowHeight - 1
}

export const DRAWER_SNAP_LABEL: Record<DrawerSnap, string> = {
  full: 'Expanded',
  half: 'Half open',
  peek: 'Collapsed',
}

/** The server's live-count bucket (`GET /venues`, D-19). Never a number. */
export type LiveNow = 'quiet' | '5-9' | '10-19' | '20+'

// Owner ruling 2026-10-18: no "Under 5 live" — below 5 shows nothing.
/** The number a live bucket shows ("5–9"); null for `quiet` (fewer than 5) and for an older server that sends none. */
export function liveNowWord(bucket: LiveNow | null | undefined): string | null {
  switch (bucket) {
    case '5-9':
      return '5–9'
    case '10-19':
      return '10–19'
    case '20+':
      return '20+'
    default:
      return null
  }
}

/** How many are live at a place, as the list says it ("5–9 live"), or null when it shows nothing. */
export function liveNowLabel(bucket: LiveNow | null | undefined): string | null {
  const word = liveNowWord(bucket)
  return word ? `${word} live` : null
}
