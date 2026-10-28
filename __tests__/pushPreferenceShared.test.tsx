/**
 * SYS-01: Settings, Notification settings and Notifications each held their own copy of `push_enabled`, loaded once
 * on mount. A write on one left the others stale. One module store now, so every instance agrees.
 */
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/pushStatus', () => ({ useOsPush: () => ({ os: 'granted', known: true, refresh: jest.fn() }) }))
jest.mock('../lib/pushDecline', () => ({ clearPushDeclined: jest.fn(async () => {}) }))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => {}),
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getProfile: jest.fn(async () => ({ success: true, data: { profile: { push_enabled: true } } })),
    updateProfile: jest.fn(async () => ({ success: true })),
  },
}))

import { act, renderHook } from '@testing-library/react-native'

import { apiClient } from '../lib/apiClient'
import { resetPushPreferenceStore, usePushPreference } from '../lib/usePushPreference'

beforeEach(() => {
  resetPushPreferenceStore()
  ;(apiClient.getProfile as jest.Mock).mockClear()
})

it('two instances agree after one writes, and the second does not read the profile again', async () => {
  const a = await renderHook(() => usePushPreference())
  await act(async () => {})
  const b = await renderHook(() => usePushPreference())
  await act(async () => {})
  expect(a.result.current.enabled).toBe(true)
  expect(b.result.current.enabled).toBe(true)
  expect(apiClient.getProfile).toHaveBeenCalledTimes(1)

  await act(async () => a.result.current.toggle())
  expect(a.result.current.enabled).toBe(false)
  expect(b.result.current.enabled).toBe(false)
  expect(b.result.current.off).toBe(true)
})

it('a store older than 30 s is read again on mount', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  try {
    await renderHook(() => usePushPreference())
    await act(async () => {})
    jest.setSystemTime(Date.now() + 31_000)
    await renderHook(() => usePushPreference())
    await act(async () => {})
    expect(apiClient.getProfile).toHaveBeenCalledTimes(2)
  } finally {
    jest.useRealTimers()
  }
})

it('a slow read that lands after a save does not undo it (M1)', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  try {
    const saver = await renderHook(() => usePushPreference())
    await act(async () => {})
    expect(saver.result.current.enabled).toBe(true)
    // The value is stale, so a second screen reads again; that read is slow.
    jest.setSystemTime(Date.now() + 31_000)
    let land: (v: unknown) => void = () => {}
    ;(apiClient.getProfile as jest.Mock).mockReturnValueOnce(new Promise((r) => (land = r)))
    const reader = await renderHook(() => usePushPreference())
    // While it is out, the person turns push off on the first screen.
    await act(async () => saver.result.current.toggle())
    await act(async () => land({ success: true, data: { profile: { push_enabled: true } } }))
    expect(saver.result.current.enabled).toBe(false)
    expect(reader.result.current.enabled).toBe(false)
  } finally {
    jest.useRealTimers()
  }
})
