/**
 * Settings: sign-out asks first, the push switch tells the truth about the
 * phone, a failed load can be retried, and deleting the account says it worked.
 *
 * Behavioural, against mocked auth, API and notification permission, because
 * each is a branch a source grep would pass by name alone.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'

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
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn() },
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
import SettingsScreen from '../app/settings'
import { apiClient } from '../lib/apiClient'
import { deleteAccount, signOut } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>
const permissions = Notifications.getPermissionsAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.updateProfile.mockResolvedValue({ success: true } as never)
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
})

describe('Sign out', () => {
  it('asks before signing out, and Cancel keeps you in', async () => {
    await render(<SettingsScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Sign out?')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Cancel'))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out from the tray', async () => {
    ;(signOut as jest.Mock).mockResolvedValue({ success: true })
    await render(<SettingsScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))
    // The tray's own button, not the row that opened it.
    await screen.findByText('Sign out?')
    const buttons = screen.getAllByText('Sign out')
    fireEvent.press(buttons[buttons.length - 1])

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })
})

describe('Push notifications', () => {
  it('shows off when the phone blocks them, whatever the account says', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await render(<SettingsScreen />)

    expect(await screen.findByText("Off in your phone's settings.")).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: 'Push notifications' })
    expect(toggle.props.accessibilityState.checked).toBe(false)
  })

  it('explains, and offers Settings, instead of saving a switch nothing will deliver on', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await render(<SettingsScreen />)
    await screen.findByText("Off in your phone's settings.")

    fireEvent.press(screen.getByRole('switch', { name: 'Push notifications' }))

    expect(await screen.findByText('Notifications are off')).toBeTruthy()
    expect(api.updateProfile).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Open Settings'))
    expect(openSettings).toHaveBeenCalled()
  })

  it('saves as before when the phone allows them', async () => {
    await render(<SettingsScreen />)
    const toggle = () => screen.getByRole('switch', { name: 'Push notifications' })
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: true, disabled: false }))

    // The row is the target: a tap anywhere on it flips the switch.
    fireEvent.press(toggle())

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('u_me', expect.objectContaining({ push_enabled: false })))
    expect(screen.queryByText('Notifications are off')).toBeNull()
  })
})

it('offers Try again when the settings did not load, and it works', async () => {
  api.getProfile.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
  await render(<SettingsScreen />)

  expect(await screen.findByText("Your settings didn't load. Pull down or try again.")).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(screen.queryByText("Your settings didn't load. Pull down or try again.")).toBeNull())
  expect(api.getProfile).toHaveBeenCalledTimes(2)
})

describe('Delete account', () => {
  /** The row opens the tray; the tray's own button is the last one with the label. */
  const openTray = async () => {
    fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }))
    await screen.findByText('Delete your account?')
  }
  const lastButton = (name: string) => {
    const all = screen.getAllByRole('button', { name })
    return all[all.length - 1]
  }

  it('asks twice, then says the account was deleted once it was', async () => {
    ;(deleteAccount as jest.Mock).mockResolvedValue({ success: true })
    await render(<SettingsScreen />)
    await openTray()

    fireEvent.press(lastButton('Delete account'))
    expect(await screen.findByText('Delete your account for good?')).toBeTruthy()
    expect(deleteAccount).not.toHaveBeenCalled()

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Your account has been deleted.', 'success'))
    expect(deleteAccount).toHaveBeenCalledTimes(1)
  })

  it('keeps the tray open with the reason when deleting fails, and offers Try again', async () => {
    ;(deleteAccount as jest.Mock).mockResolvedValue({ success: false, error: 'Server said no.' })
    await render(<SettingsScreen />)
    await openTray()
    fireEvent.press(lastButton('Delete account'))
    fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText('Server said no.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('Cancel deletes nothing', async () => {
    await render(<SettingsScreen />)
    await openTray()
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteAccount).not.toHaveBeenCalled()
  })
})

it('reports a sign-out the server did not hear about', async () => {
  ;(signOut as jest.Mock).mockResolvedValue({ success: false })
  await render(<SettingsScreen />)
  fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))
  await screen.findByText('Sign out?')
  const buttons = screen.getAllByText('Sign out')
  fireEvent.press(buttons[buttons.length - 1])

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/^Signed out on this phone/), 'info'))
})

it('says which setting did not save, as a toast', async () => {
  api.updateProfile.mockResolvedValue({ success: false, error: 'nope' } as never)
  await render(<SettingsScreen />)
  const toggle = () => screen.getByRole('switch', { name: 'Read receipts' })
  await waitFor(() => expect(toggle().props.accessibilityState.disabled).toBe(false))
  fireEvent.press(toggle())

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Couldn't save “Read receipts”. Try again.", 'error'))
})

it('opens About and Contact support', async () => {
  await render(<SettingsScreen />)
  fireEvent.press(await screen.findByRole('button', { name: "About Blend'n" }))
  expect(router.push).toHaveBeenCalledWith('/about')
  fireEvent.press(screen.getByRole('button', { name: 'Contact support' }))
  expect(router.push).toHaveBeenCalledWith('/support')
})
