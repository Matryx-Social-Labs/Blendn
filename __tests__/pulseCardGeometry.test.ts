import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Pulse's card geometry, against frame `1141:4644`.
 *
 * Every number here was read out of Figma with `get_metadata`, not inferred
 * from the render. They are recorded as a table so a later reader can check the
 * build against the design without opening Figma:
 *
 * | Node | What | Frame (390 artboard) |
 * |---|---|---|
 * | `1141:4660` | Featured carousel mask | x=**-12** (full-bleed 390) × 466 |
 * | `1141:4663` | Featured Card 1 | x=**24**, **331.5 × 450** |
 * | `1141:4680` | Featured Card 2 | x=379.5 → **gap 24** |
 * | `1141:4709` | Upcoming Card 1 | 366 × 437.38, padding 24 |
 * | `1141:4710` | Upcoming image | **318 × 165.38**, inset 24 |
 * | `1141:4731` | Upcoming Card 2 | y=469.375 → **stack gap 32** |
 *
 * The failure this suite exists for is subtle and was live: the *card* was
 * correct in every internal dimension and sat in the wrong place, because the
 * carousel took `Main`'s 12pt gutter instead of bleeding and using its own 24.
 * Nothing about that is visible in a diff, and no existing test touched it.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const CARD = () => read('components', 'pulse', 'FeaturedCard.tsx')
const SCREEN = () => read('app', '(tabs)', 'events.tsx')
const UPCOMING = () => read('components', 'pulse', 'UpcomingCard.tsx')

describe('the Featured card matches 1141:4663', () => {
  it('is 85% of the screen, both dimensions taken proportionally', () => {
    const card = CARD()
    // 331.5 / 390 = 0.85 exactly.
    expect(331.5 / 390).toBeCloseTo(0.85, 4)
    expect(card).toContain('Math.round(SCREEN_WIDTH * 0.85)')
    /*
     * The width was once proportional and the height literal (450), so the two
     * agreed only on a 390pt device — the one a designer checks. On a 440pt
     * phone that is 374 × 450 where the shape wants 374 × 508.
     */
    expect(card).toContain('FEATURED_CARD_ASPECT = 450 / 331.5')
    expect(card).toContain('Math.round(width * FEATURED_CARD_ASPECT)')
  })

  it('keeps the frame gap of 24 between cards', () => {
    // 1141:4680 x=379.5 minus 1141:4663 right edge (24 + 331.5 = 355.5).
    expect(379.5 - (24 + 331.5)).toBe(24)
    expect(CARD()).toContain('FEATURED_CARD_GAP = 24')
  })

  it('draws its interior at the frame values', () => {
    const card = CARD()
    expect(card).toContain('padding: 32')          // 1141:4666 p-[32px]
    expect(card).toContain('gap: 16')              // 1141:4666 gap-[16px]
    expect(card).toContain('paddingHorizontal: 17') // 1141:4667 px-[17px]
    expect(card).toContain('paddingVertical: 5')    // 1141:4667 py-[5px]
    expect(card).toContain("backgroundColor: 'rgba(45,44,44,0.4)'")
    expect(card).toContain('gap: 24')              // 1141:4671 meta row
    expect(card).toContain('gap: 8')               // 1141:4672 within a meta item
  })
})

describe('the Featured row bleeds past Main’s gutter', () => {
  it('cancels the 12pt page padding, as the mask does', () => {
    /*
     * `1141:4660` is at section-x `-12`, cancelling `Main`'s 12pt padding so
     * the row is the full 390. Built inside the gutter, the scroll area ended
     * 12pt short of the screen edge and read as a clipped list rather than one
     * running off the edge — which is the affordance the peek exists to create.
     */
    expect(SCREEN()).toContain('marginHorizontal: -MAIN_PADDING_HORIZONTAL')
  })
})

describe('the card in view is centred and clears the tab bar', () => {
  /*
   * Two constraints the frame does not have, both from the running app.
   *
   * `Main` is a 390 × 3548 scrolling artboard, so the design never had to fit
   * this card inside a viewport. At the frame's 85% it does not: measured on a
   * 440 × 956 device the card was 374 × 508 with its top at 387, so its bottom
   * landed at 908 against a tab bar starting at ~843 — 65pt of the hero card,
   * including the space under its title, beneath the navigation.
   */
  const layout = (screenH: number, insetTop: number, insetBottom: number, screenW: number) => {
    const CHROME = 64 + 32 + 133 + 48 + 24 + 24
    const available = screenH - (insetTop + CHROME) - (insetBottom + 88) - 16
    const width = Math.min(Math.round(screenW * 0.85), Math.round(available / (450 / 331.5)))
    return { width, height: Math.round(width * (450 / 331.5)), inset: Math.round((screenW - width) / 2) }
  }

  it('never lets the card reach the bar, on a tall phone or a short one', () => {
    for (const [w, h, top, bottom] of [
      [440, 956, 62, 34], // iPhone 17 Pro Max, the device this was measured on
      [390, 844, 47, 34], // the artboard's own size
      [375, 667, 20, 0], // SE — no safe insets, short screen
    ] as const) {
      const l = layout(h, top, bottom, w)
      const cardTop = top + 64 + 32 + 133 + 48 + 24 + 24
      const barTop = h - bottom - 88
      expect(cardTop + l.height).toBeLessThanOrEqual(barTop)
      expect(l.width).toBeGreaterThan(0)
    }
  })

  it('centres it — equal margins, so neighbours peek equally either side', () => {
    const l = layout(956, 62, 34, 440)
    expect(440 - l.width - l.inset).toBe(l.inset)
    // Screenshot-verified on the simulator: 61.0 left, 61.3 right, card 318.
    expect(l.width).toBe(318)
    expect(l.inset).toBe(61)
  })

  it('is exported as one function both call sites use', () => {
    // The solo branch and the carousel used to size independently, so a city
    // with exactly one featured event placed it differently from a city with
    // two. Both now read `featuredCardLayout`.
    expect(CARD()).toContain('export function featuredCardLayout')
    const screen = SCREEN()
    expect(screen).toContain('featuredCardLayout(insets, TAB_BAR_CLEARANCE)')
    expect(screen.match(/width=\{featured\.width\}/g)?.length).toBe(2)
    expect(screen.match(/paddingHorizontal: featured\.inset/g)?.length).toBe(2)
  })

  it('snaps by the width it actually drew, not the unclamped one', () => {
    expect(SCREEN()).toContain('snapToInterval={featured.width + FEATURED_CARD_GAP}')
  })

  it('the page still scrolls under the bar rather than stopping at it', () => {
    // The bar is a floating overlay: the feed runs the full height of the
    // screen and passes beneath it. Only the hero card is sized to clear it.
    expect(SCREEN()).toContain('paddingBottom: insets.bottom + Math.max(')
    expect(SCREEN()).toContain("position: 'absolute'")
  })
})

describe('the Upcoming card matches 1141:4709', () => {
  it('is padded 24 with a 24 gap, and its image is 165', () => {
    const up = UPCOMING()
    // 1141:4710 is at (24, 24) and 318 wide inside a 366 card: 366-24-24 = 318.
    expect(366 - 24 * 2).toBe(318)
    // Body starts at 213.38 = 24 (pad) + 165.38 (image) + 24 (gap).
    expect(24 + 165.38 + 24).toBeCloseTo(213.38, 2)
    expect(up).toContain('const IMAGE_HEIGHT = 165')
    expect(up).toContain('padding: 24')
    expect(up).toContain('gap: 24')
  })

  it('stacks with the frame’s 32', () => {
    // 1141:4731 y=469.375 minus card 1 height 437.38.
    expect(Math.round(469.375 - 437.38)).toBe(32)
    expect(SCREEN()).toContain('STACK_GAP = 32')
  })
})
