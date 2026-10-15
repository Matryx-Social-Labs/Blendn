/**
 * REGRESSION (client plan Part 4b, BD-CU04): a conversation opened by accepting
 * a board request draws no match opener.
 *
 * The failure this pins shows nothing: the conversation opens, the pseudonyms
 * are right, and the screen greets two people who agreed to share a car with
 * "You both said yes." A board conversation is pseudonymous like a match, so
 * any opener keyed on pseudonymity, or on "new conversation", draws it here.
 * The server marks it with `origin_board_request_id` and answers
 * `fromMatch: false`; the thread must believe that and nothing else.
 *
 * Rendered, not grepped: the DM screen with the exact payload staging returned
 * for a board conversation (SCRUM-126, 2026-09-14), and a match as the control
 * so the assertion cannot pass on a screen that never draws an opener.
 */
import { render, screen, waitFor } from '@testing-library/react-native'

const mockParams: Record<string, string> = { conversationId: 'conv-board' }
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    Stack: { Screen: () => React.createElement(React.Fragment) },
  }
})
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
    getConversation: jest.fn(),
    getConversationMessages: jest.fn(),
    sendPrivateMessage: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => {
  const noop = () => () => {}
  return {
    subscribeToConversation: noop,
    subscribeToDelivered: noop,
    startPrivateTyping: jest.fn(),
    stopPrivateTyping: jest.fn(),
    markPrivateMessagesRead: jest.fn(),
  }
})
// One object: the screen reloads when `user` changes identity.
const mockAuth = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
jest.mock('../lib/notifications', () => ({ useActiveThread: () => {} }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))

import { apiClient } from '../lib/apiClient'
import PrivateChat from '../app/private-chat/[conversationId]'

const api = apiClient as jest.Mocked<typeof apiClient>

/** What `GET /conversations/:id` returned for the board conversation on staging. */
const BOARD_CONVERSATION = {
  id: 'conv-board',
  otherUser: { id: 'u_kavya', name: 'Arctic Falcon', image: null },
  fromMatch: false,
  pseudonymous: true,
  youRevealed: false,
  theyRevealed: false,
  revealRequested: false,
  createdAt: '2026-10-01T10:00:00Z',
  lastMessageAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  api.getConversationMessages.mockResolvedValue({
    success: true,
    data: { messages: [], hasMore: false, nextCursor: null },
  } as never)
})

it('draws no match opener on a conversation opened from the board', async () => {
  api.getConversation.mockResolvedValue({ success: true, data: BOARD_CONVERSATION } as never)
  await render(<PrivateChat />)

  // The pseudonym arrived, so the conversation record has been read and drawn.
  expect(await screen.findAllByText('Arctic Falcon')).not.toHaveLength(0)
  expect(screen.queryByText('You both said yes.')).toBeNull()
  expect(screen.queryByText(/liked each other/)).toBeNull()
})

it('still draws it on a match — the control', async () => {
  api.getConversation.mockResolvedValue({
    success: true,
    data: { ...BOARD_CONVERSATION, id: 'conv-match', fromMatch: true },
  } as never)
  await render(<PrivateChat />)

  await waitFor(() => expect(screen.getByText('You both said yes.')).toBeTruthy())
})
