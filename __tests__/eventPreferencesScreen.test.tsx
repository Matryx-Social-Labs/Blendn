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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'
import { AX_XXXL, atScale, resetScale, textNodes } from './helpers/togetherAx'
import { MAX_FONT_SCALE } from '../lib/design/tokens'

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
jest.mock('../lib/pendingRoute', () => ({
  onClosingForLink: (listener: () => void) => {
    mockLinkClosers.add(listener)
    return () => mockLinkClosers.delete(listener)
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), setMatchPreferences: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import EventPreferences from '../app/event-preferences/[eventId]'
import { apiClient } from '../lib/apiClient'
import { untilIntentAnswered } from '../lib/checkIn'
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

  await fireEvent.press(screen.getByRole('checkbox', { name: /^Networking/ }))
  expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: false })
})

it('says which intents are chosen, and "Just here" clears the rest', async () => {
  await render(<EventPreferences />)
  const networking = () => screen.getByRole('checkbox', { name: /^Networking/ })
  const justHere = () => screen.getByRole('checkbox', { name: /^Just here for the event/ })

  expect(networking().props.accessibilityState).toMatchObject({ checked: false })
  await fireEvent.press(networking())
  expect(networking().props.accessibilityState).toMatchObject({ checked: true })

  await fireEvent.press(justHere())
  expect(justHere().props.accessibilityState).toMatchObject({ checked: true })
  expect(networking().props.accessibilityState).toMatchObject({ checked: false })
})

it('saves exactly what it did before the redesign, then goes back', async () => {
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('checkbox', { name: /^Making friends/ }))
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

it("shows the server’s sentence when a save is refused, and stays on the screen", async () => {
  // "Dating is for 18+" is something a person can act on; "could not save" is not.
  api.setMatchPreferences.mockResolvedValue({ success: false, error: 'Dating is for 18+' } as never)
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('checkbox', { name: /^Making friends/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Dating is for 18+', 'error', { haptic: 'error' }))
  expect(router.back).not.toHaveBeenCalled()
})

it('says it could not save when a refusal carries no sentence', async () => {
  api.setMatchPreferences.mockResolvedValue({ success: false } as never)
  await render(<EventPreferences />)
  await fireEvent.press(await screen.findByRole('checkbox', { name: /^Making friends/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Could not save. Try again.', 'error', { haptic: 'error' }))
  expect(router.back).not.toHaveBeenCalled()
})

it('never offers Dating to a minor', async () => {
  api.getProfile.mockResolvedValue({
    success: true,
    data: { name: 'Kid', profile: { age: 17, name: 'Kid', photos: [] } },
  } as never)
  await render(<EventPreferences />)
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: /^Dating/ })).toBeNull())
  // And with no photo, the reveal switch says what is missing.
  expect(await screen.findByText(/to your profile first/)).toBeTruthy()
})

it('tells a waiting check-in when the first-door question goes, so the room comes after it (Flow 4 #14)', async () => {
  const answered = jest.fn()
  void untilIntentAnswered().then(answered)
  const view = await render(<EventPreferences />)
  await Promise.resolve()
  expect(answered).not.toHaveBeenCalled()
  await view.unmount()
  await Promise.resolve()
  expect(answered).toHaveBeenCalledTimes(1)
})

it('closed by the person it says "closed"; closed for a link it says "abandoned", and the check-in stops (review MED-2)', async () => {
  const outcomes: string[] = []
  void untilIntentAnswered().then((o) => outcomes.push(o))
  const byPerson = await render(<EventPreferences />)
  await byPerson.unmount()
  await Promise.resolve()

  void untilIntentAnswered().then((o) => outcomes.push(o))
  const byLink = await render(<EventPreferences />)
  // Told before the screen goes (RC drive 6): settled then, and the unmount's "closed" after it changes nothing.
  mockCloseForLink()
  await Promise.resolve()
  expect(outcomes).toEqual(['closed', 'abandoned'])
  await byLink.unmount()
  await Promise.resolve()

  expect(outcomes).toEqual(['closed', 'abandoned'])
})

it('a newer wait supersedes an older one as abandoned: the older check-in never pushes its room', async () => {
  const first = untilIntentAnswered()
  void untilIntentAnswered()
  await expect(first).resolves.toBe('abandoned')
})

describe('the redesigned cards', () => {
  it('a second tap on a chosen intent clears it, and the empty answer is what is saved', async () => {
    Object.assign(mockParams, { askIntent: undefined })
    await render(<EventPreferences />)
    const friends = () => screen.getByRole('checkbox', { name: /^Making friends/ })
    await fireEvent.press(friends())
    expect(friends().props.accessibilityState).toMatchObject({ checked: true })
    await fireEvent.press(friends())
    expect(friends().props.accessibilityState).toMatchObject({ checked: false })
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.setMatchPreferences).toHaveBeenCalled())
    expect(api.setMatchPreferences.mock.calls[0][1]).toMatchObject({ intent: [], revealed: false })
  })

  it('Named reveals, and only then offers "Do this at future events too"', async () => {
    Object.assign(mockParams, { askIntent: undefined })
    await render(<EventPreferences />)
    expect(screen.queryByText('Do this at future events too')).toBeNull()
    expect(screen.getByRole('radio', { name: /^Anonymous/ }).props.accessibilityState).toMatchObject({ checked: true })

    await fireEvent.press(await screen.findByRole('radio', { name: /^Named/ }))
    expect(screen.getByRole('radio', { name: /^Named/ }).props.accessibilityState).toMatchObject({ checked: true })
    await fireEvent.press(await screen.findByText('Do this at future events too'))
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.setMatchPreferences).toHaveBeenCalled())
    expect(api.setMatchPreferences.mock.calls[0][1]).toMatchObject({ revealed: true, rememberReveal: true })
  })

  it('Named is blocked, with the reason as its sentence, when there is no photo yet', async () => {
    Object.assign(mockParams, { askIntent: undefined })
    api.getProfile.mockResolvedValue({ success: true, data: { name: 'Kid', profile: { age: 30, name: 'Kid', photos: [] } } } as never)
    await render(<EventPreferences />)
    const named = await screen.findByRole('radio', { name: /Add a photo to your profile first/ })
    expect(named.props.accessibilityState).toMatchObject({ disabled: true })
    await fireEvent.press(named)
    expect(screen.getByRole('radio', { name: /^Anonymous/ }).props.accessibilityState).toMatchObject({ checked: true })
  })
})

describe('the top bar (visual QA r5: the ✕ floated and the copy scrolled under it, and under the Android status bar)', () => {
  it('is the DS TopBar with a ✕ named Close and no heading, pinned over the scroller', async () => {
    await render(<EventPreferences />)
    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.press(close)
    expect(router.back).toHaveBeenCalledTimes(1)
    // The screen draws only its circle (Flow 3 `prefs`): no title of its own in the bar.
    expect(screen.queryByTestId('prefs-top-condensed')).toBeNull()
  })

  it('the glass comes up once the page scrolls, so copy passes under glass and not under the ✕', async () => {
    await render(<EventPreferences />)
    expect(screen.queryByTestId('prefs-top-bar')).toBeNull()
    await fireEvent.scroll(screen.getByTestId('prefs-scroll'), { nativeEvent: { contentOffset: { y: 40 } } })
    expect(screen.getByTestId('prefs-top-bar', { includeHiddenElements: true })).toBeTruthy()
  })

  it('the first row starts under the bar (content top), not behind it', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8')
    expect(src).toContain('paddingTop: bar.contentTop')
    expect(src).not.toMatch(/insets\.top/)
  })

  it('is presented full screen, as the frame is: a page sheet drew the inset twice and cost Android its dock inset', () => {
    const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8')
    const prefs = layout.slice(layout.indexOf('name="event-preferences/[eventId]"'))
    expect(prefs.slice(0, prefs.indexOf('/>'))).toContain("presentation: 'fullScreenModal'")
  })
})

describe('opened cold, with nothing behind it', () => {
  beforeEach(() => (router.canGoBack as jest.Mock).mockReturnValue(false))
  afterEach(() => (router.canGoBack as jest.Mock).mockReturnValue(true))

  it('✕ goes to the event, not nowhere', async () => {
    await render(<EventPreferences />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Close' }))
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'e1' } })
  })

  it('a saved choice ends on the event too', async () => {
    await render(<EventPreferences />)
    await fireEvent.press(await screen.findByRole('checkbox', { name: /^Making friends/ }))
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'e1' } }))
    expect(router.back).not.toHaveBeenCalled()
  })
})

describe('at AX XXXL (TG-03)', () => {
  beforeEach(() => atScale(AX_XXXL))
  afterEach(resetScale)

  it.each([['1'], ['0']])('askIntent=%s: the screen’s own titles and their lines stop at their caps', async (askIntent) => {
    mockParams.askIntent = askIntent
    await render(<EventPreferences />)
    await act(async () => {})
    const owned = textNodes(screen.toJSON() as never).filter((n) => n.props.accessibilityRole === 'header')
    expect(owned.length).toBeGreaterThan(0)
    for (const h of owned) expect(h.props.maxFontSizeMultiplier).toBeLessThanOrEqual(MAX_FONT_SCALE.title)
    const src = readFileSync(join(__dirname, '..', 'app', 'event-preferences', '[eventId].tsx'), 'utf8')
    expect(src.match(/<Text(?![^>]*maxFontSizeMultiplier)[^>]*>/g) ?? []).toEqual([])
  })
})
