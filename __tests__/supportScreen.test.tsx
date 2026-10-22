/**
 * Contact support: the card says what the draft carries (app, phone, account), Email support opens the mail app with
 * it, no mail app is an info toast with the address, the address copies, and the Help centre failing is a toast.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as WebBrowser from 'expo-web-browser'
import { Linking } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }))
jest.mock('../components/ds/TopBar', () => ({ TopBar: () => null }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
const mockAuth = { user: { id: '8f3a5d2e-9b1c-4c77-a0de-5b6c7d8e21c1' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))

/* eslint-disable import/first */
import * as Clipboard from 'expo-clipboard'
import SupportScreen from '../app/support'
import { BLENDN_LINKS } from '../lib/links'
import { SUPPORT_EMAIL } from '../lib/support'
/* eslint-enable import/first */

beforeEach(() => jest.clearAllMocks())

it('says what the draft includes: the app, the phone and a short account id', async () => {
  await render(<SupportScreen />)
  expect(screen.getByLabelText(/^App, /)).toBeTruthy()
  expect(screen.getByLabelText(/^iOS, /)).toBeTruthy()
  expect(screen.getByLabelText('Account ID, 8f3a…21c1')).toBeTruthy()
})

it('Email support opens the mail app with the whole account id in the draft', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<SupportScreen />)
  fireEvent.press(screen.getByTestId('support-email'))
  await waitFor(() => expect(open).toHaveBeenCalled())
  const url = decodeURIComponent(String(open.mock.calls[0][0]))
  expect(url).toContain(`mailto:${SUPPORT_EMAIL}`)
  expect(url).toContain(mockAuth.user.id)
  open.mockRestore()
})

it('no mail app is an info toast that carries the address', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'))
  await render(<SupportScreen />)
  fireEvent.press(screen.getByTestId('support-email'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(`No email app opened. Write to ${SUPPORT_EMAIL}.`, 'info'))
  open.mockRestore()
})

it('the address copies, and the toast names it', async () => {
  await render(<SupportScreen />)
  fireEvent.press(screen.getByTestId('support-address'))
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(SUPPORT_EMAIL))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(`Copied ${SUPPORT_EMAIL}`, 'success'))
})

it('the Help centre opens in the app, and a refusal is a toast', async () => {
  await render(<SupportScreen />)
  fireEvent.press(screen.getByLabelText(/^Help centre/))
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(BLENDN_LINKS.help, expect.any(Object)))
  ;(WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValueOnce(new Error('no browser'))
  fireEvent.press(screen.getByLabelText(/^Help centre/))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("That page didn’t open. Try again.", 'error'))
})
