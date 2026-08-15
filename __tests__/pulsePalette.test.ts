import { readFileSync } from 'fs'
import { join } from 'path'

import { APP_COLORS, EMBER } from '../lib/theme'

/**
 * The Pulse is on one palette.
 *
 * Half the screen was restyled and half was not, so `Featured` used Liquid Ember
 * while `Nearby Events` kept the previous design's iOS blue — a "View all" with
 * a `#0A84FF` chevron sitting two sections under an Ember heading. Seven section
 * headers were on the old styles and two on the new one.
 *
 * That is not a thing a typecheck or a unit test can see, and it is not a thing
 * a render test would see either: both colours are valid, both render, and the
 * only symptom is that the screen looks like two designs. So the check is a
 * grep, which is crude and catches exactly this.
 *
 * Scoped to the files that draw The Pulse. `APP_COLORS` is not deprecated —
 * screens that have not been restyled yet still use it, deliberately, and
 * failing on those would make this a burden rather than a guard.
 */

const PULSE_SURFACE = [
  'app/(tabs)/events.tsx',
  'components/NearbyEventCard.tsx',
  'components/EventCard.tsx',
  'components/pulse/PulseHeader.tsx',
  'components/pulse/SectionHeader.tsx',
  'components/pulse/FeaturedCard.tsx',
  'components/pulse/UpcomingCard.tsx',
]

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('The Pulse uses one accent', () => {
  it('the two accents are actually different, so this test means something', () => {
    expect(APP_COLORS.accent).not.toBe(EMBER.accent)
  })

  it.each(PULSE_SURFACE)('%s does not reach for the old blue accent', (file) => {
    expect(read(file)).not.toContain('APP_COLORS.accent')
  })

  /*
   * The accent was only half of it, and checking only the accent is how the
   * other half survived a round of "no blue left".
   *
   * The old palette's greys are cool and the new one's are warm: `#000000`
   * against `#0F0E0E`, `#1C1C1E` against `#211F1F`, `#EBEBF599` against
   * `#AEAAAA`. On a screen whose whole identity is a warm gradient, a pure-black
   * page and cool grey body text read as a different design — which is exactly
   * what it looked like on a device after the accent was "fixed".
   *
   * `separator` and `success` are exempt: a neutral white alpha works on either
   * palette, and Ember defines no semantic success colour.
   */
  const BANNED = [
    'APP_COLORS.backgroundBase',
    'APP_COLORS.backgroundElevated',
    'APP_COLORS.backgroundCard',
    'APP_COLORS.textPrimary',
    'APP_COLORS.textSecondary',
    'APP_COLORS.textTertiary',
  ]

  it.each(PULSE_SURFACE)('%s takes its surfaces and text from Ember', (file) => {
    const body = read(file)
    const found = BANNED.filter((token) => body.includes(token))
    // Named, so a failure says which token rather than just "something".
    expect(found).toEqual([])
  })

  it('the two palettes really do differ on the greys', () => {
    // If these ever converge the test above becomes theatre, so assert the
    // premise rather than assuming it.
    expect(APP_COLORS.backgroundBase).not.toBe(EMBER.bg)
    expect(APP_COLORS.textSecondary).not.toBe(EMBER.textSecondary)
  })

  it.each(PULSE_SURFACE)('%s hardcodes no hex accent', (file) => {
    // A literal is how a palette gets bypassed without anything importing the
    // old one.
    const body = read(file)
    for (const hex of ['#0A84FF', '#0060DF']) {
      expect(body.toUpperCase()).not.toContain(hex)
    }
  })

  /*
   * The same colour, written a different way.
   *
   * `#0A84FF` is `rgba(10,132,255,…)`, and eight of those were live on this
   * screen while a hex-only check reported it clean: a blue chip on the
   * nightlife hero, a blue "Going" pill, two blue banner fills, and blue body
   * text on carousel meta.
   *
   * So this parses every `rgb`/`rgba` literal and rejects blue-dominant ones
   * rather than matching strings. Blue-dominant means b clearly above both r and
   * g, which greys (r≈g≈b) and anything in the warm palette never are.
   */
  it.each(PULSE_SURFACE)('%s hardcodes no blue-dominant rgb literal', (file) => {
    const offenders: string[] = []
    const literal = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g
    for (const m of read(file).matchAll(literal)) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
      if (b > r + 25 && b > g + 15) offenders.push(m[0] + ')')
    }
    expect(offenders).toEqual([])
  })

  it('recognises the old accent in either notation', () => {
    // Guards the guard: #0A84FF is rgb(10,132,255), and a check that misses the
    // second spelling is the one that already shipped.
    const asRgb = 'rgba(10,132,255,0.32)'
    const m = asRgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)!
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
    expect(b > r + 25 && b > g + 15).toBe(true)
    expect(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()).toBe(
      APP_COLORS.accent.toUpperCase()
    )
  })

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
