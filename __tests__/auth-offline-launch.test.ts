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
    signOut: jest.fn().mockResolvedValue({ success: true }),
    signInWithEmail: jest.fn(),
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
import { markSessionExpired, subscribeSessionExpired } from '../lib/sessionEvents'
import { cleanupAuth, getCurrentUser, refreshAuthUser, reinitializeAuth, retryAuth, signInWithEmail, signOut } from '../lib/useAuth'

/** What `useAuth` subscribed at import: run by `request()` when its own 401 finds the session refused. */
const sessionExpired = (subscribeSessionExpired as jest.Mock).mock.calls[0][0] as () => void

const api = apiClient as jest.Mocked<typeof apiClient>
const store = TokenStorage as jest.Mocked<typeof TokenStorage>

const STORED = { id: 'u1', email: 'a@b.c', name: 'Asha' } as never
const OFFLINE = { success: false, error: 'No internet connection. Check your network and try again.' }
const TIMED_OUT = { success: false, error: 'This is taking too long. Check your connection and try again.' }
const REFUSED = { success: false, error: 'Session expired. Please sign in again.' }

/** Every mocked answer is already settled: one macrotask lets the launch's session check run to its end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
/** Reads still out at the end of a test: answered then, so a failed test leaves no launch in flight for the next. */
const outstanding: (() => void)[] = []
/** A session read the test answers when it chooses: the check still out. */
const held = <T,>() => {
  let answer!: (value: T) => void
  const promise = new Promise<T>((resolve) => (answer = resolve))
  outstanding.push(() => answer(OFFLINE as T))
  return { promise, answer }
}
afterEach(async () => {
  outstanding.splice(0).forEach((answer) => answer())
  await settle()
})
/** The launch's state, or 'waiting' while it is still on the logo. */
const launch = () => Promise.race([reinitializeAuth(), settle().then(() => 'waiting' as const)])

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
    await settle()

    expect(state.user).toBe(STORED)
    expect(state.unreachable).toBe(false)
    expect(state.loading).toBe(false)
    expect(await getCurrentUser()).toBe(STORED)
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

    await reinitializeAuth()
    await settle()

    expect(await getCurrentUser()).toBe(STORED)
    expect(store.clearAll).not.toHaveBeenCalled()
  })
})

describe('a session the server refused', () => {
  it('is cleared, and the entry screen is told why', async () => {
    api.getSession.mockResolvedValue({ success: false, error: 'Unauthorized' } as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    store.getUser.mockResolvedValue(STORED)

    await reinitializeAuth()
    await settle()

    expect(await getCurrentUser()).toBeNull()
    expect(store.clearAll).toHaveBeenCalled()
    expect(markSessionExpired).toHaveBeenCalled()
  })

  it('takes the cached DM threads with it', async () => {
    queryCache.set('private_messages_u1_c1', [{ id: 'm1' }], 60_000)
    api.getSession.mockResolvedValue({ success: false, error: 'Unauthorized' } as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    store.getUser.mockResolvedValue(STORED)

    await reinitializeAuth()
    await settle()

    expect(queryCache.get('private_messages_u1_c1')).toBeNull()
  })

  it('is cleared without another refresh when the 401 path already dropped the tokens', async () => {
    api.getSession.mockResolvedValue({ success: false, error: 'Session expired. Please sign in again.' } as never)
    store.accessTokenOrUnknown.mockResolvedValueOnce('access').mockResolvedValue(null)

    await reinitializeAuth()
    await settle()

    expect(api.refreshSessionOutcome).not.toHaveBeenCalled()
    expect(await getCurrentUser()).toBeNull()
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
    // A user stored from the last sign-in does not open the app past a keychain that cannot say whether the session is there.
    store.getUser.mockResolvedValue(STORED)

    const first = await reinitializeAuth()
    expect(first.initialized).toBe(false)
    expect(first.user).toBeNull()
    expect(first.loading).toBe(true)
    expect(api.getSession).not.toHaveBeenCalled()
    expect(store.getUser).not.toHaveBeenCalled()

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

    await reinitializeAuth()
    await settle()

    expect(store.clearAll).not.toHaveBeenCalled()
    expect(markSessionExpired).not.toHaveBeenCalled()
    expect(await getCurrentUser()).toBe(STORED)
  })
})

/*
 * SCRUM-1187: a returning person opens straight into the app. With a user stored from the last sign-in and a refresh token
 * to renew the session, the launch signs in from them at once, and the session check runs behind it. Only the server
 * refusing the session signs out; every answer that says nothing about it keeps the person signed in.
 */
describe('a stored sign-in opens the app before the session check answers (SCRUM-1187)', () => {
  const SERVER = { id: 'u1', email: 'a@b.c', name: 'Asha R' } as never

  beforeEach(() => store.getUser.mockResolvedValue(STORED))

  it('is signed in as the stored user, off the logo, while the session read is still out', async () => {
    api.getSession.mockReturnValue(held<unknown>().promise as never)

    const state = await launch()

    expect(state).not.toBe('waiting')
    expect(state).toMatchObject({ user: STORED, loading: false, initialized: true, unreachable: false })
    expect(store.clearAll).not.toHaveBeenCalled()
  })

  it("accepted: the server's copy of the user replaces the stored one when it lands", async () => {
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    expect(await launch()).toMatchObject({ user: STORED, loading: false })

    session.answer({ success: true, data: SERVER })
    await settle()

    expect(await getCurrentUser()).toBe(SERVER)
    expect(store.setUser).toHaveBeenCalledWith(SERVER)
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it("rejected: signed out with the expiry notice once the server refuses the session, and by nothing else", async () => {
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    expect(await launch()).toMatchObject({ user: STORED, loading: false })
    expect(store.clearAll).not.toHaveBeenCalled()

    session.answer({ success: false, error: 'Unauthorized' })
    await settle()

    expect(await getCurrentUser()).toBeNull()
    expect(markSessionExpired).toHaveBeenCalledTimes(1)
    expect(store.clearAll).toHaveBeenCalledTimes(1)
  })

  it('rejected after a refresh that landed: a re-read the 401 path ended is a sign-out too', async () => {
    api.getSession.mockResolvedValueOnce(TIMED_OUT as never).mockResolvedValueOnce(REFUSED as never)
    api.refreshSessionOutcome.mockResolvedValue('ok')
    // Read at the launch, before the refresh; after the re-read's 401 the client has dropped the tokens.
    store.accessTokenOrUnknown.mockResolvedValueOnce('access').mockResolvedValueOnce('access').mockResolvedValue(null)

    expect(await launch()).toMatchObject({ user: STORED, loading: false })
    await settle()

    expect(await getCurrentUser()).toBeNull()
    expect(markSessionExpired).toHaveBeenCalledTimes(1)
    expect(api.refreshSessionOutcome).toHaveBeenCalledTimes(1)
    expect(api.getSession).toHaveBeenCalledTimes(2)
  })

  it("a refresh that lands, then a re-read that lands: the server's user replaces the stored one", async () => {
    api.getSession.mockResolvedValueOnce(TIMED_OUT as never).mockResolvedValueOnce({ success: true, data: SERVER } as never)
    api.refreshSessionOutcome.mockResolvedValue('ok')

    expect(await launch()).toMatchObject({ user: STORED, loading: false })
    await settle()

    expect(await getCurrentUser()).toBe(SERVER)
  })

  it('a check that throws keeps the stored sign-in and clears nothing', async () => {
    api.getSession.mockRejectedValue(new Error('boom'))

    expect(await launch()).toMatchObject({ user: STORED, loading: false })
    await settle()

    expect(await getCurrentUser()).toBe(STORED)
    expect(store.clearAll).not.toHaveBeenCalled()
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it("a refusal another request found first: signed out once, and the check's late refusal adds nothing", async () => {
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    expect(await launch()).toMatchObject({ user: STORED })

    // `request()` met the refusal on a screen's read: it recorded the notice itself and told `useAuth`.
    sessionExpired()
    expect(await getCurrentUser()).toBeNull()
    session.answer({ success: false, error: 'Unauthorized' })
    await settle()

    expect(store.clearAll).toHaveBeenCalledTimes(1)
    expect(markSessionExpired).not.toHaveBeenCalled()
  })

  it("a fresher read of the user that lands first is not overwritten by the check's late answer", async () => {
    const FRESHER = { id: 'u1', email: 'a@b.c', name: 'Asha Rao' } as never
    const session = held<unknown>()
    api.getSession.mockReturnValueOnce(session.promise as never).mockResolvedValueOnce({ success: true, data: FRESHER } as never)
    expect(await launch()).toMatchObject({ user: STORED })

    await refreshAuthUser()
    session.answer({ success: true, data: SERVER })
    await settle()

    expect(await getCurrentUser()).toBe(FRESHER)
  })

  it.each([
    ['a network error', OFFLINE],
    ['a timeout', TIMED_OUT],
  ])('%s: stays signed in as the stored user, signs nobody out, and asks once, not in a loop', async (_, failure) => {
    jest.useFakeTimers()
    try {
      const session = held<unknown>()
      api.getSession.mockReturnValueOnce(session.promise as never)
      api.refreshSessionOutcome.mockResolvedValue('failed')
      const opened = reinitializeAuth()
      await jest.advanceTimersByTimeAsync(0)
      expect(await opened).toMatchObject({ user: STORED, loading: false })

      session.answer(failure)
      await jest.advanceTimersByTimeAsync(10 * 60_000)

      expect(await getCurrentUser()).toBe(STORED)
      expect(store.clearAll).not.toHaveBeenCalled()
      expect(markSessionExpired).not.toHaveBeenCalled()
      expect(api.getSession).toHaveBeenCalledTimes(1)
      expect(api.refreshSessionOutcome).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('no stored user: waits on the session read as before, then says it cannot reach Blend’n', async () => {
    store.getUser.mockResolvedValue(null)
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    api.refreshSessionOutcome.mockResolvedValue('failed')

    const opening = reinitializeAuth()
    expect(await Promise.race([opening, settle().then(() => 'waiting')])).toBe('waiting')

    session.answer(OFFLINE)
    expect(await opening).toMatchObject({ user: null, unreachable: true, loading: false })
    expect(store.clearAll).not.toHaveBeenCalled()
  })

  it('a stored user but no refresh token: no sign-in from it, the launch waits for the server as before', async () => {
    store.refreshTokenOrUnknown.mockResolvedValue(null)
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)

    const opening = reinitializeAuth()
    expect(await Promise.race([opening, settle().then(() => 'waiting')])).toBe('waiting')

    session.answer({ success: true, data: SERVER })
    expect(await opening).toMatchObject({ user: SERVER, loading: false })
  })

  it('a sign-out while the check is out is not undone by its late answer', async () => {
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    expect(await launch()).toMatchObject({ user: STORED })

    await signOut()
    session.answer({ success: true, data: SERVER })
    await settle()

    expect(await getCurrentUser()).toBeNull()
    expect(store.setUser).not.toHaveBeenCalledWith(SERVER)
  })

  it("a late refusal of the last session does not sign out the account that signed in after it", async () => {
    const OTHER = { id: 'u2', email: 'b@b.c', name: 'Bo' } as never
    const session = held<unknown>()
    api.getSession.mockReturnValue(session.promise as never)
    api.refreshSessionOutcome.mockResolvedValue('rejected')
    api.signInWithEmail.mockResolvedValue({ success: true, data: { user: OTHER } } as never)
    expect(await launch()).toMatchObject({ user: STORED })

    await signOut()
    await signInWithEmail('b@b.c', 'not-a-real-password')
    session.answer({ success: false, error: 'Unauthorized' })
    await settle()

    expect(await getCurrentUser()).toBe(OTHER)
    expect(markSessionExpired).not.toHaveBeenCalled()
    expect(store.clearAll).not.toHaveBeenCalled()
  })
})
