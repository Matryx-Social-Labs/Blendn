/**
 * RC drive D1: on iOS, expo-notifications' `getPermissionsAsync` blocks Expo's one serial native queue
 * (`expo.modules.AsyncFunctionQueue`) while `usernotificationsd` is stuck, and every later Expo call, SecureStore's among
 * them, waits behind it. A JS timeout frees our await, never the queue.
 *
 * Modelled faithfully here: SecureStore and the permission read share one FIFO queue, and the permission read never
 * answers. The real auth client, the real permission reader, a scripted server.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'active' } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../lib/sentry', () => ({ Sentry: { setUser: jest.fn() } }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn() }))

/** Every native call, in the order it was queued. */
const mockLog: string[] = []
const mockSecure = new Map<string, string>()
/** The serial queue: each call starts when the one before it has finished. */
let mockTail: Promise<unknown> = Promise.resolve()
function mockQueue<T>(name: string, body: () => T | Promise<T>): Promise<T> {
  mockLog.push(name)
  const run = mockTail.then(body)
  mockTail = run.catch(() => {})
  return run
}
const mockNever = () => new Promise<never>(() => {})
/** Whether usernotificationsd answers. The stuck test runs last: a stuck read is remembered for the process. */
let mockAnswers = true
jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => mockQueue(`get ${k}`, () => mockSecure.get(k) ?? null),
  setItemAsync: (k: string, v: string) => mockQueue(`set ${k}`, () => void mockSecure.set(k, v)),
  deleteItemAsync: (k: string) => mockQueue(`delete ${k}`, () => void mockSecure.delete(k)),
}))
jest.mock('expo-notifications', () => ({
  // usernotificationsd never answers: the queue is blocked from here on.
  getPermissionsAsync: () =>
    mockQueue('getPermissionsAsync', () => (mockAnswers ? { status: 'granted', granted: true, canAskAgain: true, expires: 'never' } : mockNever())),
  // A concurrent (Swift `async`) function: off the serial queue.
  setBadgeCountAsync: async () => true,
}))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const auth = require('../lib/useAuth') as typeof import('../lib/useAuth')
const { forgetPushPermission, readPushPermission, PERMISSION_READ_MS } = require('../lib/pushStatus') as typeof import('../lib/pushStatus')
const { setAppIconBadge } = require('../lib/appBadge') as typeof import('../lib/appBadge')
const { PAINT_GRACE_MS } = require('../lib/criticalPath') as typeof import('../lib/criticalPath')
/* eslint-enable @typescript-eslint/no-require-imports */

const ACCESS = 'blendn_access_token'
const REFRESH = 'blendn_refresh_token'
const USER = { id: 'u1', email: 'a@b.c', name: 'Asha' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let signedOutOnServer = 0
/** Holds the sign-out POST until the test lets it answer. */
let mockHoldSignOut: Promise<void> | null = null
let session = 1
beforeEach(() => {
  mockLog.length = 0
  signedOutOnServer = 0
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.endsWith('/auth/signin')) {
      const n = session++
      return json(200, { success: true, data: { user: USER, accessToken: `access-${n}`, refreshToken: `refresh-${n}` } })
    }
    if (u.endsWith('/auth/session')) return json(200, { success: true, data: USER })
    if (u.endsWith('/auth/signout')) {
      if (mockHoldSignOut) await mockHoldSignOut
      signedOutOnServer += 1
      return json(200, { success: true })
    }
    return json(404, { success: false })
  }) as typeof fetch
})
afterEach(() => jest.useRealTimers())

it('reads the permission once a session, however many screens ask', async () => {
  forgetPushPermission()
  const reads = Promise.all([readPushPermission(), readPushPermission(), setAppIconBadge(2)])
  await jest.advanceTimersByTimeAsync(PAINT_GRACE_MS)
  await reads
  await readPushPermission()
  expect(mockLog.filter((c) => c === 'getPermissionsAsync')).toHaveLength(1)
  // Coming back to the app asks the phone again: Settings may have changed it.
  await readPushPermission({ fresh: true })
  expect(mockLog.filter((c) => c === 'getPermissionsAsync')).toHaveLength(2)
})

it('a sign-out still waiting on the server does not clear the session signed in after it', async () => {
  await auth.signInWithEmail('a@b.c', 'pw')
  let answer = () => {}
  mockHoldSignOut = new Promise<void>((resolve) => (answer = resolve))
  const leaving = auth.signOut()
  expect(await auth.getCurrentUser()).toBeNull()
  // Signed straight back in while the old sign-out is still out.
  await auth.signInWithEmail('a@b.c', 'pw')
  const stored = mockSecure.get(ACCESS)
  mockHoldSignOut = null
  answer()
  await expect(leaving).resolves.toEqual({ success: true })
  expect(mockSecure.get(ACCESS)).toBe(stored)
  expect((await auth.getCurrentUser())?.id).toBe(USER.id)
  await auth.signOut()
})

it('signs in, reads the token and signs out with a permission read that never answers, and the read waits for the session', async () => {
  mockAnswers = false
  forgetPushPermission()
  // A screen that wants the permission while the sign-in is in flight (the bell setting the icon's number).
  const signingIn = auth.signInWithEmail('a@b.c', 'pw')
  const badge = setAppIconBadge(3)
  await jest.advanceTimersByTimeAsync(0)
  expect(await signingIn).toEqual({ success: true })
  expect(mockLog).not.toContain('getPermissionsAsync')

  // Token reads still happen: an authenticated request reads the access token from the keychain and goes.
  await expect(apiClient.getSession()).resolves.toMatchObject({ success: true, data: USER })
  expect(mockLog).toContain(`get ${ACCESS}`)

  // Once the session is stored and the first screen has had its grace, the read goes, and never answers.
  await jest.advanceTimersByTimeAsync(PAINT_GRACE_MS)
  const at = mockLog.indexOf('getPermissionsAsync')
  expect(at).toBeGreaterThan(mockLog.indexOf(`set ${ACCESS}`))
  expect(at).toBeGreaterThan(mockLog.indexOf(`set ${REFRESH}`))
  expect(at).toBeGreaterThan(mockLog.indexOf(`get ${ACCESS}`))

  // The UI never waits on it: bounded, then unavailable for the session, and asked no more.
  await jest.advanceTimersByTimeAsync(PERMISSION_READ_MS)
  await expect(badge).resolves.toBeUndefined()
  await expect(readPushPermission({ fresh: true })).resolves.toBe('unavailable')
  expect(mockLog.filter((c) => c === 'getPermissionsAsync')).toHaveLength(1)

  // Sign-out with the queue now blocked: signed out at once, before any keychain call behind the stuck read returns.
  const leaving = auth.signOut()
  expect(await auth.getCurrentUser()).toBeNull()
  // The server half is bounded too: the refresh-token read behind the stuck call times out and sign-out still returns.
  await jest.advanceTimersByTimeAsync(35_000)
  await expect(leaving).resolves.toMatchObject({ success: false })
  // Its keychain deletes are queued (they land when the queue frees), after the sign-in's writes.
  expect(mockLog.lastIndexOf(`delete ${ACCESS}`)).toBeGreaterThan(at)
  expect(signedOutOnServer).toBe(0)
})
