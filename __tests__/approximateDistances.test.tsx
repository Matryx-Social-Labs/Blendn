/*
 * SCRUM-1080: with Precise Location off (iOS) or the coarse grant (Android) the fix is good to ~3 km, and every distance
 * measured from it said "5.4 km" or "1000 m" as if it were measured (pulse-map 06 frame 2 draws "about 1 km"). One case per
 * caller family of the shared `distanceText`, each with its exact control: a precise fix keeps its exact words.
 */
import { render, screen, within } from '@testing-library/react-native'

import type { BlendnEvent } from '../lib/api'
import type { VenueListItem } from '../lib/apiClient'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))

/* eslint-disable import/first */
import { EventCard } from '../components/ds/EventCard'
import { LiveTile } from '../components/places/PlaceCards'
import { QuietRow } from '../components/places/PlaceParts'
import { openPlace } from '../components/places/openPlace'
import { NearbyRow, nearbyRowLabel } from '../components/pulse/NearbyRow'
import { SetList, setRowLabel } from '../components/pulse/SetList'
import { Where } from '../components/venue/VenueSections'
import { homeCardProps } from '../lib/pulse'
import { subtree } from './helpers/ax'
/* eslint-enable import/first */

const HIDDEN = { includeHiddenElements: true }
const NOW = Date.parse('2026-11-04T14:10:00Z')
const start = new Date(NOW + 3_600_000).toISOString()
const event = (distance: number) =>
  ({ id: 'a', title: 'Sunday Jazz Brunch', venue_name: 'Olive Beach', start_time: start, end_time: null, timezone: 'Asia/Kolkata', distance, going_count: 0 }) as unknown as BlendnEvent
const venue = (distance: number): VenueListItem => ({
  id: 'v1',
  name: 'Toit',
  address: '298, 100 Feet Road',
  city: 'Bengaluru',
  latitude: 12.9,
  longitude: 77.6,
  venueType: 'brewery',
  venueTypeLabel: 'Brewery',
  distance,
  upcomingEventCount: 0,
  liveNow: '10-19',
  nextEvent: null,
})

beforeEach(() => mockPush.mockClear())

describe('the Pulse lead card (homeCardProps): board 06 frame 2, "at Olive Beach · about 1 km"', () => {
  it('approximate', () => expect(homeCardProps(event(0.21), NOW, 'approximate').distance).toBe('about 1 km'))
  it('exact (control)', () => expect(homeCardProps(event(0.21), NOW, 'exact').distance).toBe('200 m'))
})

describe('a set list row (Tonight, This weekend)', () => {
  it('approximate: shown and read the same', async () => {
    await render(<SetList events={[event(5.4)]} now={NOW} withDistance="approximate" onPress={jest.fn()} />)
    expect(screen.getByText('about 5 km', HIDDEN)).toBeTruthy()
    expect(setRowLabel(event(5.4), 'approximate')).toContain('at Olive Beach, about 5 km')
  })
  it('exact (control)', async () => {
    await render(<SetList events={[event(5.4)]} now={NOW} withDistance="exact" onPress={jest.fn()} />)
    expect(screen.getByText('5.4 km', HIDDEN)).toBeTruthy()
    expect(screen.queryByText(/about/, HIDDEN)).toBeNull()
  })
})

describe('the Nearby section’s distance column (EventCard lead)', () => {
  it('"about 2 km" may take two lines ("about" over "2 km") rather than clip to "about…" at large text (iOS drive, AX)', async () => {
    await render(<EventCard kind="row" lead="distance" title="Sunday Jazz Brunch" time="Tue · 12 PM" venue="Olive Beach" distance="about 2 km" testID="e" />)
    expect(screen.getByTestId('e-lead', HIDDEN).props.numberOfLines).toBe(2)
    // The number keeps its unit, so the break falls after "about" (the drive wrapped it "about 2" over "km").
    const lead = subtree(screen.toJSON() as never, 'e-lead')
    expect(JSON.stringify(lead?.children)).toContain('"\u00A0"')
    expect(JSON.stringify(lead?.children)).not.toContain('"2"," ","km"')
  })
})

describe('a Near me row (NearbyRow): no walk is timed from a guess', () => {
  it('approximate: "about 1 km", never "10 min walk"', async () => {
    await render(<NearbyRow event={event(0.6) as never} now={NOW} withDistance="approximate" onPress={jest.fn()} />)
    expect(screen.getByTestId('nearby-tag-km', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('nearby-tag-walk', HIDDEN)).toBeNull()
    expect(screen.getByText('about 1 km', HIDDEN)).toBeTruthy()
    expect(nearbyRowLabel(event(0.6) as never, NOW, 'approximate')).toContain('at Olive Beach, about 1 km')
  })
  it('exact (control): the walk', async () => {
    await render(<NearbyRow event={event(0.6) as never} now={NOW} withDistance="exact" onPress={jest.fn()} />)
    expect(screen.getByText('10 min walk', HIDDEN)).toBeTruthy()
  })
})

describe('a place’s type line: the distance is its own slot and never gives way (iOS drive: "583 80 Feet Road · Café · abo…")', () => {
  it.each([
    ['a quiet row', () => <QuietRow venue={{ ...venue(1.05), address: '583 80 Feet Road, 8th Block, Koramangala, Thiruvananthapuram' }} reading="approximate" />],
    ['a live tile', () => <LiveTile venue={{ ...venue(1.05), address: '583 80 Feet Road, 8th Block, Koramangala, Thiruvananthapuram' }} now={NOW} reading="approximate" />],
  ])('%s', async (_, el) => {
    await render(el())
    const words = screen.getByTestId('place-meta', HIDDEN)
    expect(words.props.numberOfLines).toBe(1)
    expect(within(words).queryByText(/about/, HIDDEN)).toBeNull()
    const far = screen.getByTestId('place-distance', HIDDEN)
    expect(far.props.numberOfLines).toBeUndefined()
    expect(within(far).getByText(/about 1 km/, HIDDEN)).toBeTruthy()
  })
})

describe('Places (a live tile, a quiet row) and the venue page it opens', () => {
  it('approximate: the tile, its label, the row, and the page all say "about"', async () => {
    await render(<LiveTile venue={venue(5.4)} now={NOW} reading="approximate" />)
    expect(screen.getByText('about 5 km', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('place-tile-v1').props.accessibilityLabel).toContain('about 5 kilometres')
    await render(<QuietRow venue={venue(0.35)} reading="approximate" />)
    expect(screen.getByText(/about 1 km/, HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('place-quiet-v1').props.accessibilityLabel).toContain('about 1 km')
    openPlace(venue(5.4), 'approximate')
    expect(mockPush.mock.calls[0][0].params).toEqual({ id: 'v1', km: '5.4', reading: 'approximate' })
    // The server's haversine has fifteen decimals; the page reads at most three (kmParam), so it showed no distance at all.
    openPlace(venue(1.0856734219), 'exact')
    expect(mockPush.mock.calls[1][0].params).toEqual({ id: 'v1', km: '1.086' })
    await render(<Where venue={{ name: 'Toit', address: '298, 100 Feet Road', city: 'Bengaluru', latitude: 0, longitude: 0 } as never} km={5.4} reading="approximate" onCopy={jest.fn()} />)
    expect(screen.getByText(/about 5 km/, HIDDEN)).toBeTruthy()
  })
  it('exact (control): no reading on the link, exact words on the page', async () => {
    await render(<LiveTile venue={venue(5.4)} now={NOW} reading="exact" />)
    expect(screen.getByText('5.4 km', HIDDEN)).toBeTruthy()
    openPlace(venue(5.4), 'exact')
    expect(mockPush.mock.calls[0][0].params).toEqual({ id: 'v1', km: '5.4' })
    await render(<Where venue={{ name: 'Toit', address: '298, 100 Feet Road', city: 'Bengaluru', latitude: 0, longitude: 0 } as never} km={5.4} reading="exact" onCopy={jest.fn()} />)
    expect(screen.getByText(/5\.4 km/, HIDDEN)).toBeTruthy()
    expect(screen.queryByText(/about/, HIDDEN)).toBeNull()
  })
})
