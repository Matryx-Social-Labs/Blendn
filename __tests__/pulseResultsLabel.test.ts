/**
 * The Pulse's search results overline ("3 EVENTS · BENGALURU", GO-16, audit A37): chrome over a list, so it stops at
 * CONTROL_FONT_CAP rather than wrapping to two giant lines at AX sizes. A source pin: the label lives inside the
 * Pulse screen, which is too large to render for one Text.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

it('caps the results overline at CONTROL_FONT_CAP', () => {
  const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
  expect(src).toMatch(/<Text style=\{styles\.resultsLabelText\} accessibilityRole="header" maxFontSizeMultiplier=\{CONTROL_FONT_CAP\}>/)
})

import { resultsCount } from '../lib/pulseSections'

describe('resultsCount (BAR-07)', () => {
  it('prints the server total, not the 50 loaded', () => {
    expect(resultsCount(50, 120)).toEqual({ count: 120, noun: 'events' })
  })
  it('falls back to the loaded rows when the total is unknown, and never prints fewer than are shown', () => {
    expect(resultsCount(7, null)).toEqual({ count: 7, noun: 'events' })
    expect(resultsCount(50, 12)).toEqual({ count: 50, noun: 'events' })
    expect(resultsCount(1, 1)).toEqual({ count: 1, noun: 'event' })
  })
  it('the Pulse prints it', () => {
    const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
    expect(src).toMatch(/resultsCount\(events\.length, totalCount\)\.count/)
    expect(src).toMatch(/setTotalCount\(eventsMeta\?\.totalCount \?\? null\)/)
  })
})
