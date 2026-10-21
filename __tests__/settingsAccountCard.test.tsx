/**
 * Settings' Account card (Flow 7 R4.1 7.1), the data-copy row (7.2), the delete row while it runs (frame 15) and the
 * load-error banner (frame 06): behavioural, against mocked auth and API, because each is a branch a source grep would
 * pass by name alone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking, View } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]),
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View: RNView } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(RNView, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
const mockAuth = { user: { id: 'u_me', email: 'sam@example.com' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth, signOut: jest.fn(), signOutEverywhere: jest.fn(), deleteAccount: jest.fn() }))
const mockMethod = jest.fn()
jest.mock('../lib/authMethod', () => ({ useAuthMethod: () => mockMethod() }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), getMyPlus: jest.fn(), queuedRequest: jest.fn(), forgotPassword: jest.fn() },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }) }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/haptics', () => ({ H: { destructive: jest.fn(), toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn() } }))
const mockOffline = jest.fn()
jest.mock('../lib/networkStatus', () => ({
  getNetworkState: () => (mockOffline() ? 'offline' : 'online'),
  subscribeNetworkState: () => () => {},
}))

import SettingsScreen from '../app/settings'
import { SheetHost } from '../components/SheetHost'
import { apiClient } from '../lib/apiClient'
import { H } from '../lib/haptics'
import { closeSheet } from '../lib/sheet'
import { deleteAccount, signOut, signOutEverywhere } from '../lib/useAuth'

const api = apiClient as jest.Mocked<typeof apiClient>
const Screen = () => (
  <View>
    <SettingsScreen />
    <SheetHost />
  </View>
)

afterEach(async () => {
  await act(async () => closeSheet())
})
beforeEach(() => {
  jest.clearAllMocks()
  mockMethod.mockReturnValue('password')
  mockOffline.mockReturnValue(false)
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.getMyPlus.mockResolvedValue({ success: true, data: { active: false, gated: true, product: null, source: null, expiresAt: null } } as never)
  ;(api.queuedRequest as jest.Mock).mockResolvedValue({ success: true, data: { enabled: true } })
})

describe('the Account card', () => {
  it('an email account: signed in as, Password, Sign out, Sign out of every device', async () => {
    await render(<Screen />)
    expect(await screen.findByLabelText('Signed in as, sam@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Password' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out of every device' })).toBeTruthy()
  })

  it('a Google account says so and has no Password row', async () => {
    mockMethod.mockReturnValue('google')
    await render(<Screen />)
    expect(await screen.findByLabelText('Signed in with Google, sam@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Password' })).toBeNull()
  })

  it('a session that predates the record names the email and offers no password it cannot be sure of', async () => {
    mockMethod.mockReturnValue(null)
    await render(<Screen />)
    expect(await screen.findByLabelText('Signed in as, sam@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Password' })).toBeNull()
  })

  it('the signed-in row is display only', async () => {
    await render(<Screen />)
    const row = await screen.findByTestId('settings-account')
    expect(row.props.accessibilityRole).toBeUndefined()
  })
})

describe('Change your password', () => {
  const open = async () => {
    fireEvent.press(await screen.findByRole('button', { name: 'Password' }))
    await screen.findByText('Change your password?')
  }

  it('says where the link goes, and Send link emails it and toasts info', async () => {
    api.forgotPassword.mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    await open()
    expect(screen.getByText('We’ll email a link to sam@example.com. Reset links work once, and for an hour.')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Send link' }))
    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('sam@example.com'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Check sam@example.com for the link', 'info'))
    // An email is not a success: nothing plays.
    expect(H.success).not.toHaveBeenCalled()
  })

  it('a 429 keeps the sheet and says how long to wait', async () => {
    api.forgotPassword.mockResolvedValue({ success: false, errorCode: 'RATE_LIMITED', retryAfter: 600 } as never)
    await render(<Screen />)
    await open()
    fireEvent.press(screen.getByRole('button', { name: 'Send link' }))
    expect(await screen.findByText('Too many reset requests. Try again in 10 minutes.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})

describe('Sign out of every device', () => {
  it('asks first, in the sheet that is never red, and signs out everywhere only once the server confirms', async () => {
    ;(signOutEverywhere as jest.Mock).mockResolvedValue({ success: true })
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out of every device' }))
    expect(await screen.findByText('Sign out everywhere?')).toBeTruthy()
    expect(screen.getByText('Every phone signed in to this account is signed out, this one too. Notifications stop on all of them.')).toBeTruthy()
    expect(signOutEverywhere).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('button', { name: 'Sign out everywhere' }))
    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1))
    // It is its own call: never the one-device sign-out with a flag.
    expect(signOut).not.toHaveBeenCalled()
    expect(H.destructive).not.toHaveBeenCalled()
  })

  it('Cancel keeps every session', async () => {
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out of every device' }))
    await screen.findByText('Sign out everywhere?')
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(signOutEverywhere).not.toHaveBeenCalled()
  })

  it('a server that could not be reached keeps the sheet, says nothing was signed out, and offers Try again (no landing toast)', async () => {
    ;(signOutEverywhere as jest.Mock).mockResolvedValue({ success: false, error: 'No internet connection.' })
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out of every device' }))
    await screen.findByText('Sign out everywhere?')
    fireEvent.press(screen.getByRole('button', { name: 'Sign out everywhere' }))
    expect(await screen.findByText('Couldn’t reach Blend’n, so nothing was signed out. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByText('Sign out everywhere?')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})

it('Get a copy of your data opens a prefilled email to support', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<Screen />)
  fireEvent.press(await screen.findByTestId('settings-data-copy'))
  await waitFor(() => expect(open).toHaveBeenCalled())
  const url = decodeURIComponent(String(open.mock.calls[0][0]))
  expect(url).toContain('mailto:support@blendn.app')
  expect(url).toContain('Account: u_me')
  open.mockRestore()
})

describe('Delete account while it runs', () => {
  it('the row reads Deleting account… and the Delete step 1 press plays the destructive tick', async () => {
    let finish: (v: { success: boolean }) => void = () => {}
    ;(deleteAccount as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }))
    await screen.findByText('Delete your account?')
    const step1 = screen.getAllByRole('button', { name: 'Delete account' })
    await act(async () => fireEvent(step1[step1.length - 1], 'pressIn'))
    expect(H.destructive).toHaveBeenCalledTimes(1)
    fireEvent.press(step1[step1.length - 1])
    fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByLabelText('Deleting account…')).toBeTruthy()
    await act(async () => finish({ success: false }))
    // It did not go through: the row is Delete account again.
    await waitFor(() => expect(screen.queryByLabelText('Deleting account…')).toBeNull())
  })
})

describe('offline and the load error', () => {
  it('offline with the settings loaded says what is on screen', async () => {
    mockOffline.mockReturnValue(true)
    await render(<Screen />)
    expect(await screen.findByText('Offline. Showing what you had.')).toBeTruthy()
  })

  it('a failed load is the one banner (not two) and it has Try again', async () => {
    mockOffline.mockReturnValue(true)
    api.getProfile.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await render(<Screen />)
    expect(await screen.findByTestId('settings-load-error')).toBeTruthy()
    expect(screen.queryByText('Offline. Showing what you had.')).toBeNull()
  })
})
