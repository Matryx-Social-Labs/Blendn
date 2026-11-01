/**
 * Settings: sign-out asks first, the push switch tells the truth about the
 * phone, a failed load can be retried, and deleting the account says it worked.
 *
 * Behavioural, against mocked auth, API and notification permission, because
 * each is a branch a source grep would pass by name alone.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking, View } from 'react-native'

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
  refreshAuthUser: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), getMyPlus: jest.fn(), queuedRequest: jest.fn(), getChatGroups: jest.fn() },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/deletionProof', () => ({ ...jest.requireActual('../lib/deletionProof'), appleProofForDeletion: jest.fn(), googleProofForDeletion: jest.fn() }))

import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import SettingsScreen, { ONLINE_STATUS_HINT } from '../app/settings'
import { SheetHost } from '../components/SheetHost'
import { closeSheet } from '../lib/sheet'
import { H } from '../lib/haptics'
import { apiClient } from '../lib/apiClient'
import { resetMutedRooms } from '../lib/mutedRooms'
import { deleteAccount, signOut } from '../lib/useAuth'
import { appleProofForDeletion, googleProofForDeletion } from '../lib/deletionProof'

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
jest.mock('../lib/haptics', () => ({ H: { destructive: jest.fn(), toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn() } }))

/** The screen with the app's one sheet host beside it, as the root layout mounts them. */
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
  resetMutedRooms()
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.updateProfile.mockResolvedValue({ success: true } as never)
  api.getMyPlus.mockResolvedValue({ success: true, data: plusStatus() } as never)
  ;(api.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [] } })
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  ;(api.queuedRequest as jest.Mock).mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve({ success: true, data: { enabled: init?.method === 'PUT' ? JSON.parse(String(init.body)).enabled : true } })
  )
})

describe('Sign out', () => {
  it('asks before signing out, and Cancel keeps you in', async () => {
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Sign out?')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Cancel'))
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out from the tray', async () => {
    ;(signOut as jest.Mock).mockResolvedValue({ success: true })
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))
    // The tray's own button, not the row that opened it.
    await screen.findByText('Sign out?')
    const buttons = screen.getAllByText('Sign out')
    fireEvent.press(buttons[buttons.length - 1])

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })
})

it('plays H.primary once, on the Sign out confirm and not when the sheet opens (frame 11), and never the destructive tick', async () => {
  ;(signOut as jest.Mock).mockResolvedValue({ success: true })
  await render(<Screen />)
  fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))
  await screen.findByText('Sign out?')
  expect(H.primary).not.toHaveBeenCalled()
  const buttons = screen.getAllByText('Sign out')
  const confirm = buttons[buttons.length - 1]
  // The cue is on press-in, not on release.
  await act(async () => fireEvent(confirm, 'pressIn'))
  expect(H.primary).toHaveBeenCalledTimes(1)
  fireEvent.press(confirm)

  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  expect(H.primary).toHaveBeenCalledTimes(1)
  expect(H.destructive).not.toHaveBeenCalled()
})

describe('Notifications row', () => {
  it('opens Notification settings, where the push switch now lives (the Settings screen has no switch of its own)', async () => {
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: /^Notifications/ }))
    expect(router.push).toHaveBeenCalledWith('/notification-settings')
    expect(screen.queryByRole('switch', { name: /^Push notifications/ })).toBeNull()
  })

  it('says On when nothing is muted (frame 01)', async () => {
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Notifications, On' })).toBeTruthy()
  })

  it('says how many rooms are muted (frame 02)', async () => {
    const mute = { muted: true, until: null }
    ;(api.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [{ id: 'a', event: { title: 'A' }, mute }, { id: 'b', event: { title: 'B' }, mute }, { id: 'c', event: { title: 'C' } }] },
    })
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Notifications, 2 rooms muted' })).toBeTruthy()
  })
})

it('Help has Tips, which opens the screen that lists every coach-mark sentence (R4-2)', async () => {
  await render(<Screen />)
  fireEvent.press(await screen.findByRole('button', { name: 'Tips' }))
  expect(router.push).toHaveBeenCalledWith('/tips')
})

describe('the muted count is the truth, or says it is not all of it', () => {
  const mute = { muted: true, until: null }
  it('the server’s own count wins when it sends one', async () => {
    ;(api.queuedRequest as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(url.includes('notification-preferences') ? { success: true, data: { mutedRooms: 41 } } : { success: false, errorCode: 'NOT_FOUND' })
    )
    ;(api.getChatGroups as jest.Mock).mockResolvedValue({ success: true, data: { groups: [{ id: 'a', event: { title: 'A' }, mute }] } })
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Notifications, 41 rooms muted' })).toBeTruthy()
  })

  it('a scan that lost a page says "N+", never a quietly short count', async () => {
    ;(api.queuedRequest as jest.Mock).mockImplementation(() => Promise.resolve({ success: false, errorCode: 'NOT_FOUND' }))
    ;(api.getChatGroups as jest.Mock).mockResolvedValue({
      success: true,
      data: { groups: [{ id: 'a', event: { title: 'A' }, mute }], pagination: { hasMore: true } },
    })
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Notifications, 1+ rooms muted' })).toBeTruthy()
  })
})

describe('About you row (E7: titled for the screen it opens until 14.4 "How you match" is built)', () => {
  it('sits beside Notifications and opens the about-you fields', async () => {
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'About you, What matching reads' }))
    expect(router.push).toHaveBeenCalledWith('/edit-about-you')
    expect(screen.getByText('Notifications & matching')).toBeTruthy()
  })
})

it('offers Try again when the settings did not load, and it works', async () => {
  // Every read fails (the Settings read and the Notifications hint's push read both ask), until the connection is back.
  api.getProfile.mockResolvedValue({ success: false, error: 'No internet connection.' })
  await render(<Screen />)

  expect(await screen.findByText("Your settings didn’t load. Pull down or try again.")).toBeTruthy()
  // The switches hold still until it works (frame 06).
  expect(screen.getByRole('switch', { name: 'Read receipts' }).props.accessibilityState.disabled).toBe(true)
  const before = api.getProfile.mock.calls.length
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(screen.queryByText("Your settings didn’t load. Pull down or try again.")).toBeNull())
  // The Settings read and the Notifications hint's push read each ask once at the start; Try again asks again.
  expect(api.getProfile.mock.calls.length).toBeGreaterThan(before)
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

  const typePassword = (value: string) => act(async () => fireEvent.changeText(screen.getByTestId('delete-password'), value))
  const asMethod = (method: 'apple' | 'google' | 'password') => {
    ;(mockAuth.user as { signInMethod?: string }).signInMethod = method
  }
  afterEach(() => {
    delete (mockAuth.user as { signInMethod?: string }).signInMethod
  })

  // SCRUM-944 (3): a bearer token alone no longer deletes. A password account types its password into "for good?".
  describe('a password account', () => {
    it('asks twice, the second time for the password, then says the account was deleted once it was', async () => {
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: true })
      await render(<Screen />)
      await openTray()

      fireEvent.press(lastButton('Delete account'))
      expect(await screen.findByText('Delete your account for good?')).toBeTruthy()
      expect(screen.getByText(/Enter your password to confirm\.$/)).toBeTruthy()
      expect(deleteAccount).not.toHaveBeenCalled()

      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Your account has been deleted.', 'success'))
      expect(deleteAccount).toHaveBeenCalledWith({ password: 'hunter22' })
      expect(appleProofForDeletion).not.toHaveBeenCalled()
      expect(googleProofForDeletion).not.toHaveBeenCalled()
    })

    it('with no password typed, asks for it and sends nothing', async () => {
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('Enter your password to delete your account.')).toBeTruthy()
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('a wrong password keeps the tray open, says so, and offers Try again', async () => {
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: false, error: 'Forbidden', errorCode: 'PASSWORD_INCORRECT' })
      asMethod('password')
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('wrong')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('That password isn’t right.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('Cancel forgets the typed password: reopened and sent empty, it asks again', async () => {
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('Enter your password to delete your account.')).toBeTruthy()
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('Try again sends the corrected password', async () => {
      ;(deleteAccount as jest.Mock)
        .mockResolvedValueOnce({ success: false, error: 'Forbidden', errorCode: 'PASSWORD_INCORRECT' })
        .mockResolvedValueOnce({ success: true })
      asMethod('password')
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('wrong')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      await screen.findByText('That password isn’t right.')
      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Your account has been deleted.', 'success'))
      expect(deleteAccount).toHaveBeenLastCalledWith({ password: 'hunter22' })
    })

    it('a method the phone only guessed, refused as a provider account: says to sign in again, never loops on the password', async () => {
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: false, error: 'Forbidden', errorCode: 'REAUTH_REQUIRED' })
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('Sign out and sign in again, then delete your account.')).toBeTruthy()
    })

    it('a network failure deletes nothing and says to check the connection', async () => {
      ;(deleteAccount as jest.Mock).mockRejectedValue(new Error('offline'))
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('Your account wasn’t deleted. Check your connection and try again.')).toBeTruthy()
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('any other refusal is the server’s own sentence', async () => {
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: false, error: 'Server said no.' })
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      await screen.findByText('Delete your account for good?')
      await typePassword('hunter22')
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
      expect(await screen.findByText('Server said no.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })
  })

  describe.each([
    ['apple', 'Apple', appleProofForDeletion, { appleIdentityToken: 'id', appleAuthorizationCode: 'c0de' }],
    ['google', 'Google', googleProofForDeletion, { googleIdToken: 'g-id' }],
  ] as const)('a %s account signs in with its provider once more', (method, name, proofFor, proof) => {
    const confirm = async () => {
      asMethod(method)
      await render(<Screen />)
      await openTray()
      fireEvent.press(lastButton('Delete account'))
      expect(await screen.findByText(`This can’t be undone. You’d need a new account to use Blend’n again. Sign in with ${name} once more to confirm.`)).toBeTruthy()
      expect(screen.queryByTestId('delete-password')).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }))
    }

    it('and sends the fresh token with the delete', async () => {
      ;(proofFor as jest.Mock).mockResolvedValue(proof)
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: true })
      await confirm()
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Your account has been deleted.', 'success'))
      expect(proofFor).toHaveBeenCalledTimes(1)
      expect(deleteAccount).toHaveBeenCalledWith(proof)
    })

    it('a cancelled sheet deletes nothing and says what it needs', async () => {
      ;(proofFor as jest.Mock).mockResolvedValue(null)
      await confirm()
      expect(await screen.findByText(`Sign in with ${name} to delete your account.`)).toBeTruthy()
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('a stale or foreign token the server refuses asks again', async () => {
      ;(proofFor as jest.Mock).mockResolvedValue(proof)
      ;(deleteAccount as jest.Mock).mockResolvedValue({ success: false, error: 'Forbidden', errorCode: 'REAUTH_REQUIRED' })
      await confirm()
      expect(await screen.findByText(`Sign in with ${name} again to delete your account.`)).toBeTruthy()
      expect(mockShowToast).not.toHaveBeenCalled()
    })
  })

  it('Cancel deletes nothing', async () => {
    await render(<Screen />)
    await openTray()
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it.each([
    ['apple', 'App Store'],
    ['google', 'Google Play'],
  ] as const)('says to cancel a %s subscription first, with Manage subscription (review H1)', async (source, store) => {
    const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<Screen />)
    api.getMyPlus.mockResolvedValue({ success: true, data: plusStatus({ active: true, source }) } as never)
    await openTray()
    expect(
      await screen.findByText(`Cancel Blend’n+ in your ${store} subscriptions first. Deleting your account doesn’t cancel it.`)
    ).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Manage subscription' }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//)))
    opened.mockRestore()
  })

  it('says nothing about the store for a grant, or no Plus', async () => {
    await render(<Screen />)
    for (const data of [plusStatus({ active: true, source: 'grant' }), plusStatus()]) {
      api.getMyPlus.mockResolvedValue({ success: true, data } as never)
      await openTray()
      await waitFor(() => expect(api.getMyPlus).toHaveBeenCalled())
      expect(screen.queryByText(/Deleting your account doesn’t cancel it/)).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    }
  })
})

describe('Blendn+ row (review H2)', () => {
  it('in a launch season says it is free and opens an info tray that sells nothing', async () => {
    api.getMyPlus.mockResolvedValue({ success: true, data: plusStatus({ gated: false }) } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: /^Blend’n\+, Free during launch in your city/ }))
    expect(await screen.findByText('Blend’n+ is free here for now')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('where it is sold, opens the paywall', async () => {
    await render(<Screen />)
    await waitFor(() => expect(api.getMyPlus).toHaveBeenCalled())
    fireEvent.press(await screen.findByRole('button', { name: /^Blend’n\+, See plans/ }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/plus' })))
  })
})

it('reports a sign-out the server did not hear about', async () => {
  ;(signOut as jest.Mock).mockResolvedValue({ success: false })
  await render(<Screen />)
  fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }))
  await screen.findByText('Sign out?')
  const buttons = screen.getAllByText('Sign out')
  fireEvent.press(buttons[buttons.length - 1])

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/^Signed out on this phone/), 'info'))
})

it('says which setting did not save, as a toast that plays the one error haptic', async () => {
  api.updateProfile.mockResolvedValue({ success: false, error: 'nope' } as never)
  await render(<Screen />)
  const toggle = () => screen.getByRole('switch', { name: 'Read receipts' })
  await waitFor(() => expect(toggle().props.accessibilityState.disabled).toBe(false))
  fireEvent.press(toggle())

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Couldn’t save “Read receipts”. Try again.", 'error', { haptic: 'error' }))
})

it('sends ONLY the switch that was changed: the other three are never sent from a stale screen (consent)', async () => {
  // The screen holds friendsSeeMe false (cached, or read before the one-time ask turned it on elsewhere).
  api.getProfile.mockResolvedValue({
    success: true,
    data: { profile: { push_enabled: true, show_online: true, read_receipts: true, share_location: true, friends_see_me_in_rooms: false } },
  } as never)
  await render(<Screen />)
  const toggle = () => screen.getByRole('switch', { name: 'Read receipts' })
  await waitFor(() => expect(toggle().props.accessibilityState.disabled).toBe(false))
  fireEvent.press(toggle())

  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledTimes(1))
  expect(api.updateProfile).toHaveBeenCalledWith('u_me', { read_receipts: false })
  expect(Object.keys(api.updateProfile.mock.calls[0][1] as object)).toEqual(['read_receipts'])
})

it('each switch sends its own column, and only that', async () => {
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true, friends_see_me_in_rooms: false } } } as never)
  await render(<Screen />)
  const friends = () => screen.getByRole('switch', { name: /^Friends can see I’m here/ })
  await waitFor(() => expect(friends().props.accessibilityState.disabled).toBe(false))
  fireEvent.press(friends())
  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('u_me', { friends_see_me_in_rooms: true }))
})

// D-L24: the sub names what the switch does now. Negative control: the static "Off: …" sub fails the On half.
it('"Show online status" says what On means while it is on', async () => {
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true, show_online: true } } } as never)
  await render(<Screen />)
  const labels = () => screen.queryAllByRole('switch', { includeHiddenElements: true }).map((n) => String(n.props.accessibilityLabel))
  await waitFor(() => expect(labels()).toContain(`Show online status, ${ONLINE_STATUS_HINT.on}`))
})

it('opens About and Contact support', async () => {
  await render(<Screen />)
  fireEvent.press(await screen.findByRole('button', { name: 'About Blend’n' }))
  expect(router.push).toHaveBeenCalledWith('/about')
  fireEvent.press(screen.getByRole('button', { name: 'Contact support' }))
  expect(router.push).toHaveBeenCalledWith('/support')
})
