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
    getUser: jest.fn(),
    setUser: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('../lib/sessionEvents', () => ({
  markSessionExpired: jest.fn(),
  subscribeSessionExpired: jest.fn(() => () => {}),
}))
jest.mock('../lib/roomSignal', () => ({ clearRoomSignal: jest.fn() }))
jest.mock('../lib/sentry', () => ({ Sentry: { setUser: jest.fn() } }))

import { apiClient, TokenStorage } from '../lib/apiClient'
import { markSessionExpired } from '../lib/sessionEvents'
import { cleanupAuth, reinitializeAuth, retryAuth } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>
const store = TokenStorage as jest.Mocked<typeof TokenStorage>

const STORED = { id: 'u1', email: 'a@b.c', name: 'Asha' } as never
const OFFLINE = { success: false, error: 'No internet connection. Check your network and try again.' }

beforeEach(() => {
  jest.clearAllMocks()
  cleanupAuth()
  store.getAccessToken.mockResolvedValue('access')
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

  it("says it can't reach Blend'n when there is no stored user, and still signs nobody out", async () => {
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

  it('is cleared without another refresh when the 401 path already dropped the tokens', async () => {
    api.getSession.mockResolvedValue({ success: false, error: 'Session expired. Please sign in again.' } as never)
    store.getAccessToken.mockResolvedValueOnce('access').mockResolvedValue(null)

    const state = await reinitializeAuth()

    expect(api.refreshSessionOutcome).not.toHaveBeenCalled()
    expect(state.user).toBeNull()
    expect(store.clearAll).toHaveBeenCalled()
  })
})
