/**
 * A launch that cannot reach the server is not a sign-out (P0).
 *
 * `initializeAuth` read `refreshSession()`, a boolean that folds "the server
 * refused the refresh token" and "the server never answered" into one `false`,
 * and cleared the session on either. Opening the app on a train signed people
 * out of a perfectly good session. Driven here through the real module with
 * the API mocked: only 'rejected' clears.
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getSession: jest.fn(),
    refreshSessionOutcome: jest.fn(),
    refreshSession: jest.fn(),
  },
  TokenStorage: {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    accessTokenOrUnknown: jest.fn(),
    refreshTokenOrUnknown: jest.fn(),
    getUser: jest.fn(),
    setUser: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    // No sign-out recorded on this phone (Opus review M2): the launch reads the keychain.
    signedOutHere: jest.fn().mockResolvedValue(false),
    forgetSignedOut: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../lib/sessionEvents', () => ({
  markSessionExpired: jest.fn(),
  subscribeSessionExpired: jest.fn(() => () => {}),
}))
jest.mock('../lib/roomSignal', () => ({ clearRoomSignal: jest.fn(), stopRoomSignalSource: jest.fn() }))
jest.mock('../lib/sentry', () => ({ Sentry: { setUser: jest.fn() } }))
/** The app's foreground: a launch iOS made in the background is told when the person opens it. */
const mockAppState = { currentState: 'background', listeners: [] as ((s: string) => void)[] }
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    get currentState() {
      return mockAppState.currentState
    },
    addEventListener: (_: string, fn: (s: string) => void) => {
      mockAppState.listeners.push(fn)
      return { remove: () => (mockAppState.listeners = mockAppState.listeners.filter((l) => l !== fn)) }
    },
  },
}))
const comeToForeground = () => {
  mockAppState.currentState = 'active'
  mockAppState.listeners.forEach((fn) => fn('active'))
}

import { apiClient, TokenStorage } from '../lib/apiClient'
import { queryCache } from '../lib/queryCache'
import { markSessionExpired } from '../lib/sessionEvents'
import { cleanupAuth, reinitializeAuth, retryAuth } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>
const store = TokenStorage as jest.Mocked<typeof TokenStorage>

const STORED = { id: 'u1', email: 'a@b.c', name: 'Asha' } as never
const OFFLINE = { success: false, error: 'No internet connection. Check your network and try again.' }

beforeEach(() => {
  jest.clearAllMocks()
  cleanupAuth()
  mockAppState.currentState = 'background'
  mockAppState.listeners = []
  store.getAccessToken.mockResolvedValue('access')
  store.accessTokenOrUnknown.mockResolvedValue('access')
  store.refreshTokenOrUnknown.mockResolvedValue('refresh')
})

describe('a launch that cannot reach the server', () => {
  it('keeps the stored user signed in, and leaves the tokens alone', async () => {
    api.getSession.mockResolvedValue(OFFLINE as never)
    api.refreshSessionOutcome.mockResolvedValue('failed')
    store.getUser.mockResolvedValue(STORED)

    const state = await reinitializeAuth()

    expect(state.user).toBe(STORED)
    expect(state.unreachable).toBe(false)
    expect(state.loading).toBe(false)
    expect(store.clearAll).not.toHaveBeenCalled()
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it("says it can’t reach Blend’n when there is no stored user, and still signs nobody out", async () => {
    api.getSession.mockResolvedValue(OFFLINE as never)
    api.refreshSessionOutcome.mockResolvedValue('failed')
    store.getUser.mockResolvedValue(null)

    const state = await reinitializeAuth()

    expect(state.user).toBeNull()
    expect(state.unreachable).toBe(true)
    expect(store.clearAll).not.toHaveBeenCalled()
  })

  it('Try again signs in once the server answers', async () => {
    api.getSession.mockResolvedValueOnce(OFFLINE as never)
    api.refreshSessionOutcome.mockResolvedValueOnce('failed')
    store.getUser.mockResolvedValue(null)
    expect((await reinitializeAuth()).unreachable).toBe(true)

    api.getSession.mockResolvedValueOnce({ success: true, data: STORED } as never)
    const state = await retryAuth()

    expect(state.user).toBe(STORED)
    expect(state.unreachable).toBe(false)
  })

  it('keeps the session when the refresh lands but the re-read does not', async () => {
    api.getSession.mockResolvedValue(OFFLINE as never)
    api.refreshSessionOutcome.mockResolvedValue('ok')
    store.getUser.mockResolvedValue(STORED)

    const state = await reinitializeAuth()

    expect(state.user).toBe(STORED)
    expect(store.clearAll).not.toHaveBeenCalled()
  })
})

describe('a session the server refused', () => {
  it('is cleared, and the entry screen is told why', async () => {
    api.getSession.mockResolvedValue({ success: false, error: 'Unauthorized' } as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    store.getUser.mockResolvedValue(STORED)

    const state = await reinitializeAuth()

    expect(state.user).toBeNull()
    expect(state.unreachable).toBe(false)
    expect(store.clearAll).toHaveBeenCalled()
    expect(markSessionExpired).toHaveBeenCalled()
  })

  it('takes the cached DM threads with it', async () => {
    queryCache.set('private_messages_u1_c1', [{ id: 'm1' }], 60_000)
    api.getSession.mockResolvedValue({ success: false, error: 'Unauthorized' } as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    store.getUser.mockResolvedValue(STORED)

    await reinitializeAuth()

    expect(queryCache.get('private_messages_u1_c1')).toBeNull()
  })

  it('is cleared without another refresh when the 401 path already dropped the tokens', async () => {
    api.getSession.mockResolvedValue({ success: false, error: 'Session expired. Please sign in again.' } as never)
    store.accessTokenOrUnknown.mockResolvedValueOnce('access').mockResolvedValue(null)

    const state = await reinitializeAuth()

    expect(api.refreshSessionOutcome).not.toHaveBeenCalled()
    expect(state.user).toBeNull()
    expect(store.clearAll).toHaveBeenCalled()
  })
})

/*
 * SCRUM-878: iOS launches the app in the background while the phone is locked (a push, prewarming), and the keychain
 * refuses the read. That is not "no session": the launch waits, and reads again once the person opens the app.
 */
describe('a launch whose keychain is locked', () => {
  it('decides nothing while it cannot read, and signs in from the keychain once the app comes to the foreground', async () => {
    store.accessTokenOrUnknown.mockResolvedValueOnce(undefined)
    store.refreshTokenOrUnknown.mockResolvedValueOnce(undefined)
    api.getSession.mockResolvedValue({ success: true, data: STORED } as never)

    const first = await reinitializeAuth()
    expect(first.initialized).toBe(false)
    expect(first.user).toBeNull()
    expect(api.getSession).not.toHaveBeenCalled()

    comeToForeground()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const { getCurrentUser } = jest.requireActual('../lib/useAuth') as typeof import('../lib/useAuth')
    await expect(getCurrentUser()).resolves.toBe(STORED)
    expect(store.clearAll).not.toHaveBeenCalled()
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it('a session the server could not verify, then a keychain that cannot say whether it holds a token: kept, never a sign-out', async () => {
    api.getSession.mockResolvedValue(OFFLINE as never)
    store.accessTokenOrUnknown.mockResolvedValueOnce('access').mockResolvedValueOnce(undefined)
    // What the plain getter makes of a refused read: null, which is the sign-out this must not be.
    store.getAccessToken.mockResolvedValueOnce('access').mockResolvedValue(null)
    // What the real refresh answers when the keychain will not give it the refresh token (keychainBound.test.ts).
    api.refreshSessionOutcome.mockResolvedValue('failed')
    store.getUser.mockResolvedValue(STORED)

    const state = await reinitializeAuth()

    expect(store.clearAll).not.toHaveBeenCalled()
    expect(markSessionExpired).not.toHaveBeenCalled()
    expect(state.user).toBe(STORED)
  })
})
