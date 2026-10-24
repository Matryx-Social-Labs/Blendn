/**
 * "See all" on a venue page (large data): a place with hundreds of events costs one page, then one more each
 * time it is asked, never the full list; a failed page keeps what is there; an event is never twice.
 *
 * Negative controls (the client keeps no registry): removing the dedupe in `appendUpcoming` fails "never twice";
 * making `more` ignore `pagination.hasMore` fails "stops at the last page".
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/ds/Loader', () => ({ Spinner: () => null }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenueUpcoming: jest.fn() } }))

/* eslint-disable import/first */
import { UpcomingSheet } from '../components/venue/UpcomingSheet'
import { apiClient } from '../lib/apiClient'
import { appendUpcoming, hasMoreThanShown, upcomingCount, upcomingRows, UPCOMING_MAX } from '../lib/venuePage'
/* eslint-enable import/first */

const at = (n: number) => new Date(2026, 9, 30, 21, n).toISOString()
const events = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${from + i}`, title: `Night ${from + i}`, startTime: at(from + i) }))
const rows = (from: number, n: number) => upcomingRows(events(from, n))
const page = (evs: ReturnType<typeof events>, nextCursor: string | null, total = 400) => ({
  success: true,
  data: { events: evs, pagination: { limit: 20, hasMore: nextCursor !== null, nextCursor, totalCount: total } },
})
const held = () => (screen.getByTestId('venue-upcoming-list').props.data as { id: string }[]).map((r) => r.id)
const onOpen = jest.fn()
const onClose = jest.fn()
const flush = async () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
const sheet = (over: Partial<React.ComponentProps<typeof UpcomingSheet>> = {}) => (
  <UpcomingSheet visible onClose={onClose} venueId="v1" first={rows(0, 5)} firstCursor="c1" total={400} onOpen={onOpen} {...over} />
)

beforeEach(() => jest.clearAllMocks())

describe('the sheet', () => {
  it('names how many there are in all, shows the page’s rows and fetches the first page of the rest from its cursor', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValue(page(events(5, 20), 'c2'))
    await render(sheet())
    await flush()
    expect(screen.getByRole('header', { name: 'Coming up here · 400' })).toBeTruthy()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(1)
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledWith('v1', 'c1', 20)
    expect(screen.getByTestId('venue-upcoming-all-e0')).toBeTruthy()
    // Only what has been asked for is held: 25 of 400.
    expect(screen.getByTestId('venue-upcoming-list').props.data).toHaveLength(25)
  })

  const endReached = async () => {
    await act(async () => {
      fireEvent(screen.getByTestId('venue-upcoming-list'), 'endReached')
    })
    await flush()
  }

  it('the end of the list asks for the next page by the last cursor, and stops at the last page', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValueOnce(page(events(5, 20), 'c2')).mockResolvedValueOnce(page(events(25, 3), null, 28))
    await render(sheet({ total: 28 }))
    await flush()
    await endReached()
    expect(apiClient.getVenueUpcoming).toHaveBeenLastCalledWith('v1', 'c2', 20)
    expect(held()).toHaveLength(28)
    expect(held()[27]).toBe('e27')
    // The last page: reaching the end again asks for nothing.
    await endReached()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(2)
  })

  it('a page that fails keeps what is there and says so; Try again asks for the same page', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValueOnce({ success: false, error: 'timeout' }).mockResolvedValueOnce(page(events(5, 2), null, 7))
    await render(sheet({ total: 7 }))
    await flush()
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
    expect(screen.getByTestId('venue-upcoming-all-e4')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-upcoming-retry'))
    })
    await flush()
    expect(apiClient.getVenueUpcoming).toHaveBeenLastCalledWith('v1', 'c1', 20)
    expect(held()).toHaveLength(7)
    expect(screen.queryByText('Couldn’t load more.')).toBeNull()
  })

  it('a thrown request is the same failure, not a crash', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockRejectedValue(new Error('offline'))
    await render(sheet())
    await flush()
    expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
  })

  it('with nothing more to ask for it asks for nothing', async () => {
    await render(sheet({ first: rows(0, 4), firstCursor: null, total: 4 }))
    await flush()
    expect(apiClient.getVenueUpcoming).not.toHaveBeenCalled()
    await endReached()
    expect(apiClient.getVenueUpcoming).not.toHaveBeenCalled()
  })

  it('reaching the end while a page is on its way, or after one failed, asks for nothing more', async () => {
    let land!: (v: unknown) => void
    ;(apiClient.getVenueUpcoming as jest.Mock).mockReturnValueOnce(new Promise((r) => (land = r)))
    await render(sheet())
    await endReached()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(1)
    await act(async () => land({ success: false, error: 'timeout' }))
    await endReached()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(1)
  })

  it('a tap opens the event and closes the sheet', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValue(page([], null, 5))
    await render(sheet())
    await flush()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-upcoming-all-e2'))
    })
    expect(onClose).toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledWith('e2')
  })

  it('opening it again starts from what the page has, not from the pages already loaded', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValue(page(events(5, 20), 'c2'))
    const view = await render(sheet())
    await flush()
    expect(held()).toHaveLength(25)
    await view.rerender(sheet({ visible: false }))
    await view.rerender(sheet({ visible: true }))
    await flush()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(2)
    expect(apiClient.getVenueUpcoming).toHaveBeenLastCalledWith('v1', 'c1', 20)
  })
})

describe('a first page that fits without scrolling (GO-04, audit C1: "· 35" with 10 reachable)', () => {
  const window = Dimensions.get('window')
  const tall = (height: number) => act(async () => Dimensions.set({ window: { ...window, height }, screen: { ...window, height } }))
  afterEach(() => tall(window.height))
  const tens = () =>
    (apiClient.getVenueUpcoming as jest.Mock)
      .mockResolvedValueOnce(page(events(5, 10), 'c2', 35))
      .mockResolvedValueOnce(page(events(15, 10), 'c3', 35))
      .mockResolvedValueOnce(page(events(25, 10), null, 35))

  it('pages on by itself while the rows fit the list, since no end can be scrolled to: all 35', async () => {
    await tall(3000)
    tens()
    await render(sheet({ total: 35 }))
    await flush()
    await flush()
    await flush()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(3)
    expect(apiClient.getVenueUpcoming).toHaveBeenNthCalledWith(2, 'v1', 'c2', 20)
    expect(apiClient.getVenueUpcoming).toHaveBeenNthCalledWith(3, 'v1', 'c3', 20)
    expect(held()).toHaveLength(35)
  })

  it('stops once the rows fill the list, and the end of the list brings the rest', async () => {
    await tall(1400) // a list of 840: 15 rows of 56 still fit, 25 do not
    tens()
    await render(sheet({ total: 35 }))
    await flush()
    await flush()
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledTimes(2)
    expect(held()).toHaveLength(25)
    await act(async () => {
      fireEvent(screen.getByTestId('venue-upcoming-list'), 'endReached')
    })
    await flush()
    expect(held()).toHaveLength(35)
  })

  it('the day keeps its words: no fixed column to cut "Sat 24 Oct"; the title gives way instead', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValue(page([], null, 5))
    await render(sheet({ total: 5 }))
    await flush()
    const day = screen.getAllByTestId('venue-upcoming-day')[0]
    const title = screen.getAllByTestId('venue-upcoming-title')[0]
    const dayStyle = StyleSheet.flatten(day.props.style)
    expect(dayStyle.width).toBeUndefined()
    expect(dayStyle.flexShrink).toBe(0)
    expect(StyleSheet.flatten(title.props.style).flexShrink).toBe(1)
  })
})

describe('the numbers', () => {
  it('never twice: a page that overlaps what is there adds only what is new', () => {
    expect(appendUpcoming(rows(0, 3), rows(2, 3)).map((r) => r.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
  })

  it('the count is the server’s total when it is at least what the page holds, else what the page holds', () => {
    expect(upcomingCount({ upcoming: [], upcomingTotal: 400 }, 5)).toBe(400)
    expect(upcomingCount({ upcoming: [], upcomingTotal: 3 }, 5)).toBe(5)
    expect(upcomingCount({ upcoming: [] }, 5)).toBe(5)
    expect(upcomingCount({ upcoming: [], upcomingTotal: null }, 0)).toBe(0)
    expect(upcomingCount({ upcoming: [], upcomingTotal: Number.NaN }, 2)).toBe(2)
  })

  it('See all is for more than the three shown', () => {
    expect(hasMoreThanShown(3)).toBe(false)
    expect(hasMoreThanShown(4)).toBe(true)
    expect(hasMoreThanShown(0)).toBe(false)
  })

  it('a page is capped whatever it is sent', () => {
    expect(upcomingRows(events(0, 500)).length).toBe(UPCOMING_MAX)
    expect(upcomingRows(events(0, 500), 20).length).toBe(20)
  })
})
