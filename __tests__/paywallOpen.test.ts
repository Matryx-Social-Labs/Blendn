/**
 * Where the paywall never opens, even on a tap (review LOW): on top of itself,
 * or over onboarding. And iOS waits for a tray to finish leaving before a
 * native modal is pushed over it (review MEDIUM).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { logPaywallEvent: jest.fn(async () => ({ success: true })) } }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { afterTrayDismissed } from '../components/ActionTray'
import { notePathname, openPaywall, paywallBlockedAt } from '../lib/paywall'
/* eslint-enable import/first */

beforeEach(() => (router.push as jest.Mock).mockClear())

it.each(['/plus', '/onboarding/welcome', '/onboarding'])('never opens at %s, not even on a tap', async (path) => {
  notePathname(path)
  expect(paywallBlockedAt(path)).toBe(true)
  expect(await openPaywall('profile', { userInitiated: true })).toBe(false)
  expect(router.push).not.toHaveBeenCalled()
})

it('opens on a tap anywhere else', async () => {
  notePathname('/settings')
  expect(await openPaywall('profile', { userInitiated: true })).toBe(true)
  expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile' } })
})

describe('afterTrayDismissed', () => {
  const os = Platform.OS
  afterEach(() => { Platform.OS = os })

  it('on Android, at once', async () => {
    Platform.OS = 'android'
    await expect(afterTrayDismissed(10_000)).resolves.toBeUndefined()
  })

  it('on iOS, not before the fallback when no tray says it has gone', async () => {
    jest.useFakeTimers()
    try {
      Platform.OS = 'ios'
      let done = false
      void afterTrayDismissed(600).then(() => { done = true })
      await jest.advanceTimersByTimeAsync(599)
      expect(done).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      expect(done).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })
})
