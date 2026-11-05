/**
 * The worst-case strings every redesign is proofed with (owner, 2026-11-05: memory long-text-proof-every-ui), and the
 * style-based checks a test renderer can make without a layout pass: how a variable string's Text is bounded, and that
 * no row between it and the screen can push it over a sibling.
 *
 * Only data-driven text: cities, venue and event names, people's names, counts, prices, server copy. Static copy is
 * designed in place. The admin repo carries the same list (`__tests__/support/long-text.ts` there).
 */
import { StyleSheet } from 'react-native'

export const WORST = {
  city: 'Thiruvananthapuram',
  cityHyphenated: 'Saint-Jean-sur-Richelieu',
  /** Three lines at the title size on a 393 pt phone. */
  eventTitle: 'Midnight Bass: a four-deck takeover with special guests from Berlin and Bengaluru',
  venue: 'The Courtyard at Jayamahal Palace Hotel',
  firstName: 'Venkatalakshmi',
  firstNameHyphenated: 'Maximilian-Alexander',
  firstNameDevanagari: 'वेंकटलक्ष्मी',
  count: 12_480,
  bigCount: 1_240_000,
  inrMinor: 1_249_900,
  inr: '₹12,499',
  cadMinor: 124_999,
  cad: 'CA$1,249.99',
  ticketType: 'Early bird · Standing · Includes one drink',
  email: 'venkatalakshmi.maximilian-alexander@thiruvananthapuram-events.example.com',
} as const

/** The people's names, for a surface that shows one: each must survive the same slot. */
export const WORST_NAMES = [WORST.firstName, WORST.firstNameHyphenated, WORST.firstNameDevanagari] as const

type Instance = { type: unknown; props: Record<string, unknown>; parent: Instance | null }
type Flat = { flex?: number; flexShrink?: number; flexDirection?: string; flexWrap?: string; maxWidth?: unknown }

const flat = (n: Instance) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Flat
const isHost = (n: Instance) => typeof n.type === 'string'

/** How a variable string's Text is bounded: its line cap (none: it wraps) and where an ellipsis cuts. */
export const slotOf = (text: Instance) => ({
  lines: text.props.numberOfLines as number | undefined,
  ellipsize: (text.props.ellipsizeMode as string | undefined) ?? 'tail',
})

/**
 * No sibling overlap, by style. In every non-wrapping row between the text and the root, the branch holding the text
 * gives way (flex, or flexShrink above 0) or is held to the row (maxWidth 100%). Yoga's default is flexShrink 0, so a
 * branch that does neither lays out at the text's full width and runs under its siblings.
 *
 * Returns the first row that would not give way (null: none), so a failure names the culprit.
 */
export function rowThatOverflows(text: Instance): Flat | null {
  let branch = text
  for (let up = text.parent; up; up = up.parent) {
    if (!isHost(up)) continue
    const row = flat(up)
    if ((row.flexDirection === 'row' || row.flexDirection === 'row-reverse') && row.flexWrap !== 'wrap') {
      const b = flat(branch)
      const givesWay = (b.flex ?? 0) > 0 || (b.flexShrink ?? 0) > 0 || b.maxWidth === '100%'
      if (!givesWay) return row
    }
    branch = up
  }
  return null
}
