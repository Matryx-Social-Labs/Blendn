/*
 * The Places pane (guidelines/places/places.js `placesPane`, round4/r4d.js
 * `placesFail`): every state it draws against a mocked API. Live now as tiles,
 * Open tonight as rows, the quiet places folded behind one line; loading, the
 * first load failing, an empty city, a refresh failing over a list; the type
 * chips asking the server; and the paging rule that keeps thousands of venues
 * from being a hundred requests.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import type { VenueListItem } from '../lib/apiClient'

jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 96 }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenues: jest.fn() } }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { PlacesList } from '../components/home/PlacesList'
import type { HomeBrowse } from '../components/home/HomeShell'
import { apiClient } from '../lib/apiClient'
import { H } from '../lib/haptics'
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

beforeEach(() => {
  jest.spyOn(H, 'select').mockImplementation(() => {})
  jest.spyOn(H, 'threshold').mockImplementation(() => {})
})

describe('the three strata', () => {
  const venues = [
    venue('a', { name: 'Toit', liveNow: '10-19', nextEvent: tonight() }),
    venue('b', { name: 'Fandom', liveNow: 'quiet', nextEvent: tonight(), venueType: 'nightclub', venueTypeLabel: 'Club' }),
    venue('c', { name: 'Koshy’s', venueType: 'cafe', venueTypeLabel: 'Café' }),
    venue('d', { name: 'Arbor', venueType: null }),
  ]

  it('Live now as tiles, Open tonight as rows with the event line, the rest folded behind one line with a count', async () => {
    getVenues.mockResolvedValue(page(venues))
    await mount()
    expect(screen.getByRole('header', { name: 'Live now' })).toBeTruthy()
    expect(screen.getByText('1 place')).toBeTruthy()
    expect(screen.getByLabelText('Toit. Brewery. 350 m. 10–19 live. Live, Vinyl Night')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Open tonight' })).toBeTruthy()
    expect(screen.getByLabelText('Fandom. Club. 350 m. Under 5 live. Live, Vinyl Night')).toBeTruthy()
    expect(screen.getByLabelText('2 quiet places')).toBeTruthy()
    // Folded: the quiet rows are not drawn.
    expect(screen.queryByTestId('place-quiet-c')).toBeNull()
  })

  it('live is a bucket, never a number: the pill says "10–19 live" and the tile never says who', async () => {
    getVenues.mockResolvedValue(page(venues))
    await mount()
    expect(screen.getByText('10–19 live')).toBeTruthy()
  })

  it('the fold opens in place and says "expanded"; a second tap closes it', async () => {
    getVenues.mockResolvedValue(page(venues))
    await mount()
    const fold = screen.getByLabelText('2 quiet places')
    expect(fold.props.accessibilityState).toMatchObject({ expanded: false })
    await act(async () => {
      fireEvent.press(fold)
    })
    expect(H.select).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('place-quiet-c')).toBeTruthy()
    expect(screen.getByTestId('place-quiet-d')).toBeTruthy()
    expect(screen.getByLabelText('2 quiet places').props.accessibilityState).toMatchObject({ expanded: true })
    await act(async () => {
      fireEvent.press(screen.getByLabelText('2 quiet places'))
    })
    expect(screen.queryByTestId('place-quiet-c')).toBeNull()
  })

  it('a tile and a row open the place, handing over the distance the list showed', async () => {
    getVenues.mockResolvedValue(page(venues))
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-tile-a'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'a', km: '0.35' } })
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-open-b'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'b', km: '0.35' } })
  })

  it('a place with no distance opens without one', async () => {
    getVenues.mockResolvedValue(page([venue('a', { liveNow: '5-9', distance: null })]))
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('place-tile-a'))
    })
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/venue/[id]', params: { id: 'a' } })
  })

  it('a viewer the server tells nothing sees no live pill and no live words', async () => {
    getVenues.mockResolvedValue(page([venue('a', { liveNow: null })]))
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByLabelText('1 quiet place'))
    })
    expect(screen.getByLabelText('Place a. Brewery. 350 m')).toBeTruthy()
    expect(screen.queryByText(/live$/)).toBeNull()
  })
})

describe('the chips', () => {
  it('each asks the server for that type, afresh, and the selected one is white', async () => {
    getVenues.mockResolvedValue(page([venue('a', { liveNow: '5-9' })]))
    await mount()
    expect(getVenues).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 30, city: 'Bengaluru', sortBy: 'distance', venueType: undefined }), { force: true })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Breweries' }))
    })
    await waitFor(() => expect(getVenues).toHaveBeenLastCalledWith(expect.objectContaining({ venueType: 'brewery' }), { force: true }))
    expect(screen.getByRole('button', { name: 'Breweries' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('a type with nothing in this city says so and keeps the chips to change it', async () => {
    getVenues.mockResolvedValueOnce(page([venue('a', { liveNow: '5-9' })]))
    await mount()
    getVenues.mockResolvedValue(page([]))
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Clubs' }))
    })
    await waitFor(() => expect(screen.getByText('No clubs in Bengaluru yet')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Clubs' })).toBeTruthy()
  })
})

describe('loading, failing, empty', () => {
  it('loading: a static skeleton and no chips', async () => {
    getVenues.mockReturnValue(new Promise(() => {}))
    await mount()
    expect(screen.getByTestId('places-skeleton')).toBeTruthy()
    expect(screen.queryByTestId('places-type-chips')).toBeNull()
  })

  it('the first load failing replaces the pane: "Couldn’t load places" and Try again reads afresh', async () => {
    getVenues.mockResolvedValueOnce({ success: false, error: 'offline' })
    await mount()
    expect(screen.getByText('Couldn’t load places')).toBeTruthy()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
    expect(screen.queryByTestId('places-type-chips')).toBeNull()
    getVenues.mockResolvedValue(page([venue('a', { liveNow: '5-9' })]))
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    await waitFor(() => expect(screen.getByTestId('place-tile-a')).toBeTruthy())
    expect(getVenues).toHaveBeenLastCalledWith(expect.anything(), { force: true })
  })

  it('an empty city says so and offers the city picker', async () => {
    getVenues.mockResolvedValue(page([]))
    const b = browse()
    await mount(b)
    expect(screen.getByText('No places in Bengaluru yet')).toBeTruthy()
    expect(screen.getByText('We list venues as they come on. Try another city.')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Change city' }))
    })
    expect(b.openCityPicker).toHaveBeenCalledTimes(1)
  })

  it('no city decided yet asks nothing; the pane waits', async () => {
    getVenues.mockResolvedValue(page([]))
    await mount(browse({ ready: false }))
    expect(getVenues).not.toHaveBeenCalled()
    expect(screen.getByTestId('places-skeleton')).toBeTruthy()
  })

  it('a refresh failing over a list keeps the list and says so inline', async () => {
    getVenues.mockResolvedValueOnce(page([venue('a', { liveNow: '5-9' })]))
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
})

describe('thousands of venues', () => {
  const full = (from: number) => Array.from({ length: 30 }, (_, i) => venue(`v${from + i}`))

  it('folded, it reads the first few pages on its own and then stops; unfolded, it reads on as the end is reached', async () => {
    getVenues.mockImplementation(({ page: n }: { page: number }) => Promise.resolve(page(full(n * 100), true, n)))
    await mount()
    const list = screen.getByTestId('places-list')
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent(list, 'endReached')
      })
    }
    // Page 1 on opening, then pages 2 and 3 — and no more while the quiet places are folded.
    expect(getVenues.mock.calls.map(([q]) => q.page)).toEqual([1, 2, 3])
    await act(async () => {
      fireEvent.press(screen.getByLabelText('90+ quiet places'))
    })
    await act(async () => {
      fireEvent(list, 'endReached')
    })
    expect(getVenues.mock.calls.map(([q]) => q.page)).toEqual([1, 2, 3, 4])
  })

  it('no row fetches anything: only the list asks', async () => {
    getVenues.mockResolvedValue(page(Array.from({ length: 25 }, (_, i) => venue(`t${i}`, { liveNow: '5-9' }))))
    await mount()
    expect(getVenues).toHaveBeenCalledTimes(1)
  })
})
