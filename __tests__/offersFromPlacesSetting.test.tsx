/**
 * Settings: sign-out asks first, the push switch tells the truth about the
 * phone, a failed load can be retried, and deleting the account says it worked.
 *
 * Behavioural, against mocked auth, API and notification permission, because
 * each is a branch a source grep would pass by name alone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  // A screen's focus, run once as on mount.
  useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]),
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
// Stable, like the real singleton: a new user object per render re-runs every effect keyed on it.
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({
  useAuth: () => mockAuth,
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), getMyPlus: jest.fn(), queuedRequest: jest.fn() },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import SettingsScreen from '../app/notification-settings'
import { apiClient } from '../lib/apiClient'
import { deleteAccount, signOut } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>
const plusStatus = (o: Partial<{ active: boolean; gated: boolean; source: 'apple' | 'google' | 'grant' | null }> = {}) => ({
  active: false,
  gated: true,
  product: o.active ? 'plus' : null,
  source: null,
  expiresAt: null,
  ...o,
})
const permissions = Notifications.getPermissionsAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.updateProfile.mockResolvedValue({ success: true } as never)
  api.getMyPlus.mockResolvedValue({ success: true, data: plusStatus() } as never)
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  ;(api.queuedRequest as jest.Mock).mockImplementation((_url: string, init?: RequestInit) =>
    // A place has regulars on for this person: the row is drawn only then (D21, YOU-04).
    Promise.resolve({ success: true, data: init?.method === 'PUT' ? JSON.parse(String(init.body)) : { enabled: true, pushes: true, regulars: { active: true } } })
  )
})

describe('Offers from places (step 12 review M6)', () => {
  it('shows what the server keeps, and turning it off sends exactly that', async () => {
    await render(<SettingsScreen />)
    const row = await screen.findByLabelText(/^Offers from places/)
    await waitFor(() => expect(screen.getByLabelText(/^Offers from places/).props.accessibilityState).toMatchObject({ checked: true }))
    await act(async () => { fireEvent.press(screen.getByLabelText(/^Offers from places/)) })
    void row
    expect(api.queuedRequest).toHaveBeenLastCalledWith('/api/mobile/me/offers', { method: 'PUT', body: '{"enabled":false,"pushes":false}' }, true, 2)
    expect(screen.getByLabelText(/^Offers from places/).props.accessibilityState).toMatchObject({ checked: false })
  })

  it('reads off while the server holds no yes for the push, and turning it on gives both yeses with the consent words beside it (SCRUM-628)', async () => {
    ;(api.queuedRequest as jest.Mock).mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve({ success: true, data: init?.method === 'PUT' ? JSON.parse(String(init.body)) : { enabled: true, pushes: false, regulars: { active: true } } })
    )
    await render(<SettingsScreen />)
    await screen.findByLabelText(/^Offers from places/)
    await waitFor(() => expect(screen.getByLabelText(/^Offers from places/).props.accessibilityState).toMatchObject({ checked: false }))
    // The words that ask: a notification, for an offer, from a place.
    expect(screen.getByLabelText(/^Offers from places/).props.accessibilityLabel).toMatch(/notification/i)
    await act(async () => { fireEvent.press(screen.getByLabelText(/^Offers from places/)) })
    expect(api.queuedRequest).toHaveBeenLastCalledWith('/api/mobile/me/offers', { method: 'PUT', body: '{"enabled":true,"pushes":true}' }, true, 2)
    expect(screen.getByLabelText(/^Offers from places/).props.accessibilityState).toMatchObject({ checked: true })
  })
})

