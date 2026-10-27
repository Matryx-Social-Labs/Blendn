/**
 * `refreshAuthUser` re-reads the session after a profile write and on opening Settings (SCRUM-742). An unchanged user
 * must not notify every `useAuth` subscriber or rewrite secure storage; a changed one must do both (L3).
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signInWithEmail: jest.fn(), getSession: jest.fn() },
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
import { FOREGROUND_REFRESH_MS, refreshAuthUser, refreshAuthUserOnForeground, sameUser, signInWithEmail } from '../lib/useAuth'
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
