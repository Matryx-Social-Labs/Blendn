/**
 * Add friends, Flow 7 2-A (Link | QR code and the section names), in a file of its own: the store and mocks start fresh.
 *
 * Add friends — the requests either way, against a mocked API.
 *
 * Behavioural, because every button here is a decision about which request
 * and which verb: Accept and Not now must answer THIS request with the right
 * action and take only it off the list; Withdraw must take back only yours;
 * a failure must leave the row where it was; and a second tap while the first
 * is in flight must not send a second answer.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockAsk = jest.fn()
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: (...a: unknown[]) => mockAsk(...a), useStillHere: () => () => true }))
const mockAddParams: { side?: string } = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockAddParams,
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
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getFriendInvite: jest.fn(),
    resetFriendInvite: jest.fn(),
    getFriendRequests: jest.fn(),
    respondToFriendRequest: jest.fn(),
    withdrawFriendRequest: jest.fn(),
  },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../lib/useAuth', () => {
  const auth = { user: { id: 'u_me', name: 'Sam' } }
  return { useAuth: () => auth }
})
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})

import { apiClient } from '../lib/apiClient'
import AddFriendsScreen from '../app/friends/add'
import { resetFriendRequests } from '../lib/friendRequests'

const api = apiClient as jest.Mocked<typeof apiClient>
const person = (userId: string, name: string) => ({ userId, name, photo: null })
const BEN = { id: 'req-ben', person: person('u_ben', 'Ben'), createdAt: '2026-09-27T20:00:00Z' }
const CAM = { id: 'req-cam', person: person('u_cam', 'Cam'), createdAt: '2026-09-27T20:00:00Z' }
const DEE = { id: 'req-dee', person: person('u_dee', 'Dee'), createdAt: '2026-09-27T20:00:00Z' }

/*
 * Flow 7 2-A: one card flips between your link and a QR of the same URL with your face in it; Friend requests and Sent requests
 * are the section names. Negative control: the card without `side` (no QR) fails the first; the old "Requests"/"Sent" the second.
 */
describe('Link | QR code', () => {
  beforeEach(() => {
    resetFriendRequests()
    // Tests above leave answers queued (`…Once`), which `clearAllMocks` keeps.
    for (const fn of [api.getFriendInvite, api.getFriendRequests]) fn.mockReset()
    api.getFriendInvite.mockResolvedValue({ success: true, data: { token: 'abcdefghijklmnopqrstuv', url: 'https://www.blendn.app/f/abcdefghijklmnopqrstuv' } })
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [BEN, CAM], outgoing: [DEE] } })
  })
  afterEach(() => delete mockAddParams.side)

  it('flips the card to a QR of your link, with your face and "Scan to ask to be friends"; the intro stays on the link side', async () => {
    await render(<AddFriendsScreen />)
    await screen.findByText('blendn.app/…qrstuv')
    expect(screen.getByText('Nobody can find you by searching. Send your link, or let them scan.')).toBeTruthy()
    expect(screen.queryByTestId('invite-qr', { includeHiddenElements: true })).toBeNull()
    await act(async () => fireEvent.press(screen.getByRole('tab', { name: /QR code/ })))
    expect(screen.getByTestId('invite-qr', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Scan to ask to be friends')).toBeTruthy()
    expect(screen.queryByText('Nobody can find you by searching. Send your link, or let them scan.')).toBeNull()
    // Share my link and Reset link stay where they were.
    expect(screen.getByText('Share my link')).toBeTruthy()
    expect(screen.getByText('Reset link')).toBeTruthy()
  })

  it('opens on the QR side from the empty Friends page’s Show my QR code', async () => {
    mockAddParams.side = 'qr'
    await render(<AddFriendsScreen />)
    expect(await screen.findByTestId('invite-qr', { includeHiddenElements: true })).toBeTruthy()
  })

  it('names its sections Friend requests and Sent requests', async () => {
    await render(<AddFriendsScreen />)
    expect(await screen.findByText('Friend requests')).toBeTruthy()
    expect(screen.getByText('Sent requests')).toBeTruthy()
    expect(screen.queryByText('Requests')).toBeNull()
    expect(screen.queryByText('Sent')).toBeNull()
  })
})
