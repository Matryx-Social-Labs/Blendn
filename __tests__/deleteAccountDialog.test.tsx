/**
 * Settings ▸ Delete account says what deletion actually does.
 *
 * It used to promise "permanently deletes your profile, photos, and personal
 * info". The API keeps sent messages under a deleted account and holds
 * registration details for 180 days (IT Rules 2021), so the first alert says
 * that and links to the published page for the rest.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Alert, Linking } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { SafeAreaView: (p: object) => React.createElement(View, p) }
})
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({
  useAuth: () => mockAuth,
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(async () => ({ success: true, data: { profile: {} } })) },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(),
  removePushTokenFromProfile: jest.fn(),
}))

import SettingsScreen from '../app/settings'

type Button = { text?: string; onPress?: () => void }

it('says what is kept, and links to the page that lists it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<SettingsScreen />)

  fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }))

  const [, message, buttons] = alert.mock.calls[0] as [string, string, Button[]]
  expect(message).toMatch(/Messages you sent stay/)
  expect(message).toMatch(/180 days/)
  expect(message).not.toMatch(/personal info/)

  buttons.find((b) => b.text === "What's kept")?.onPress?.()
  expect(Linking.openURL).toHaveBeenCalledWith('https://www.blendn.app/delete-account')
})
