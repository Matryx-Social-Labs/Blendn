/**
 * The server's sentence survives the sign-out it causes (SCRUM-292).
 *
 * Driven on Android: an admin suspended the account, the phone's refresh got
 * 403 "This account has been suspended…", and the entry screen still said
 * "You were signed out". The sign-out that followed fired requests with no
 * session left — the push-token DELETE, and any other call waiting on the same
 * refresh — each 401'd, and each recorded the generic marker over the
 * sentence. The iOS simulator has no push token, so it sent nothing and
 * passed; a real phone of either kind has one.
 *
 * These drive the real client: a scripted server, real token storage (in
 * memory), the real 401 → refresh path, and the entry screen's read.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockSecure.set(k, v)
  },
  deleteItemAsync: async (k: string) => {
    mockSecure.delete(k)
  },
}))
// apiClient registers an AppState listener on a 1 s module-level timer; with the
// real module that fires after teardown and imports react-native into a dead
// environment. Plain objects keep it harmless.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  consumeSessionEnd,
  consumeSessionEndedNotice,
  markSessionExpired,
  markSessionStarted,
  subscribeSessionExpired,
} from '../lib/sessionEvents'

// apiClient refuses to load without a base URL; imports are hoisted, so require it after.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const SUSPENDED = "This account has been suspended. Contact support@blendn.app if you think that's a mistake."

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const settle = () => new Promise((r) => setTimeout(r, 0))

/** A suspended account: every call 401s, and the refresh says why. */
function suspendedServer(refreshDelayMs = 0) {
  const seen: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push(`${init?.method ?? 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')}`)
    if (url.endsWith('/api/mobile/auth/refresh')) {
      await new Promise((r) => setTimeout(r, refreshDelayMs))
      return json(403, { success: false, error: SUSPENDED })
    }
    return json(401, { success: false, error: 'Unauthorized' })
  }) as typeof fetch
  return seen
}

beforeEach(async () => {
  mockSecure.clear()
  await AsyncStorage.clear()
})

describe('a suspended phone is told why, through the sign-out that follows', () => {
  it("keeps the refresh's sentence when the push-token DELETE 401s after the tokens are gone", async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    const seen = suspendedServer()

    await apiClient.getSession()
    // What _layout does once `user` is null: an authenticated DELETE with no session.
    await apiClient.removePushToken('ExponentPushToken[device]')
    await settle()

    expect(seen).toEqual([
      'GET /api/mobile/auth/session',
      'POST /api/mobile/auth/refresh',
      'DELETE /api/mobile/notifications/token?token=ExponentPushToken%5Bdevice%5D',
    ])
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })

  it('keeps it when several calls 401 at once and share the one refresh', async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    const seen = suspendedServer(20)

    await Promise.all([apiClient.getSession(), apiClient.getSession(), apiClient.getSession()])
    await settle()

    expect(seen.filter((s) => s.startsWith('POST /api/mobile/auth/refresh'))).toHaveLength(1)
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })
})

describe('the notice belongs to one session end', () => {
  it('is not raised again by a call that 401s after the entry screen read it', async () => {
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)

    markSessionExpired()
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(false)
  })

  it('is recorded on a cold start, before this process has seen any sign-in', async () => {
    // A phone relaunched with a stored session: nothing has called
    // markSessionStarted, and the first end may carry no sentence at all.
    let fresh!: typeof import('../lib/sessionEvents')
    jest.isolateModules(() => {
      fresh = require('../lib/sessionEvents')
    })
    fresh.markSessionExpired()
    await settle()
    expect(await fresh.consumeSessionEndedNotice()).toBe(true)
  })

  it('is news again once a new session has begun', async () => {
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()
    await consumeSessionEndedNotice()

    await TokenStorage.setTokens('access-2', 'refresh-2')
    markSessionExpired()
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(true)
  })

  it('is not inherited by the next sign-in when nobody read it', async () => {
    // One person's "suspended" must never greet whoever signs in next on the phone.
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()

    await TokenStorage.setTokens('access-3', 'refresh-3')
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(false)
  })

  it("lets the server's sentence replace a generic marker for the same end", async () => {
    markSessionStarted()
    markSessionExpired()
    markSessionExpired(SUSPENDED)
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })

  it('still tells the app every time, so a signed-in screen is always cleared', () => {
    const heard = jest.fn()
    const unsubscribe = subscribeSessionExpired(heard)
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    markSessionExpired()
    unsubscribe()
    expect(heard).toHaveBeenCalledTimes(2)
  })
})

describe('the reason is typed (Flow 15 15.1 to 15.4)', () => {
  const STAFF = 'This app is for attendees. Organisers, venue owners and sponsors sign in at the dashboard.'

  it('a suspension through the real refresh path is read once as suspended, with the sentence', async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    suspendedServer()
    await apiClient.getSession()
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'suspended', sentence: SUSPENDED })
    expect(await consumeSessionEnd()).toBeNull()
  })

  it('a staff account is told apart from a suspended one by its sentence', async () => {
    markSessionStarted()
    markSessionExpired(STAFF, 'FORBIDDEN')
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'staff', sentence: STAFF })
  })

  it('a code the server names wins over the sentence, and a code alone carries no sentence', async () => {
    markSessionStarted()
    markSessionExpired(undefined, 'SESSION_REVOKED_ELSEWHERE')
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'elsewhere', sentence: undefined })
    markSessionStarted()
    markSessionExpired(undefined, 'PASSWORD_RESET')
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'reset', sentence: undefined })
  })

  it('the generic end is expired, and a specific one replaces it but never the reverse', async () => {
    markSessionStarted()
    markSessionExpired()
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'expired', sentence: undefined })

    markSessionStarted()
    markSessionExpired()
    markSessionExpired(undefined, 'PASSWORD_RESET')
    markSessionExpired()
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'reset', sentence: undefined })
  })

  it('a 401 from the refresh keeps only a named reason, never its own sentence', async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/mobile/auth/refresh')
        ? json(401, { success: false, error: 'Invalid or expired refresh token', errorCode: 'SESSION_REVOKED_ELSEWHERE' })
        : json(401, { success: false, error: 'Unauthorized' })
    ) as typeof fetch
    await apiClient.getSession()
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'elsewhere', sentence: undefined })

    await TokenStorage.setTokens('access-2', 'refresh-2')
    markSessionStarted()
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/mobile/auth/refresh')
        ? json(401, { success: false, error: 'Invalid or expired refresh token', errorCode: 'UNAUTHORIZED' })
        : json(401, { success: false, error: 'Unauthorized' })
    ) as typeof fetch
    await apiClient.getSession()
    await settle()
    expect(await consumeSessionEnd()).toEqual({ reason: 'expired', sentence: undefined })
  })

  it('an end recorded before the reason was kept is classified from its sentence', async () => {
    await AsyncStorage.setItem('blendn.session.endedByServer', STAFF)
    expect(await consumeSessionEnd()).toEqual({ reason: 'staff', sentence: STAFF })
  })
})

describe('every request names the build (Flow 15 15.14), and a refusal to serve it marks the app', () => {
  it('sends X-App-Version, and 426 or UPDATE_REQUIRED marks update required', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gate = require('../lib/updateRequired') as typeof import('../lib/updateRequired')
    gate.resetUpdateRequired()
    let sent: Record<string, string> = {}
    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = init?.headers as Record<string, string>
      return json(426, { success: false, error: 'Update Blend’n', errorCode: 'UPDATE_REQUIRED' })
    }) as typeof fetch
    await apiClient.getSession()
    expect(sent['X-App-Version']).toBeDefined()
    expect(sent['X-App-Version']).not.toBe('')
    expect(gate.isUpdateRequired()).toBe(true)
    expect(gate.isUpdateRefusal(426, undefined)).toBe(true)
    expect(gate.isUpdateRefusal(400, 'UPDATE_REQUIRED')).toBe(true)
    expect(gate.isUpdateRefusal(403, 'FORBIDDEN')).toBe(false)
  })

  it('does not send it from the web build (a custom header there is a preflight the server does not allow yet)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform: { OS: string } }
    const was = Platform.OS
    Platform.OS = 'web'
    try {
      let sent: Record<string, string> = {}
      global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        sent = init?.headers as Record<string, string>
        return json(200, { success: true, data: {} })
      }) as typeof fetch
      await apiClient.getSession()
      expect(Object.keys(sent)).not.toContain('X-App-Version')
    } finally {
      Platform.OS = was
    }
  })
})

describe('the refresh names the reason in reasonCode, beside an errorCode that keeps its old value', () => {
  const refreshAnswers = (status: number, body: Record<string, unknown>) => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/mobile/auth/refresh') ? json(status, { success: false, ...body }) : json(401, { success: false, error: 'Unauthorized' }),
    ) as typeof fetch
  }
  const endedBy = async (status: number, body: Record<string, unknown>) => {
    markSessionStarted()
    await TokenStorage.setTokens('access-1', 'refresh-1')
    refreshAnswers(status, body)
    await apiClient.getSession()
    await settle()
    return (await consumeSessionEnd())?.reason
  }

  it('a 403 FORBIDDEN with ACCOUNT_STAFF is a staff account, even in a sentence the client does not know', async () => {
    expect(await endedBy(403, { error: 'Staff, reworded.', errorCode: 'FORBIDDEN', reasonCode: 'ACCOUNT_STAFF' })).toBe('staff')
  })

  it('a 401 PASSWORD_RESET (both fields) is a reset; SESSION_REVOKED_ELSEWHERE is elsewhere', async () => {
    const body = { error: 'Invalid or expired refresh token' }
    expect(await endedBy(401, { ...body, errorCode: 'PASSWORD_RESET', reasonCode: 'PASSWORD_RESET' })).toBe('reset')
    expect(await endedBy(401, { ...body, errorCode: 'SESSION_REVOKED_ELSEWHERE', reasonCode: 'SESSION_REVOKED_ELSEWHERE' })).toBe('elsewhere')
  })

  it('an old server (errorCode only) is read the same', async () => {
    expect(await endedBy(403, { error: SUSPENDED, errorCode: 'FORBIDDEN' })).toBe('suspended')
    expect(await endedBy(401, { error: 'Invalid or expired refresh token', errorCode: 'PASSWORD_RESET' })).toBe('reset')
  })

  it('a bare 401 learns no reason', async () => {
    expect(await endedBy(401, { error: 'Invalid or expired refresh token', errorCode: 'UNAUTHORIZED' })).toBe('expired')
  })

  it('ApiResponse carries reasonCode through, beside the errorCode', async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    global.fetch = jest.fn(async () => json(403, { success: false, error: 'Finish up first', errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' })) as typeof fetch
    const res = await apiClient.getSession()
    expect(res).toMatchObject({ success: false, errorCode: 'FORBIDDEN', reasonCode: 'PROFILE_INCOMPLETE' })
    global.fetch = jest.fn(async () => json(403, { success: false, error: 'Nope', errorCode: 'FORBIDDEN' })) as typeof fetch
    expect(await apiClient.getSession()).not.toHaveProperty('reasonCode')
  })
})
