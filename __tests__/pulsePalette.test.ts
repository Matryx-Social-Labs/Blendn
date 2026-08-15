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
