/**
 * RevenueCat follows the signed-in account (plan v2 step 11): the server takes
 * the buyer from RevenueCat's `app_user_id` alone, so a sign-in must log
 * RevenueCat in as that account and a sign-out must log it out — through the
 * one place every auth path changes the user (`updateAuthState`).
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signInWithEmail: jest.fn(), signOut: jest.fn(), getSession: jest.fn(), refreshSession: jest.fn() },
  TokenStorage: { clearAll: jest.fn().mockResolvedValue(undefined), setUser: jest.fn(), getUser: jest.fn(), getAccessToken: jest.fn() },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))
jest.mock('../lib/goLive', () => ({ clearLiveSession: jest.fn() }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn(async () => {}) }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { syncPurchasesUser } from '../lib/purchases'
import { signInWithEmail, signOut } from '../lib/useAuth'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const settle = () => new Promise((r) => setTimeout(r, 0))

it('a sign-in logs RevenueCat in as that account; a sign-out logs it out', async () => {
  api.signInWithEmail.mockResolvedValue({ success: true, data: { user: { id: 'u1', email: 'a@b.c' } } } as never)
  await signInWithEmail('a@b.c', 'pw')
  await settle()
  expect(syncPurchasesUser).toHaveBeenLastCalledWith('u1')

  api.signOut.mockResolvedValue({ success: true } as never)
  await signOut()
  await settle()
  expect(syncPurchasesUser).toHaveBeenLastCalledWith(null)
  expect(syncPurchasesUser).toHaveBeenCalledTimes(2)
})
