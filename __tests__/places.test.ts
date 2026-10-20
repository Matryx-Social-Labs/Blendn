import type { VenueListItem } from '../lib/apiClient'
import { initialPlaces, mayLoadMore, placesKey, placesReducer, uniqueById, type PlacesState } from '../lib/places'

/** The Places list's loading rules (lib/places.ts; step 2 review). */

const venue = (id: string): VenueListItem => ({
  id,
  name: id,
  address: null,
  city: 'Bengaluru',
  latitude: 12.97,
  longitude: 77.59,
  venueType: null,
  venueTypeLabel: 'Bar',
  distance: null,
  upcomingEventCount: 0,
  liveNow: 'quiet',
  nextEvent: null,
})

const KEY = placesKey('Bengaluru', null)
const loaded = (venues: string[], page = 1, hasMore = true): PlacesState =>
  placesReducer(placesReducer(initialPlaces(KEY), { type: 'request', key: KEY, page }), {
    type: 'loaded',
    key: KEY,
    page,
    venues: venues.map(venue),
    hasMore,
  })

describe('the Places list loads', () => {
  it('shows a spinner for a first page, and the list once it arrives', () => {
    const asking = placesReducer(initialPlaces(KEY), { type: 'request', key: KEY, page: 1 })
    expect(asking.status).toBe('loading')
    expect(loaded(['a', 'b']).status).toBe('ready')
  })

  it('drops a page meant for another city or another spot', () => {
    const now = loaded(['a'])
    const other = placesKey('Mumbai', null)
    expect(placesReducer(now, { type: 'loaded', key: other, page: 2, venues: [venue('z')], hasMore: false })).toBe(now)
  })

  it('starts again on a new key, and only then', () => {
    const now = loaded(['a'])
    expect(placesReducer(now, { type: 'reset', key: KEY })).toBe(now)
    const moved = placesReducer(now, { type: 'reset', key: placesKey('Bengaluru', { latitude: 12.98, longitude: 77.6 }) })
    expect(moved).toMatchObject({ status: 'idle', venues: [], page: 0 })
  })

  it('never shows a venue twice when one is taken over (or back) between pages', () => {
    const one = loaded(['a', 'b'])
    const two = placesReducer(placesReducer(one, { type: 'request', key: KEY, page: 2 }), {
      type: 'loaded',
      key: KEY,
      page: 2,
      venues: [venue('b'), venue('c')],
      hasMore: false,
    })
    expect(two.venues.map((v) => v.id)).toEqual(['a', 'b', 'c'])
  })

  it('asks for one page at a time from the end of the list', () => {
    const one = loaded(['a'])
    expect(mayLoadMore(one)).toBe(true)
    const asking = placesReducer(one, { type: 'request', key: KEY, page: 2 })
    expect(mayLoadMore(asking)).toBe(false)
  })

  it('keeps the list and says so when a refresh fails, and does not stop paging', () => {
    const one = loaded(['a', 'b'])
    const failed = placesReducer(placesReducer(one, { type: 'request', key: KEY, page: 1 }), { type: 'failed', key: KEY, page: 1 })
    expect(failed).toMatchObject({ status: 'ready', refreshFailed: true })
    expect(failed.venues).toHaveLength(2)
    expect(mayLoadMore(failed)).toBe(true)
  })

  it('shows the error when there is nothing to keep, and leaves paging retryable when a later page fails', () => {
    const empty = placesReducer(placesReducer(initialPlaces(KEY), { type: 'request', key: KEY, page: 1 }), { type: 'failed', key: KEY, page: 1 })
    expect(empty.status).toBe('error')
    const one = loaded(['a'])
    const pageTwoFailed = placesReducer(placesReducer(one, { type: 'request', key: KEY, page: 2 }), { type: 'failed', key: KEY, page: 2 })
    expect(pageTwoFailed).toMatchObject({ loadingMore: false, hasMore: true, refreshFailed: false })
  })

  it('keys a spot to about 100 m, so a GPS jitter is the same list', () => {
    expect(placesKey('Bengaluru', { latitude: 12.97131, longitude: 77.59422 })).toBe(
      placesKey('Bengaluru', { latitude: 12.97139, longitude: 77.59431 })
    )
  })
})

describe('a server that orders live first', () => {
  it('the first page says so; later pages keep it; a list for another key forgets it', () => {
    let s = placesReducer(initialPlaces(KEY), { type: 'loaded', key: KEY, page: 1, venues: [], hasMore: true, orderedLive: true })
    expect(s.orderedLive).toBe(true)
    s = placesReducer(s, { type: 'loaded', key: KEY, page: 2, venues: [], hasMore: true })
    expect(s.orderedLive).toBe(true)
    s = placesReducer(s, { type: 'loaded', key: KEY, page: 1, venues: [], hasMore: true })
    expect(s.orderedLive).toBe(false)
  })

  it('the type chip is part of what the list is of', () => {
    expect(placesKey('Bengaluru', null, 'brewery')).not.toBe(placesKey('Bengaluru', null))
  })
})

describe('a venue that goes live between page loads is listed once (order=live)', () => {
  const v = (id: string, name = id) => ({ id, name }) as never

  it('across pages the first occurrence wins, position and all', () => {
    let s = placesReducer(initialPlaces(KEY), { type: 'loaded', key: KEY, page: 1, venues: [v('a'), v('b', 'first b')], hasMore: true })
    s = placesReducer(s, { type: 'loaded', key: KEY, page: 2, venues: [v('b', 'second b'), v('c')], hasMore: true })
    expect(s.venues.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect((s.venues[1] as unknown as { name: string }).name).toBe('first b')
  })

  it('and within one page, including the first', () => {
    const s = placesReducer(initialPlaces(KEY), { type: 'loaded', key: KEY, page: 1, venues: [v('a'), v('a', 'again'), v('b')], hasMore: true })
    expect(s.venues.map((x) => x.id)).toEqual(['a', 'b'])
    const t = placesReducer(s, { type: 'loaded', key: KEY, page: 2, venues: [v('c'), v('c'), v('a')], hasMore: false })
    expect(t.venues.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('uniqueById does not mutate what it is given', () => {
    const input = [v('a'), v('a')]
    uniqueById(input)
    expect(input).toHaveLength(2)
  })
})

describe('what the stat line and the offline banner read', () => {
  const v = (id: string) => ({ id }) as never
  it('keeps the server’s total and when page 1 arrived; a later page updates the total, never the time', () => {
    let s = placesReducer(initialPlaces(KEY), { type: 'loaded', key: KEY, page: 1, venues: [v('a')], hasMore: true, total: 6422, at: 1000 })
    expect(s).toMatchObject({ total: 6422, readAt: 1000 })
    s = placesReducer(s, { type: 'loaded', key: KEY, page: 2, venues: [v('b')], hasMore: true, total: 6423, at: 2000 })
    expect(s).toMatchObject({ total: 6423, readAt: 1000 })
    // A page that does not say keeps what was known.
    s = placesReducer(s, { type: 'loaded', key: KEY, page: 3, venues: [v('c')], hasMore: false })
    expect(s.total).toBe(6423)
    expect(initialPlaces(KEY)).toMatchObject({ total: null, readAt: null })
  })

  it('a search or a radius is a different list', () => {
    const base = placesKey('Bengaluru', null)
    expect(placesKey('Bengaluru', null, null, 'toit')).not.toBe(base)
    expect(placesKey('Bengaluru', null, null, null, 5)).not.toBe(base)
    expect(placesKey('Bengaluru', null, null, 'toit', 5)).not.toBe(placesKey('Bengaluru', null, null, 'toit', 2))
  })
})
