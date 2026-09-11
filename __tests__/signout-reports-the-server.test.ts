/**
 * signOut() reports what the server did.
 *
 * Local state is cleared either way — that is right. But the first version
 * returned `{ success: true }` from BOTH branches, so a sign-out the server
 * never saw (offline) left the refresh token valid and the push token
 * registered while Settings' error branch could never run.
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signOut: jest.fn(), getSession: jest.fn() },
  TokenStorage: { clearAll: jest.fn().mockResolvedValue(undefined), setUser: jest.fn(), getUser: jest.fn() },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))

import { apiClient } from '../lib/apiClient'
import { signOut } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>

describe('signOut', () => {
  it('is success only when the server confirmed', async () => {
    api.signOut.mockResolvedValue({ success: true } as never)
    await expect(signOut()).resolves.toEqual({ success: true })
  })

  it('reports the failure the server returned, after clearing local state', async () => {
    api.signOut.mockResolvedValue({ success: false, error: 'offline' } as never)
    await expect(signOut()).resolves.toEqual({ success: false, error: 'offline' })
  })
})
