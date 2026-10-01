/**
 * Board requests in the Banter, against a mocked API (client plan Part 3b/4b).
 *
 * Accept opens the conversation it made; "already answered" is news, not a
 * failure; an ask you sent never reads as declined.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react')
    useEffect(effect, [effect])
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getBoardRequests: jest.fn(), answerBoardRequest: jest.fn() },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/OptimizedImage', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { OptimizedImage: () => React.createElement(View) }
})
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { router } from 'expo-router'
import { BoardRequestsSection } from '../components/board/BoardRequestsSection'
import { apiClient } from '../lib/apiClient'

const api = apiClient as jest.Mocked<typeof apiClient>
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

const base = {
  message: null,
  createdAt: new Date().toISOString(),
  decidedAt: null,
  event: { id: 'e1', title: 'Warehouse Night', startTime: FUTURE },
  post: { id: 'p1', kind: 'offer' as const, body: 'Two seats from Indiranagar' },
}
const INCOMING = { ...base, id: 'r-in', status: 'pending' as const, live: true, counterpart: 'Arctic Falcon' }
const WAITING = { ...base, id: 'r-wait', status: 'pending' as const, live: true, counterpart: 'Velvet Heron' }
const DECLINED = { ...base, id: 'r-no', status: 'declined' as const, live: false, counterpart: 'Quiet Otter' }

beforeEach(() => jest.clearAllMocks())

it('accepts, then opens the conversation the accept made', async () => {
  api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [INCOMING], outgoing: [] } })
  api.answerBoardRequest.mockResolvedValue({
    success: true,
    data: { id: 'r-in', status: 'accepted', conversationId: 'conv-1' },
  })
  await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

  await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId: 'conv-1' },
    })
  )
  expect(api.answerBoardRequest).toHaveBeenCalledWith('r-in', 'accept')
  expect(screen.queryByText('Arctic Falcon')).toBeNull()
})

it('tells "already answered" as news, not as a failure', async () => {
  api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [INCOMING], outgoing: [] } })
  api.answerBoardRequest.mockResolvedValue({
    success: false,
    errorCode: 'CONFLICT',
    error: 'That request has already been answered',
  })
  await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

  await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That request has already been answered', 'info'))
  expect(mockShowToast).not.toHaveBeenCalledWith(expect.anything(), 'error')
  expect(router.push).not.toHaveBeenCalled()
})

it('declines quietly: the row leaves, and nothing is said', async () => {
  api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [INCOMING], outgoing: [] } })
  api.answerBoardRequest.mockResolvedValue({ success: true, data: { id: 'r-in', status: 'declined' } })
  await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

  await fireEvent.press(await screen.findByLabelText('Decline the request from Arctic Falcon'))

  await waitFor(() => expect(screen.queryByText('Arctic Falcon')).toBeNull())
  expect(api.answerBoardRequest).toHaveBeenCalledWith('r-in', 'decline')
  expect(mockShowToast).not.toHaveBeenCalled()
})

it('shows your own asks quieter, and a declined one only as closed', async () => {
  api.getBoardRequests.mockResolvedValue({
    success: true,
    data: { incoming: [], outgoing: [WAITING, DECLINED] },
  })
  const onCount = jest.fn()
  await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)

  expect(await screen.findByText('Waiting on them')).toBeTruthy()
  expect(screen.getByText('Closed')).toBeTruthy()
  expect(screen.queryByText(/declin/i)).toBeNull()
  // Only a live ask can be withdrawn.
  expect(screen.getByLabelText('Withdraw your ask to Velvet Heron')).toBeTruthy()
  expect(screen.queryByLabelText('Withdraw your ask to Quiet Otter')).toBeNull()
  await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(2))
})

it('draws nothing, and says so, when there is nothing', async () => {
  api.getBoardRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } })
  const onCount = jest.fn()
  await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)

  await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalled())
  expect(screen.queryByText('The Board')).toBeNull()
  expect(onCount).toHaveBeenLastCalledWith(0)
})
