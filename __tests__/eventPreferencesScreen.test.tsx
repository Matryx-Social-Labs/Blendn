/**
 * The screen after check-in — "Why do you go out?" and "Can people see who you
 * are?" — designed off placeholder (2026-09-28).
 *
 * Simulator QA found it still showing testers a red "PLACEHOLDER DESIGN"
 * banner, and AXe read its Save as a GenericElement: a `TouchableOpacity` with
 * no role, so VoiceOver announced a word, not a button. Behavioural, because
 * "is it a button, and does it say what is chosen" is what a screen reader
 * gets, and a grep for the prop would pass on the wrong element.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { SafeAreaView: (p: object) => React.createElement(View, p) }
})
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), setMatchPreferences: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import EventPreferences from '../app/event-preferences/[eventId]'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>

beforeEach(() => {
  jest.clearAllMocks()
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  Object.assign(mockParams, { eventId: 'e1', revealed: '0', askIntent: '1' })
  api.getProfile.mockResolvedValue({
    success: true,
    data: { name: 'Sagar', profile: { age: 27, name: 'Sagar', photos: ['p.jpg'] } },
  } as never)
  api.setMatchPreferences.mockResolvedValue({ success: true } as never)
})

it('shows no placeholder banner, in the render or the source', async () => {
  await render(<EventPreferences />)
  expect(screen.queryByText(/PLACEHOLDER/)).toBeNull()
  const src = readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8')
  expect(src).not.toContain('PLACEHOLDER')
  expect(src).not.toContain('TouchableOpacity')
})

it('exposes Save as a button, disabled until the first-door question has an answer', async () => {
  await render(<EventPreferences />)
  const save = await screen.findByRole('button', { name: 'Save' })
  expect(save.props.accessibilityState).toMatchObject({ disabled: true })

  await fireEvent.press(screen.getByRole('button', { name: /^Networking/ }))
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: false })
})

it('says which intents are chosen, and "Just here" clears the rest', async () => {
  await render(<EventPreferences />)
  const networking = () => screen.getByRole('button', { name: /^Networking/ })
  const justHere = () => screen.getByRole('button', { name: /^Just here for the event/ })

  expect(networking().props.accessibilityState).toMatchObject({ selected: false })
  await fireEvent.press(networking())
  expect(networking().props.accessibilityState).toMatchObject({ selected: true })

  await fireEvent.press(justHere())
  expect(justHere().props.accessibilityState).toMatchObject({ selected: true })
  expect(networking().props.accessibilityState).toMatchObject({ selected: false })
})

it('saves exactly what it did before the redesign, then goes back', async () => {
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('button', { name: /^Making friends/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1))
  expect(api.setMatchPreferences).toHaveBeenCalledWith('e1', {
    intent: ['friendship'],
    rememberIntent: true,
    revealed: false,
    rememberReveal: false,
  })
})

it('leaves the intent alone when only the reveal was opened', async () => {
  // No GET for per-event intent: sending the empty selection would wipe it.
  Object.assign(mockParams, { askIntent: undefined })
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('button', { name: 'Save' }))
  await waitFor(() => expect(api.setMatchPreferences).toHaveBeenCalled())
  expect(api.setMatchPreferences.mock.calls[0][1]).toMatchObject({ intent: undefined, revealed: false })
})

it('leads with the intent question at the first door, and the reveal question otherwise', async () => {
  await render(<EventPreferences />)
  expect(await screen.findByText('Why do you go out?')).toBeTruthy()
  expect(screen.queryByText('Why are you here tonight?')).toBeNull()
})

it('asks "Why are you here tonight?" when only the reveal was opened', async () => {
  Object.assign(mockParams, { askIntent: undefined })
  await render(<EventPreferences />)
  expect(await screen.findByText('Why are you here tonight?')).toBeTruthy()
  expect(screen.queryByText('Why do you go out?')).toBeNull()
})

it("shows the server's sentence when a save is refused, and stays on the screen", async () => {
  // "Dating is for 18+" is something a person can act on; "could not save" is not.
  api.setMatchPreferences.mockResolvedValue({ success: false, error: 'Dating is for 18+' } as never)
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('button', { name: /^Making friends/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Dating is for 18+', 'error'))
  expect(router.back).not.toHaveBeenCalled()
})

it('says it could not save when a refusal carries no sentence', async () => {
  api.setMatchPreferences.mockResolvedValue({ success: false } as never)
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('button', { name: /^Making friends/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Could not save. Try again.', 'error'))
  expect(router.back).not.toHaveBeenCalled()
})

it('never offers Dating to a minor', async () => {
  api.getProfile.mockResolvedValue({
    success: true,
    data: { name: 'Kid', profile: { age: 17, name: 'Kid', photos: [] } },
  } as never)
  await render(<EventPreferences />)
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Dating/ })).toBeNull())
  // And with no photo, the reveal switch says what is missing.
  expect(await screen.findByText(/to your profile first/)).toBeTruthy()
})
