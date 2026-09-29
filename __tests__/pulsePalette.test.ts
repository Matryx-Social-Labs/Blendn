import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Pulse keeps one shape.
 *
 * Its palette is no longer pinned here: `npm run lint:design` (run by
 * `designTokens.test.ts`) rejects the legacy `APP_*` palette and any raw hex or
 * `rgba()` in `app/` and `components/`, which is everything the old accent,
 * grey and blue-literal checks asserted. What stays is structure the lint
 * cannot see.
 */
const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('The Pulse has one section header', () => {
  it('every section heading goes through one component', () => {
    /*
     * The blue chevron lived in a hand-rolled header row. Seven of those
     * existed; the fix was to delete all seven rather than recolour them, so
     * the next section somebody adds inherits the design instead of copying
     * whichever neighbour they happened to look at.
     */
    const screen = read('app/(tabs)/events.tsx')
    expect(screen).not.toContain('styles.sectionTitle')
    expect(screen).not.toContain('styles.viewAllText')
    expect(screen).not.toContain('styles.sectionDividerLine')
  })
})

/*
 * The Pulse is one surface.
 *
 * Colour was never the real problem. The screen was a sticky bar, plus a
 * rounded bordered elevated panel positioned inside the page, plus the list
 * inside that — three surfaces where the frame has one, with a fourth
 * (`#111214 -> #000000`) painted behind every screen at the root. Two rounds of
 * palette fixes could not help, because the furniture was being repainted in a
 * room of the wrong shape.
 *
 * These pin the shape, not the colours.
 */
describe('The Pulse is one flat surface', () => {
  /*
   * Comments stripped before matching.
   *
   * The first version of this failed on its own explanation — the comment
   * saying "a plain View, not a SafeAreaView" contains the word it was banning.
   * A grep over prose tests the prose.
   */
  const code = (rel: string) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

  const screen = code('app/(tabs)/events.tsx')
  const root = code('app/_layout.tsx')

  it('has no panel wrapping the list', () => {
    // `sectionBg` was the panel: absolutely positioned, bordered, with its own
    // background and gradient, holding the whole feed.
    expect(screen).not.toContain('sectionBg')
  })

  it('has no top bar', () => {
    // Its three jobs live elsewhere now: avatar on the Me tab, settings behind
    // it, city picker in the headline.
    expect(screen).not.toContain('topBarSticky')
    expect(screen).not.toContain('styles.topBar')
    expect(screen).not.toContain('wordmark')
  })

  it('does not inset the scrolling container itself', () => {
    /*
     * `SafeAreaView edges={['bottom']}` shortened the scroll surface, so the
     * feed stopped dead at the nav with a visible edge instead of passing under
     * it. Insets belong on the content, not on the thing that scrolls.
     */
    expect(screen).not.toContain('SafeAreaView')
  })

  it('paints no gradient behind every screen', () => {
    // The root gradient showed through as a different panel edge wherever a
    // screen did not paint its own opaque background.
    expect(root).not.toContain('BackgroundGradient')
  })
})
