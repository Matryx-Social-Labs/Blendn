/**
 * Opus review M3: one permission read slower than PERMISSION_READ_MS left push unregistered for the whole run, and
 * Settings said "off" with a Turn on that could not work. A late answer now registers (without the OS dialog), and a
 * phone that has not answered reads as unknown.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-device', () => ({ isDevice: true }))
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } }))
let mockAnswer: ((v: unknown) => void) | null = null
/** Once set, the phone answers at once. */
let mockNow: unknown = null
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => (mockNow ? Promise.resolve(mockNow) : new Promise((resolve) => (mockAnswer = resolve)))),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[late]' })),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { registerPushToken: jest.fn(async () => ({ success: true })) },
  TokenStorage: { getUser: jest.fn(async () => ({ id: 'u1' })) },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { act, renderHook } from '@testing-library/react-native'
import * as Notifications from 'expo-notifications'

import { apiClient } from '../lib/apiClient'
import { initializePushNotifications } from '../lib/notifications'
import { forgetPushPermission, PERMISSION_READ_MS, useOsPush } from '../lib/pushStatus'

const GRANTED = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' }

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  forgetPushPermission()
})
afterEach(() => jest.useRealTimers())

it('a read that answers late still registers the push token, once, and never with the OS dialog', async () => {
  const first = initializePushNotifications({ prompt: true })
  await jest.advanceTimersByTimeAsync(PERMISSION_READ_MS)
  await expect(first).resolves.toBeNull()
  // A second start (another screen) while it is still stuck waits for the same one run.
  await initializePushNotifications({ prompt: true })
  expect(apiClient.registerPushToken).not.toHaveBeenCalled()

  await act(async () => mockAnswer?.(GRANTED))
  await jest.advanceTimersByTimeAsync(0)
  expect(apiClient.registerPushToken).toHaveBeenCalledTimes(1)
  expect(apiClient.registerPushToken).toHaveBeenCalledWith('ExponentPushToken[late]', expect.any(String))
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
})

it('Settings: a phone that has not answered is unknown, never "off" with a Turn on', async () => {
  // Real time here: the hook renders through act, whose flush waits on timers. One PERMISSION_READ_MS of it.
  jest.useRealTimers()
  const { result } = await renderHook(() => useOsPush())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PERMISSION_READ_MS + 100))
  })
  expect(result.current.known).toBe(false)
  // It answers: Settings learns it on the next read.
  await act(async () => mockAnswer?.(GRANTED))
  mockNow = GRANTED
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current).toMatchObject({ known: true, os: 'granted' })
}, PERMISSION_READ_MS * 3)
