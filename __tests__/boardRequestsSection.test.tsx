/**
 * Board requests in the Banter, against a mocked API (client plan Part 3b/4b).
 *
 * Accept opens the conversation it made; "already answered" is news, not a
 * failure; an ask you sent never lets a decline be read — not in its line, not
 * in a toast, not in a withdrawal that fails.
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
import type { BoardRequest } from '../lib/board'

const api = apiClient as jest.Mocked<typeof apiClient>
const FUTURE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

const base = {
  message: null,
  createdAt: new Date().toISOString(),
  decidedAt: null,
  event: { id: 'e1', title: 'Warehouse Night', startTime: FUTURE },
  post: { id: 'p1', kind: 'offer' as const, body: 'Two seats from Indiranagar' },
}
const INCOMING: BoardRequest = { ...base, id: 'r-in', status: 'pending', live: true, counterpart: 'Arctic Falcon' }
const WAITING: BoardRequest = { ...base, id: 'r-wait', status: 'pending', live: true, counterpart: 'Velvet Heron' }
const DECLINED: BoardRequest = {
  ...base,
  id: 'r-no',
  status: 'declined',
  live: false,
  decidedAt: new Date().toISOString(),
  counterpart: 'Quiet Otter',
}
const LAPSED: BoardRequest = { ...base, id: 'r-old', status: 'pending', live: false, counterpart: 'Lunar Fox' }

const listing = (incoming: BoardRequest[], outgoing: BoardRequest[] = []) => ({
  success: true,
  data: { incoming, outgoing },
})

beforeEach(() => {
  jest.clearAllMocks()
  api.getBoardRequests.mockReset()
  api.answerBoardRequest.mockReset()
})

describe('answering an ask', () => {
  it('accepts, then opens the conversation the accept made', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({ success: true, data: { id: 'r-in', status: 'accepted', conversationId: 'conv-1' } })
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

  it('tells "already answered" as news, then lets the row go on the reload', async () => {
    api.getBoardRequests.mockResolvedValueOnce(listing([INCOMING])).mockResolvedValue(listing([]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That request has already been answered' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That request has already been answered', 'info'))
    expect(mockShowToast).not.toHaveBeenCalledWith(expect.anything(), 'error')
    expect(router.push).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('Arctic Falcon')).toBeNull())
  })

  it('a blocked asker: says so, opens nothing, and the row stays', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'This request can no longer be accepted',
    })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('This request can no longer be accepted', 'error'))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByText('Arctic Falcon')).toBeTruthy()
  })

  it('declines quietly: the row leaves, and nothing is said', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({ success: true, data: { id: 'r-in', status: 'declined' } })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Decline the request from Arctic Falcon'))

    await waitFor(() => expect(screen.queryByText('Arctic Falcon')).toBeNull())
    expect(api.answerBoardRequest).toHaveBeenCalledWith('r-in', 'decline')
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a decline already overtaken (409) goes quietly too', async () => {
    api.getBoardRequests.mockResolvedValueOnce(listing([INCOMING])).mockResolvedValue(listing([]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That request has already been answered' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Decline the request from Arctic Falcon'))
    await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Arctic Falcon')).toBeNull()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a decline that did not go out puts the row back and says so', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({ success: false, error: 'No internet connection. Check your network and try again.' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Decline the request from Arctic Falcon'))
    expect(await screen.findByText('Arctic Falcon')).toBeTruthy()
    expect(mockShowToast).toHaveBeenCalledWith('No internet connection. Check your network and try again.', 'error')
  })

  it('answers once for two taps', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    let settle: (v: unknown) => void = () => {}
    api.answerBoardRequest.mockReturnValue(new Promise((r) => (settle = r)) as never)
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    const accept = await screen.findByLabelText('Accept the request from Arctic Falcon')
    await fireEvent.press(accept)
    await fireEvent.press(accept)
    settle({ success: true, data: { id: 'r-in', status: 'accepted', conversationId: 'conv-1' } })

    await waitFor(() => expect(router.push).toHaveBeenCalled())
    expect(api.answerBoardRequest).toHaveBeenCalledTimes(1)
  })
})

describe('asks you sent', () => {
  it('reads a declined ask exactly as a waiting one — line and Withdraw both', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [WAITING, DECLINED]))
    const onCount = jest.fn()
    await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)

    expect(await screen.findAllByText('Waiting on them')).toHaveLength(2)
    expect(screen.getByLabelText('Withdraw your ask to Velvet Heron')).toBeTruthy()
    expect(screen.getByLabelText('Withdraw your ask to Quiet Otter')).toBeTruthy()
    expect(screen.queryByText(/declin|closed/i)).toBeNull()
    expect(screen.queryByLabelText(/declin/i)).toBeNull()
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(2))
  })

  it('a lapsed ask is closed, with nothing left to withdraw', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [LAPSED]))
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)
    expect(await screen.findByText('Closed')).toBeTruthy()
    expect(screen.queryByLabelText('Withdraw your ask to Lunar Fox')).toBeNull()
  })

  it('withdraws: the row leaves, and nothing is said', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [WAITING]))
    api.answerBoardRequest.mockResolvedValue({ success: true, data: { id: 'r-wait', status: 'withdrawn' } })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Withdraw your ask to Velvet Heron'))
    await waitFor(() => expect(screen.queryByText(/Velvet Heron/)).toBeNull())
    expect(api.answerBoardRequest).toHaveBeenCalledWith('r-wait', 'withdraw')
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('withdrawing one already answered goes just the same — and stays gone after a reload', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [DECLINED]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That request has already been answered' })
    const view = await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Withdraw your ask to Quiet Otter'))
    await waitFor(() => expect(screen.queryByText(/Quiet Otter/)).toBeNull())
    expect(mockShowToast).not.toHaveBeenCalled()

    await view.rerender(<BoardRequestsSection refreshKey={1} onCount={jest.fn()} />)
    await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/Quiet Otter/)).toBeNull()
  })

  it.each([
    ['refused', { success: false, error: 'No internet connection. Check your network and try again.' }],
    ['threw', 'throw'],
  ])('a withdrawal that %s puts the row back, silently', async (_, outcome) => {
    api.getBoardRequests.mockResolvedValue(listing([], [WAITING]))
    if (outcome === 'throw') api.answerBoardRequest.mockRejectedValue(new Error('queue cleared'))
    else api.answerBoardRequest.mockResolvedValue(outcome as never)
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Withdraw your ask to Velvet Heron'))
    expect(await screen.findByLabelText('Withdraw your ask to Velvet Heron')).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})

describe('what the Banter counts', () => {
  it('draws nothing, and says so, when there is nothing', async () => {
    api.getBoardRequests.mockResolvedValue(listing([]))
    const onCount = jest.fn()
    await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)

    await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalled())
    expect(screen.queryByText('The Board')).toBeNull()
    expect(onCount).toHaveBeenLastCalledWith(0)
  })

  it('reads again when the Banter refreshes', async () => {
    api.getBoardRequests.mockResolvedValueOnce(listing([])).mockResolvedValue(listing([INCOMING]))
    const onCount = jest.fn()
    const view = await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)
    await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalledTimes(1))

    await view.rerender(<BoardRequestsSection refreshKey={1} onCount={onCount} />)
    expect(await screen.findByText('Arctic Falcon')).toBeTruthy()
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(1))
  })
})
