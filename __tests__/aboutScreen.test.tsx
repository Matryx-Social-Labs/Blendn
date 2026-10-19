/**
 * About: our own documents open in the in-app browser (blendn.app only); the
 * map's credits — OpenStreetMap's ODbL one among them is required — are other
 * sites' and open in the system browser. A refused link was six dead rows.
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
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }))
jest.mock('../components/motion/ScalePress', () => ({ __esModule: true, default: require('react-native').Pressable }))
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

/* eslint-disable import/first */
import AboutScreen from '../app/about'
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
  fireEvent.press(screen.getByLabelText(title))
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url, expect.any(Object)))
  expect(system).not.toHaveBeenCalled()
  system.mockRestore()
})

it('a link that will not open is a toast, not a silent row', async () => {
  const system = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'))
  await render(<AboutScreen />)
  fireEvent.press(screen.getByLabelText(/OpenFreeMap/))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("That page didn't open. Try again.", 'error'))
  system.mockRestore()
})
