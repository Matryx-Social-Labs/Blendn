/**
 * An onboarded account is not sent through onboarding again.
 *
 * Driven on the iOS simulator: sign up → finish all eight steps → sign out →
 * sign in with the same email → the app landed on "The basics" with the date
 * of birth empty. The server said `onboarded: true`; the client's routing
 * effect asks `resumeStep({ isNewAccount })`, and `isNewAccount` was still
 * the `true` that sign-up set — sign-out did not reset it and email sign-in
 * did not set it either. Only a relaunch cleared it, which is why the bug
 * looked like "sometimes".
 */
jest.mock('../lib/apiClient', () => ({
  apiClient: { signUp: jest.fn(), signInWithEmail: jest.fn(), signOut: jest.fn(), getSession: jest.fn() },
  TokenStorage: {
    clearAll: jest.fn().mockResolvedValue(undefined),
    setUser: jest.fn(),
    getUser: jest.fn().mockResolvedValue(null),
    getAccessToken: jest.fn().mockResolvedValue(null),
  },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))

import { renderHook, waitFor } from '@testing-library/react-native'
import { apiClient } from '../lib/apiClient'
import { signInWithEmail, signOut, signUp, useAuth } from '../lib/useAuth'
import { resumeStep } from '../lib/onboarding'

const api = apiClient as jest.Mocked<typeof apiClient>
const user = { id: 'u1', email: 'a@b.c', name: 'A' }

beforeEach(() => {
  jest.clearAllMocks()
  api.signUp.mockResolvedValue({ success: true, data: { user, accessToken: 't', refreshToken: 'r' } } as never)
  api.signInWithEmail.mockResolvedValue({ success: true, data: { user, accessToken: 't', refreshToken: 'r' } } as never)
  api.signOut.mockResolvedValue({ success: true } as never)
})

it('sign-up sets the flag, sign-out clears it, sign-in never sets it', async () => {
  const { result } = await renderHook(() => useAuth())

  await signUp('a@b.c', 'Qa-2026-pass!', 'A')
  await waitFor(() => expect(result.current.isNewAccount).toBe(true))

  await signOut()
  await waitFor(() => expect(result.current.user).toBeNull())
  expect(result.current.isNewAccount).toBe(false)

  await signInWithEmail('a@b.c', 'Qa-2026-pass!')
  await waitFor(() => expect(result.current.user).not.toBeNull())
  expect(result.current.isNewAccount).toBe(false)
  // Which is what keeps the routing effect out of onboarding for a sign-in.
  expect(resumeStep({ finishedOnServer: false, stored: null, isNewAccount: result.current.isNewAccount })).toBeNull()
})

it('a sign-in straight after a sign-up (no sign-out between) is still not new', async () => {
  const { result } = await renderHook(() => useAuth())
  await signUp('a@b.c', 'Qa-2026-pass!', 'A')
  await waitFor(() => expect(result.current.isNewAccount).toBe(true))
  await signInWithEmail('a@b.c', 'Qa-2026-pass!')
  await waitFor(() => expect(result.current.isNewAccount).toBe(false))
})
