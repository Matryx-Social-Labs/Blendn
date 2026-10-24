/**
 * About: our own documents open in the in-app browser (blendn.app only); the
 * map's credits — OpenStreetMap's ODbL one among them is required — are other
 * sites' and open in the system browser. A refused link was six dead rows.
 * The version copies on a tap, and the grievance officer is a row that opens the mail app.
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
jest.mock('../components/onboarding/Backdrop', () => ({ Backdrop: () => null, ORB_LEVEL: { landing: 1 } }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }))
jest.mock('../components/ds/TopBar', () => ({ TopBar: () => null }))
jest.mock('../components/motion/ScalePress', () => ({ __esModule: true, default: require('react-native').Pressable }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

/* eslint-disable import/first */
import * as Clipboard from 'expo-clipboard'
import AboutScreen from '../app/about'
import { appVersionLabel, GRIEVANCE, grievanceMailto } from '../lib/support'
import { BLENDN_LINKS } from '../lib/links'
import { MAP_CREDITS } from '../lib/mapStyleEmber'
/* eslint-enable import/first */

const credits = Object.values(MAP_CREDITS)

it.each(credits.map((c) => [c.text, c.href] as const))('the map credit “%s” opens in the system browser', async (text, href) => {
  const system = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<AboutScreen />)
  fireEvent.press(screen.getByLabelText(new RegExp(text.replace(/[©.]/g, '.'))))
  await waitFor(() => expect(system).toHaveBeenCalledWith(href))
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled()
  expect(mockToast).not.toHaveBeenCalled()
  system.mockRestore()
})

it('there are six credits, and the OpenStreetMap licence link is one of them', () => {
  expect(credits).toHaveLength(6)
  expect(credits.map((c) => c.href)).toContain('https://www.openstreetmap.org/copyright')
})

it.each([
  ['Terms of Service', BLENDN_LINKS.terms],
  ['Privacy Policy', BLENDN_LINKS.privacy],
  ['Community guidelines', BLENDN_LINKS.guidelines],
])('%s opens in the in-app browser', async (title, url) => {
  const system = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  await render(<AboutScreen />)
  fireEvent.press(screen.getByLabelText(new RegExp(`^${title}`)))
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url, expect.any(Object)))
  expect(system).not.toHaveBeenCalled()
  system.mockRestore()
})

it('a link that will not open is a toast, not a silent row', async () => {
  const system = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'))
  await render(<AboutScreen />)
  fireEvent.press(screen.getByLabelText(/OpenFreeMap/))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("That page didn’t open. Try again.", 'error'))
  system.mockRestore()
})

describe('the version', () => {
  it('copies on a tap and says what it copied, with no haptic of its own', async () => {
    await render(<AboutScreen />)
    fireEvent.press(screen.getByLabelText(/^Version /))
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(appVersionLabel()))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(`Copied ${appVersionLabel()}`, 'success'))
  })

  it('says so when the clipboard refuses', async () => {
    ;(Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('no'))
    await render(<AboutScreen />)
    fireEvent.press(screen.getByLabelText(/^Version /))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn’t copy that. Try again.", 'error'))
  })
})

describe('the grievance officer', () => {
  it('is named with the legal company and address, and the row opens the mail app', async () => {
    const system = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<AboutScreen />)
    const row = screen.getByTestId('about-grievances')
    expect(row.props.accessibilityLabel).toContain(GRIEVANCE.officer)
    expect(row.props.accessibilityLabel).toContain('Matryx Social Labs Private Limited')
    expect(row.props.accessibilityLabel).toContain('opens your mail app')
    fireEvent.press(row)
    await waitFor(() => expect(system).toHaveBeenCalledWith(grievanceMailto()))
    expect(grievanceMailto()).toContain('grievance@blendn.app')
    system.mockRestore()
  })
})

it('keeps a licence whole when a map-data row wraps: "(CC BY 4.0)" has non-breaking spaces', async () => {
  await render(<AboutScreen />)
  expect(screen.getByText('Google Open Buildings (CC BY 4.0)')).toBeTruthy()
})

// D-M10: the wordmark never breaks "Blend’ / n" at AX. Negative control: without `numberOfLines={1}` it fails.
it('sets the wordmark on one line, shrunk to fit', async () => {
  await render(<AboutScreen />)
  const mark = screen.getByTestId('about-wordmark')
  expect(mark.props.numberOfLines).toBe(1)
  expect(mark.props.adjustsFontSizeToFit).toBe(true)
})
