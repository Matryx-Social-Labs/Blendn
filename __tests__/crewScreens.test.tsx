/**
 * The crew screens against a mocked API (test plan §7: CR-CU01, CR-M01/M02).
 *
 * The join-time consent is on screen without a tap and nothing is sent until
 * the person ticks it; the Blend shows names only from `GET /blends` (a kept-
 * private member stays a pseudonym); a Blend that is not open reads closed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

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
  apiClient: { getFriends: jest.fn(), blockUser: jest.fn(), leaveChatGroup: jest.fn(), queuedRequest: jest.fn() },
}))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { create: jest.fn(), myCrews: jest.fn(), join: jest.fn(), decline: jest.fn(), blends: jest.fn(), reveal: jest.fn() },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { router } from 'expo-router'
import BlendScreen from '../app/blend/[blendId]'
import CrewsScreen from '../app/crews/index'
import NewCrewScreen from '../app/crews/new'
import { apiClient } from '../lib/apiClient'
import { BLEND_CLOSED_LINE, CONSENT_AGREE, CONSENT_LINE, KEEP_ANONYMOUS_LABEL, type Blend } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
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
    await waitFor(() => screen.getByText('Rohan'))
    await fireEvent.press(screen.getByText('Rohan'))
    await fireEvent.press(screen.getByRole('switch', { name: KEEP_ANONYMOUS_LABEL }))
    await fireEvent.press(screen.getByRole('checkbox'))
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
    await fireEvent.press(screen.getByRole('checkbox'))
    await fireEvent.press(screen.getByLabelText('Make the crew'))
    await waitFor(() => screen.getByText('A phone number. Contact details can’t go on it.'))
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

  it('an invite that went away says so, in one line', async () => {
    crews.join.mockResolvedValue({ success: false, error: 'Crew not found', errorCode: 'NOT_FOUND' })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Accept'))
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_AGREE) }))
    await fireEvent.press(screen.getByLabelText('Join Five'))
    await waitFor(() => screen.getByText('That invite isn’t open any more.'))
  })

  it('declining tells nobody and takes it off the list', async () => {
    crews.decline.mockResolvedValue({ success: true, data: { declined: true } })
    await render(<CrewsScreen />)
    await waitFor(() => screen.getByText('Vikram asked you · Crew of 4'))
    await fireEvent.press(screen.getByLabelText('Decline'))
    await waitFor(() => expect(screen.queryByText('Vikram asked you · Crew of 4')).toBeNull())
    expect(crews.decline).toHaveBeenCalledWith('c5')
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
        revealed: 0,
        keptPrivate: 0,
        people: [{ userId: 'me', pseudonym: 'Cosmic Panda', name: null, photo: null }],
      },
      {
        kind: 'crew',
        crewId: 'c5',
        name: 'Five',
        emblemSeed: 's5',
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
  })

  it('reveal asks first, then posts the reveal for this Blend', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    crews.reveal.mockResolvedValue({ success: true, data: { revealed: 3, keptPrivate: 1 } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Reveal our crew'))
    expect(crews.reveal).not.toHaveBeenCalled()
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    const action = sheet.actions.find((a) => a.label === 'Reveal')
    await (action as { run: () => Promise<unknown> }).run()
    expect(crews.reveal).toHaveBeenCalledWith('b1')
  })

  it('blocks somebody on the other side by their handle in this Blend', async () => {
    mockParams.blendId = 'b1'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    api.blockUser.mockResolvedValue({ success: true, data: { blocked: true } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText('Blend with Five'))
    await fireEvent.press(screen.getByLabelText('Velvet Heron. Block or report'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as ActionSheet
    await (sheet.actions.find((a) => a.label === 'Block') as { run: () => Promise<unknown> }).run()
    expect(api.blockUser).toHaveBeenCalledWith('rh_p2')
  })

  it('a Blend that is not open reads closed', async () => {
    mockParams.blendId = 'gone'
    crews.blends.mockResolvedValue({ success: true, data: { blends: [blend] } })
    await render(<BlendScreen />)
    await waitFor(() => screen.getByText(BLEND_CLOSED_LINE))
  })
})
