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
