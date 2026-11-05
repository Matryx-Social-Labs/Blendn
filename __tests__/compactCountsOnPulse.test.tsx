/**
 * Counts that can grow, as the eye sees them on the Pulse and N1 (owner 2026-11-05): "12k", "1.2k" (`compactCount`);
 * a screen reader still hears the whole number. The floor of five comes first.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('expo-image', () => ({ Image: () => null }))

/* eslint-disable import/first */
import { EventCard } from '../components/ds/EventCard'
import { SectionHeader } from '../components/ds/SectionHeader'
import { NearbyRow, nearbyRowLabel, WhenHeading } from '../components/pulse/NearbyRow'
import { quickChips } from '../lib/pulseChips'
import { resultsCount, sectionCountLabel } from '../lib/pulseSections'
import { NO_FILTERS } from '../lib/eventFilters'
/* eslint-enable import/first */

const NOW = Date.parse('2026-11-04T14:10:00Z')
const row = {
  id: 'e1', title: 'Rooftop Jazz', start_time: '2026-11-04T15:00:00Z', end_time: null, timezone: 'Asia/Kolkata',
  venue_name: 'Loft 38', distance: 0.6, going_count: 1240, cover_image_url: null,
} as never

it('chips: "This weekend 12k", heard as 12,480 events; under five, nothing', () => {
  const [, weekend] = quickChips({ filters: NO_FILTERS, counts: { tonight: 3, weekend: 12_480 }, nearOn: false, vibe: null })
  expect(weekend.count).toBe('12k')
  expect(weekend.accessibilityLabel).toBe('This weekend, 12,480 events')
  expect(quickChips({ filters: NO_FILTERS, counts: { tonight: 3, weekend: 0 }, nearOn: false, vibe: null })[0].count).toBeUndefined()
})

it('a Near me row: "1.2k going" on screen, "1,240 going" read', async () => {
  await render(<NearbyRow event={row} now={NOW} withDistance onPress={jest.fn()} />)
  expect(screen.getByText('1.2k', { includeHiddenElements: true })).toBeTruthy()
  expect(nearbyRowLabel(row, NOW, true)).toMatch(/1,240 going$/)
})

it('a time heading: "· 12k", read as 12,480 events', async () => {
  await render(<WhenHeading title="This weekend" count={12_480} />)
  expect(screen.getByText('· 12k')).toBeTruthy()
  expect(screen.getByRole('header').props.accessibilityLabel).toBe('This weekend, 12,480 events')
})

it('the lead card and the rail cards: "1.2k going" on screen, read whole', async () => {
  await render(<EventCard kind="hero" layout="lead" title="Midnight Bass" time="Sat · 10:30 PM" venue="Pebble" going={1240} onPress={jest.fn()} testID="lead" />)
  expect(screen.getByTestId('lead-people', { includeHiddenElements: true })).toHaveTextContent('1.2k going')
  expect(screen.getByTestId('lead').props.accessibilityLabel).toMatch(/1,240 going/)
  await render(<EventCard kind="compact" title="Midnight Bass" time="Sat · 10:30 PM" venue="Pebble" going={1240} onPress={jest.fn()} testID="c" />)
  expect(screen.getByText('1.2k going', { includeHiddenElements: true })).toBeTruthy()
})

it('a section header: "Tonight · 1.2k", heard as 1,204; a floor keeps its plus', async () => {
  await render(<SectionHeader title="Tonight" count={1204} />)
  expect(screen.getByText('1.2k', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByRole('header').props.accessibilityLabel).toBe('Tonight, 1,204')
  expect(sectionCountLabel({ count: 50, more: true })).toBe('50+')
  expect(sectionCountLabel({ count: 1204, more: false })).toBe('1.2k')
})

it('search results: "12k events" on screen, the whole count for the label', () => {
  expect(resultsCount(50, 12_480)).toMatchObject({ count: 12_480, text: '12k', label: '12,480' })
})

it('the set list and the search overline print compact and speak whole (source pins: both screens are too large to render here)', () => {
  const { readFileSync } = jest.requireActual('fs')
  const { join } = jest.requireActual('path')
  const setList = readFileSync(join(__dirname, '../components/pulse/SetList.tsx'), 'utf8')
  expect(setList).toMatch(/\{compactCount\(going\)\}/)
  expect(setList).toMatch(/going\.toLocaleString\('en-US'\)\} going/)
  // The city picker's "47 events" too; its row is heard through `cityCountLabel`, whole.
  expect(readFileSync(join(__dirname, '../components/pulse/CityPicker.tsx'), 'utf8')).toMatch(/\{compactCount\(count\)\}/)
  const pulse = readFileSync(join(__dirname, '../app/(tabs)/events.tsx'), 'utf8')
  expect(pulse).toMatch(/accessibilityLabel=\{`\$\{resultsCount\(events\.length, totalCount\)\.label\}/)
})
