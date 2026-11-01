/**
 * One of your crews (Flow 10 · 10.4) against a mocked API: every state the
 * page draws, what the owner can do that a member cannot, and the sheets for
 * leaving, removing, reporting, inviting and editing.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriends: jest.fn(), muteChatGroup: jest.fn(), unmuteChatGroup: jest.fn() },
}))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { crew: jest.fn(), update: jest.fn(), invite: jest.fn(), leave: jest.fn(), report: jest.fn(), setKeepMeAnonymous: jest.fn() },
}))
jest.mock('../lib/roomRow', () => ({ useRoomRow: () => null }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))

import { router } from 'expo-router'
import CrewScreen from '../app/crews/[crewId]'
import { apiClient } from '../lib/apiClient'
import { KEEP_ANONYMOUS_LABEL, type Crew, type CrewMember } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { showSheet, type ActionSheet, type ReasonSheet } from '../lib/sheet'

const api = apiClient as jest.Mocked<typeof apiClient>
const crews = crewsApi as jest.Mocked<typeof crewsApi>

const member = (userId: string, name: string, role: 'owner' | 'member' = 'member', isFriend = true): CrewMember => ({
  userId,
  isFriend,
  name,
  photo: null,
  role,
  joinedAt: '2026-10-09T10:00:00Z',
})
const crew = (role: 'owner' | 'member', over: Partial<Crew> = {}): Crew => ({
  crewId: 'c2',
  name: 'Nebula',
  bio: 'Late sets, early trains.',
  intent: ['friendship'],
  tags: [{ slug: 'dance-floor', label: 'Dance floor' }],
  emblemSeed: 'seed',
  openToSolo: false,
  createdAt: '2026-10-09T10:00:00Z',
  chatGroupId: 'g2',
  size: 3,
  you: { role, keepMeAnonymous: false },
  members: [member('me', 'Sam', role), member('rh_priya', 'Priya', role === 'owner' ? 'member' : 'owner'), member('rh_rohan', 'Rohan')],
  ...over,
})
const sheetOf = <T,>() => (showSheet as jest.Mock).mock.calls.at(-1)[0] as T
const run = (sheet: ActionSheet, label: string) => (sheet.actions.find((a) => a.label === label) as { run: () => Promise<unknown> }).run()

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(crews).forEach((fn) => (fn as jest.Mock).mockReset())
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  mockParams.crewId = 'c2'
})

describe('the page', () => {
  it('draws the head, the members with You and the owner marked, and your settings', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.getByText('Late sets, early trains.')).toBeTruthy()
    expect(screen.getByText('Dance floor')).toBeTruthy()
    expect(screen.getByText('Friendship')).toBeTruthy()
    expect(screen.getByLabelText('Members, 3')).toBeTruthy()
    expect(screen.getByLabelText('You')).toBeTruthy()
    expect(screen.getByLabelText('Priya, owner')).toBeTruthy()
    expect(screen.getByText('Owner')).toBeTruthy()
    expect(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) })).toBeTruthy()
    expect(screen.getByRole('switch', { name: /Mute the crew chat/ })).toBeTruthy()
    expect(screen.getByLabelText('Leave crew')).toBeTruthy()
  })

  it('a member row opens their room card (handle, first name); your own row does nothing', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))

    await act(async () => fireEvent.press(screen.getByLabelText('Priya, owner')))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/user/[id]', params: { id: 'rh_priya', pseudonym: 'Priya', roomSeed: 'c2:rh_priya' } })

    ;(router.push as jest.Mock).mockClear()
    await act(async () => fireEvent.press(screen.getByLabelText('You')))
    expect(router.push).not.toHaveBeenCalled()
  })

  // D-L14: the owner's Edit crew lists the fields it edits, not a setting. Negative control: the old hint fails it.
  it('the owner’s Edit crew says what it edits: name, bio, vibe', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Edit crew'))
    expect(screen.getByText('Name, bio, vibe')).toBeTruthy()
  })

  it('a member has no Edit crew and no ⋯ on anyone', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.queryByText('Edit crew')).toBeNull()
    expect(screen.queryByLabelText('More, Rohan')).toBeNull()
  })

  it('the owner gets Edit crew and a ⋯ on everyone but themselves', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Edit crew'))
    expect(screen.getByLabelText('More, Rohan')).toBeTruthy()
    expect(screen.queryByLabelText('More, Sam')).toBeNull()
  })

  it('a hidden crew tells its members, and the footnote names nobody when someone is kept apart', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member', { hidden: true, apart: true }) })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('This crew is hidden while we look at a report. Only its members can see it.'))
    expect(screen.getByText(/Someone you’ve blocked, or who blocked you, is in this crew/)).toBeTruthy()
  })

  it('shows nothing about either when the server says neither', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.queryByTestId('crew-hidden')).toBeNull()
    expect(screen.queryByText(/Someone you’ve blocked/)).toBeNull()
  })

  it('a full crew cannot ask anyone else in', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner', { size: 12 }) })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.queryByLabelText('Invite friends')).toBeNull()
  })

  it('open invites count against the seats: 10 members + 2 invites (seatsLeft 0) offers no Invite (YOU-12)', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner', { size: 10, seatsLeft: 0 }) })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.queryByLabelText('Invite friends')).toBeNull()
  })

  it('an older server with no seatsLeft still reads the members alone', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner', { size: 10 }) })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
  })

  it('has no Open crew chat: the room is reached from the Banter and the chat’s own header', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    expect(screen.queryByLabelText('Open crew chat')).toBeNull()
  })
})

describe('when it does not load', () => {
  it('a failed read offers the retry, and is not "gone"', async () => {
    crews.crew.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('This crew didn’t load'))
    expect(screen.queryByText('This crew isn’t here any more')).toBeNull()
    crews.crew.mockResolvedValueOnce({ success: true, data: crew('member') })
    await fireEvent.press(screen.getByLabelText('Try again'))
    await waitFor(() => screen.getByText('Late sets, early trains.'))
  })

  it('a 404 is one plain line, whatever the reason', async () => {
    crews.crew.mockResolvedValue({ success: false, error: 'Crew not found', errorCode: 'NOT_FOUND' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('This crew isn’t here any more'))
    expect(screen.getByText('It dissolved. Nobody is told who left.')).toBeTruthy()
    // The card (Flow 15 #11) goes back on a tap, as the top bar's Back does.
    await fireEvent.press(screen.getByTestId('crew-gone'))
    expect(router.back).toHaveBeenCalled()
  })

  it('a refresh that fails keeps the crew on screen', async () => {
    crews.crew.mockResolvedValueOnce({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Nebula'))
    crews.crew.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await act(async () => {
      await screen.getByTestId('crew-scroll').props.refreshControl.props.onRefresh()
    })
    expect(screen.getByText('Nebula')).toBeTruthy()
  })
})

describe('your settings', () => {
  it('M11: the anonymity switch holds still while its write is in flight', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.setKeepMeAnonymous.mockReturnValue(new Promise(() => {}) as never)
    await render(<CrewScreen />)
    await waitFor(() => screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    await fireEvent.press(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    expect(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) })).toBeDisabled()
    expect(crews.setKeepMeAnonymous).toHaveBeenCalledWith('c2', 'me', true)
  })

  it('M11: a write that lands after a refresh changes only its own field', async () => {
    crews.crew.mockResolvedValueOnce({ success: true, data: crew('owner') })
    let finish: (v: unknown) => void = () => {}
    crews.setKeepMeAnonymous.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<CrewScreen />)
    await waitFor(() => screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    await fireEvent.press(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    // Meanwhile a pull-to-refresh brings the crew as it is now: its bio changed elsewhere.
    crews.crew.mockResolvedValueOnce({ success: true, data: crew('owner', { bio: 'New line.' }) })
    await act(async () => {
      await screen.getByTestId('crew-scroll').props.refreshControl.props.onRefresh()
    })
    await act(async () => finish({ success: true, data: { keepMeAnonymous: true } }))
    expect(screen.getByText('New line.')).toBeTruthy()
    expect(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }).props.accessibilityState.checked).toBe(true)
  })

  it('a save that fails says so and leaves the switch as it was', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.setKeepMeAnonymous.mockResolvedValue({ success: false, error: 'Failed', errorCode: 'SERVER_ERROR' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    await fireEvent.press(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Couldn’t save that. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByRole('switch', { name: new RegExp(KEEP_ANONYMOUS_LABEL) }).props.accessibilityState.checked).toBe(false)
  })

  it('muting the chat mutes its room until you unmute', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    api.muteChatGroup.mockResolvedValue({ success: true, data: { chatGroupId: 'g2', mute: { muted: true, until: null } } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByRole('switch', { name: /Mute the crew chat/ }))
    await fireEvent.press(screen.getByRole('switch', { name: /Mute the crew chat/ }))
    await waitFor(() => expect(api.muteChatGroup).toHaveBeenCalledWith('g2', null))
    await waitFor(() => expect(screen.getByRole('switch', { name: /Mute the crew chat/ }).props.accessibilityState.checked).toBe(true))
  })
})

describe('inviting', () => {
  const friends = (...names: string[]) => ({
    success: true as const,
    data: { friends: names.map((n) => ({ userId: `u-${n}`, name: n, photo: null, since: '2026-09-01T00:00:00Z' })), count: names.length },
  })

  it('M5: leaves out a friend already in the crew, and says how many were asked', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    api.getFriends.mockResolvedValue(friends('Rohan', 'Kavya', 'Meera'))
    crews.invite.mockResolvedValue({ success: true, data: { invited: 2 } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    expect(screen.queryByRole('checkbox', { name: 'Ask Rohan' })).toBeNull()
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Meera' }))
    await fireEvent.press(screen.getByLabelText('Ask 2'))
    await waitFor(() => expect(crews.invite).toHaveBeenCalledWith('c2', ['u-Kavya', 'u-Meera']))
    expect(mockToast).toHaveBeenCalledWith('Asked 2 friends', 'success')
  })

  it('an invite that fills the crew takes Invite friends away at once (seatsLeft goes down by the number asked)', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner', { size: 10, seatsLeft: 2 }) })
    api.getFriends.mockResolvedValue(friends('Kavya', 'Meera'))
    crews.invite.mockResolvedValue({ success: true, data: { invited: 2 } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Meera' }))
    await fireEvent.press(screen.getByLabelText('Ask 2'))
    await waitFor(() => expect(crews.invite).toHaveBeenCalledWith('c2', ['u-Kavya', 'u-Meera']))
    await waitFor(() => expect(screen.queryByLabelText('Invite friends')).toBeNull())
  })

  it('when every friend is in already, says so', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    api.getFriends.mockResolvedValue(friends('Rohan'))
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByText('Every friend of yours is in this crew, or you have none to ask yet.'))
  })

  it('a failed friends read is not "none to ask": it offers the retry', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    api.getFriends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByLabelText('Your friends didn’t load — try again'))
    api.getFriends.mockResolvedValueOnce(friends('Kavya'))
    await fireEvent.press(screen.getByLabelText('Your friends didn’t load — try again'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Kavya' }))
  })

  it('search: more than eight friends offers it, asks the server with q, and a crewmate already in is still left out', async () => {
    jest.useFakeTimers()
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    api.getFriends.mockResolvedValueOnce(friends('Rohan', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'))
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByTestId('friend-pick-search'))
    api.getFriends.mockResolvedValueOnce(friends('Rohan', 'Rohit'))
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('friend-pick-search'), 'Ro')
    })
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    expect(api.getFriends).toHaveBeenLastCalledWith(null, 'ro')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohit' }))
    expect(screen.queryByRole('checkbox', { name: 'Ask Rohan' })).toBeNull()
    jest.useRealTimers()
  })

  it('a refused invite says so and keeps the sheet', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    api.getFriends.mockResolvedValue(friends('Kavya'))
    crews.invite.mockResolvedValue({ success: false, error: 'Failed', errorCode: 'SERVER_ERROR' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    await fireEvent.press(screen.getByLabelText('Ask 1'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Couldn’t send the invites. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByLabelText('Ask 1')).toBeTruthy()
  })
})

describe('leaving, removing and reporting', () => {
  it('leaving a crew that would carry on says nobody is told, then leaves', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.leave.mockResolvedValue({ success: true, data: { dissolved: false } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Leave crew'))
    await fireEvent.press(screen.getByLabelText('Leave crew'))
    const sheet = sheetOf<ActionSheet>()
    expect(sheet.title).toBe('Leave Nebula?')
    expect(sheet.message).toBe('You leave the crew and its chat. Nobody is told you left; the crew just has one fewer.')
    expect(await run(sheet, 'Leave crew')).toEqual({ ok: true, toast: 'You left Nebula' })
    expect(crews.leave).toHaveBeenCalledWith('c2', 'me')
    expect(router.back).toHaveBeenCalled()
  })

  it('leaving the last of two says the crew closes', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member', { size: 2 }) })
    crews.leave.mockResolvedValue({ success: true, data: { dissolved: true } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Leave crew'))
    await fireEvent.press(screen.getByLabelText('Leave crew'))
    const sheet = sheetOf<ActionSheet>()
    expect(sheet.message).toBe('Leaving will close the crew — there’ll be one of you left.')
    expect(await run(sheet, 'Leave and close the crew')).toEqual({ ok: true, toast: 'Nebula has closed' })
  })

  it('leaving from the chat takes the chat with it', async () => {
    mockParams.fromChat = '1'
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.leave.mockResolvedValue({ success: true, data: { dissolved: false } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Leave crew'))
    await fireEvent.press(screen.getByLabelText('Leave crew'))
    await run(sheetOf<ActionSheet>(), 'Leave crew')
    expect(router.dismissTo).toHaveBeenCalledWith('/crews')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('a leave that fails stays and says why', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.leave.mockResolvedValue({ success: false, error: 'Failed', errorCode: 'SERVER_ERROR' })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Leave crew'))
    await fireEvent.press(screen.getByLabelText('Leave crew'))
    expect(await run(sheetOf<ActionSheet>(), 'Leave crew')).toEqual({ ok: false, error: 'Couldn’t leave. Try again.' })
    expect(router.back).not.toHaveBeenCalled()
  })

  it('the owner removes a member by their handle in the room, after a confirm that says they are not told who', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.leave.mockResolvedValue({ success: true, data: { dissolved: false } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('More, Rohan'))
    await fireEvent.press(screen.getByLabelText('More, Rohan'))
    const sheet = sheetOf<ActionSheet>()
    expect(sheet.title).toBe('Remove Rohan from Nebula?')
    expect(sheet.message).toContain('They aren’t told who removed them.')
    expect(crews.leave).not.toHaveBeenCalled()
    expect(await run(sheet, 'Remove')).toEqual({ ok: true, toast: 'Rohan was removed' })
    expect(crews.leave).toHaveBeenCalledWith('c2', 'rh_rohan')
  })

  it('the ⋯ menu reports the name or bio, with reasons in the design’s words, and promises only that the crew is not told (SCRUM-987)', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.report.mockResolvedValue({ success: true, data: { reported: true } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('More'))
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(screen.getByLabelText('Report this crew’s name or bio'))
    const sheet = sheetOf<ReasonSheet>()
    expect(sheet.kind).toBe('reasons')
    expect(sheet.title).toBe('Report Nebula')
    // Our moderators do see who reported (the Reports queue names them); only the crew is never told.
    expect(sheet.message).toBe('Only the crew’s name and bio are reported. The crew isn’t told who sent it.')
    expect(sheet.reasons.map((r) => r.label)).toEqual([
      'Hateful or abusive name',
      'Contact details or a handle',
      'Impersonating someone',
      'Spam or a business',
      'Something else',
    ])
    expect(await sheet.run('spam')).toEqual({ ok: true, toast: 'Reported. Thanks — the crew isn’t told it was you.' })
    expect(crews.report).toHaveBeenCalledWith('c2', { reason: 'spam' })
  })

  it('the ⋯ menu also leaves', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('More'))
    await fireEvent.press(screen.getByLabelText('More'))
    await fireEvent.press(within(screen.getByTestId('crew-menu')).getByLabelText('Leave crew'))
    expect(sheetOf<ActionSheet>().title).toBe('Leave Nebula?')
  })
})

describe('editing', () => {
  const openEdit = async () => {
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Edit crew'))
    await fireEvent.press(screen.getByText('Edit crew'))
    await waitFor(() => screen.getByTestId('make-name-input'))
  }

  it('sends only what changed', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.update.mockResolvedValue({ success: true, data: crew('owner', { name: 'Nebula II' }) })
    await openEdit()
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Nebula II')
    await fireEvent.press(screen.getByLabelText('Save'))
    await waitFor(() => expect(crews.update).toHaveBeenCalledWith('c2', { name: 'Nebula II' }))
    await waitFor(() => expect(screen.getAllByText('Nebula II').length).toBeGreaterThan(0))
  })

  it('turns "Room for one more" on, which is what lets the crew like one person', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.update.mockResolvedValue({ success: true, data: crew('owner', { openToSolo: true }) })
    await openEdit()
    await fireEvent.press(screen.getByRole('switch', { name: 'Room for one more' }))
    await fireEvent.press(screen.getByLabelText('Save'))
    await waitFor(() => expect(crews.update).toHaveBeenCalledWith('c2', { openToSolo: true }))
  })

  it('holds the same limits as making one', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    await openEdit()
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'N')
    await fireEvent.press(screen.getByLabelText('Save'))
    expect(screen.getByText('A crew name is 2–32 characters')).toBeTruthy()
    expect(crews.update).not.toHaveBeenCalled()
  })

  it('saving nothing sends nothing', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    await openEdit()
    await fireEvent.press(screen.getByLabelText('Save'))
    expect(crews.update).not.toHaveBeenCalled()
  })

  it('a name the server will not take comes back under the name, and goes once the name is edited', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.update.mockResolvedValue({ success: false, error: 'This can’t be a crew’s name.', errorCode: 'BAD_REQUEST', field: 'name' })
    await openEdit()
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Bad name')
    await fireEvent.press(screen.getByLabelText('Save'))
    await waitFor(() => screen.getByText('This can’t be a crew’s name.'))
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Better name')
    expect(screen.queryByText('This can’t be a crew’s name.')).toBeNull()
  })

  it('a refusal with no field is the form’s: a toast, nothing under the bio', async () => {
    const said = 'A phone number. A crew card is shown to people you haven’t met, so contact details can’t go on it.'
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.update.mockResolvedValue({ success: false, error: said, errorCode: 'BAD_REQUEST' })
    await openEdit()
    await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Call 98450 12345')
    await fireEvent.press(screen.getByLabelText('Save'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(said, 'error', { haptic: 'error' }))
    expect(screen.queryByText(said)).toBeNull()
  })
})


describe('the top bar follows the scroll (audit M12, DS #30)', () => {
  const scrollTo = (y: number) =>
    act(async () =>
      fireEvent(screen.getByTestId('crew-scroll'), 'scroll', {
        nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 393, height: 2000 }, layoutMeasurement: { width: 393, height: 800 } },
      })
    )
  const barTitle = () => screen.queryAllByText('Nebula')

  it('at rest the bar is bare and says nothing; past 8 pt it has glass; once the head has scrolled away it names the crew', async () => {
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Late sets, early trains.'))
    const before = barTitle().length // the head's own name
    await scrollTo(4)
    expect(barTitle()).toHaveLength(before)
    await scrollTo(60)
    expect(barTitle()).toHaveLength(before)
    expect(screen.getByTestId('crew-top-bar')).toBeTruthy()
    await scrollTo(250)
    expect(barTitle()).toHaveLength(before + 1)
    await scrollTo(4)
    expect(barTitle()).toHaveLength(before)
  })

  it('renders on a threshold crossing only, never per frame (a ref guards it)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../app/crews/[crewId].tsx'), 'utf8')
    expect(src).toMatch(/if \(next !== barRef\.current\)/)
  })

  it('the loading page has the page’s own shape, not one square', async () => {
    crews.crew.mockReturnValue(new Promise(() => {}) as never)
    await render(<CrewScreen />)
    expect(screen.getByLabelText('Loading the crew')).toBeTruthy()
  })
})
