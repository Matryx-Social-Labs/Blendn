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
    expect(resultsCount(50, 120)).toEqual({ count: 120, text: '120', noun: 'events' })
    expect(resultsCount(50, 1204).text).toBe('1,204')
  })
  it('falls back to the loaded rows when the total is unknown, and never prints fewer than are shown', () => {
    expect(resultsCount(7, null)).toEqual({ count: 7, text: '7', noun: 'events' })
    expect(resultsCount(50, 12)).toEqual({ count: 50, text: '50', noun: 'events' })
    expect(resultsCount(1, 1)).toEqual({ count: 1, text: '1', noun: 'event' })
  })
  it('the Pulse prints it', () => {
    const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
    expect(src).toMatch(/resultsCount\(events\.length, totalCount\)\.text/)
    expect(src).toMatch(/setTotalCount\(eventsMeta\?\.totalCount \?\? null\)/)
  })
})

describe('the Pulse wires the P0 sections to their sources (M11 source pins)', () => {
  const src = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')

  it('hands the sections the full-page flag and the distance query', () => {
    expect(src).toMatch(/pulseSections<Event>\(\{ page: events, pageFull: hasMore, nearby,/)
    expect(src).toMatch(/sortBy: 'distance', sortOrder: 'asc', endDate: nearbyEndDate\(Date\.now\(\)\)/)
    expect(src).toMatch(/if \(hasFix\) \{\s*\n\s*fetchEventsApi/)
  })

  it('names the interest from the loaded page, and only once that page has loaded for this place', () => {
    expect(src).toMatch(/pickInterest\(interests\.data\?\.interests \?\? \[\], eventsRef\.current\)/)
    expect(src).toMatch(/pageFor !== placeKey\) return/)
    expect(src).toMatch(/setPageFor\(feedKey\(selectedCity, userLocation\)\)/)
  })

  it('no longer publishes the centre button’s signal (the one source does)', () => {
    expect(src).not.toMatch(/publishRoomSignal/)
  })
})
