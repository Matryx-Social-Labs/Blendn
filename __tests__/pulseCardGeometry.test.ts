import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Pulse's card geometry.
 *
 * Originally pinned to Figma frame `1141:4644`; since the design-system pass
 * the cards follow `docs/DESIGN_SYSTEM.md` instead. The table below is the
 * frame as measured, kept for reference.
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

describe('the Featured row sits on the page margin', () => {
  it('starts every card at GUTTER, not centred', () => {
    const card = CARD()
    // Centring put the card ~55pt in beside a 24pt page — the most visible
    // misalignment on the screen.
    expect(card).toContain('export const FEATURED_ROW_INSET = GUTTER')
    expect(card).toContain('inset: FEATURED_ROW_INSET')
    expect(card).not.toContain('(SCREEN_WIDTH - width) / 2')
  })

  it('leaves room for the next card to peek, and fills the width when alone', () => {
    const card = CARD()
    expect(card).toContain(
      'SCREEN_WIDTH - FEATURED_ROW_INSET - FEATURED_CARD_GAP - FEATURED_PEEK'
    )
    expect(card).toContain('FEATURED_CARD_SOLO = SCREEN_WIDTH - FEATURED_ROW_INSET * 2')
    expect(SCREEN()).toContain('featuredItems.length === 1')
  })

  it('draws its interior from the design system', () => {
    const card = CARD()
    expect(card).toContain('body: { paddingTop: SPACE.lg')
    expect(card).toContain('title: TYPE.title')
    expect(card).toContain('numberOfLines={2}')
    expect(card).toContain('tagText: { ...TYPE.label')
  })

  it('puts the words under the photo, not on it', () => {
    /*
     * The title used to sit on a dark scrim over the photograph. An
     * organiser's upload can be anything, and a scrim strong enough to
     * guarantee contrast greys out the picture — so the words moved below it,
     * as Luma, District and Airbnb do.
     */
    const card = CARD()
    expect(card).not.toContain('LinearGradient')
    expect(card).not.toContain("position: 'absolute', left: 0, right: 0, bottom: 0")
    expect(card).toContain('export const FEATURED_PHOTO_ASPECT = 1')
    expect(card).toContain(
      'SPACE.lg + TYPE.title.lineHeight * 2 + SPACE.xs + TYPE.meta.lineHeight'
    )
  })

  it('cancels the page margin so the row runs edge to edge', () => {
    expect(SCREEN()).toContain('marginHorizontal: -MAIN_PADDING_HORIZONTAL')
  })
})

describe('the card clears the tab bar', () => {
  /*
   * The same arithmetic as `featuredCardLayout`, restated so a change to one
   * of its terms has to be made on purpose in both places.
   * 64 bar + 16 top padding + 104 header (40 + 16 + 48) + 32 section gap +
   * 26 heading + 16 heading gap.
   */
  const CHROME = 64 + 16 + 104 + 32 + 26 + 16
  const ASPECT = 1
  // The words under the photo: 16 gap + two 30pt title lines + 4 + an 18pt meta line.
  const BODY = 16 + 60 + 4 + 18
  const BREATH = 24
  const barTopOf = (screenH: number, insetBottom: number) =>
    screenH - (8 + 56 + Math.max(insetBottom - 6, 20))

  const layout = (screenH: number, insetTop: number, insetBottom: number, screenW: number) => {
    const available = barTopOf(screenH, insetBottom) - (insetTop + CHROME) - BREATH
    const width = Math.min(screenW - 24 - 16 - 32, Math.round((available - BODY) / ASPECT))
    return { width, height: Math.round(width * ASPECT) + BODY, inset: 24 }
  }

  it('sums the chrome from the constants that draw it', () => {
    expect(CARD()).toContain(
      'TOP_BAR_HEIGHT + SPACE.lg + PULSE_HEADER_HEIGHT + SPACE.xxl + TYPE.heading.lineHeight + SPACE.lg'
    )
    expect(read('components', 'pulse', 'PulseHeader.tsx')).toContain(
      'PULSE_HEADER_HEIGHT = TYPE.display.lineHeight + SPACE.lg + CONTROL.md'
    )
  })

  it('fits the card entirely above the bar, on a tall phone and a short one', () => {
    for (const [w, h, top, bottom] of [
      [440, 956, 62, 34], // iPhone 17 Pro Max
      [390, 844, 47, 34], // iPhone 15/16
      [375, 667, 20, 0], // SE — no safe insets, short screen
    ] as const) {
      const l = layout(h, top, bottom, w)
      expect(top + CHROME + l.height + BREATH).toBeLessThanOrEqual(barTopOf(h, bottom))
      expect(l.width).toBeGreaterThan(0)
    }
  })

  it('the bar is the size it claims to be', () => {
    expect(8 + 56 + Math.max(34 - 6, 20)).toBe(92)
    expect(956 - barTopOf(956, 34)).toBe(92)
  })

  it('is exported as one function both call sites use', () => {
    expect(CARD()).toContain('export function featuredCardLayout')
    const screen = SCREEN()
    expect(screen).toContain('tabBarTop(SCREEN_HEIGHT, insets.bottom)')
    expect(screen.match(/width=\{featured\.width\}/g)?.length).toBe(2)
    expect(screen.match(/paddingHorizontal: featured\.inset/g)?.length).toBe(2)
  })

  it('counts the banners above the header, which the chrome constant cannot know', () => {
    // "You're in San Francisco — nothing here yet" pushed the card's date and
    // venue under the bar: the fit assumed nothing sat above the header.
    expect(CARD()).toContain('insets.top + CHROME_ABOVE_CARD + above')
    expect(SCREEN()).toContain('onLayout={onBannersLayout}')
    expect(SCREEN().match(/bannersHeight\s*\)/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('snaps by the width it actually drew, not the unclamped one', () => {
    expect(SCREEN()).toContain('snapToInterval={featured.width + FEATURED_CARD_GAP}')
  })

  it('the page still scrolls under the bar rather than stopping at it', () => {
    expect(SCREEN()).toContain('paddingBottom: insets.bottom + Math.max(')
    expect(read('app/(tabs)/_layout.tsx')).toContain("position: 'absolute'")
  })
})

describe('the Upcoming card', () => {
  it('is a row: words on the left, a square photo on the right', () => {
    const up = UPCOMING()
    expect(up).toContain('export const UPCOMING_THUMB = CONTROL.md * 2')
    expect(up).toContain("flexDirection: 'row'")
    expect(up).toContain('padding: SPACE.lg')
    expect(up).toContain('title: TYPE.bodyStrong')
    // Nothing printed on the photograph but the heart.
    expect(up).not.toContain('LinearGradient')
  })

  it('is grouped by day, so each card carries only its time', () => {
    const screen = SCREEN()
    expect(screen).toContain('groupByDay(upcomingStackItems)')
    expect(screen).toContain('timeLabel={timeLabel(item.start_time)}')
    expect(screen).toContain('dayGroups: { gap: SPACE.xl }')
    expect(screen).toContain('dayGroup: { gap: SPACE.md }')
  })
})

describe('each section is drawn once', () => {
  /*
   * `renderUpcomingFigmaCarousel` bundled Featured with Upcoming, and the list
   * already rendered Featured in the branch directly above it — so any city
   * with at least one upcoming event drew the whole Featured carousel twice,
   * the same hero one screen apart. Live from #130 until it was spotted on a
   * device.
   *
   * Nothing catches a duplicate render: both copies are correct in isolation,
   * the screen simply has two of them.
   */
  const SRC = () => read('app/(tabs)/events.tsx')
  const codeOnly = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('calls the Featured row from exactly one place', () => {
    const calls = codeOnly(SRC()).split('renderFeaturedRow()').length - 1
    expect(calls).toBe(1)
  })

  it('calls the Upcoming stack from exactly one place', () => {
    const calls = codeOnly(SRC()).split('renderUpcomingStack()').length - 1
    expect(calls).toBe(1)
  })

  it('has no wrapper bundling the two together', () => {
    // The shape the bug lived in: a wrapper returning Featured AND Upcoming,
    // called from a site that had already drawn Featured.
    expect(codeOnly(SRC())).not.toContain('renderUpcomingFigmaCarousel')
  })
})
