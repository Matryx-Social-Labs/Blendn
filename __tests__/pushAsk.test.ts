/** The in-context push ask (Flow 9 · 9.7): once per moment, only a phone that can still be asked, never after a no. */
const mockPerm = jest.fn()
jest.mock('expo-notifications', () => ({ getPermissionsAsync: () => mockPerm() }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/apiClient', () => ({ TokenStorage: { getUser: jest.fn(async () => ({ id: 'me' })) } }))
jest.mock('../lib/notifications', () => ({ initializePushNotifications: jest.fn(async () => 'token') }))
jest.mock('../lib/pushDecline', () => ({
  clearPushDeclined: jest.fn(async () => {}),
  markPushDeclined: jest.fn(async () => {}),
  hasDeclinedPush: jest.fn(async () => false),
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn() } }))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { TokenStorage } from '../lib/apiClient'
import { initializePushNotifications } from '../lib/notifications'
import { ASK_COPY, askPushInContext } from '../lib/pushAsk'
import { clearPushDeclined, hasDeclinedPush, markPushDeclined } from '../lib/pushDecline'
import { showSheet, type ActionSheet } from '../lib/sheet'
import { forgetPushPermission } from '../lib/pushStatus'

beforeEach(async () => {
  // The permission is read once a session (RC drive D1): each test is a new one.
  forgetPushPermission()
  jest.clearAllMocks()
  await AsyncStorage.clear()
  ;(hasDeclinedPush as jest.Mock).mockReset().mockResolvedValue(false)
  ;(markPushDeclined as jest.Mock).mockReset().mockResolvedValue(undefined)
  mockPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
})

const sheet = () => (showSheet as jest.Mock).mock.calls[0][0] as ActionSheet

describe('askPushInContext', () => {
  it('asks after a going RSVP in the frame’s words, and after a first like in its own', async () => {
    expect(await askPushInContext('rsvp')).toBe(true)
    expect(sheet().title).toBe('Want a heads-up if the time or venue changes?')
    jest.clearAllMocks()
    expect(await askPushInContext('like')).toBe(true)
    expect(sheet().title).toBe('Want to know when it’s mutual?')
    expect(ASK_COPY.like.body).toMatch(/Nothing for likes you haven’t returned/)
  })

  it('asks once per moment, whatever the answer', async () => {
    await askPushInContext('rsvp')
    expect(await askPushInContext('rsvp')).toBe(false)
    expect(showSheet).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['allowed', { status: 'granted', canAskAgain: true }],
    ['refused for good', { status: 'denied', canAskAgain: false }],
  ])('never asks a phone that is %s, and does not spend the moment on it', async (_n, perm) => {
    mockPerm.mockResolvedValue(perm)
    expect(await askPushInContext('rsvp')).toBe(false)
    expect(showSheet).not.toHaveBeenCalled()
    // The phone's answer changes (read again in a later session, or on the return from its Settings).
    forgetPushPermission()
    mockPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    expect(await askPushInContext('rsvp')).toBe(true)
  })

  it('asks nobody who is signed out', async () => {
    ;(TokenStorage.getUser as jest.Mock).mockResolvedValueOnce(null)
    expect(await askPushInContext('rsvp')).toBe(false)
  })

  it('Continue clears a “maybe later” and registers (which asks the OS); Not now asks nothing', async () => {
    await askPushInContext('like')
    expect(initializePushNotifications).not.toHaveBeenCalled()
    ;(sheet().actions.find((a) => a.label === 'Continue') as { then: () => void }).then()
    await new Promise((r) => setImmediate(r))
    expect(clearPushDeclined).toHaveBeenCalledWith('me')
    expect(initializePushNotifications).toHaveBeenCalledTimes(1)
  })

  it('a no from onboarding (or anywhere) is a no: no RSVP ask, and the moment is not spent', async () => {
    ;(hasDeclinedPush as jest.Mock).mockResolvedValueOnce(true)
    expect(await askPushInContext('rsvp')).toBe(false)
    expect(showSheet).not.toHaveBeenCalled()
    expect(await askPushInContext('rsvp')).toBe(true)
  })

  it('Not now records the no, and a no at the RSVP means no like ask', async () => {
    const declined = new Set<string>()
    ;(markPushDeclined as jest.Mock).mockImplementation(async (id: string) => void declined.add(id))
    ;(hasDeclinedPush as jest.Mock).mockImplementation(async (id: string) => declined.has(id))
    await askPushInContext('rsvp')
    ;(sheet().actions.find((a) => a.label === 'Not now') as { then: () => void }).then()
    expect(markPushDeclined).toHaveBeenCalledWith('me')
    ;(showSheet as jest.Mock).mockClear()
    expect(await askPushInContext('like')).toBe(false)
    expect(showSheet).not.toHaveBeenCalled()
  })
})
