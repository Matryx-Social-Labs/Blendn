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
import { afterSheetDismissed } from '../lib/sheetDismissed'
import { notePaywallClosed, notePathname, openPaywall, openTonight, paywallBlockedAt, registerTonightHost, resetPaywallSession, subscribePaywallClosed } from '../lib/paywall'
/* eslint-enable import/first */

beforeEach(async () => {
  ;(router.push as jest.Mock).mockClear()
  resetPaywallSession()
  await require('@react-native-async-storage/async-storage').clear()
})

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

describe('afterSheetDismissed', () => {
  const os = Platform.OS
  afterEach(() => { Platform.OS = os })

  it('on Android, at once', async () => {
    Platform.OS = 'android'
    await expect(afterSheetDismissed(10_000)).resolves.toBeUndefined()
  })

  it('on iOS, not before the fallback when no tray says it has gone', async () => {
    jest.useFakeTimers()
    try {
      Platform.OS = 'ios'
      let done = false
      void afterSheetDismissed(600).then(() => { done = true })
      await jest.advanceTimersByTimeAsync(599)
      expect(done).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      expect(done).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })
})

/**
 * The Tonight sheet is the contextual door to the same paywall (Flow 12 · 12.1): the same
 * policy, the same places it never opens, and the page when nobody can draw the sheet.
 *
 * Negative controls: routing `openTonight` around `mayShow` fails "an automatic ask is the
 * policy's"; dropping the host check fails "with no host, the page opens instead".
 */
describe('openTonight', () => {
  const stay = { trigger: 'stay' as const, venue: 'Toit' }
  let host: jest.Mock
  let off: () => void
  beforeEach(() => {
    host = jest.fn()
    off = registerTonightHost(host)
    notePathname('/venue/v1')
  })
  afterEach(() => off())

  it('a tap opens the sheet, never the page', async () => {
    expect(await openTonight(stay, { userInitiated: true })).toBe(true)
    expect(host).toHaveBeenCalledWith(stay)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('an automatic ask is the policy’s: once a night, once a session', async () => {
    expect(await openTonight(stay)).toBe(true)
    expect(await openTonight(stay)).toBe(false)
    expect(host).toHaveBeenCalledTimes(1)
  })

  it('an automatic ask never arrives over a chat or the room, but a tap does', async () => {
    notePathname('/chat/abc')
    expect(await openTonight(stay)).toBe(false)
    expect(await openTonight(stay, { userInitiated: true })).toBe(true)
  })

  it.each(['/plus', '/onboarding/basics'])('never opens at %s, not even on a tap', async (path) => {
    notePathname(path)
    expect(await openTonight(stay, { userInitiated: true })).toBe(false)
    expect(host).not.toHaveBeenCalled()
  })

  it('with no host, the page opens instead, on the trigger the sheet counts as', async () => {
    off()
    expect(await openTonight({ trigger: 'night', venue: '' }, { userInitiated: true })).toBe(true)
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'recap' } })
  })

  it('the earlier nights on Going answer with the sheet’s own "night" trigger', async () => {
    expect(await openPaywall('recap', { userInitiated: true })).toBe(true)
    expect(host).toHaveBeenCalledWith({ trigger: 'night', venue: '' })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('every other trigger still opens the page', async () => {
    expect(await openPaywall('profile', { userInitiated: true })).toBe(true)
    expect(host).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith({ pathname: '/plus', params: { trigger: 'profile' } })
  })

  it('hears how the sheet closed: done or dismissed, dismissed by default', () => {
    const heard: string[] = []
    const stop = subscribePaywallClosed((how) => heard.push(how))
    notePaywallClosed('done')
    notePaywallClosed()
    stop()
    notePaywallClosed('done')
    expect(heard).toEqual(['done', 'dismissed'])
  })
})
