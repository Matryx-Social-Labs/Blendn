/**
 * The community guidelines ask at the top of an event room's chat.
 *
 * Once per room, until "Got it": a dismissal at one event says nothing about the
 * next room of strangers. Behavioural against the AsyncStorage mock, plus the
 * two places that must open the same URL: the banner's link and the Settings row.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
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
  return { SafeAreaView: (p: object) => React.createElement(View, p) }
})
// One object, as the real singleton hands out: a fresh one per render re-runs
// Settings' load effect forever.
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
import { RoomGuidelinesBanner } from '../components/chat/RoomGuidelinesBanner'
import { COMMUNITY_GUIDELINES_URL, roomGuidelinesKey } from '../lib/communityGuidelines'

const BANNER = 'room-guidelines-banner'

/**
 * Render a room's banner and let its stored flag's read land. Every test reads
 * synchronously after this, so the one asserting absence is not passing merely
 * because it looked before the read finished — the ones asserting presence
 * prove the flush is enough.
 */
async function openRoom(userId: string, chatRoomId: string) {
  const view = await render(<RoomGuidelinesBanner userId={userId} chatRoomId={chatRoomId} />)
  await act(async () => {})
  return view
}

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true)
})

it('links to the published page', () => {
  expect(COMMUNITY_GUIDELINES_URL).toBe('https://www.blendn.app/community-guidelines')
})

it('shows on the first open of a room', async () => {
  await openRoom('u_me', 'room_a')
  expect(screen.getByTestId(BANNER)).toBeTruthy()
  expect(screen.getByText('This room is anonymous. Be kind, keep it safe — people here are real.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Community guidelines' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy()
})

it('"Got it" hides it, and it stays hidden when that room opens again', async () => {
  const first = await openRoom('u_me', 'room_a')
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  expect(screen.queryByTestId(BANNER)).toBeNull()
  await waitFor(async () =>
    expect(await AsyncStorage.getItem(roomGuidelinesKey('u_me', 'room_a'))).toBe('dismissed')
  )
  await first.unmount()

  await openRoom('u_me', 'room_a')
  expect(screen.queryByTestId(BANNER)).toBeNull()
})

it("shows again in a different event's room", async () => {
  await AsyncStorage.setItem(roomGuidelinesKey('u_me', 'room_a'), 'dismissed')
  await openRoom('u_me', 'room_b')
  expect(screen.getByTestId(BANNER)).toBeTruthy()
})

it('shows for a second account on the same phone', async () => {
  await AsyncStorage.setItem(roomGuidelinesKey('u_me', 'room_a'), 'dismissed')
  await openRoom('u_other', 'room_a')
  expect(screen.getByTestId(BANNER)).toBeTruthy()
})

it('shows when the stored flag cannot be read — the safe direction', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('disk'))
  await openRoom('u_me', 'room_a')
  expect(screen.getByTestId(BANNER)).toBeTruthy()
})

it('the link opens the guidelines', async () => {
  await openRoom('u_me', 'room_a')
  await fireEvent.press(screen.getByRole('link', { name: 'Community guidelines' }))
  expect(Linking.openURL).toHaveBeenCalledWith(COMMUNITY_GUIDELINES_URL)
  // Reading the rules is not agreeing to them: the banner stays.
  expect(screen.getByTestId(BANNER)).toBeTruthy()
})

it('the Settings row opens the same page', async () => {
  await render(<SettingsScreen />)
  await fireEvent.press(await screen.findByRole('button', { name: 'Community guidelines' }))
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(COMMUNITY_GUIDELINES_URL))
})
