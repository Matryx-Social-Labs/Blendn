/**
 * Flow 5 C3 (P-A): Room settings asks Tonight's question when the room has one. Your answer goes through
 * PUT /matches/preferences (≤ 140 after the server's trim); the server's moderation refusal is said in the field, in
 * its own words; clearing it sends null; a room with no question (a venue night, no lens) shows no field.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  // A router modal holds the screen while focused (components/system/RouteModal): here it is focused while mounted.
  // A router modal releases the screen on its transitionEnd (components/system/RouteModal): no navigator here.
  useNavigation: () => undefined,
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  }
})
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
// The screen tells a waiting check-in it has gone (lib/checkIn.ts); its storage is native.
jest.mock('../lib/roomVisibilityStorage', () => ({}))
// The link-closing signal as lib/pendingRoute gives it; `mockCloseForLink()` is a link closing the modals.
const mockLinkClosers = new Set<() => void>()
const mockCloseForLink = () => [...mockLinkClosers].forEach((listener) => listener())
jest.mock('../lib/linkClosers', () => ({
  onClosingForLink: (listener: () => void) => {
    mockLinkClosers.add(listener)
    return () => mockLinkClosers.delete(listener)
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), getMatchPreferences: jest.fn(() => Promise.resolve({ success: false })), setMatchPreferences: jest.fn(), forgetActiveCheckins: jest.fn(), forgetVenues: jest.fn(), forgetEvent: jest.fn() },
}))
// The faces as host nodes carrying what they were given: which creature a card draws is the pseudonym it was handed.
jest.mock('../components/ds/Avatar', () => {
  const { View } = jest.requireActual('react-native')
  return { Avatar: (p: { kind: string }) => <View testID={`avatar-${p.kind}`} {...p} /> }
})
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import EventPreferences from '../app/event-preferences/[eventId]'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const WORK = { key: 'work', question: 'What are you working on?' }
const prefs = (lens: unknown, tonightAnswer: string | null = null) =>
  api.getMatchPreferences.mockResolvedValue({ success: true, data: { intent: [], revealed: false, tonightAnswer, lens } } as never)

beforeEach(() => {
  jest.clearAllMocks()
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  Object.assign(mockParams, { eventId: 'e1', revealed: '0', pseudonym: 'Quiet Lynx' })
  api.getProfile.mockResolvedValue({ success: true, data: { name: 'Sagar', profile: { age: 27, name: 'Sagar', photos: ['p.jpg'] } } } as never)
  api.setMatchPreferences.mockResolvedValue({ success: true } as never)
})

const field = () => screen.findByTestId('prefs-tonight-input')
const save = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
  await act(async () => {})
}
const sent = () => api.setMatchPreferences.mock.calls[0]?.[1] as Record<string, unknown>

it('asks the room’s question, with your saved answer in the field and its count', async () => {
  prefs(WORK, 'A map of quiet cafés')
  await render(<EventPreferences />)
  expect((await field()).props.value).toBe('A map of quiet cafés')
  expect(screen.getByText('What are you working on?')).toBeTruthy()
  expect(screen.getByText('20/140', { includeHiddenElements: true })).toBeTruthy()
})

it('a room with no question shows no field: a venue night, no lens, or the read failed', async () => {
  for (const answer of [() => prefs({ key: 'venue_night', question: null }), () => prefs(null), () => api.getMatchPreferences.mockResolvedValue({ success: false } as never)]) {
    answer()
    await render(<EventPreferences />)
    await act(async () => {})
    expect(screen.queryByTestId('prefs-tonight-input')).toBeNull()
  }
})

it('saves your answer trimmed the way the server trims it', async () => {
  prefs(WORK)
  await render(<EventPreferences />)
  await fireEvent.changeText(await field(), '  Riso   zines \n and a tram map ')
  await save()
  expect(sent().tonightAnswer).toBe('Riso zines and a tram map')
})

it('an answer left as it was is not sent (the other choices still save)', async () => {
  prefs(WORK, 'Same as before')
  await render(<EventPreferences />)
  await field()
  await save()
  expect(sent()).not.toHaveProperty('tonightAnswer')
})

it('Clear empties it, and saving sends null', async () => {
  prefs(WORK, 'Something to take back')
  await render(<EventPreferences />)
  await field()
  await fireEvent.press(screen.getByRole('button', { name: 'Clear your answer' }))
  expect((await field()).props.value).toBe('')
  await save()
  expect(sent().tonightAnswer).toBeNull()
})

it('a moderation refusal is said in the field in the server’s words, and the screen stays', async () => {
  prefs(WORK)
  api.setMatchPreferences.mockResolvedValue({ success: false, error: 'That can’t go in your answer.', reasonCode: 'TEXT_NOT_ALLOWED', errorCode: 'VALIDATION_FAILED' } as never)
  await render(<EventPreferences />)
  await fireEvent.changeText(await field(), 'something it refuses')
  await save()
  expect(screen.getByText('That can’t go in your answer.')).toBeTruthy()
  expect(mockShowToast).not.toHaveBeenCalled()
  expect(router.back).not.toHaveBeenCalled()
  // Typing again clears the refusal.
  await fireEvent.changeText(await field(), 'something else')
  expect(screen.queryByText('That can’t go in your answer.')).toBeNull()
})

it('over 140 (counted as the server counts: code points) Save refuses', async () => {
  prefs(WORK)
  await render(<EventPreferences />)
  await fireEvent.changeText(await field(), '😀'.repeat(141))
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: true })
  await fireEvent.changeText(await field(), '😀'.repeat(140))
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: false })
})
