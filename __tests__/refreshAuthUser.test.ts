/**
 * `refreshAuthUser` re-reads the session after a profile write and on opening Settings (SCRUM-742). An unchanged user
 * must not notify every `useAuth` subscriber or rewrite secure storage; a changed one must do both (L3).
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signInWithEmail: jest.fn(), signInWithGoogle: jest.fn(), signInWithApple: jest.fn(), signOut: jest.fn(), getSession: jest.fn() },
  TokenStorage: { clearAll: jest.fn(), setUser: jest.fn(), getUser: jest.fn(), getAccessToken: jest.fn() },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))
jest.mock('../lib/goLive', () => ({ clearLiveSession: jest.fn() }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn(async () => {}) }))

/* eslint-disable import/first */
import { apiClient, TokenStorage } from '../lib/apiClient'
import { myMainPhoto } from '../lib/myPhoto'
import { FOREGROUND_REFRESH_MS, getCurrentUser, refreshAuthUser, refreshAuthUserOnForeground, sameUser, signInWithApple, signInWithEmail, signInWithGoogle, signOut } from '../lib/useAuth'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const user = { id: 'u1', email: 'a@b.c', name: 'Sam', image: null, emailVerified: null, createdAt: '2026-01-01', signInMethod: 'password', profile: null }

beforeEach(async () => {
  jest.clearAllMocks()
  api.signInWithEmail.mockResolvedValue({ success: true, data: { user } } as never)
  await signInWithEmail('a@b.c', 'pw')
  ;(TokenStorage.setUser as jest.Mock).mockClear()
})

it('an unchanged user writes nothing and notifies nobody', async () => {
  api.getSession.mockResolvedValue({ success: true, data: { ...user } } as never)
  await refreshAuthUser()
  expect(TokenStorage.setUser).not.toHaveBeenCalled()
})

it('a changed user is stored', async () => {
  api.getSession.mockResolvedValue({ success: true, data: { ...user, name: 'Samir' } } as never)
  await refreshAuthUser()
  expect(TokenStorage.setUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Samir' }))
})

it('a changed signInMethod counts as a change', async () => {
  api.getSession.mockResolvedValue({ success: true, data: { ...user, signInMethod: 'google' } } as never)
  await refreshAuthUser()
  expect(TokenStorage.setUser).toHaveBeenCalled()
})

it('sameUser needs a user to compare with', () => {
  expect(sameUser(null, user as never)).toBe(false)
  expect(sameUser(user as never, { ...user } as never)).toBe(true)
})

describe('refreshAuthUserOnForeground', () => {
  it('re-reads the session when the app comes back, at most once a minute', async () => {
    api.getSession.mockResolvedValue({ success: true, data: { ...user } } as never)
    const t0 = 10_000_000
    await refreshAuthUserOnForeground(t0)
    await refreshAuthUserOnForeground(t0 + FOREGROUND_REFRESH_MS - 1)
    expect(api.getSession).toHaveBeenCalledTimes(1)
    await refreshAuthUserOnForeground(t0 + FOREGROUND_REFRESH_MS)
    expect(api.getSession).toHaveBeenCalledTimes(2)
  })
})

/*
 * H1: the Google and Apple routes answer with the profile WITHOUT `photos` (blendn-admin auth/google/route.ts: the user is built
 * from `profileForSelfResponse(user.profile)`, which selects none), so the Me tab had no face after either sign-in until a relaunch.
 * The fixture is that response.
 */
describe('Google and Apple sign-in fetch the session photo (H1)', () => {
  const googleUser = { id: 'g1', email: 'g@b.c', name: 'Gita', image: 'https://oauth.example/a.jpg', emailVerified: null, createdAt: '2026-01-01', profile: { phone: null, name: 'Gita', age: 30, location: 'Bengaluru', interests: [], onboarded: true } }
  const sessionUser = { ...googleUser, profile: { ...googleUser.profile, photos: ['https://x/main.jpg'] } }

  it.each([
    ['Google', () => signInWithGoogle('idtoken'), 'signInWithGoogle'],
    ['Apple', () => signInWithApple('idtoken'), 'signInWithApple'],
  ] as const)('%s: getSession is called and the photo becomes the Me tab’s', async (_n, run, method) => {
    ;(api as unknown as Record<string, jest.Mock>)[method].mockResolvedValue({ success: true, data: { user: googleUser, isNewUser: false } })
    api.getSession.mockClear()
    api.getSession.mockResolvedValue({ success: true, data: sessionUser } as never)
    await run()
    await new Promise((r) => setImmediate(r))
    expect(api.getSession).toHaveBeenCalledTimes(1)
    expect(myMainPhoto(await getCurrentUser())).toBe('https://x/main.jpg')
  })

  it('signing out lets the next account’s first foreground read through the throttle', async () => {
    api.getSession.mockResolvedValue({ success: true, data: { ...user } } as never)
    api.signOut.mockResolvedValue({ success: true } as never)
    const t0 = 20_000_000
    await signInWithEmail('a@b.c', 'pw')
    await refreshAuthUserOnForeground(t0)
    api.getSession.mockClear()
    await signOut()
    await signInWithEmail('a@b.c', 'pw')
    await refreshAuthUserOnForeground(t0 + 1)
    expect(api.getSession).toHaveBeenCalledTimes(1)
  })
})

it('drops a session read that belongs to another account (L1)', async () => {
  api.getSession.mockResolvedValue({ success: true, data: { ...user, id: 'someone-else', name: 'Other' } } as never)
  await refreshAuthUser()
  expect(TokenStorage.setUser).not.toHaveBeenCalled()
})

it('a read in flight when the person signs out does not put them back (H1)', async () => {
  let land!: (r: unknown) => void
  api.getSession.mockImplementation(() => new Promise((resolve) => (land = resolve)) as never)
  api.signOut.mockResolvedValue({ success: true } as never)
  const reading = refreshAuthUser()
  await signOut()
  land({ success: true, data: { ...user, name: 'Back again' } })
  await reading
  expect(await getCurrentUser()).toBeNull()
  expect(TokenStorage.setUser).not.toHaveBeenCalled()
})

it('without a signed-in user there is nothing to refresh and nothing is read (H1)', async () => {
  api.signOut.mockResolvedValue({ success: true } as never)
  await signOut()
  api.getSession.mockClear()
  await refreshAuthUser()
  expect(api.getSession).not.toHaveBeenCalled()
})
