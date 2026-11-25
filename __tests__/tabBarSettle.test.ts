/*
 * The tab bar settling into the compact pill (SCRUM-1023, tab-bar board option B): when a list asks it to, and its
 * shape at any point between full and compact. Pure worklets, run here on the JS thread.
 */
import { makeMutable } from 'react-native-reanimated'

import {
  expandTabBar,
  nextRun,
  RUN_START,
  TAB_BAR_SETTLE,
  tabBarShape,
  trackTabBarScroll,
  type ScrollRun,
} from '../lib/tabBarSettle'
import { SIZE, SPACE } from '../lib/design/tokens'

/** Feeds offsets in order, as a list's scroll events would, and returns whether the bar is compact after each. */
function scroll(offsets: number[], start = { run: RUN_START, compact: false }) {
  let { run, compact } = start
  return offsets.map((y) => {
    ;({ run, compact } = nextRun(run, y, compact))
    return compact
  })
}

describe('when a list settles the bar (board: 48 pt down in one go, past 120; back on 16 up or under 24)', () => {
  it('settles after 48 pt of downward scroll in one go, once the list is 120 pt from its top', () => {
    expect(scroll([0, 60, 100, 119]).at(-1)).toBe(false)
    expect(scroll([0, 60, 100, 120]).at(-1)).toBe(true)
  })

  it('does not settle on less than 48 pt in one go, however far down the list is', () => {
    // At 400, a reader nudging 30 down, 10 up, 30 down: never 48 in one run.
    const at400 = { run: { y: 400, from: 400, down: true } as ScrollRun, compact: false }
    expect(scroll([430, 420, 450], at400)).toEqual([false, false, false])
    // Control: the same distance in one go does settle.
    expect(scroll([430, 448], at400).at(-1)).toBe(true)
  })

  it('comes back on 16 pt of upward scroll, not on less', () => {
    const settled = { run: { y: 600, from: 400, down: true } as ScrollRun, compact: true }
    expect(scroll([590, 585], settled).at(-1)).toBe(true)
    expect(scroll([590, 584], settled).at(-1)).toBe(false)
  })

  it('comes back at the top of the list (under 24 pt), whatever the run', () => {
    const settled = { run: { y: 30, from: 30, down: true } as ScrollRun, compact: true }
    expect(scroll([23], settled)).toEqual([false])
  })

  it('does not come back when the scroll stops: the same offset again keeps it compact', () => {
    const settled = { run: { y: 600, from: 400, down: true } as ScrollRun, compact: true }
    expect(scroll([600, 600, 600], settled)).toEqual([true, true, true])
  })

  it('a reversal starts a new run from where it turned', () => {
    // Down to 500 (settles), up 10 (still compact), down again: the 10 up was a run of its own, too short to return it.
    expect(scroll([0, 200, 500, 490, 495])).toEqual([false, true, true, true, true])
  })
})

describe('trackTabBarScroll: a list scroll event into the shared request', () => {
  const event = (y: number, content = 3000, viewport = 800) => ({
    contentOffset: { x: 0, y },
    contentSize: { width: 400, height: content },
    layoutMeasurement: { width: 400, height: viewport },
  })

  beforeEach(() => expandTabBar())

  it('asks the bar to settle and to come back', () => {
    const run = makeMutable(RUN_START)
    for (const y of [0, 100, 200]) trackTabBarScroll(run, event(y) as never)
    expect(TAB_BAR_SETTLE.scroll.get()).toBe(1)
    for (const y of [180, 170]) trackTabBarScroll(run, event(y) as never)
    expect(TAB_BAR_SETTLE.scroll.get()).toBe(0)
  })

  it('the bounce past the end of a list is not an upward scroll', () => {
    const run = makeMutable(RUN_START)
    // Max offset 2200; iOS overshoots to 2260 and springs back: clamped, it never moved up.
    for (const y of [0, 1000, 2200, 2260, 2230, 2200]) trackTabBarScroll(run, event(y) as never)
    expect(TAB_BAR_SETTLE.scroll.get()).toBe(1)
  })

  it('a list shorter than its viewport never settles the bar', () => {
    const run = makeMutable(RUN_START)
    for (const y of [0, 150, 300]) trackTabBarScroll(run, event(y, 700) as never)
    expect(TAB_BAR_SETTLE.scroll.get()).toBe(0)
  })

  it('expandTabBar clears both requests: the lists’ and the drawer’s', () => {
    TAB_BAR_SETTLE.scroll.set(1)
    TAB_BAR_SETTLE.drawer.set(1)
    expandTabBar()
    expect([TAB_BAR_SETTLE.scroll.get(), TAB_BAR_SETTLE.drawer.get()]).toEqual([0, 0])
  })
})

describe('tabBarShape: the board’s barB() at any point between full (0) and compact (1)', () => {
  it('full at 393: 361 × 64, 16 pt in, five 70.6 cells, the disc 56, labels shown', () => {
    expect(tabBarShape(0, 393)).toMatchObject({ width: 361, height: SIZE.tabBar, left: SPACE.tabBarInset, disc: SIZE.disc, labels: 1, drop: 0 })
    expect(tabBarShape(0, 393).cell).toBeCloseTo((361 - 8) / 5, 6)
  })

  it('compact: 288 × 52 centred, five 56 pt cells, the disc 44, no labels, the bottom edge where it was', () => {
    const c = tabBarShape(1, 393)
    expect(c).toMatchObject({ width: 288, height: SIZE.tabBarCompact, cell: SIZE.primary, disc: SIZE.discCompact, labels: 0 })
    expect(c.left).toBeCloseTo((393 - 288) / 2, 6)
    // The top edge comes down by the 12 pt the height loses, so the bottom stays put; the row's centre by half of it.
    expect(c.drop).toBe(6)
  })

  it('compact is the same 288 on every phone; full follows the width', () => {
    expect(tabBarShape(1, 375).width).toBe(288)
    expect(tabBarShape(0, 375).width).toBe(343)
    expect(tabBarShape(1, 440).width).toBe(288)
  })

  it('labels are gone before the pill is half-shrunk (board: 1 − 2.2p)', () => {
    expect(tabBarShape(0.25, 393).labels).toBeCloseTo(0.45, 6)
    expect(tabBarShape(0.46, 393).labels).toBe(0)
  })

  it('the radius is always half the height: a capsule at every frame', () => {
    for (const p of [0, 0.3, 0.7, 1]) expect(tabBarShape(p, 393).radius).toBe(tabBarShape(p, 393).height / 2)
  })
})
