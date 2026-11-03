import { CHIP_BLOCK, DRAWER_HEADER_HEIGHT, drawerSnapPoints, LEAD_CARD_HEIGHT, LEAD_GAP, LEAD_CARD_MIN, pulseRest, REST_MAX_SHARE, settlePage } from '../lib/home'

/**
 * Flow 3 · Pulse, Option C (owner pick 2026-11-03): the drawer rests where one whole 256 pt lead card sits above the tab
 * bar, under the header and the chips. 336 pt on a 393 × 852 phone (board, measured: header to +100, chips +110, card +172), checked across screen sizes from SE to Pro Max and Android with a gesture bar.
 */

// Each phone as the shell measures it: `topChrome` is the safe area plus the 64 pt top bar, `tabBarTop` is `tabBarTop()`.
const PHONES = {
  iPhone16: { height: 852, topChrome: 59 + 64, tabBarTop: 852 - 34 - 64 },
  SE: { height: 667, topChrome: 20 + 64, tabBarTop: 667 - 0 - 64 },
  ProMax: { height: 932, topChrome: 59 + 64, tabBarTop: 932 - 34 - 64 },
  // Android 12 dp over a 48 dp nav bar (`tabBarBottomGap`), a Pixel 7's 915 dp, and a small 640 dp phone.
  Pixel7: { height: 915, topChrome: 24 + 64, tabBarTop: 915 - 48 - 12 - 64 },
  SmallAndroid: { height: 640, topChrome: 24 + 64, tabBarTop: 640 - 0 - 12 - 64 },
}

describe('the Pulse at rest (Option C)', () => {
  it('rests at 336 on a 393 × 852 phone, the board’s frame to the point (header +100, chips +110, card +172, 256 tall)', () => {
    expect(pulseRest(PHONES.iPhone16)).toEqual({ half: 336, lead: LEAD_CARD_HEIGHT })
    expect(DRAWER_HEADER_HEIGHT + CHIP_BLOCK + LEAD_GAP).toBe(172)
  })

  it.each(Object.entries(PHONES))('%s: the card ends above the tab bar and the map keeps the top', (_name, phone) => {
    const { half, lead } = pulseRest(phone)
    const cardFoot = half + DRAWER_HEADER_HEIGHT + CHIP_BLOCK + LEAD_GAP + lead
    // As the board draws it: the card's foot runs at most 10 pt under the floating bar (its words stay clear).
    expect(cardFoot).toBeLessThanOrEqual(phone.tabBarTop + 10)
    expect(lead).toBeGreaterThanOrEqual(LEAD_CARD_MIN)
    expect(lead).toBeLessThanOrEqual(LEAD_CARD_HEIGHT)
    // The drawer never rises over more than its share of the screen above the bar: the map is never a strip.
    expect(phone.tabBarTop - half).toBeLessThanOrEqual(Math.round(phone.height * REST_MAX_SHARE))
    expect(half).toBeGreaterThan(phone.topChrome)
  })

  it('a short phone keeps its map and shrinks the card rather than hide its foot under the bar', () => {
    const { half, lead } = pulseRest(PHONES.SE)
    expect(lead).toBeLessThan(LEAD_CARD_HEIGHT)
    expect(half).toBe(PHONES.SE.tabBarTop - Math.round(PHONES.SE.height * REST_MAX_SHARE))
  })

  it('a tall phone shows more map, never a taller card', () => {
    const { half, lead } = pulseRest(PHONES.ProMax)
    expect(lead).toBe(LEAD_CARD_HEIGHT)
    expect(half).toBeGreaterThan(336)
  })

  it('the drawer takes the rest as its half point, between full and peek', () => {
    const rest = pulseRest(PHONES.iPhone16)
    const points = drawerSnapPoints({ ...PHONES.iPhone16, half: rest.half })
    expect(points.half).toBe(336)
    expect(points.full).toBeLessThan(points.half)
    expect(points.half).toBeLessThan(points.peek)
    // Control: without it the half point is the old middle of the screen.
    expect(drawerSnapPoints(PHONES.iPhone16).half).toBe(426)
  })
})

describe('the lead pager settles on a page', () => {
  const W = 345
  it('a slow release settles on the nearest page', () => {
    expect(settlePage(-W * 0.4, 0, W, 3)).toBe(0)
    expect(settlePage(-W * 0.6, 0, W, 3)).toBe(1)
  })
  it('a flick moves one page, never past the ends', () => {
    expect(settlePage(-W * 0.1, -1500, W, 3)).toBe(1)
    expect(settlePage(-W * 1.9, -3000, W, 3)).toBe(2)
    expect(settlePage(-W * 2.2, -3000, W, 3)).toBe(2)
    expect(settlePage(W * 0.3, 2000, W, 3)).toBe(0)
  })
  it('never moves more than one page from where it started', () => {
    expect(settlePage(-W * 0.2, -9000, W, 3, 0)).toBe(1)
  })
})
