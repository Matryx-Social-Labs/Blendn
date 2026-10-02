import type { VenueListItem } from '../lib/apiClient'
import { initialPlaces, mayLoadMore, placesKey, placesReducer, type PlacesState } from '../lib/places'

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
