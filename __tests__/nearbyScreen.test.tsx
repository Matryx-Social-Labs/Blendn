/**
 * Nearby (Flow 3 `nearby`): the list nearest first with the distance leading each row, and each of the states the
 * frame draws as a StateScreen. The loading state is the static 72 pt rows; offline is the DS banner.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), navigate: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}))
jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvent: jest.fn(() => Promise.resolve({})) } }))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: jest.fn(() => Promise.resolve({ city: 'Bengaluru' })) }))
jest.mock('../lib/useMinimumVisible', () => ({ useMinimumVisible: (on: boolean) => on }))
jest.mock('../lib/photoUtils', () => ({ getOptimizedImageUrl: () => null }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn(() => Promise.resolve()), OptimizedImage: 'View' }))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { Linking, Platform } from 'react-native'
import NearbyEventsScreen from '../app/nearby-events'
import { getEvents } from '../lib/api'
import { markOffline, markOnline } from '../lib/networkStatus'
/* eslint-enable import/first */

const events = getEvents as jest.Mock
const mockLocation = Location as jest.Mocked<typeof Location>
const ev = (id: string, title: string, lat: number) => ({
  id,
  title,
  venue_name: 'Toit',
  latitude: lat,
  longitude: 77.6,
  start_time: new Date(Date.now() + 3_600_000).toISOString(),
  end_time: new Date(Date.now() + 7_200_000).toISOString(),
  cover_image_url: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  markOnline()
  mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never)
  mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never)
  mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.6 } } as never)
  // A first open with nothing cached: the fix has to be asked for.
  mockLocation.getLastKnownPositionAsync.mockResolvedValue(null)
  mockLocation.hasServicesEnabledAsync.mockResolvedValue(true)
})

const open = async () => {
  await render(<NearbyEventsScreen />)
  await act(async () => {})
}

it('lists the nearest first, each row led by its distance, and a tap opens the Scene', async () => {
  events.mockResolvedValue({ data: [ev('far', 'Far Night', 13.2), ev('near', 'Near Night', 12.975)], error: null })
  await open()
  const rows = await screen.findAllByRole('button', { name: /Night/ })
  expect(rows[0].props.accessibilityLabel).toMatch(/^Near Night/)
  expect(screen.getByTestId('nearby-near-lead')).toBeTruthy()
  await fireEvent.press(rows[0])
  expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/event/[id]', params: expect.objectContaining({ id: 'near' }) }))
})

it('shows the static rows while loading, busy', async () => {
  events.mockReturnValue(new Promise(() => {}))
  await open()
  expect(screen.getByTestId('nearby-skeleton').props.accessibilityState).toMatchObject({ busy: true })
})

it('denied: says why, and Open Settings goes to the settings', async () => {
  mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never)
  const open_ = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
  await open()
  expect(await screen.findByText('Location access needed')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }))
  expect(open_).toHaveBeenCalled()
})

it('permission but no fix by the deadline: "Location unavailable" with Try again, not an empty city', async () => {
  jest.useFakeTimers()
  try {
    mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error('no fix'))
    await open()
    for (let i = 0; i < 20; i++) await act(async () => jest.advanceTimersByTime(1_000))
    expect(screen.getByText('Location unavailable')).toBeTruthy()
    expect(screen.queryByText('No nearby events')).toBeNull()
  } finally {
    jest.useRealTimers()
  }
  mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.6 } } as never)
  events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Alpha Night/ })).toBeTruthy())
})

it('a first ask refused while the phone is still looking keeps the loading rows, and the fix that follows lists (drive 4 D-10)', async () => {
  jest.useFakeTimers()
  try {
    // Arrange: nothing cached; iOS refuses the first ask ("location unknown"), the second has a fix.
    mockLocation.getCurrentPositionAsync
      .mockRejectedValueOnce(Object.assign(new Error('Location unknown'), { code: 'E_LOCATION_UNAVAILABLE' }))
      .mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.6 } } as never)
    events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })

    // Act
    await open()

    // Assert: still loading, never the error, then the list.
    expect(screen.getByTestId('nearby-skeleton')).toBeTruthy()
    expect(screen.queryByText('Location unavailable')).toBeNull()
    for (let i = 0; i < 3; i++) await act(async () => jest.advanceTimersByTime(1_000))
    expect(screen.queryByText('Location unavailable')).toBeNull()
    expect(screen.getByRole('button', { name: /Alpha Night/ })).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

it('leaving while it still looks stops the asking (review LOW-4)', async () => {
  jest.useFakeTimers()
  try {
    mockLocation.getCurrentPositionAsync.mockRejectedValue(Object.assign(new Error('Location unknown'), { code: 'E_LOCATION_UNAVAILABLE' }))
    await open()
    await act(async () => jest.advanceTimersByTime(1_000))
    const asked = mockLocation.getCurrentPositionAsync.mock.calls.length
    await screen.unmount()
    for (let i = 0; i < 5; i++) await act(async () => jest.advanceTimersByTime(1_000))
    expect(mockLocation.getCurrentPositionAsync.mock.calls.length).toBe(asked)
  } finally {
    jest.useRealTimers()
  }
})

it('a recent fix the phone already has is used at once', async () => {
  mockLocation.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.6 }, timestamp: Date.now() } as never)
  events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })
  await open()
  expect(await screen.findByRole('button', { name: /Alpha Night/ })).toBeTruthy()
  expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled()
})

it('Location Services off is said at once, not after the deadline', async () => {
  mockLocation.hasServicesEnabledAsync.mockResolvedValue(false)
  await open()
  expect(await screen.findByText('Location unavailable')).toBeTruthy()
  expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled()
})

it('a fix that never comes is "Location unavailable" after 15 s, not a skeleton for ever', async () => {
  jest.useFakeTimers()
  try {
    mockLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}) as never)
    await open()
    expect(screen.getByTestId('nearby-skeleton')).toBeTruthy()
    await act(async () => {
      jest.advanceTimersByTime(15_000)
    })
    await act(async () => {
      jest.advanceTimersByTime(1_000)
    })
    expect(screen.getByText('Location unavailable')).toBeTruthy()
    expect(screen.queryByTestId('nearby-skeleton')).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

it('a failed load is "Couldn’t load events"; an empty one offers Browse events', async () => {
  events.mockResolvedValue({ data: null, error: new Error('x') })
  await open()
  expect(await screen.findByText('Couldn’t load events')).toBeTruthy()
  events.mockResolvedValue({ data: [], error: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('No nearby events')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Browse events' }))
  expect(router.navigate).toHaveBeenCalledWith('/(tabs)/events')
})

it('says it is offline over the list it still shows', async () => {
  events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })
  await open()
  expect(screen.queryByTestId('nearby-offline')).toBeNull()
  await act(async () => markOffline())
  expect(screen.getByText('Offline. Showing what you had.')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Alpha Night/ })).toBeTruthy()
})

describe('the header', () => {
  const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  afterEach(() => on('ios'))

  it('iOS centres a 17 pt title (the condensed bar); Android keeps it beside Back', async () => {
    events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })
    on('ios')
    const view = await render(<NearbyEventsScreen />)
    await act(async () => {})
    expect(screen.getByTestId('nearby-top-condensed')).toBeTruthy()
    await view.unmount()
    on('android')
    await render(<NearbyEventsScreen />)
    await act(async () => {})
    expect(screen.queryByTestId('nearby-top-condensed')).toBeNull()
  })
})

describe('a city with hundreds of events (large data)', () => {
  const full = Array.from({ length: 50 }, (_, i) => ev(`a${i}`, `Night ${i}`, 12.9 + i / 1000))
  const nextPage = [ev('b0', 'Later 0', 13.1), ev('b1', 'Later 1', 13.11), ev('a49', 'Night 49', 12.949)]
  const atEnd = async () => {
    await fireEvent(screen.getByTestId('nearby-list'), 'endReached')
    await act(async () => {})
  }

  it('reads the first page by size, and the next only when the reader reaches the end, from the same fix and city', async () => {
    events.mockResolvedValueOnce({ data: full, error: null }).mockResolvedValueOnce({ data: nextPage, error: null })
    await open()
    expect(events).toHaveBeenCalledTimes(1)
    expect(events.mock.calls[0][0]).toMatchObject({ page: 0, limit: 50, sortBy: 'distance', city: 'Bengaluru' })
    await atEnd()
    expect(events).toHaveBeenCalledTimes(2)
    expect(events.mock.calls[1][0]).toMatchObject({ page: 1, limit: 50, sortBy: 'distance', city: 'Bengaluru', lat: 12.97, lon: 77.6 })
  })

  it('a short page is the last: reaching the end again asks for nothing', async () => {
    events.mockResolvedValueOnce({ data: full, error: null }).mockResolvedValueOnce({ data: nextPage, error: null })
    await open()
    await atEnd()
    await atEnd()
    expect(events).toHaveBeenCalledTimes(2)
  })

  it('a city of fewer than a page never asks for a second', async () => {
    events.mockResolvedValue({ data: [ev('a', 'A', 12.98), ev('b', 'B', 12.99)], error: null })
    await open()
    await atEnd()
    expect(events).toHaveBeenCalledTimes(1)
  })

  it('a refused page says so at the foot, keeps the rows, and is asked again only by that foot', async () => {
    events.mockResolvedValueOnce({ data: full, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await open()
    await atEnd()
    expect(await screen.findByTestId('nearby-more-failed')).toBeTruthy()
    expect(screen.getByTestId('nearby-a49')).toBeTruthy()
    // The scroll does not ask again by itself.
    await atEnd()
    expect(events).toHaveBeenCalledTimes(2)
    events.mockResolvedValueOnce({ data: nextPage, error: null })
    await fireEvent.press(screen.getByTestId('nearby-more-failed'))
    await waitFor(() => expect(events).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByTestId('nearby-more-failed')).toBeNull())
  })
})

describe('two triggers in one frame (Nearby)', () => {
  it('the list\'s end firing twice asks for the next page once, and the page after it is the third', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ev(`a${i}`, `Night ${i}`, 12.9 + i / 1000))
    const second = Array.from({ length: 50 }, (_, i) => ev(`b${i}`, `Later ${i}`, 13.1 + i / 1000))
    events.mockResolvedValueOnce({ data: full, error: null }).mockResolvedValueOnce({ data: second, error: null }).mockResolvedValue({ data: [], error: null })
    await open()
    await act(async () => {
      fireEvent(screen.getByTestId('nearby-list'), 'endReached')
      fireEvent(screen.getByTestId('nearby-list'), 'endReached')
    })
    await act(async () => {})
    expect(events).toHaveBeenCalledTimes(2)
    await act(async () => {
      fireEvent(screen.getByTestId('nearby-list'), 'endReached')
    })
    await act(async () => {})
    expect(events.mock.calls[2][0]).toMatchObject({ page: 2 })
  })
})

describe('Nearby sort and bound (BAR-11, BAR-14)', () => {
  it('Nearest asks for the week the Pulse section covers', async () => {
    events.mockResolvedValue({ data: [ev('a', 'A Night', 12.98)], error: null })
    await open()
    await screen.findByTestId('nearby-list')
    const q = events.mock.calls[0][0]
    expect(q).toMatchObject({ sortBy: 'distance' })
    const days = (Date.parse(q.endDate) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThanOrEqual(7.05)
  })

  it('Soonest switches the query to start time, keeps the fix, and drops the date bound', async () => {
    events.mockResolvedValue({ data: [ev('a', 'A Night', 12.98)], error: null })
    await open()
    await screen.findByTestId('nearby-list')
    events.mockClear()
    await fireEvent.press(screen.getByRole('tab', { name: 'Soonest' }))
    await waitFor(() => expect(events).toHaveBeenCalled())
    expect(events.mock.calls[0][0]).toMatchObject({ page: 0, sortBy: 'start_time', lat: 12.97, lon: 77.6, city: 'Bengaluru' })
    expect(events.mock.calls[0][0].endDate).toBeUndefined()
  })
})
