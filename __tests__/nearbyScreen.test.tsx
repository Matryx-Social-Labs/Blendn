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

it('permission but no fix: "Location unavailable" with Try again, not an empty city', async () => {
  mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error('no fix'))
  await open()
  expect(await screen.findByText('Location unavailable')).toBeTruthy()
  expect(screen.queryByText('No nearby events')).toBeNull()
  mockLocation.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 12.97, longitude: 77.6 } } as never)
  events.mockResolvedValue({ data: [ev('a', 'Alpha Night', 12.98)], error: null })
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Alpha Night/ })).toBeTruthy())
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
