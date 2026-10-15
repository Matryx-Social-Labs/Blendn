import { act, renderHook } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { goLive: jest.fn() } }))
jest.mock('../lib/checkIn', () => ({ checkInChanged: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('expo-location', () => ({
  hasServicesEnabledAsync: jest.fn(async () => true),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { BestForNavigation: 6 },
}))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import { apiClient } from '../lib/apiClient'
import { useGoLive } from '../lib/useGoLive'
/* eslint-enable import/first */

/**
 * The weak-fix path through the real location helper (step 5 review, H4): a
 * fix the server would accept is sent, a worse one gets a tray whose "Try
 * Again" runs Go Live again, and Precise Location off says so.
 */
const fix = (accuracy: number) => ({ coords: { latitude: 12.97, longitude: 77.59, accuracy }, timestamp: 0 }) as never
const place = { id: 'v1', name: 'The Humming Tree', latitude: 1, longitude: 2 }

async function goLiveOnce(showTray: jest.Mock) {
  const { result } = await renderHook(() => useGoLive({ place, showTray, closeTray: jest.fn() }))
  await act(async () => {
    await result.current.goLive({ minutes: 20 })
  })
}

beforeEach(() => {
  ;(apiClient.goLive as jest.Mock).mockResolvedValue({ success: true, data: { venueDayId: 'd', expiresAt: 'x' } })
})

it('sends a fix the server accepts (80 m) instead of refusing it on the phone', async () => {
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce(fix(80))
  const showTray = jest.fn()
  await goLiveOnce(showTray)
  expect(showTray).not.toHaveBeenCalled()
  expect(apiClient.goLive).toHaveBeenCalledWith('v1', expect.objectContaining({ deviceInfo: expect.objectContaining({ gpsAccuracy: 80 }) }))
})

it('a fix past the server ceiling, then "Try Again" with a good one, goes live (H4)', async () => {
  ;(Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce(fix(400)).mockResolvedValueOnce(fix(10))
  const showTray = jest.fn()
  await goLiveOnce(showTray)
  expect(apiClient.goLive).not.toHaveBeenCalled()
  const buttons = showTray.mock.calls[0][2] as { label: string; onPress: () => void }[]
  await act(async () => {
    buttons.find((b) => b.label === 'Try Again')!.onPress()
    await new Promise((r) => setTimeout(r, 0))
  })
  expect(apiClient.goLive).toHaveBeenCalledTimes(1)
})

it('iOS Precise Location off is said as such, not "move for a better signal" (H4)', async () => {
  ;(Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted', ios: { scope: 'whenInUse', accuracy: 'reduced' } })
  const showTray = jest.fn()
  await goLiveOnce(showTray)
  expect(showTray.mock.calls[0][0]).toBe('Turn on Precise Location')
  expect(apiClient.goLive).not.toHaveBeenCalled()
})
