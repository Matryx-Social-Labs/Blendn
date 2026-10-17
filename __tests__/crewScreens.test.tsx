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
