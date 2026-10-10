/**
 * Settings ▸ Delete account says what deletion actually does.
 *
 * It used to promise "permanently deletes your profile, photos, and personal
 * info". The API keeps sent messages under a deleted account and holds
 * registration details for 180 days (IT Rules 2021), so the first step of the tray says
 * that and links to the published page for the rest.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
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
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({
  useAuth: () => mockAuth,
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getProfile: jest.fn(async () => ({ success: true, data: { profile: {} } })),
    getMyPlus: jest.fn(async () => ({ success: true, data: { active: false, gated: false, product: null, source: null, expiresAt: null } })),
  },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(),
  removePushTokenFromProfile: jest.fn(),
}))

import SettingsScreen from '../app/settings'

it('says what is kept, and links to the page that lists it', async () => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<SettingsScreen />)

  fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }))

  const message = await screen.findByText(/Messages you sent stay/)
  expect(message.props.children).toMatch(/180 days/)
  expect(screen.queryByText(/personal info/)).toBeNull()

  fireEvent.press(screen.getByRole('button', { name: "What's kept" }))
  expect(Linking.openURL).toHaveBeenCalledWith('https://www.blendn.app/delete-account')
})
