/**
 * The Board screen against a mocked API (client plan Part 3b, test plan BD-*).
 *
 * The two empty states, the two card shapes in their order, a gate's reason on
 * the screen in the server's words, and a 409 drawn as a state.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
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
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getBoard: jest.fn(),
    getBoardRequests: jest.fn(),
    postToBoard: jest.fn(),
    askOnBoard: jest.fn(),
    withdrawBoardPost: jest.fn(),
  },
}))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { apiClient } from '../lib/apiClient'
import { openBlendn } from '../lib/blendnOverlay'
import BoardScreen from '../app/board/[eventId]'

const api = apiClient as jest.Mocked<typeof apiClient>
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

const OFFER = {
  id: 'p-offer',
  kind: 'offer' as const,
  body: 'Driving from Indiranagar at 8',
  spacesLeft: 2,
  createdAt: '2026-10-01T09:00:00Z',
  author: 'Velvet Heron',
  mine: false,
  requestCount: 1,
}
const SEEKING = {
  id: 'p-seek',
  kind: 'seeking' as const,
  body: 'Going alone, anyone from Koramangala?',
  spacesLeft: null,
  createdAt: '2026-10-01T10:00:00Z',
  author: 'Quiet Otter',
  mine: false,
  requestCount: 0,
}
const NO_REQUESTS = { success: true, data: { incoming: [], outgoing: [] } }

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(mockParams, { eventId: 'e1', title: 'Warehouse Night', startTime: FUTURE })
  api.getBoardRequests.mockResolvedValue(NO_REQUESTS as never)
})

it('invites the first post when nobody has posted', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [] } })
  await render(<BoardScreen />)

  expect(await screen.findByText("Nobody's posted yet")).toBeTruthy()
  await fireEvent.press(screen.getByLabelText('Write a post'))
  expect(screen.getByLabelText('Your post')).toBeTruthy()
})

it('is closed after doors, and offers the room instead', async () => {
  mockParams.startTime = PAST
  await render(<BoardScreen />)

  expect(screen.getByText("The board's closed")).toBeTruthy()
  await fireEvent.press(screen.getByLabelText('Open the room'))
  expect(openBlendn).toHaveBeenCalled()
  expect(api.getBoard).not.toHaveBeenCalled()
})

it('puts an offer, with its spaces, above a newer seeking', async () => {
  // The server sends newest first: the seeking arrives first.
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [SEEKING, OFFER] } })
  await render(<BoardScreen />)

  expect(await screen.findByText('2 spaces left')).toBeTruthy()
  const bodies = screen.getAllByText(/Driving from Indiranagar|Going alone/).map((n) => n.props.children)
  expect(bodies).toEqual([OFFER.body, SEEKING.body])
  // The kind in words too, so the counter is never the only difference.
  expect(screen.getByText('Offering')).toBeTruthy()
  expect(screen.getByText('Looking')).toBeTruthy()
})

it('shows which gate refused a post, in the server’s words, and keeps it there', async () => {
  const reason =
    'Add your name, age, two interests and why you go out — people are deciding whether to travel with you'
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [] } })
  api.postToBoard.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: reason })
  await render(<BoardScreen />)

  await fireEvent.press(await screen.findByLabelText('Write a post'))
  await fireEvent.changeText(screen.getByLabelText('Your post'), 'Two seats from Indiranagar')
  await fireEvent.press(screen.getByLabelText('Post to the board'))

  expect(await screen.findByText(reason)).toBeTruthy()
  expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'offer', body: 'Two seats from Indiranagar', spacesLeft: 1 })
  // Still composing, with the words kept, so the fix can be followed and retried.
  expect(screen.getByLabelText('Your post').props.value).toBe('Two seats from Indiranagar')
})

it('puts a new post at the top', async () => {
  // The next read has it, newest first, under the handle the server gave you.
  const mine = { ...SEEKING, id: 'p-new', body: 'Me too, from HSR', author: 'Lunar Fox', mine: true }
  api.getBoard
    .mockResolvedValueOnce({ success: true, data: { posts: [OFFER] } })
    .mockResolvedValue({ success: true, data: { posts: [mine, OFFER] } })
  api.postToBoard.mockResolvedValue({
    success: true,
    data: { id: 'p-new', kind: 'seeking', body: 'Me too, from HSR', spacesLeft: null, createdAt: '2026-10-01T11:00:00Z' },
  })
  await render(<BoardScreen />)

  await fireEvent.press(await screen.findByLabelText('Write a post'))
  await fireEvent.press(screen.getByLabelText("I'm looking"))
  await fireEvent.changeText(screen.getByLabelText('Your post'), 'Me too, from HSR')
  await fireEvent.press(screen.getByLabelText('Post to the board'))

  await waitFor(() => expect(screen.getAllByText(/Me too, from HSR|Driving from/)[0].props.children).toBe('Me too, from HSR'))
  expect(api.postToBoard).toHaveBeenCalledWith('e1', { kind: 'seeking', body: 'Me too, from HSR' })
  expect(await screen.findByText('Lunar Fox')).toBeTruthy()
  expect(screen.getByText('Looking · yours')).toBeTruthy()
})

it('flips the card to "Waiting on them" when the ask goes', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [OFFER] } })
  api.askOnBoard.mockResolvedValue({ success: true, data: { id: 'r1', status: 'pending' } })
  await render(<BoardScreen />)

  await fireEvent.press(await screen.findByLabelText('Ask Velvet Heron to join'))
  expect(await screen.findByText('Waiting on them')).toBeTruthy()
  expect(screen.queryByLabelText('Ask Velvet Heron to join')).toBeNull()
  expect(api.askOnBoard).toHaveBeenCalledWith('e1', 'p-offer')
})

it('draws a 409 as a state — the sentence, no button, nothing alarming', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [OFFER] } })
  api.askOnBoard.mockResolvedValue({
    success: false,
    errorCode: 'CONFLICT',
    error: 'You have already asked — give them a moment',
  })
  await render(<BoardScreen />)

  await fireEvent.press(await screen.findByLabelText('Ask Velvet Heron to join'))
  expect(await screen.findByText('You have already asked — give them a moment')).toBeTruthy()
  expect(screen.queryByLabelText('Ask Velvet Heron to join')).toBeNull()
})

it('names the gate on an ask, and leaves the button for after the fix', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [OFFER] } })
  api.askOnBoard.mockResolvedValue({
    success: false,
    errorCode: 'FORBIDDEN',
    error: 'You have 5 asks waiting for an answer. Give them a moment.',
  })
  await render(<BoardScreen />)

  await fireEvent.press(await screen.findByLabelText('Ask Velvet Heron to join'))
  expect(await screen.findByText('You have 5 asks waiting for an answer. Give them a moment.')).toBeTruthy()
  expect(screen.getByLabelText('Ask Velvet Heron to join')).toBeTruthy()
})

it('remembers an ask already sent', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [OFFER] } })
  api.getBoardRequests.mockResolvedValue({
    success: true,
    data: {
      incoming: [],
      outgoing: [
        {
          id: 'r1',
          status: 'pending',
          message: null,
          createdAt: '2026-10-01T10:00:00Z',
          decidedAt: null,
          live: true,
          counterpart: 'Velvet Heron',
          event: { id: 'e1', title: 'Warehouse Night', startTime: FUTURE },
          post: { id: 'p-offer', kind: 'offer', body: OFFER.body },
        },
      ],
    },
  })
  await render(<BoardScreen />)

  expect(await screen.findByText('Waiting on them')).toBeTruthy()
  expect(screen.queryByLabelText('Ask Velvet Heron to join')).toBeNull()
})

it('says why the board is not open to you — not going, in the server’s words', async () => {
  api.getBoard.mockResolvedValue({
    success: false,
    errorCode: 'FORBIDDEN',
    error: 'Mark yourself as going to post here',
  })
  await render(<BoardScreen />)

  expect(await screen.findByText('Mark yourself as going to post here')).toBeTruthy()
})

it('says the board did not load, rather than that it is empty', async () => {
  api.getBoard.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'Failed to load the board' })
  await render(<BoardScreen />)

  expect(await screen.findByText("The board didn't load")).toBeTruthy()
  expect(screen.queryByText("Nobody's posted yet")).toBeNull()
})

it('carries the placeholder banner in every state', async () => {
  api.getBoard.mockResolvedValue({ success: true, data: { posts: [OFFER] } })
  await render(<BoardScreen />)
  expect(await screen.findByText(/PLACEHOLDER DESIGN/)).toBeTruthy()
})
