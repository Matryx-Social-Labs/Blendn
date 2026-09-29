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
 *
 * The card's size, margin and clearance of the tab bar are called for real in
 * `featuredCardLayout.test.tsx`. What is read as source here is the screen's
 * wiring of it, which is not rendered.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const SCREEN = () => read('app', '(tabs)', 'events.tsx')

describe('the screen wires the Featured row in', () => {
  it('lets a lone card fill the width', () => {
    expect(SCREEN()).toContain('featuredItems.length === 1')
  })

  it('cancels the page margin so the row runs edge to edge', () => {
    expect(SCREEN()).toContain('marginHorizontal: -MAIN_PADDING_HORIZONTAL')
  })

  it('counts the banners above the header, which the chrome constant cannot know', () => {
    // "You're in San Francisco — nothing here yet" pushed the card's date and
    // venue under the bar: the fit assumed nothing sat above the header.
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
