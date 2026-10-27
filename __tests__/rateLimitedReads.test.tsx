/**
 * Rate-limited reads (Flow 15 #15): a read the server refuses for asking too fast says the wait and reads again, on Pulse and
 * Places as it does on Going. Never "couldn't load" (the connection is fine) and never "nothing here" (there is something).
 */
import { act, render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

import { PulseBanners } from '../components/pulse/PulseBanners'
import { rateLimitWait } from '../lib/rateLimited'
import { initialPlaces, mayLoadMore, placesKey, placesReducer, type PlacesState } from '../lib/places'
import { placeRows, NO_FILTERS, type PlaceView } from '../lib/placesPane'

jest.mock('../lib/apiClient', () => ({ apiClient: { getEvents: jest.fn() } }))
/* eslint-disable import/first */
import { getEvents } from '../lib/api'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('the Pulse', () => {
  it('the read carries the server\'s code and wait through to the screen', async () => {
    ;(apiClient.getEvents as jest.Mock).mockResolvedValue({ success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED', retryAfter: 42 })
    const { data, error } = await getEvents({ page: 0 })
    expect(data).toBeNull()
    expect(rateLimitWait([error])).toBe(42)
  })

  it('a plain failure carries no wait: it is still "couldn\'t load"', async () => {
    ;(apiClient.getEvents as jest.Mock).mockResolvedValue({ success: false, error: 'boom' })
    const { error } = await getEvents({ page: 0 })
    expect(rateLimitWait([error])).toBeNull()
  })

  const banners = (rateLimit: number | null, refreshFailed = false) => (
    <PulseBanners
      socketStatus={'connected' as never}
      switchTo={null}
      onSwitch={() => {}}
      away={null}
      locationDenied={false}
      onOpenSettings={() => {}}
      refreshFailed={refreshFailed}
      rateLimit={rateLimit}
      onRetry={() => {}}
    />
  )

  it('the banner says the wait, counting down, and replaces "Couldn\'t refresh events"', async () => {
    await render(banners(52, true))
    expect(await screen.findByTestId('pulse-rate-limited')).toBeTruthy()
    expect(screen.getByText('0:52')).toBeTruthy()
    expect(screen.queryByTestId('pulse-refresh-failed')).toBeNull()
  })

  it('no refusal, no banner; a failed refresh is as it was', async () => {
    await render(banners(null, true))
    expect(screen.queryByTestId('pulse-rate-limited')).toBeNull()
    expect(screen.getByTestId('pulse-refresh-failed')).toBeTruthy()
  })

  it('the screen reads again when the wait is over, and shows neither the failed page nor the empty one meanwhile', () => {
    const events = src('app/(tabs)/events.tsx')
    expect(events).toMatch(/rateLimitWaitOf\(error\)/)
    expect(events).toContain('rateLimit={rateLimit && !rateLimit.onMore ? rateLimit.seconds : null}')
    expect(events).toMatch(/events\.length === 0 && !!netError && rateLimit === null/)
    expect(events).toMatch(/events\.length === 0 && !netError && rateLimit === null/)
    expect(events).toContain('onRateLimitDone={rateLimitDone}')
  })
})

describe('the Pulse waits out the server\'s wait, whoever asks (M4, M5)', () => {
  const events = src('app/(tabs)/events.tsx')
  const body = (name: string) => events.slice(events.indexOf(name), events.indexOf(name) + 900)

  it('the first page, the sync timers, a pull and a scroll to the end all return early inside the wait', () => {
    expect(events).toContain('const rateLimitUntilRef = useRef(0)')
    expect(body('const fetchEvents = useCallback(async')).toMatch(/if \(withinWait\(\)\) return/)
    expect(body('const fetchMore = useCallback(async')).toMatch(/withinWait\(\)\) return/)
  })

  it('a refusal sets the wait from the server\'s seconds, and only the banner\'s end clears it and reads again', () => {
    expect(events).toContain('rateLimitUntilRef.current = Date.now() + seconds * 1000')
    const done = events.slice(events.indexOf('const rateLimitDone = () =>'), events.indexOf('const rateLimitDone = () =>') + 400)
    expect(done).toContain('rateLimitUntilRef.current = 0')
    expect(done).toMatch(/onMore \? fetchMore\(\) : fetchEvents\(\{ force: true \}\)/)
    expect(events.match(/rateLimitUntilRef\.current = 0/g)).toHaveLength(1)
  })

  it('a refused later page is recorded as one, shown at the foot and not the head, and asks for that page again', () => {
    expect(events).toContain('refuse(wait, true)')
    expect(events).toContain('rateLimit?.onMore ? (')
    expect(events).toContain('testID="pulse-more-rate-limited"')
    // The page is not counted when it is refused, so the retry asks for the same one.
    const more = body('const fetchMore = useCallback(async')
    expect(more.indexOf('refuse(wait, true)')).toBeLessThan(events.indexOf('setPage(prev => prev + 1)'))
  })
})

describe('Places', () => {
  const KEY = placesKey('Bengaluru', null)
  const refused = (page: number, state: PlacesState = initialPlaces(KEY)) =>
    placesReducer(placesReducer(state, { type: 'request', key: KEY, page }), { type: 'failed', key: KEY, page, rateLimit: 30 })
  const venue = (id: string) => ({ id, name: id, address: null, city: 'B', latitude: 1, longitude: 1, venueType: null, venueTypeLabel: 'Bar', distance: null, upcomingEventCount: 0, liveNow: 'quiet', nextEvent: null }) as never
  const withList = () =>
    placesReducer(placesReducer(initialPlaces(KEY), { type: 'request', key: KEY, page: 1 }), { type: 'loaded', key: KEY, page: 1, venues: [venue('a')], hasMore: true })

  it('a refused first read is not an error state: nothing to retry, only the wait', () => {
    const s = refused(1)
    expect(s.status).not.toBe('error')
    expect(s.rateLimit).toEqual({ seconds: 30, page: 1 })
  })

  const view = (s: PlacesState): PlaceView => ({
    status: s.status,
    strata: { live: [], open: [], quiet: [] },
    more: false,
    quietOpen: false,
    near: [],
    hasFix: false,
    filters: NO_FILTERS,
    searching: false,
    rateLimited: s.rateLimit !== null,
  })

  it('draws no skeleton, error or empty row for it: the banner is the state', () => {
    expect(placeRows(view(refused(1))).map((r) => r.kind)).toEqual(['title', 'search'])
  })

  it('a refused refresh keeps the list and says the wait; a refused later page keeps it too and stops asking', () => {
    const list = withList()
    const refresh = refused(1, list)
    expect(refresh.venues).toHaveLength(1)
    expect(refresh.refreshFailed).toBe(false)
    const more = refused(2, list)
    expect(more.venues).toHaveLength(1)
    expect(more.rateLimit).toEqual({ seconds: 30, page: 2 })
    expect(mayLoadMore(more)).toBe(false)
    expect(mayLoadMore(placesReducer(more, { type: 'rateLimitDone', key: KEY }))).toBe(true)
  })

  it('a read that goes through clears the wait', () => {
    const next = placesReducer(placesReducer(refused(1), { type: 'request', key: KEY, page: 1 }), { type: 'loaded', key: KEY, page: 1, venues: [venue('a')], hasMore: false })
    expect(next.rateLimit).toBeNull()
  })

  it('a failure that is not a refusal is still a failure', () => {
    const s = placesReducer(placesReducer(initialPlaces(KEY), { type: 'request', key: KEY, page: 1 }), { type: 'failed', key: KEY, page: 1 })
    expect(s.status).toBe('error')
    expect(s.rateLimit).toBeNull()
  })

  it('the list shows the banner in the title row, or in the footer for a later page, and reads again when it is over', () => {
    const list = src('components/home/PlacesList.tsx')
    expect(list).toContain('rateLimit: rateLimitWait([res]) ?? undefined')
    expect(list).toContain('testID="places-rate-limited"')
    expect(list).toContain('testID="places-more-rate-limited"')
    expect(list).toMatch(/dispatch\(\{ type: 'rateLimitDone', key \}\)/)
  })
})
