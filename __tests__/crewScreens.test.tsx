/**
 * The crew screens against a mocked API (test plan §7: CR-CU01, CR-M01/M02).
 *
 * The join-time consent is on screen without a tap and nothing is sent until
 * the person ticks it; the Blend shows names only from `GET /blends` (a kept-
 * private member stays a pseudonym); a Blend that is not open reads closed.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
jest.mock('expo-linear-gradient', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { LinearGradient: (p: object) => React.createElement(View, p) }
})
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: { getFriends: jest.fn(), blockUser: jest.fn(), leaveChatGroup: jest.fn(), queuedRequest: jest.fn(), getActiveCheckins: jest.fn() },
}))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: {
    create: jest.fn(),
    myCrews: jest.fn(),
    join: jest.fn(),
    decline: jest.fn(),
    blends: jest.fn(),
    reveal: jest.fn(),
    crew: jest.fn(),
    update: jest.fn(),
    here: jest.fn(),
    setKeepMeAnonymous: jest.fn(),
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/roomMembership', () => ({ markRoomLeft: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { router } from 'expo-router'
import BlendScreen from '../app/blend/[blendId]'
import CrewScreen from '../app/crews/[crewId]'
import CrewsScreen from '../app/crews/index'
import NewCrewScreen from '../app/crews/new'
import { apiClient } from '../lib/apiClient'
import {
  BLEND_CLOSED_LINE,
  CONSENT_AGREE,
  CONSENT_LINE,
  KEEP_ANONYMOUS_LABEL,
  REVEALED_LINE,
  type Blend,
  type Crew,
} from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { markRoomLeft } from '../lib/roomMembership'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = apiClient as jest.Mocked<typeof apiClient>
const crews = crewsApi as jest.Mocked<typeof crewsApi>

beforeEach(() => {
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  api.getFriends.mockResolvedValue({
    success: true,
    data: { friends: [{ userId: 'u-rohan', name: 'Rohan', photo: null, since: '2026-09-01T00:00:00Z' }], count: 1 },
  })
})

describe('making a crew (CR-CU01)', () => {
  it('shows the consent and the anonymity switch without a tap, and sends nothing until it is ticked', async () => {
    await render(<NewCrewScreen />)
    expect(screen.getByText(CONSENT_LINE)).toBeTruthy()
    expect(screen.getByText(KEEP_ANONYMOUS_LABEL)).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'Two')
    expect(screen.getByLabelText('Make the crew')).toBeDisabled()
    await fireEvent.press(screen.getByLabelText('Make the crew'))
    expect(crews.create).not.toHaveBeenCalled()
  })

  it('sends revealConsent: true, the anonymity choice and the friends picked, then opens the crew with the count asked', async () => {
    crews.create.mockResolvedValue({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 1 } })
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'Two')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    expect(screen.getByRole('checkbox', { name: 'Ask Rohan' }).props.accessibilityState).toEqual({ checked: true })
    await fireEvent.press(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    await fireEvent.press(screen.getByLabelText('Make the crew'))

    await waitFor(() => expect(crews.create).toHaveBeenCalledTimes(1))
    expect(crews.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'Two', inviteUserIds: ['u-rohan'], revealConsent: true, keepMeAnonymous: true })
    )
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({ pathname: '/crews/[crewId]', params: { crewId: 'c1', asked: '1' } })
    )
  })

  it('a refusal of the name says what the server found', async () => {
    crews.create.mockResolvedValue({ success: false, error: 'A phone number. Contact details can’t go on it.' })
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'call 98450 12345')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    await fireEvent.press(screen.getByLabelText('Make the crew'))
    await waitFor(() => screen.getByText('A phone number. Contact details can’t go on it.'))
  })

  it('C1: Make stays off until a friend is picked, even with the consent ticked', async () => {
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'Two')
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    expect(screen.getByLabelText('Make the crew')).toBeDisabled()
    await fireEvent.press(screen.getByLabelText('Make the crew'))
    expect(crews.create).not.toHaveBeenCalled()
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    expect(screen.getByLabelText('Make the crew')).not.toBeDisabled()
  })

  it('a failed friends read is not "no friends": it offers the retry', async () => {
    api.getFriends.mockResolvedValueOnce({ success: false, error: 'No internet connection.' })
    await render(<NewCrewScreen />)
    await waitFor(() => screen.getByLabelText('Your friends didn’t load — try again'))
    expect(screen.queryByText('Add friends first — a crew is made from your friends.')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Your friends didn’t load — try again'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohan' }))
  })

  it('M8: two fast taps on Make send one create', async () => {
    let finish: (v: unknown) => void = () => {}
    crews.create.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<NewCrewScreen />)
    await fireEvent.changeText(screen.getByLabelText('Crew name'), 'Two')
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ask Rohan' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    const button = screen.getByLabelText('Make the crew')
    // Both taps land before the screen re-renders (state would lag them).
    await act(async () => {
      void fireEvent.press(button)
      void fireEvent.press(button)
    })
    expect(crews.create).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { crewId: 'c1', chatGroupId: 'g1', invited: 1 } }))
    crews.create.mockReset()
  })
})

describe('an invite', () => {
  const invite = {
    crewId: 'c5',
    name: 'Five',
    bio: null,
    emblemSeed: 's',
    tags: [],
    size: 4,
    invitedBy: 'Vikram',
    invitedAt: '2026-10-09T10:00:00Z',
  }

  beforeEach(() => {
    crews.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [invite] } })
  })

  it('accepting shows the consent first, and joins only once it is ticked', async () => {
    crews.join.mockResolvedValue({ success: true, data: { chatGroupId: 'g5' } })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Accept'))
    expect(screen.getByText(CONSENT_LINE)).toBeTruthy()

    await fireEvent.press(screen.getByLabelText('Join Five'))
    expect(crews.join).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    await fireEvent.press(screen.getByLabelText('Join Five'))
    await waitFor(() => expect(crews.join).toHaveBeenCalledWith('c5', { revealConsent: true, keepMeAnonymous: false }))
  })

  it('H4: an invite that went away says so, and stays off the list even if a read still has it', async () => {
    const gone = { ...invite, crewId: 'c-gone', name: 'Gone' }
    crews.myCrews.mockResolvedValue({ success: true, data: { crews: [], invites: [gone] } })
    crews.join.mockResolvedValue({ success: false, error: 'Crew not found', errorCode: 'NOT_FOUND' })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Accept'))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    await fireEvent.press(screen.getByLabelText('Join Gone'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('That invite isn’t open any more.', 'info'))
    // The re-read still lists it (a cached answer): it stays off the screen.
    await waitFor(() => expect(screen.queryByText('Vikram asked you · Crew of 4')).toBeNull())
  })

  it('M8: two taps on Join in the same render send one join', async () => {
    let finish: (v: unknown) => void = () => {}
    crews.join.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Accept'))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    const join = screen.getByLabelText('Join Five')
    await act(async () => {
      void fireEvent.press(join)
      void fireEvent.press(join)
    })
    expect(crews.join).toHaveBeenCalledTimes(1)
    await act(async () => finish({ success: true, data: { chatGroupId: 'g5' } }))
    crews.join.mockReset()
  })

  it('declining tells nobody and takes it off the list', async () => {
    crews.decline.mockResolvedValue({ success: true, data: { declined: true } })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Decline'))
    // It asks first: a decline holds for 30 days.
    expect(crews.decline).not.toHaveBeenCalled()
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    expect(sheet.title).toBe('Decline Five?')
    ;(sheet.actions.find((a) => a.label === 'Decline') as { then: () => void }).then()
    await waitFor(() => expect(screen.queryByText('Vikram asked you · Crew of 4')).toBeNull())
    expect(crews.decline).toHaveBeenCalledWith('c5')
  })
})

describe('a crew', () => {
  const crew = (role: 'owner' | 'member'): Crew => ({
    crewId: 'c2',
    name: 'Two',
    bio: null,
    intent: [],
    tags: [],
    emblemSeed: 's',
    openToSolo: false,
    createdAt: '2026-10-09T10:00:00Z',
    chatGroupId: 'g2',
    size: 2,
    you: { role, keepMeAnonymous: false },
    members: [],
  })

  it('its owner can turn on "Room for one more" — what lets the crew like one person', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValue({ success: true, data: crew('owner') })
    crews.update.mockResolvedValue({ success: true, data: { ...crew('owner'), openToSolo: true } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByRole('switch', { name: 'Room for one more' }))
    await fireEvent.press(screen.getByRole('switch', { name: 'Room for one more' }))
    await waitFor(() => expect(crews.update).toHaveBeenCalledWith('c2', { openToSolo: true }))
  })

  it('M5: the invite picker leaves out a friend already in the crew', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValue({
      success: true,
      data: {
        ...crew('owner'),
        members: [{ userId: 'rh_r', isFriend: true, name: 'Rohan', photo: null, role: 'member', joinedAt: '2026-10-09T10:00:00Z' }],
      },
    })
    api.getFriends.mockResolvedValue({
      success: true,
      data: {
        friends: [
          { userId: 'u-rohan', name: 'Rohan', photo: null, since: '2026-09-01T00:00:00Z' },
          { userId: 'u-kavya', name: 'Kavya', photo: null, since: '2026-09-01T00:00:00Z' },
        ],
        count: 2,
      },
    })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('Invite friends'))
    await fireEvent.press(screen.getByLabelText('Invite friends'))
    await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Kavya' }))
    expect(screen.queryByRole('checkbox', { name: 'Ask Rohan' })).toBeNull()
  })

  it('"We’re here" names the event you are checked in at, not a place you went live at', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    api.getActiveCheckins.mockResolvedValue({
      success: true,
      data: { checkIns: [{ eventId: 'venue-day', kind: 'venue_day' }, { eventId: 'the-event', kind: 'event' }] },
    } as never)
    crews.here.mockResolvedValue({ success: true, data: { notified: 1, repeated: false } })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByLabelText('We’re here'))
    await fireEvent.press(screen.getByLabelText('We’re here'))
    await waitFor(() => expect(crews.here).toHaveBeenCalledWith('c2', 'the-event'))
  })

  it('M11: the anonymity switch holds still while its write is in flight', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    crews.setKeepMeAnonymous.mockReturnValue(new Promise(() => {}) as never)
    await render(<CrewScreen />)
    const toggle = await waitFor(() => screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await fireEvent.press(toggle)
    expect(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL })).toBeDisabled()
    crews.setKeepMeAnonymous.mockReset()
  })

  it('M11: a write that lands after a refresh changes only its own field', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValueOnce({ success: true, data: crew('owner') })
    let finish: (v: unknown) => void = () => {}
    crews.setKeepMeAnonymous.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<CrewScreen />)
    const anon = await waitFor(() => screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await fireEvent.press(anon)
    // Meanwhile a pull-to-refresh brings the crew as it is now: room for one more turned on elsewhere.
    crews.crew.mockResolvedValueOnce({ success: true, data: { ...crew('owner'), openToSolo: true } })
    await act(async () => {
      await screen.getByTestId('crew-scroll').props.refreshControl.props.onRefresh()
    })
    await waitFor(() => expect(crews.crew).toHaveBeenCalledTimes(2))
    await act(async () => finish({ success: true, data: { keepMeAnonymous: true } }))
    expect(screen.getByRole('switch', { name: 'Room for one more' }).props.accessibilityState.checked).toBe(true)
    expect(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }).props.accessibilityState.checked).toBe(true)
    crews.setKeepMeAnonymous.mockReset()
    crews.crew.mockReset()
  })

  it('a member does not get the owner’s switch', async () => {
    mockParams.crewId = 'c2'
    crews.crew.mockResolvedValue({ success: true, data: crew('member') })
    await render(<CrewScreen />)
    await waitFor(() => screen.getByText('Open crew chat'))
    expect(screen.queryByRole('switch', { name: 'Room for one more' })).toBeNull()
  })
})

describe('a Blend (CR-M02)', () => {
  const blend: Blend = {
    blendId: 'b1',
    chatGroupId: 'g1',
    eventId: 'e1',
    closesAt: new Date(Date.now() + 9 * 3600_000).toISOString(),
    sides: [
      {
        kind: 'crew',
        crewId: 'c2',
        name: 'Two',
        emblemSeed: 's2',
        mine: true,
        count: 3,
        revealed: null,
        keptPrivate: null,
        people: [{ userId: 'me', pseudonym: 'Cosmic Panda', name: null, photo: null }],
      },
      {
        kind: 'crew',
        crewId: 'c5',
        name: 'Five',
        emblemSeed: 's5',
        mine: false,
        count: 2,
        revealed: 1,
        keptPrivate: 1,
        people: [
          { userId: 'rh_v', pseudonym: 'Quiet Otter', name: 'Vikram', photo: 'v.jpg' },
          { userId: 'rh_p2', pseudonym: 'Velvet Heron', name: null, photo: null },
        ],
      },
    ],
  }

  it('names only whoever revealed in this Blend; a kept-private member stays their pseudonym', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    expect(screen.getByText('Vikram')).toBeTruthy()
    expect(screen.getByText('Velvet Heron')).toBeTruthy()
    expect(screen.getByText('1 revealed · 1 keeps it private')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    // H3: your own side is a count and you — never which crewmate kept private.
    expect(screen.getByText('You and 2 of your crew here')).toBeTruthy()
    expect(screen.getAllByText(/keeps? it private/)).toHaveLength(1)
  })

  it('M6: a failed read is not a closed Blend', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: false, error: 'No internet connection.' })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText(/This Blend didn.t load/))
    expect(screen.queryByText(BLEND_CLOSED_LINE)).toBeNull()
  })

  it('opened from its chat, "Open the chat" goes back to it rather than stacking another', async () => {
    mockParams.blendId = 'b1'
    mockParams.fromChat = '1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Open the chat'))
    expect(router.back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('M8: a second block while the first is in flight sends nothing', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    let finish: (v: unknown) => void = () => {}
    api.blockUser.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Velvet Heron. Block'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    const run = (sheet.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run
    const first = run()
    await run()
    expect(api.blockUser).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ success: true, data: { blocked: true } })
      await first
    })
    api.blockUser.mockReset()
  })

  it('reveal asks first, then posts the reveal for this Blend', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    crews.reveal.mockResolvedValue({ success: true, data: { revealed: true } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Reveal our crew'))
    expect(crews.reveal).not.toHaveBeenCalled()
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    const action = sheet.actions.find((a) => a.label === 'Reveal')
    await act(async () => {
      await (action as { run: () => Promise<unknown> }).run()
    })
    expect(crews.reveal).toHaveBeenCalledWith('b1')
    // No count comes back: one line, never "N revealed · M keep it private" about your own crew.
    await waitFor(() => screen.getByText(REVEALED_LINE))
  })

  it('blocks somebody on the other side by their handle in this Blend', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    api.blockUser.mockResolvedValue({ success: true, data: { blocked: true } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Velvet Heron. Block'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    await (sheet.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run()
    expect(api.blockUser).toHaveBeenCalledWith('rh_p2')
  })

  it('leaving marks the room left on this phone, so its chat offers Rejoin rather than "closed"', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    api.leaveChatGroup.mockResolvedValue({ success: true, data: { chatGroupId: 'g1', left: true } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Leave this Blend'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    await (sheet.actions.find((a) => a.label === 'Leave') as { run: () => Promise<unknown> }).run()
    expect(api.leaveChatGroup).toHaveBeenCalledWith('g1')
    expect(markRoomLeft).toHaveBeenCalledWith('g1')
  })

  it('a Blend that is not open reads closed', async () => {
    mockParams.blendId = 'gone'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText(BLEND_CLOSED_LINE))
  })
})
