/**
 * SYS-08: Android's per-kind rows open the phone's channel page, so a kind turned off on iOS had no way back on. A kind the account
 * has off renders as a switch there. SYS-07: the Sounds row opens the phone's settings on both platforms.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking, Platform } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u_me' } }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), queuedRequest: jest.fn() } }))
jest.mock('../lib/notifications', () => ({ initializePushNotifications: jest.fn(async () => null), removePushTokenFromProfile: jest.fn(async () => true) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })) }))
jest.mock('expo-application', () => ({ applicationId: 'app.blendn' }))
jest.mock('../lib/haptics', () => ({ H: { toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn() } }))

import { apiClient } from '../lib/apiClient'
import { resetPushPreferenceStore } from '../lib/usePushPreference'

const api = apiClient as jest.Mocked<typeof apiClient>
// The screen reads the platform when it loads: this file is its own module registry, so set it before the require.
Platform.OS = 'android'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('../app/notification-settings').default as () => React.JSX.Element
beforeEach(() => {
  resetPushPreferenceStore()
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.updateProfile.mockResolvedValue({ success: true } as never)
  ;(api.queuedRequest as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('notification-preferences')) {
      return Promise.resolve({ success: true, data: init?.method === 'PUT' ? { matches: true, crew: true, night: true } : { matches: false, crew: true, night: true } })
    }
    return Promise.resolve({ success: true, data: { enabled: true } })
  })
})

it('a kind the account has off is a switch that turns it back on; the others open the phone’s channel page', async () => {
  await render(<Screen />)
  const matches = await screen.findByRole('switch', { name: /^Matches and friends/ })
  expect(matches.props.accessibilityState.checked).toBe(false)
  expect(screen.getByRole('link', { name: /^Your crew/ })).toBeTruthy()
  expect(screen.queryByRole('switch', { name: /^Your crew/ })).toBeNull()
  await act(async () => fireEvent.press(matches))
  await waitFor(() =>
    expect(api.queuedRequest).toHaveBeenCalledWith('/api/mobile/me/notification-preferences', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ matches: true }) }), true, 2)
  )
})

it('the Sounds row opens the phone’s settings', async () => {
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
  await render(<Screen />)
  fireEvent.press(await screen.findByRole('link', { name: /^Sounds, pop-ups and lock screen/ }))
  expect(open).toHaveBeenCalled()
})
