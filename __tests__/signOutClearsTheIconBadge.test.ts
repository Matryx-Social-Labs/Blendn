/*
 * The app icon's number is the signed-in account's (blendn-admin `badgeCount`, `lib/appBadge.ts`): the next person to open the
 * app on this phone must not inherit it. `clearAuthState` is the one place every way out of a session passes through (sign out,
 * sign out everywhere, a refused refresh), so that is where it is cleared.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockSetBadge = jest.fn()
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  setBadgeCountAsync: (...a: unknown[]) => mockSetBadge(...a),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { signOut: jest.fn(), signOutEverywhere: jest.fn() },
  TokenStorage: { clearAll: jest.fn(async () => {}), getUser: jest.fn(async () => null) },
}))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn() }))

import { apiClient } from '../lib/apiClient'
import { signOut, signOutEverywhere } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>

beforeEach(() => {
  jest.clearAllMocks()
})

it('signing out clears the icon', async () => {
  api.signOut.mockResolvedValue({ success: true } as never)
  await signOut()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(mockSetBadge).toHaveBeenCalledWith(0)
})

it('signing out when the server did not confirm still clears this phone\'s icon', async () => {
  api.signOut.mockResolvedValue({ success: false, error: 'offline' } as never)
  await signOut()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(mockSetBadge).toHaveBeenCalledWith(0)
})

it('signing out everywhere clears it only once the server confirmed, as the rest of the state is', async () => {
  api.signOutEverywhere.mockResolvedValue({ success: false, error: 'offline' } as never)
  await signOutEverywhere()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(mockSetBadge).not.toHaveBeenCalled()
  api.signOutEverywhere.mockResolvedValue({ success: true } as never)
  await signOutEverywhere()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(mockSetBadge).toHaveBeenCalledWith(0)
})
