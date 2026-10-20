/**
 * Crews (Flow 10 · 10.1) and the invite (10.3) against a mocked API.
 *
 * Every state the list draws, what See invite opens, and the invite's one
 * rule: nothing is sent until Join is tapped, and the consent is on screen
 * when it is.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: (p: object) => React.createElement(View, p),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
jest.mock('../lib/crewsApi', () => ({ crewsApi: { myCrews: jest.fn(), join: jest.fn(), decline: jest.fn() } }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const mockAskPush = jest.fn()
jest.mock('../lib/crewPushAsk', () => ({ askCrewPush: (id: string) => mockAskPush(id) }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

import { router } from 'expo-router'
import CrewsScreen from '../app/crews/index'
import InviteScreen from '../app/crews/invite/[crewId]'
import { CONSENT_LINE, KEEP_ANONYMOUS_LABEL, type Crew, type CrewInvite } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = crewsApi as jest.Mocked<typeof crewsApi>
const DAY = 24 * 60 * 60 * 1000

const invite = (over: Partial<CrewInvite> = {}): CrewInvite => ({
  crewId: 'c-usual',
  name: 'The Usual Suspects',
  bio: 'Thursday quiz, Friday regret.',
  emblemSeed: 'seed-usual',
  tags: [{ slug: 'quiz-team', label: 'Quiz team' }],
  size: 6,
  invitedBy: 'Aisha',
  invitedAt: new Date(Date.now() - 3 * DAY).toISOString(),
  ...over,
})
const crew = (over: Partial<Crew> = {}): Crew => ({
  crewId: 'c-nebula',
  name: 'Nebula',
  bio: null,
  intent: [],
  tags: [],
  emblemSeed: 'seed-nebula',
  openToSolo: false,
  createdAt: '2026-10-09T10:00:00Z',
  chatGroupId: 'g-nebula',
  size: 4,
  you: { role: 'owner', keepMeAnonymous: false },
  members: [],
  ...over,
})
const list = (crews: Crew[], invites: CrewInvite[]) => ({ success: true as const, data: { crews, invites } })

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
  for (const k of Object.keys(mockParams)) delete mockParams[k]
})

describe('Crews', () => {
  it('no crews: says what a crew is for, and Make a crew opens the sheet', async () => {
    api.myCrews.mockResolvedValue(list([], []))
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Go out together. Meet other crews.'))
    expect(screen.getByText(/When two of you are at the same night/)).toBeTruthy()
    expect(screen.queryByTestId('crews-make')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Make a crew'))
    expect(router.push).toHaveBeenCalledWith('/crews/new')
  })

  it('your crews are rows with the name and Crew of N, no presence, and the dock', async () => {
    api.myCrews.mockResolvedValue(list([crew(), crew({ crewId: 'c2', name: 'Orbit', size: 6 })], []))
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByLabelText('Nebula, Crew of 4'))
    expect(screen.getByLabelText('Orbit, Crew of 6')).toBeTruthy()
    expect(screen.getByLabelText('Your crews, 2')).toBeTruthy()
    expect(screen.getByText(/Who’s where shows once you’ve checked in/)).toBeTruthy()
    expect(screen.getByTestId('crews-make')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Nebula, Crew of 4'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/crews/[crewId]', params: { crewId: 'c-nebula' } })
  })

  it('a crew of one is forming and says it starts when someone joins', async () => {
    api.myCrews.mockResolvedValue(list([crew({ size: 1 })], []))
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByLabelText('Nebula, Just you · starts when someone joins'))
  })

  it('an invite names the friend and the crew, and See invite opens it without joining', async () => {
    api.myCrews.mockResolvedValue(list([], [invite()]))
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Aisha invited you to The Usual Suspects'))
    expect(screen.getByText('Crew of 6 · 3 days ago')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('See invite, The Usual Suspects'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/crews/invite/[crewId]', params: { crewId: 'c-usual' } })
    expect(api.join).not.toHaveBeenCalled()
  })

  it('a lapsed invite dims, says Expired and offers nothing', async () => {
    api.myCrews.mockResolvedValue(
      list([], [invite({ crewId: 'c-old', name: 'Quiz Night Irregulars', invitedBy: 'Rohan', invitedAt: new Date(Date.now() - 20 * DAY).toISOString() })])
    )
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByLabelText('Rohan invited you to Quiz Night Irregulars, Expired'))
    expect(screen.queryByLabelText(/See invite/)).toBeNull()
  })

  it('a failed read is not "no crews": it offers the retry, and a refresh that fails keeps the list', async () => {
    api.myCrews.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Your crews didn’t load'))
    expect(screen.queryByText('Go out together. Meet other crews.')).toBeNull()
    api.myCrews.mockResolvedValueOnce(list([crew()], []))
    await fireEvent.press(screen.getByLabelText('Try again'))
    await waitFor(() => screen.getByLabelText('Nebula, Crew of 4'))
    api.myCrews.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await act(async () => {
      await screen.getByTestId('crews-scroll').props.refreshControl.props.onRefresh()
    })
    expect(screen.getByLabelText('Nebula, Crew of 4')).toBeTruthy()
  })

  it('the 18+ gate says so in the server’s words and offers the way through', async () => {
    api.myCrews.mockResolvedValue({
      success: false,
      error: 'Crews are for people 18 and over who have finished setting up.',
      errorCode: 'FORBIDDEN',
    })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Not yet'))
    expect(screen.getByText('Crews are for people 18 and over who have finished setting up.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Finish setting up'))
    expect(router.push).toHaveBeenCalledWith('/onboarding/basics')
  })
})

describe('an invite', () => {
  beforeEach(() => {
    mockParams.crewId = 'c-usual'
    api.myCrews.mockResolvedValue(list([], [invite()]))
  })

  it('shows what an invitee is given, and the consent on screen with nothing sent', async () => {
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    expect(screen.getByText('Thursday quiz, Friday regret.')).toBeTruthy()
    expect(screen.getByText('Quiz team')).toBeTruthy()
    expect(screen.getByText('Aisha invited you · Crew of 6')).toBeTruthy()
    expect(screen.getByText('You’ll see who’s in it once you join.')).toBeTruthy()
    expect(screen.getByText(CONSENT_LINE)).toBeTruthy()
    expect(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL })).toBeTruthy()
    expect(api.join).not.toHaveBeenCalled()
  })

  it('the consent sits in the dock with Join, so a long bio can not scroll it away', async () => {
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    const dock = screen.getByTestId('invite-dock')
    expect(within(dock).getByText(CONSENT_LINE)).toBeTruthy()
    expect(within(dock).getByRole('switch', { name: KEEP_ANONYMOUS_LABEL })).toBeTruthy()
    expect(within(dock).getByLabelText('Join')).toBeTruthy()
  })

  it('Join is the agreement: it sends revealConsent true and the anonymity choice, says Joined, then opens the crew chat and asks about pushes', async () => {
    api.join.mockResolvedValue({ success: true, data: { chatGroupId: 'g-usual' } })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    await fireEvent.press(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await fireEvent.press(screen.getByLabelText('Join'))
    await waitFor(() => expect(api.join).toHaveBeenCalledWith('c-usual', { revealConsent: true, keepMeAnonymous: true }))
    await waitFor(() => screen.getByLabelText('Joined'))
    expect(router.replace).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/chat/[id]',
        params: { id: 'g-usual', roomName: 'The Usual Suspects', kind: 'crew', crewId: 'c-usual' },
      })
    )
    expect(mockToast).toHaveBeenCalledWith('You’re in The Usual Suspects', 'success')
    expect(mockAskPush).toHaveBeenCalledWith('me')
  })

  it('two taps on Join in the same render send one join', async () => {
    let finish: (v: unknown) => void = () => {}
    api.join.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    const join = screen.getByLabelText('Join')
    await act(async () => {
      void fireEvent.press(join)
      void fireEvent.press(join)
    })
    expect(api.join).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { chatGroupId: 'g' } }))
  })

  it('an invite that went away is one plain sentence, and stays Expired on the list', async () => {
    api.join.mockResolvedValue({ success: false, error: 'Crew not found', errorCode: 'NOT_FOUND' })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    await fireEvent.press(screen.getByLabelText('Join'))
    await waitFor(() => screen.getByText('This invite isn’t open any more'))
    expect(screen.getByText('Invites last 14 days. Ask your friend to invite you again.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Back to Crews'))
    expect(router.back).toHaveBeenCalled()
  })

  it('an invite the list no longer has reads the same', async () => {
    api.myCrews.mockResolvedValue(list([], []))
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('This invite isn’t open any more'))
  })

  it('a full crew is the server’s sentence in a refusal sheet', async () => {
    api.join.mockResolvedValue({ success: false, error: 'A crew has at most 12 people.', errorCode: 'CONFLICT' })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    await fireEvent.press(screen.getByLabelText('Join'))
    await waitFor(() => screen.getByText('This crew is full'))
    expect(screen.getByText('A crew has at most 12 people.')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('a failed read offers the retry', async () => {
    api.myCrews.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('This invite didn’t load'))
    await fireEvent.press(screen.getByLabelText('Try again'))
    await waitFor(() => screen.getByText('The Usual Suspects'))
  })

  it('Not now asks first (a decline holds for 30 days), then tells nobody and goes back', async () => {
    api.decline.mockResolvedValue({ success: true, data: { declined: true } })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    await fireEvent.press(screen.getByLabelText('Not now'))
    expect(api.decline).not.toHaveBeenCalled()
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    expect(sheet.title).toBe('Decline The Usual Suspects?')
    expect(sheet.message).toBe('Aisha isn’t told. They can’t ask you into this crew again for 30 days.')
    await act(async () => (sheet.actions.find((a) => a.label === 'Decline') as { then: () => void }).then())
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith('c-usual'))
    await waitFor(() => expect(router.back).toHaveBeenCalled())
  })

  it('a decline that fails says so and stays', async () => {
    api.decline.mockResolvedValue({ success: false, error: 'Failed', errorCode: 'SERVER_ERROR' })
    await render(<InviteScreen />)
    await waitFor(() => screen.getByText('The Usual Suspects'))
    await fireEvent.press(screen.getByLabelText('Not now'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    await act(async () => (sheet.actions.find((a) => a.label === 'Decline') as { then: () => void }).then())
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Couldn’t decline. Try again.', 'error', { haptic: 'error' }))
    expect(router.back).not.toHaveBeenCalled()
  })
})
