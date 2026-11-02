/**
 * Every request is bounded where it waits before its fetch (SCRUM-754, SCRUM-733): the keychain read of the token, and the
 * shared token refresh. The real client, a keychain that can be made to stall, a scripted server. A stalled keychain is a
 * transport-shaped failure, never "no token": the session is kept, never cleared.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
/** Keys whose read (or write) never answers: a SecureStore queue blocked by another module's call. */
const mockStalledReads = new Set<string>()
const mockStalledWrites = new Set<string>()
/** Writes held in the blocked queue: each lands (in order) when the test unblocks it. */
const mockHeldWrites: (() => void)[] = []
/** A read held until the test answers it. */
let mockHeld: ((value: string) => void) | null = null
let mockHold = false
/** Keys whose read throws, as iOS's keychain does for a locked phone (errSecInteractionNotAllowed). */
const mockLockedReads = new Set<string>()
/** Slots (`key` or `legacy:key`) whose delete throws, as a keychain call that fails mid sign-out. */
const mockFailingDeletes = new Set<string>()
/** Every keychain write and delete, in order, with the accessibility a write asked for. */
const mockOps: string[] = []
/** The keychain service an option names: the old one's items are kept apart, as `legacy:<key>`. */
type MockOptions = { keychainService?: string; keychainAccessible?: string }
const mockSlot = (k: string, o?: MockOptions) => (o?.keychainService === 'blendn.api.auth' ? `legacy:${k}` : k)
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: (k: string, o?: MockOptions) =>
    mockLockedReads.has(k)
      ? Promise.reject(new Error('Keychain: errSecInteractionNotAllowed (-25308)'))
      : mockHold
      ? new Promise((resolve) => (mockHeld = resolve))
      : mockStalledReads.has(k)
        ? new Promise(() => {})
        : Promise.resolve(mockSecure.get(mockSlot(k, o)) ?? null),
  setItemAsync: (k: string, v: string, o?: MockOptions) => {
    mockOps.push(`set ${mockSlot(k, o)} ${o?.keychainAccessible}`)
    return mockStalledWrites.has(k)
      ? new Promise<void>((resolve) => mockHeldWrites.push(() => resolve(void mockSecure.set(k, v))))
      : Promise.resolve(void mockSecure.set(k, v))
  },
  deleteItemAsync: async (k: string, o?: MockOptions) => {
    mockOps.push(`delete ${mockSlot(k, o)}`)
    if (mockFailingDeletes.has(mockSlot(k, o))) throw new Error('Keychain: delete failed')
    mockSecure.delete(mockSlot(k, o))
  },
}))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'active' } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
const mockExpired = jest.fn()
jest.mock('../lib/sessionEvents', () => ({ ...jest.requireActual('../lib/sessionEvents'), markSessionExpired: (...a: unknown[]) => mockExpired(...a) }))
// The deadlines at test scale: a token read 100 ms, the whole refresh 200 ms.
jest.mock('../lib/fetchTimeout', () => ({ ...jest.requireActual('../lib/fetchTimeout'), REQUEST_TIMEOUT_MS: 100 }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage, REFRESH_DEADLINE_MS, SIGN_OUT_READ_MS, SIGN_IN_PERSIST_MS } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { TIMEOUT_MESSAGE } = require('../lib/fetchTimeout') as typeof import('../lib/fetchTimeout')
const { Logger } = require('../lib/logger') as typeof import('../lib/logger')
/* eslint-enable @typescript-eslint/no-require-imports */

const ACCESS = 'blendn_access_token'
const REFRESH = 'blendn_refresh_token'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  mockSecure.clear()
  mockStalledReads.clear()
  mockStalledWrites.clear()
  mockHeldWrites.length = 0
  mockLockedReads.clear()
  mockFailingDeletes.clear()
  mockExpired.mockClear()
  await TokenStorage.setTokens('access-1', 'refresh-1')
  // The keychain as a launch finds it: nothing read into memory yet (RC drive 2 D-A), so every read here asks the keychain.
  TokenStorage.forgetMemory()
  mockOps.length = 0
})
afterEach(async () => {
  // Let the background refresh retries (2 s, 5 s, 10 s) run out inside the test, not after it.
  mockStalledReads.clear()
  mockLockedReads.clear()
  mockStalledWrites.clear()
  global.fetch = jest.fn(async () => json(401, { success: false })) as typeof fetch
  await jest.advanceTimersByTimeAsync(20_000)
  jest.useRealTimers()
})

it('an access-token read that never answers fails the request as a timeout, and keeps the session', async () => {
  global.fetch = jest.fn() as typeof fetch
  mockStalledReads.add(ACCESS)
  const pending = apiClient.getSession()
  await jest.advanceTimersByTimeAsync(100)
  await expect(pending).resolves.toEqual({ success: false, error: TIMEOUT_MESSAGE })
  // Never sent unauthenticated, and never signed out.
  expect(global.fetch).not.toHaveBeenCalled()
  expect(mockSecure.get(REFRESH)).toBe('refresh-1')
  expect(mockExpired).not.toHaveBeenCalled()
})

it('a refresh-token read that never answers is a failed refresh, not a rejected one: the session is kept', async () => {
  global.fetch = jest.fn(async () => json(401, { success: false, error: 'expired' })) as typeof fetch
  mockStalledReads.add(REFRESH)
  const pending = apiClient.getSession()
  await jest.advanceTimersByTimeAsync(100)
  await expect(pending).resolves.toEqual({ success: false, error: TIMEOUT_MESSAGE })
  expect(mockSecure.get(ACCESS)).toBe('access-1')
  expect(mockSecure.get(REFRESH)).toBe('refresh-1')
  expect(mockExpired).not.toHaveBeenCalled()
})

it('a keychain write that never finishes does not hold the refresh: its tokens go at once (RC drive 2 D-A)', async () => {
  let refreshes = 0
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      refreshes += 1
      return json(200, { success: true, data: { accessToken: 'access-2', refreshToken: 'refresh-2' } })
    }
    const bearer = (init?.headers as Record<string, string> | undefined)?.Authorization
    return bearer === 'Bearer access-2' ? json(200, { success: true, data: { id: 'u1' } }) : json(401, { success: false })
  }) as typeof fetch
  // The refresh reaches the server, then storing what it sent never finishes. It used to hold the refresh to its deadline.
  mockStalledWrites.add(ACCESS)
  await expect(apiClient.getSession()).resolves.toMatchObject({ success: true })
  expect(refreshes).toBe(1)
  // Not persisted, and not waited for: the next request sends the new token from memory, with no second refresh.
  expect(mockSecure.get(ACCESS)).toBe('access-1')
  await expect(apiClient.getSession()).resolves.toMatchObject({ success: true })
  expect(refreshes).toBe(1)
  expect(mockExpired).not.toHaveBeenCalled()
})

it('a refresh whose fetch never answers is released at its deadline: the next 401 starts its own (review L1)', async () => {
  let refreshes = 0
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    if (String(url).endsWith('/auth/refresh')) {
      refreshes += 1
      // The server took the request and never answered: only REFRESH_DEADLINE_MS stands between this and forever.
      return new Promise<Response>(() => {})
    }
    return Promise.resolve(json(401, { success: false }))
  }) as typeof fetch
  const first = apiClient.getSession()
  await jest.advanceTimersByTimeAsync(REFRESH_DEADLINE_MS)
  // Released, as a failed refresh: a transport problem, never a sign-out.
  await expect(first).resolves.toEqual({ success: false, error: TIMEOUT_MESSAGE })
  expect(refreshes).toBe(1)
  expect(mockExpired).not.toHaveBeenCalled()

  // The next 401 starts a refresh of its own; joined to the hung one, it would never send.
  const second = apiClient.getSession()
  await jest.advanceTimersByTimeAsync(0)
  expect(refreshes).toBe(2)
  await jest.advanceTimersByTimeAsync(REFRESH_DEADLINE_MS)
  await expect(second).resolves.toEqual({ success: false, error: TIMEOUT_MESSAGE })
})

it('a slow keychain leaves a breadcrumb; a quick one says nothing', async () => {
  const warn = Logger.warn as jest.Mock
  warn.mockClear()
  await TokenStorage.getAccessToken()
  expect(warn).not.toHaveBeenCalledWith('auth', 'keychain:slow', expect.anything())
  TokenStorage.forgetMemory()
  mockHold = true
  const read = TokenStorage.getAccessToken()
  mockHold = false
  await jest.advanceTimersByTimeAsync(2500)
  mockHeld?.('access-1')
  await read
  expect(warn).toHaveBeenCalledWith('auth', 'keychain:slow', expect.objectContaining({ op: 'get', key: ACCESS }))
})

it('a keychain read that lands after a clear never puts the cleared session back in memory (RC drive 2 D-A)', async () => {
  mockHold = true
  const read = TokenStorage.getAccessToken()
  mockHold = false
  await TokenStorage.clearAll()
  mockHeld?.('access-1')
  // Its caller gets what it read (sign-out's POST relies on that); memory keeps the clear.
  await expect(read).resolves.toBe('access-1')
  await expect(TokenStorage.getAccessToken()).resolves.toBeNull()
})

describe('sign-out always finishes (SCRUM-733)', () => {
  it('a refresh-token read that never answers: no POST (it would end every session), the phone is cleared, the server unconfirmed', async () => {
    global.fetch = jest.fn() as typeof fetch
    mockStalledReads.add(REFRESH)
    const pending = apiClient.signOut()
    // Sign-out waits SIGN_OUT_READ_MS for the keychain, not the (here shortened) request deadline.
    await jest.advanceTimersByTimeAsync(SIGN_OUT_READ_MS + 100)
    await expect(pending).resolves.toEqual({ success: false, error: TIMEOUT_MESSAGE })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockSecure.has(ACCESS)).toBe(false)
  })

  it('a keychain that answers signs out this session on the server, then clears', async () => {
    let body: Record<string, unknown> = {}
    global.fetch = jest.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return json(200, { success: true })
    }) as typeof fetch
    await expect(apiClient.signOut()).resolves.toMatchObject({ success: true })
    expect(body.refreshToken).toBe('refresh-1')
    expect(mockSecure.has(REFRESH)).toBe(false)
  })
})

describe('sign-in lands on the Pulse even when the keychain is blocked (SCRUM-903)', () => {
  const USER = 'blendn_user'
  const signedIn = { success: true, data: { accessToken: 'access-2', refreshToken: 'refresh-2', user: { id: 'u2', email: 'b@test' } } }
  /** The keychain's queue is blocked: every write waits, as behind a wedged permission read. */
  const blockWrites = () => [ACCESS, REFRESH, USER].forEach((k) => mockStalledWrites.add(k))
  const unblockWrites = async () => {
    mockStalledWrites.clear()
    mockHeldWrites.splice(0).forEach((land) => land())
    await jest.advanceTimersByTimeAsync(0)
  }

  it('answers the sign-in at SIGN_IN_PERSIST_MS, with the session in memory and a warning', async () => {
    global.fetch = jest.fn(async () => json(200, signedIn)) as typeof fetch
    blockWrites()
    const warn = Logger.warn as jest.Mock
    warn.mockClear()
    const pending = apiClient.signInWithEmail('b@test', 'pw')
    let settled = false
    void pending.then(() => (settled = true))
    await jest.advanceTimersByTimeAsync(SIGN_IN_PERSIST_MS - 1)
    expect(settled).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toMatchObject({ success: true })
    // The new session answers from memory, so the Pulse's first request carries it.
    await expect(TokenStorage.getAccessToken()).resolves.toBe('access-2')
    expect(warn).toHaveBeenCalledWith('auth', 'signIn:persistSlow', expect.objectContaining({ ms: SIGN_IN_PERSIST_MS }))
  })

  it('keeps persisting in the background: when the queue frees, the keychain holds the session', async () => {
    global.fetch = jest.fn(async () => json(200, signedIn)) as typeof fetch
    blockWrites()
    const pending = apiClient.signInWithEmail('b@test', 'pw')
    await jest.advanceTimersByTimeAsync(SIGN_IN_PERSIST_MS)
    await pending
    expect(mockSecure.get(ACCESS)).toBe('access-1')
    // Tokens land, then the user is written (it is issued after them), then the signed-out marker is forgotten.
    await unblockWrites()
    await unblockWrites()
    expect(mockSecure.get(ACCESS)).toBe('access-2')
    expect(mockSecure.get(REFRESH)).toBe('refresh-2')
    expect(JSON.parse(mockSecure.get(USER) ?? '{}')).toMatchObject({ id: 'u2' })
  })

  it('a sign-out while the persist is pending: the old sign-in does not write its user back', async () => {
    global.fetch = jest.fn(async () => json(200, signedIn)) as typeof fetch
    blockWrites()
    const pending = apiClient.signInWithEmail('b@test', 'pw')
    await jest.advanceTimersByTimeAsync(SIGN_IN_PERSIST_MS)
    await pending
    global.fetch = jest.fn(async () => json(200, { success: true })) as typeof fetch
    await apiClient.signOut()
    await unblockWrites()
    await unblockWrites()
    expect(mockSecure.has(USER)).toBe(false)
  })

  it('a keychain that answers costs no wait and no warning', async () => {
    global.fetch = jest.fn(async () => json(200, signedIn)) as typeof fetch
    const warn = Logger.warn as jest.Mock
    warn.mockClear()
    await expect(apiClient.signInWithEmail('b@test', 'pw')).resolves.toMatchObject({ success: true })
    expect(mockSecure.get(ACCESS)).toBe('access-2')
    expect(warn).not.toHaveBeenCalledWith('auth', 'signIn:persistSlow', expect.anything())
  })
})

/*
 * SCRUM-878: iOS launches the app in the background while the phone is locked (prewarming, a push). The tokens were
 * stored WHEN_UNLOCKED_THIS_DEVICE_ONLY, so the keychain refused the read; it was taken for "no token", and the 401 path
 * cleared the session and said "You were signed out" over a live refresh token.
 */
describe('a locked keychain is not a missing token (SCRUM-878)', () => {
  it('a refresh-token read the keychain refuses is a failed refresh: nothing cleared, nobody told they were signed out', async () => {
    global.fetch = jest.fn(async () => json(401, { success: false, error: 'expired' })) as typeof fetch
    mockLockedReads.add(REFRESH)
    await expect(apiClient.refreshSessionOutcome()).resolves.toBe('failed')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockSecure.get(REFRESH)).toBe('refresh-1')
    expect(mockSecure.get(ACCESS)).toBe('access-1')
    expect(mockExpired).not.toHaveBeenCalled()
  })

  it('says which reads it could not make: unknown, never null', async () => {
    mockLockedReads.add(ACCESS)
    await expect(TokenStorage.accessTokenOrUnknown()).resolves.toBeUndefined()
    await expect(TokenStorage.refreshTokenOrUnknown()).resolves.toBe('refresh-1')
    mockLockedReads.clear()
    await expect(TokenStorage.accessTokenOrUnknown()).resolves.toBe('access-1')
  })

  it('stores them readable after the first unlock, in their own service; the older copy goes only once that is written', async () => {
    await TokenStorage.setTokens('access-2', 'refresh-2')
    const AFU = 'afterFirstUnlockThisDeviceOnly'
    expect(mockOps.filter((op) => op.includes(REFRESH))).toEqual([`set ${REFRESH} ${AFU}`, `delete legacy:${REFRESH}`])
    expect(mockSecure.get(REFRESH)).toBe('refresh-2')
  })

  it('an install from an older build: its session is read from the old service, and moved by the next write', async () => {
    mockSecure.clear()
    mockSecure.set(`legacy:${ACCESS}`, 'access-old')
    mockSecure.set(`legacy:${REFRESH}`, 'refresh-old')
    await expect(TokenStorage.refreshTokenOrUnknown()).resolves.toBe('refresh-old')
    await TokenStorage.setTokens('access-new', 'refresh-new')
    expect([...mockSecure.keys()].sort()).toEqual([ACCESS, REFRESH])
    expect(mockSecure.get(REFRESH)).toBe('refresh-new')
  })

  it('a write that never finishes leaves the older copy in place: never a moment with no session stored', async () => {
    mockSecure.clear()
    mockSecure.set(`legacy:${REFRESH}`, 'refresh-old')
    mockStalledWrites.add(REFRESH)
    void TokenStorage.setRefreshToken('refresh-new')
    await jest.advanceTimersByTimeAsync(1000)
    expect(mockSecure.get(`legacy:${REFRESH}`)).toBe('refresh-old')
  })
})

describe('sign-out clears both keychain services (SCRUM-878 review)', () => {
  it('deletes the old copy even when the new delete fails, and reports the clear as incomplete', async () => {
    // An install whose old copy outlived a migration: both services hold the refresh token.
    mockSecure.set(`legacy:${REFRESH}`, 'refresh-old')
    mockFailingDeletes.add(REFRESH)

    const cleared = await TokenStorage.clearAll()

    expect(mockOps).toContain(`delete legacy:${REFRESH}`)
    expect(mockSecure.has(`legacy:${REFRESH}`)).toBe(false)
    // Not fully clear: the "signed out here" marker must stay, so the next launch clears again.
    expect(cleared).toBe(false)
  })

  it('reports a full clear when every delete succeeds', async () => {
    mockSecure.set(`legacy:${REFRESH}`, 'refresh-old')

    expect(await TokenStorage.clearAll()).toBe(true)
    expect(mockSecure.has(`legacy:${REFRESH}`)).toBe(false)
    expect(mockSecure.has(REFRESH)).toBe(false)
  })
})
