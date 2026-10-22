/*
 * The Places pane (guidelines/places/places.js `placesPane`, round4/r4d.js
 * `placesFail`): every state it draws against a mocked API. Live now as tiles,
 * Open tonight as rows, the quiet places folded behind one line; loading, the
 * first load failing, an empty city, a refresh failing over a list; the type
 * chips asking the server; and the paging rule that keeps thousands of venues
 * from being a hundred requests.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import React from 'react'
import { Platform } from 'react-native'

import type { VenueListItem } from '../lib/apiClient'

jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 96 }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenues: jest.fn(), getVenue: jest.fn(), queuedRequest: jest.fn(), cachedRequest: jest.fn() } }))
jest.mock('../lib/offers', () => ({ offersApi: { prefs: jest.fn() } }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { PlacesList } from '../components/home/PlacesList'
import type { HomeBrowse } from '../components/home/HomeShell'
import { apiClient } from '../lib/apiClient'
import { offersApi } from '../lib/offers'
import { H } from '../lib/haptics'
import { PULL_ARM } from '../lib/usePullToRefresh'
import { markOffline, markOnline } from '../lib/networkStatus'
/* eslint-enable import/first */

const getVenues = apiClient.getVenues as jest.Mock

const at = (h: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), h, 0).toISOString()
const venue = (id: string, over: Partial<VenueListItem> = {}): VenueListItem => ({
  id,
  name: `Place ${id}`,
  address: `${id} Main Road`,
  city: 'Bengaluru',
  latitude: 12.9,
  longitude: 77.6,
  venueType: 'brewery',
  venueTypeLabel: 'Brewery',
  distance: 0.35,
  upcomingEventCount: 0,
  liveNow: 'quiet',
  nextEvent: null,
  ...over,
})
// A night that is on now (it started an hour ago and ends in an hour), so "Live" holds whatever the test's clock says.
const tonight = () => ({
  id: 'e1',
  title: 'Vinyl Night',
  slug: null,
  coverImageUrl: null,
  startTime: new Date(Date.now() - 3_600_000).toISOString(),
  endTime: new Date(Date.now() + 3_600_000).toISOString(),
})
const page = (venues: VenueListItem[], hasMore = false, pageNo = 1) => ({
  success: true,
  data: { venues, pagination: { page: pageNo, limit: 30, totalCount: venues.length, totalPages: 1, hasMore } },
})

/** Any read answers with the list, but Near you's (`limit: 5`), which answers with `near`. */
const serve = (venues: VenueListItem[], near: VenueListItem[] = []) =>
  getVenues.mockImplementation((q: { limit: number }) => Promise.resolve(q.limit === 5 ? page(near) : page(venues)))
/** The calls that asked for the list itself. */
/** The glow and the badge are decoration for a screen reader: found by id, not by reading order. */
const HIDDEN = { includeHiddenElements: true }
const listCalls = () => getVenues.mock.calls.filter(([q]) => q.limit === 30)

const browse = (over: Partial<HomeBrowse> = {}): HomeBrowse => ({
  city: 'Bengaluru',
  location: { latitude: 12.97, longitude: 77.59 },
  ready: true,
  cityCentre: null,
  cityPick: { n: 0, here: false },
  requestLocation: jest.fn(),
  openCityPicker: jest.fn(),
  ...over,
})

async function mount(b: HomeBrowse = browse(), active = true) {
  const view = await render(<PlacesList browse={b} active={active} />)
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

afterEach(() => markOnline())

beforeEach(() => {
  jest.spyOn(H, 'select').mockImplementation(() => {})
  jest.spyOn(H, 'threshold').mockImplementation(() => {})
})

describe('the sections', () => {
  const venues = [
    venue('a', { name: 'Toit', liveNow: '10-19', nextEvent: tonight() }),
    venue('b', { name: 'Fandom', liveNow: 'quiet', nextEvent: tonight(), venueType: 'nightclub', venueTypeLabel: 'Club' }),
    venue('c', { name: 'Koshy’s', venueType: 'cafe', venueTypeLabel: 'Café' }),
    venue('d', { name: 'Arbor', venueType: null }),
  ]

  it('Live now as glow tiles, Open tonight as cards with the event line, the rest folded behind one line with a count', async () => {
    serve(venues)
    await mount()
    expect(screen.getByRole('header', { name: 'Live now, 1' })).toBeTruthy()
    expect(screen.getByLabelText('Toit. Brewery, a Main Road, 350 metres. 10 to 19 people live')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Open tonight, 1' })).toBeTruthy()
    expect(screen.getByLabelText('Fandom. Club, b Main Road, 350 metres. Live, Vinyl Night.')).toBeTruthy()
    expect(screen.getByLabelText('2 more places. Nearest first')).toBeTruthy()
    // Folded: the quiet rows are not drawn.
    expect(screen.queryByTestId('place-quiet-c')).toBeNull()
  })

  it('the stat line is one text for a screen reader, the total the server’s and the strata the ones read', async () => {
    getVenues.mockImplementation((q: { limit: number }) =>
      Promise.resolve(q.limit === 5 ? page([]) : { success: true, data: { venues, pagination: { page: 1, limit: 30, totalCount: 6422, totalPages: 215, hasMore: false } } })
    )
    await mount()
    expect(screen.getByLabelText('6,422 places, 1 live, 1 open tonight')).toBeTruthy()
    expect(screen.getByText('6,422 PLACES · 1 LIVE · 1 OPEN TONIGHT')).toBeTruthy()
  })

  it('the glow is the bucket’s: a 10–19 tile has the middle step, a quiet one has none', async () => {
    serve([venue('a', { liveNow: '10-19' }), venue('b', { liveNow: '5-9' })])
    await mount()
    expect(screen.getByTestId('place-glow-10-19-now', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('place-glow-5-9-now', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('place-glow-quiet-now', HIDDEN)).toBeNull()
  })

  it('under five draws no live count: a quiet row carries no pill, no "N live" label', async () => {
    serve([venue('c', { name: 'Koshy’s', liveNow: 'quiet', venueType: 'cafe', venueTypeLabel: 'Café' })])
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('1 more place. Nearest first'))
    })
    expect(screen.getByTestId('place-quiet-c')).toBeTruthy()
    expect(screen.getByLabelText('Koshy’s. Café. 350 m')).toBeTruthy()
    expect(screen.queryByText(/(^|\s)live$/i)).toBeNull()
    expect(screen.queryByText(/under 5/i)).toBeNull()
  })

  it('live is a bucket, never a number: the pill says "10–19 live" and the tile never says who', async () => {
    serve(venues)
    await mount()
    expect(screen.getByText('10–19 live')).toBeTruthy()
  })

  it('the fold opens in place and says "expanded"; a second tap closes it', async () => {
    serve(venues)
    await mount()
    const fold = screen.getByLabelText('2 more places. Nearest first')
    expect(fold.props.accessibilityState).toMatchObject({ expanded: false })
    await act(async () => {
      fireEvent.press(fold)
    })
    expect(H.select).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('place-quiet-c')).toBeTruthy()
    expect(screen.getByTestId('place-quiet-d')).toBeTruthy()
    expect(screen.getByLabelText('2 more places. Nearest first').props.accessibilityState).toMatchObject({ expanded: true })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('2 more places. Nearest first'))
    })
    expect(screen.queryByTestId('place-quiet-c')).toBeNull()
  })

  it('a tile, a card and a near row open the place, handing over the distance the list showed', async () => {
    serve(venues, [venue('n1', { name: 'Nearest' })])
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-tile-a'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'a', km: '0.35' } })
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-open-b'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'b', km: '0.35' } })
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-near-n1'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'n1', km: '0.35' } })
  })

  it('a place with no distance opens without one', async () => {
    serve([venue('a', { liveNow: '5-9', distance: null })])
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-tile-a'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'a' } })
  })

  it('a viewer the server tells nothing sees no live pill and no live words', async () => {
    serve([venue('a', { liveNow: null })])
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('1 more place. Nearest first'))
    })
    expect(screen.getByLabelText('Place a. Brewery. 350 m')).toBeTruthy()
    expect(screen.queryByText(/live$/)).toBeNull()
  })

  it('"See all" on Live now focuses the stratum: the other sections go, the filter badge shows one', async () => {
    serve(venues)
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-live-header-action'))
    })
    expect(screen.queryByRole('header', { name: /Open tonight/ })).toBeNull()
    expect(screen.queryByTestId('places-quiet-fold')).toBeNull()
    expect(screen.getByTestId('places-filter-badge', HIDDEN)).toBeTruthy()
  })
})

describe('Near you', () => {
  it('asks for the five nearest by distance, once, and draws them numbered under the heading', async () => {
    serve([venue('a', { liveNow: '5-9' })], [venue('n1', { name: 'One', liveNow: '10-19' }), venue('n2', { name: 'Two' })])
    await mount()
    const near = getVenues.mock.calls.filter(([q]) => q.limit === 5)
    expect(near).toHaveLength(1)
    expect(near[0][0]).toMatchObject({ page: 1, limit: 5, lat: 12.97, lon: 77.59, sortBy: 'distance' })
    expect(screen.getByRole('header', { name: 'Near you' })).toBeTruthy()
    expect(screen.getByLabelText('1 of 5 nearest. One, Brewery, n1 Main Road, 350 metres')).toBeTruthy()
    expect(screen.getByLabelText('2 of 5 nearest. Two, Brewery, n2 Main Road, 350 metres')).toBeTruthy()
    // The live caption only from a bucket of 5 or more.
    expect(screen.getAllByText('10–19 live').length).toBeGreaterThan(0)
  })

  it('reports its pins to the map, numbered, and takes them back when the pane is not the one in front', async () => {
    const onNearPins = jest.fn()
    serve([venue('a', { liveNow: '5-9' })], [venue('n1'), venue('n2')])
    const b = browse()
    const view = await render(<PlacesList browse={b} active onNearPins={onNearPins} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(onNearPins).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'n1', n: 1 }), expect.objectContaining({ id: 'n2', n: 2 })])
    await view.rerender(<PlacesList browse={b} active={false} onNearPins={onNearPins} />)
    expect(onNearPins).toHaveBeenLastCalledWith([])
  })

  it('"Show on map" asks the shell to lift the drawer and fit the pins', async () => {
    const onShow = jest.fn()
    serve([venue('a', { liveNow: '5-9' })], [venue('n1')])
    await render(<PlacesList browse={browse()} active onShowNearOnMap={onShow} />)
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-near-header-action'))
    })
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('without a fix there is no request, no distance, no pins: the location card asks', async () => {
    const b = browse({ location: null })
    const onNearPins = jest.fn()
    serve([venue('a', { liveNow: '5-9', distance: null })])
    await render(<PlacesList browse={b} active onNearPins={onNearPins} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(getVenues.mock.calls.filter(([q]) => q.limit === 5)).toHaveLength(0)
    expect(screen.getByText('Turn on location to see the places closest to you, numbered on the map.')).toBeTruthy()
    expect(onNearPins).toHaveBeenLastCalledWith([])
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-near-ask-button'))
    })
    expect(b.requestLocation).toHaveBeenCalledTimes(1)
    // The list asks for names, not distances.
    expect(listCalls()[0][0]).toMatchObject({ sortBy: 'name' })
  })

  it('a fix and no places near: the section is absent', async () => {
    serve([venue('a', { liveNow: '5-9' })], [])
    await mount()
    expect(screen.queryByRole('header', { name: 'Near you' })).toBeNull()
  })
})

describe('the kinds', () => {
  it('a plate per kind, in the design’s order; tapping one asks the server for it, afresh, and the chip carries it', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    for (const t of ['pub_bar', 'brewery', 'nightclub', 'live_music_venue', 'lounge_rooftop', 'cafe']) expect(screen.getByTestId(`places-kind-${t}`)).toBeTruthy()
    expect(listCalls().at(-1)?.[0]).toEqual(expect.objectContaining({ page: 1, limit: 30, city: 'Bengaluru', sortBy: 'distance', venueType: undefined, order: 'live' }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-kind-brewery'))
    })
    expect(H.select).toHaveBeenCalled()
    await waitFor(() => expect(listCalls().at(-1)?.[1]).toEqual({ force: true }))
    expect(listCalls().at(-1)?.[0]).toMatchObject({ venueType: 'brewery' })
    // The kinds grid and Near you go; the chip stays under the search and removes itself.
    expect(screen.queryByTestId('places-kind-brewery')).toBeNull()
    expect(screen.getByTestId('places-kind-chip')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Breweries, remove filter'))
    })
    await waitFor(() => expect(listCalls().at(-1)?.[0]).toMatchObject({ venueType: undefined }))
  })

  it('a kind with nothing in this city says so and keeps the chip to clear it', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    getVenues.mockResolvedValue(page([]))
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-kind-nightclub'))
    })
    await waitFor(() => expect(screen.getByText('No clubs in Bengaluru yet')).toBeTruthy())
    expect(screen.getByTestId('places-kind-chip')).toBeTruthy()
  })
})

describe('the filter sheet', () => {
  const open = async () => {
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter'))
    })
  }

  it('applies a kind, a stratum and a radius together: the server gets the kind and the radius, the badge counts three', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    await open()
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-kind-cafe'))
      fireEvent.press(screen.getByTestId('places-filter-on-live'))
      fireEvent.press(screen.getByTestId('places-filter-far-5'))
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-apply'))
    })
    await waitFor(() => expect(listCalls().at(-1)?.[0]).toMatchObject({ venueType: 'cafe', radius: 5 }))
    expect(screen.getByTestId('places-filter-badge', HIDDEN)).toBeTruthy()
  })

  it('each applied filter is a removable chip under the search, and each × clears only its own', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    await open()
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-kind-cafe'))
      fireEvent.press(screen.getByTestId('places-filter-on-live'))
      fireEvent.press(screen.getByTestId('places-filter-far-5'))
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-apply'))
    })
    expect(screen.getByTestId('places-kind-chip', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('places-on-chip', HIDDEN)).toBeTruthy()
    expect(screen.getByLabelText('Within 5 km, remove filter')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Within 5 km, remove filter'))
    })
    expect(screen.queryByTestId('places-far-chip', HIDDEN)).toBeNull()
    expect(screen.getByTestId('places-kind-chip', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('places-on-chip', HIDDEN)).toBeTruthy()
  })

  it('"Show n places" is the server’s count for the draft, after 250 ms', async () => {
    jest.useFakeTimers()
    try {
      getVenues.mockImplementation((q: { limit: number; venueType?: string }) =>
        Promise.resolve(q.limit === 1 ? { success: true, data: { venues: [], pagination: { page: 1, limit: 1, totalCount: q.venueType === 'cafe' ? 212 : 6422, totalPages: 1, hasMore: false } } } : q.limit === 5 ? page([]) : page([venue('a', { liveNow: '5-9' })]))
      )
      await mount()
      await open()
      await act(async () => {
        fireEvent.press(screen.getByTestId('places-filter-kind-cafe'))
      })
      expect(getVenues.mock.calls.filter(([q]) => q.limit === 1)).toHaveLength(0)
      await act(async () => {
        jest.advanceTimersByTime(250)
        await Promise.resolve()
      })
      expect(getVenues.mock.calls.filter(([q]) => q.limit === 1).at(-1)?.[0]).toMatchObject({ venueType: 'cafe', page: 1, limit: 1 })
      await act(async () => {
        jest.advanceTimersByTime(400)
      })
      // The button's number rolls (a RollingNumber), so it is read as the sentence, once settled.
      expect(screen.getByRole('button', { name: 'Show 212 places' })).toBeTruthy()
      expect(screen.getByTestId('places-filter-apply-count')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('"Clear all" empties the draft; without a fix there is no "How far"', async () => {
    serve([venue('a', { liveNow: '5-9', distance: null })])
    await mount(browse({ location: null }))
    await open()
    expect(screen.queryByTestId('places-filter-far-5')).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-kind-cafe'))
    })
    expect(screen.getByTestId('places-filter-kind-cafe').props.accessibilityState).toMatchObject({ selected: true })
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-filter-sheet-header-action'))
    })
    expect(screen.getByTestId('places-filter-kind-cafe').props.accessibilityState).toMatchObject({ selected: false })
    expect(screen.getByTestId('places-filter-kind-counter').props.children).toBe('Any')
  })
})

describe('the sticky search', () => {
  it('is the list’s second row, pinned, with its bar behind it; scrolling the list does not remount the field or lose its text', async () => {
    serve(Array.from({ length: 20 }, (_, i) => venue(`v${i}`, { liveNow: '5-9' })))
    await mount()
    const list = screen.getByTestId('places-list')
    expect(list.props.stickyHeaderIndices).toEqual([1])
    // The bar (the design system's Material) is mounted once the list has scrolled, not before.
    expect(screen.queryByTestId('sticky-search-bar', HIDDEN)).toBeNull()
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('places-search-input'), 'toi')
    })
    await act(async () => {
      fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 2000 }, contentSize: { height: 6000, width: 400 }, layoutMeasurement: { height: 800, width: 400 } } })
    })
    expect(screen.getByTestId('sticky-search-bar', HIDDEN)).toBeTruthy()
    expect(screen.getByTestId('places-search-input').props.value).toBe('toi')
  })

  it('typing re-renders the search row only: the list is not asked again until the text settles', async () => {
    jest.useFakeTimers()
    try {
      serve([venue('a', { liveNow: '5-9' })])
      await mount()
      const before = listCalls().length
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('places-search-input'), 't')
        fireEvent.changeText(screen.getByTestId('places-search-input'), 'to')
        fireEvent.changeText(screen.getByTestId('places-search-input'), 'toi')
        jest.advanceTimersByTime(299)
      })
      expect(listCalls()).toHaveLength(before)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('search', () => {
  it('asks the server after a beat, and the answer is a flat list of places under one label', async () => {
    jest.useFakeTimers()
    try {
      serve([venue('a', { liveNow: '5-9' })])
      await mount()
      getVenues.mockImplementation((q: { search?: string; limit: number }) => Promise.resolve(q.limit === 5 ? page([]) : page(q.search ? [venue('t1', { name: 'Toit' })] : [venue('a', { liveNow: '5-9' })])))
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('places-search-input'), 'toi')
      })
      expect(listCalls().some(([q]) => q.search)).toBe(false)
      await act(async () => {
        jest.advanceTimersByTime(300)
        await Promise.resolve()
      })
      expect(listCalls().at(-1)?.[0]).toMatchObject({ search: 'toi' })
      expect(screen.getByTestId('places-results-header')).toBeTruthy()
      expect(screen.getByTestId('place-quiet-t1')).toBeTruthy()
      expect(screen.queryByTestId('place-tile-a')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('a search that matches nothing says so', async () => {
    jest.useFakeTimers()
    try {
      serve([venue('a', { liveNow: '5-9' })])
      await mount()
      serve([])
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('places-search-input'), 'zzz')
        jest.advanceTimersByTime(300)
      })
      await waitFor(() => expect(screen.getByText('No places match “zzz”')).toBeTruthy())
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the peek line', () => {
  it('the pane reports “N places live · M open tonight” for the drawer to keep at peek, and nothing before it knows', async () => {
    const onSummary = jest.fn()
    serve([venue('a', { liveNow: '5-9' }), venue('b', { nextEvent: tonight() }), venue('c')])
    await render(<PlacesList browse={browse()} active onSummary={onSummary} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(onSummary).toHaveBeenCalledWith(null)
    expect(onSummary).toHaveBeenLastCalledWith('1 place live · 1 open tonight')
  })
})

describe('the header stays while a kind is chosen', () => {
  it('a tap on a plate keeps the header and search up through the load and through a failed load', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    getVenues.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      fireEvent.press(screen.getByTestId('places-kind-cafe'))
    })
    expect(screen.getByTestId('places-skeleton')).toBeTruthy()
    expect(screen.getByTestId('places-search')).toBeTruthy()
    expect(screen.getByTestId('places-kind-chip')).toBeTruthy()
    getVenues.mockResolvedValue({ success: false, error: 'offline' })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cafés, remove filter'))
    })
    await waitFor(() => expect(screen.getByTestId('places-error')).toBeTruthy())
    expect(screen.getByTestId('places-search')).toBeTruthy()
  })
})

describe('loading, failing, empty', () => {
  it('loading: the real header and search, then static blocks at the new sections’ geometry', async () => {
    getVenues.mockReturnValue(new Promise(() => {}))
    await mount()
    expect(screen.getByTestId('places-skeleton')).toBeTruthy()
    expect(screen.getByTestId('places-search')).toBeTruthy()
    // The title is the drawer's tabs now: the pane draws none of its own.
    expect(screen.queryByRole('header', { name: 'Places' })).toBeNull()
    expect(screen.getByTestId('places-header')).toBeTruthy()
  })

  it('the first load failing replaces the sections: "Couldn’t load places" and Try again reads afresh', async () => {
    getVenues.mockResolvedValueOnce({ success: false, error: 'offline' })
    getVenues.mockResolvedValue(page([]))
    await mount()
    expect(screen.getByText('Couldn’t load places')).toBeTruthy()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
    serve([venue('a', { liveNow: '5-9' })])
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    await waitFor(() => expect(screen.getByTestId('place-tile-a')).toBeTruthy())
    expect(listCalls().at(-1)?.[1]).toEqual({ force: true })
  })

  it('an empty city says so and offers the city picker', async () => {
    serve([])
    const b = browse()
    await mount(b)
    expect(screen.getByText('No places in Bengaluru yet')).toBeTruthy()
    expect(screen.getByText('We list venues as they come on. Try another city.')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Change city' }))
    })
    expect(b.openCityPicker).toHaveBeenCalledTimes(1)
  })

  it('the header has no title and no city chip (the drawer’s title tabs carry both), and keeps the stat line', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount(browse())
    await waitFor(() => expect(screen.getByTestId('place-tile-a')).toBeTruthy())
    expect(screen.queryByTestId('places-city')).toBeNull()
    expect(within(screen.getByTestId('places-header')).queryByText('Places')).toBeNull()
    expect(within(screen.getByTestId('places-header')).getByTestId('places-stat')).toBeTruthy()
  })

  it('no city decided yet asks nothing; the pane waits', async () => {
    serve([])
    await mount(browse({ ready: false }))
    expect(getVenues).not.toHaveBeenCalled()
    expect(screen.getByTestId('places-skeleton')).toBeTruthy()
  })

  it('a refresh failing over a list keeps the list and says so inline', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    const b = browse()
    const view = await mount(b, true)
    expect(screen.getByTestId('place-tile-a')).toBeTruthy()
    // The pane is closed and reopened: the person asks again, and the answer is a failure.
    getVenues.mockResolvedValue({ success: false, error: 'offline' })
    await view.rerender(<PlacesList browse={b} active={false} />)
    await view.rerender(<PlacesList browse={b} active />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Places didn’t refresh.')).toBeTruthy()
    expect(screen.getByTestId('place-tile-a')).toBeTruthy()
  })

  it('offline with a list: a banner saying when it was live, and the content stays', async () => {
    serve([venue('a', { liveNow: '5-9' })])
    await mount()
    await act(async () => {
      markOffline()
    })
    expect(screen.getByTestId('places-offline')).toBeTruthy()
    expect(screen.getByText(/^Offline\. Live as of \d{1,2}(:\d{2})? (AM|PM)$/)).toBeTruthy()
    expect(screen.getByTestId('place-tile-a')).toBeTruthy()
  })
})

describe('pull to refresh', () => {
  /*
   * WP7's branded pull (motion #18): on iOS the list's own bounce is the pull, no UIRefreshControl, so the arm tick is the
   * app's H.threshold, once, and the refresh starts on release past the point. Android keeps the platform control.
   */
  const at = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 0, height: 0 }, layoutMeasurement: { width: 0, height: 0 } } })
  const setOS = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  afterEach(() => setOS('ios'))

  it('iOS: arms once with H.threshold, and a release past the point re-reads the list and Near you', async () => {
    setOS('ios')
    serve([venue('a', { liveNow: '5-9' })], [venue('n1')])
    await mount()
    getVenues.mockClear()
    const list = screen.getByTestId('places-list')
    expect(list.props.refreshControl).toBeUndefined()
    await act(async () => {
      fireEvent.scroll(list, at(-PULL_ARM - 6))
    })
    expect(H.threshold).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent(list, 'scrollEndDrag', at(-PULL_ARM - 6))
    })
    expect(listCalls()).toHaveLength(1)
    expect(getVenues.mock.calls.filter(([q]) => q.limit === 5)).toHaveLength(1)
  })

  it('Android: the platform control re-reads the list and Near you, with no haptic of ours', async () => {
    setOS('android')
    serve([venue('a', { liveNow: '5-9' })], [venue('n1')])
    await mount()
    getVenues.mockClear()
    await act(async () => {
      screen.getByTestId('places-list').props.refreshControl.props.onRefresh()
    })
    expect(listCalls()).toHaveLength(1)
    expect(getVenues.mock.calls.filter(([q]) => q.limit === 5)).toHaveLength(1)
    expect(H.threshold).not.toHaveBeenCalled()
  })
})

describe('thousands of venues', () => {
  const full = (from: number) => Array.from({ length: 30 }, (_, i) => venue(`v${from + i}`))

  it('folded, it reads the first few pages on its own and then stops; unfolded, it reads on as the end is reached', async () => {
    getVenues.mockImplementation(({ page: n, limit }: { page: number; limit: number }) => Promise.resolve(limit === 5 ? page([]) : page(full(n * 100), true, n)))
    await mount()
    const list = screen.getByTestId('places-list')
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent(list, 'endReached')
      })
    }
    // Page 1 on opening, then pages 2 and 3 — and no more while the quiet places are folded.
    expect(listCalls().map(([q]) => q.page)).toEqual([1, 2, 3])
    await act(async () => {
      fireEvent.press(screen.getByLabelText('90+ more places. Nearest first'))
    })
    await act(async () => {
      fireEvent(list, 'endReached')
    })
    expect(listCalls().map(([q]) => q.page)).toEqual([1, 2, 3, 4])
  })

  it('no row fetches anything: the list asks once, Near you once, and no other API call of any kind is made — not a venue, not a request, not a prefs read', async () => {
    serve(Array.from({ length: 25 }, (_, i) => venue(`t${i}`, { liveNow: i % 3 ? '5-9' : 'quiet', nextEvent: i % 2 ? tonight() : null })), [venue('n1'), venue('n2')])
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/more places?\. /))
    })
    // The list once, and Near you once: the one extra request. Nothing per row.
    expect(listCalls()).toHaveLength(1)
    expect(getVenues).toHaveBeenCalledTimes(2)
    for (const call of [apiClient.getVenue, apiClient.queuedRequest, apiClient.cachedRequest, offersApi.prefs]) expect(call).not.toHaveBeenCalled()
  })

  it('without the order: "live" echo the first pages are all it reads on its own, even if the server happened to send live venues', async () => {
    getVenues.mockImplementation(({ page: n, limit }: { page: number; limit: number }) => limit === 5 ? Promise.resolve(page([])) : Promise.resolve(page(Array.from({ length: 30 }, (_, i) => venue(`x${n}-${i}`, { liveNow: '5-9' })), true, n)))
    await mount()
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        fireEvent(screen.getByTestId('places-list'), 'endReached')
      })
    }
    expect(listCalls().map(([q]) => q.page)).toEqual([1, 2, 3])
  })

  it('with tiers, venues open by hours alone keep the paging going past page 1', async () => {
    const tiered = (n: number, tier: 'open' | 'quiet') => Array.from({ length: 30 }, (_, i) => venue(`h${n}-${i}`, { tier }))
    const calls: number[] = []
    getVenues.mockImplementation(({ page: n, limit }: { page: number; limit: number }) => {
      if (limit === 5) return Promise.resolve(page([]))
      calls.push(n)
      const p = page(tiered(n, n < 4 ? 'open' : 'quiet'), true, n)
      return Promise.resolve({ ...p, data: { ...p.data, pagination: { ...p.data.pagination, order: 'live' } } })
    })
    await mount()
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        fireEvent(screen.getByTestId('places-list'), 'endReached')
      })
    }
    // Pages 1-3 are open by hours (no event, no live label: the old split read them as quiet and stopped at 1).
    expect(calls).toEqual([1, 2, 3, 4])
    expect(screen.getByRole('header', { name: /^Open tonight/ })).toBeTruthy()
  })

  it('every page of a paging session is read fresh: none is served from cache against a fresh page 1', async () => {
    getVenues.mockImplementation(({ page: n, limit }: { page: number; limit: number }) => limit === 5 ? Promise.resolve(page([])) : Promise.resolve(page(Array.from({ length: 30 }, (_, i) => venue(`f${n}-${i}`)), true, n)))
    await mount()
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent(screen.getByTestId('places-list'), 'endReached')
      })
    }
    expect(getVenues.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const [, options] of getVenues.mock.calls) expect(options).toEqual({ force: true })
  })

  it('a server that orders live first is read as far as the last live or open venue, with no page cap, and no further once a quiet one shows', async () => {
    const liveFull = (from: number) => Array.from({ length: 30 }, (_, i) => venue(`l${from + i}`, { liveNow: '5-9' }))
    const calls: number[] = []
    getVenues.mockImplementation(({ page: n, limit }: { page: number; limit: number }) => {
      if (limit === 5) return Promise.resolve(page([]))
      calls.push(n)
      // Pages 1-5 are all live; page 6 reaches the quiet ones.
      const venues = n < 6 ? liveFull(n * 100) : full(n * 100)
      return Promise.resolve({ ...page(venues, true, n), data: { ...page(venues, true, n).data, pagination: { ...page(venues, true, n).data.pagination, order: 'live' } } })
    })
    await mount()
    const list = screen.getByTestId('places-list')
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        fireEvent(list, 'endReached')
      })
    }
    expect(calls).toEqual([1, 2, 3, 4, 5, 6])
  })
})
