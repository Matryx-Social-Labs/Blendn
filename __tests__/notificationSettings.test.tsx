/**
 * Notification settings (Flow 9 · 9.6): the master switch, the phone blocking, the kinds dimming with the master,
 * and the degrade: no per-kind switch until the server sends them.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking, Platform } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
const mockUser = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockUser }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), queuedRequest: jest.fn() },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
jest.mock('expo-application', () => ({ applicationId: 'app.blendn' }))
jest.mock('../lib/haptics', () => ({ H: { toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn() } }))

import * as Notifications from 'expo-notifications'
import NotificationSettingsScreen from '../app/notification-settings'
import { OFFERS_PUSH_OFF } from '../components/notifications/OffersFromPlacesRow'
import { SheetHost } from '../components/SheetHost'
import { apiClient } from '../lib/apiClient'
import { openChannelSettings } from '../lib/channelSettings'
import { parsePrefs } from '../lib/notificationPrefs'
import { closeSheet } from '../lib/sheet'
import { View } from 'react-native'
import { forgetPushPermission } from '../lib/pushStatus'
import { resetPushPreferenceStore } from '../lib/usePushPreference'

const api = apiClient as jest.Mocked<typeof apiClient>
const permissions = Notifications.getPermissionsAsync as jest.Mock
const Screen = () => (
  <View>
    <NotificationSettingsScreen />
    <SheetHost />
  </View>
)

/** The server's answers by path: offers on, per-kind preferences per test. */
let kinds: unknown = { success: false, errorCode: 'NOT_FOUND' }
/** `/me/offers`: a place has regulars on for this person, unless a test says not (D21). */
let offers: unknown = { success: true, data: { enabled: true, regulars: { active: true } } }
beforeEach(() => {
  offers = { success: true, data: { enabled: true, regulars: { active: true } } }
  // The permission is read once a session (RC drive D1): each test is a new one.
  forgetPushPermission()
  resetPushPreferenceStore()
  jest.clearAllMocks()
  kinds = { success: false, errorCode: 'NOT_FOUND' }
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  api.updateProfile.mockResolvedValue({ success: true } as never)
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  ;(api.queuedRequest as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('notification-preferences')) {
      return Promise.resolve(init?.method === 'PUT' ? { success: true, data: { matches: false, crew: true, night: true } } : kinds)
    }
    return Promise.resolve(init?.method === 'PUT' ? { success: true, data: { enabled: true } } : offers)
  })
})
afterEach(async () => {
  await act(async () => closeSheet())
})

describe('parsePrefs', () => {
  it('takes all three booleans or nothing', () => {
    expect(parsePrefs({ matches: true, crew: false, night: true })).toEqual({ matches: true, crew: false, night: true })
    for (const bad of [null, 'x', {}, { matches: true, crew: false }, { matches: 1, crew: 0, night: 1 }]) expect(parsePrefs(bad)).toBeNull()
  })
})

describe('the master switch', () => {
  it('shows what the account says and saves as before', async () => {
    await render(<Screen />)
    const toggle = () => screen.getByRole('switch', { name: /^Push notifications/ })
    await waitFor(() => expect(toggle().props.accessibilityState).toMatchObject({ checked: true, disabled: false }))
    fireEvent.press(toggle())
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith('u_me', { push_enabled: false }))
  })

  it('dimmed, it says why: checking while it reads, and a row to try again when the read failed (r7 L9)', async () => {
    let answer: (v: unknown) => void = () => {}
    api.getProfile.mockReturnValueOnce(new Promise((r) => (answer = r)) as never)
    await render(<Screen />)
    expect(screen.getByText('Checking your setting…')).toBeTruthy()
    await act(async () => answer({ success: false, error: 'offline' }))
    expect(await screen.findByText('Couldn’t load this setting. Tap to try again.')).toBeTruthy()
    fireEvent.press(screen.getByTestId('settings-pushEnabled-retry'))
    await waitFor(() => expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState).toMatchObject({ checked: true, disabled: false }))
  })

  it('rolls back, with a toast naming it, when the save fails', async () => {
    api.updateProfile.mockResolvedValue({ success: false, error: 'no' } as never)
    await render(<Screen />)
    await waitFor(() => expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState.disabled).toBe(false))
    fireEvent.press(screen.getByRole('switch', { name: /^Push notifications/ }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t save “Push notifications”. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState.checked).toBe(true)
  })

  it('dims the kinds when it is off, and they take no touch', async () => {
    api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: false } } } as never)
    await render(<Screen />)
    await waitFor(() => expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState.checked).toBe(false))
    const kindsBlock = screen.getByTestId('notification-settings-kinds')
    expect(kindsBlock.props.pointerEvents).toBe('none')
    expect(kindsBlock.props.style).toMatchObject({ opacity: 0.45 })
  })
})

describe('the phone blocking', () => {
  it('is a solid row with Turn on, and Turn on opens the phone’s settings; the switch reads off', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await render(<Screen />)
    expect(await screen.findByText('Your phone is blocking Blend’n’s notifications.')).toBeTruthy()
    expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState.checked).toBe(false)
    fireEvent.press(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(openSettings).toHaveBeenCalled())
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('explains, and changes nothing, when the switch is pressed', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await render(<Screen />)
    await screen.findByText('Your phone is blocking Blend’n’s notifications.')
    fireEvent.press(screen.getByRole('switch', { name: /^Push notifications/ }))
    expect(await screen.findByText('Notifications are off')).toBeTruthy()
    expect(api.updateProfile).not.toHaveBeenCalled()
  })

  it('is not shown when pushes are on', async () => {
    await render(<Screen />)
    await waitFor(() => expect(screen.getByRole('switch', { name: /^Push notifications/ }).props.accessibilityState.checked).toBe(true))
    expect(screen.queryByText(/blocking/)).toBeNull()
  })
})

describe('the kinds, until the server sends them', () => {
  it('hides the per-kind switches and keeps Offers, the one the server has', async () => {
    await render(<Screen />)
    expect(await screen.findByRole('switch', { name: /^Offers from places/ })).toBeTruthy()
    for (const title of ['Matches and friends', 'Your crew', 'After the night']) expect(screen.queryByText(title)).toBeNull()
  })

  it('shows them once the server sends all three, and a flip saves just that one', async () => {
    kinds = { success: true, data: { matches: true, crew: true, night: true } }
    await render(<Screen />)
    const row = await screen.findByRole('switch', { name: 'Matches and friends' })
    fireEvent.press(row)
    await waitFor(() => {
      const put = (api.queuedRequest as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PUT' && String(init.body).includes('matches'))
      expect(put?.[1].body).toBe(JSON.stringify({ matches: false }))
    })
    expect(screen.getByRole('switch', { name: 'Your crew' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'After the night' })).toBeTruthy()
  })

  it('puts a kind back with a toast when its save fails', async () => {
    kinds = { success: true, data: { matches: true, crew: true, night: true } }
    ;(api.queuedRequest as jest.Mock).mockImplementation((url: string, init?: RequestInit) =>
      url.includes('notification-preferences') ? Promise.resolve(init?.method === 'PUT' ? { success: false } : kinds) : Promise.resolve({ success: true, data: { enabled: true } })
    )
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('switch', { name: 'Your crew' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t save “Your crew”. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByRole('switch', { name: 'Your crew' }).props.accessibilityState.checked).toBe(true)
  })

  it('says what the switches do: they stop the push only', async () => {
    await render(<Screen />)
    expect(await screen.findByText(/These stop the push only; the bell still fills\./)).toBeTruthy()
  })
})

describe('openChannelSettings', () => {
  it('asks the phone for that channel’s page on Android, and falls back to the app’s settings', async () => {
    const original = Platform.OS
    Platform.OS = 'android'
    const send = jest.spyOn(Linking, 'sendIntent').mockResolvedValueOnce()
    await openChannelSettings('crew')
    expect(send).toHaveBeenCalledWith('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'app.blendn' },
      { key: 'android.provider.extra.CHANNEL_ID', value: 'crew' },
    ])
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    send.mockRejectedValueOnce(new Error('no'))
    await openChannelSettings('crew')
    expect(open).toHaveBeenCalled()
    Platform.OS = original
  })
})

// D21 (D-M4, D-LM13): no control for a feature that doesn't exist; no live switch for offers that can't arrive.
// Negative control: the row as it was (always drawn, live with push off) fails both.
describe('Offers from places, while regulars are deferred', () => {
  it('is not drawn until the server says a place has regulars on for this person', async () => {
    offers = { success: true, data: { enabled: true } }
    await render(<Screen />)
    await screen.findByRole('switch', { name: /^Push notifications/ })
    await act(async () => {})
    expect(screen.queryByText('Offers from places')).toBeNull()
  })

  it('with push off it is off, held, and says why', async () => {
    api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: false } } } as never)
    await render(<Screen />)
    const row = await screen.findByRole('switch', { name: /^Offers from places/ })
    expect(row.props.accessibilityState).toMatchObject({ disabled: true, checked: false })
    expect(screen.getByText(OFFERS_PUSH_OFF)).toBeTruthy()
  })
})

describe('one offers row', () => {
  it('Android lists “Offers from places” once: no second “Offers channel” row beside it (drive r7)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'notification-settings.tsx'), 'utf8') as string
    expect(src).not.toMatch(/Offers channel/)
    expect(src.match(/<OffersFromPlacesRow\b/g)).toHaveLength(1)
  })
})
