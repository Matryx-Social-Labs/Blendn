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
  apiClient: {
    getBoardRequests: jest.fn(),
    answerBoardRequest: jest.fn(),
    reportBoardRequest: jest.fn(),
    blockBoardRequest: jest.fn(),
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
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
import { showSheet } from '../lib/sheet'

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
// What the server sends an asker for a declined ask (step 6b): pending, live, undecided.
const DECLINED: BoardRequest = { ...base, id: 'r-no', status: 'pending', live: true, counterpart: 'Quiet Otter' }
// And for an ask to somebody blocked either way: an ask on a withdrawn post.
const BLOCKED: BoardRequest = {
  ...base,
  id: 'r-blk',
  status: 'pending',
  live: false,
  counterpart: 'Amber Lynx',
  post: { id: 'p1', kind: 'offer', body: null },
}
const LAPSED: BoardRequest = { ...base, id: 'r-old', status: 'pending', live: false, counterpart: 'Lunar Fox' }

const listing = (incoming: BoardRequest[], outgoing: BoardRequest[] = []) => ({
  success: true,
  data: { incoming, outgoing },
})

beforeEach(() => {
  jest.clearAllMocks()
  Object.values(api).forEach((fn) => (fn as jest.Mock).mockReset())
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

  it.each([
    ['That offer is full', 'Your offer is full'],
    ['That request has already been answered', 'Already answered'],
    ['That post was taken down', 'Closed'],
    ['That event has ended', 'Closed'],
    ['This request can no longer be accepted', 'Closed'],
  ])('an accept refused with "%s" leaves "%s" quietly on the ask', async (error, line) => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

    expect(await screen.findByText(line)).toBeTruthy()
    expect(screen.queryByText(error)).toBeNull()
    expect(mockShowToast).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    // And it reads again, so an ask that can no longer be answered goes.
    await waitFor(() => expect(api.getBoardRequests).toHaveBeenCalledTimes(2))
  })

  it('an ask the reload no longer lists goes, note and all', async () => {
    api.getBoardRequests.mockResolvedValueOnce(listing([INCOMING])).mockResolvedValue(listing([]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That event has ended' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))
    await waitFor(() => expect(screen.queryByText('Arctic Falcon')).toBeNull())
  })

  it('an accept refused outright (403): says so, opens nothing, and the row stays', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.answerBoardRequest.mockResolvedValue({
      success: false,
      errorCode: 'FORBIDDEN',
      error: 'Only the person who was asked can answer',
    })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Accept the request from Arctic Falcon'))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Only the person who was asked can answer', 'error'))
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
  it('reads a declined ask, as its asker is sent it, exactly as a waiting one', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [WAITING, DECLINED]))
    const onCount = jest.fn()
    await render(<BoardRequestsSection refreshKey={0} onCount={onCount} />)

    expect(await screen.findAllByText('Waiting on them')).toHaveLength(2)
    expect(screen.getByLabelText('Withdraw your ask to Velvet Heron')).toBeTruthy()
    expect(screen.getByLabelText('Withdraw your ask to Quiet Otter')).toBeTruthy()
    expect(screen.queryByText(/declin/i)).toBeNull()
    expect(screen.queryByLabelText(/declin/i)).toBeNull()
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(2))
  })

  it('reads an ask to somebody blocked as closed, with nothing to withdraw', async () => {
    api.getBoardRequests.mockResolvedValue(listing([], [BLOCKED]))
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)
    expect(await screen.findByText('Closed')).toBeTruthy()
    expect(screen.queryByLabelText('Withdraw your ask to Amber Lynx')).toBeNull()
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

  it('withdrawing one that was accepted meanwhile (409) brings it back as said yes', async () => {
    const accepted = { ...WAITING, status: 'accepted' as const, live: false }
    api.getBoardRequests.mockResolvedValueOnce(listing([], [WAITING])).mockResolvedValue(listing([], [accepted]))
    api.answerBoardRequest.mockResolvedValue({ success: false, errorCode: 'CONFLICT', error: 'That request has already been answered' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    await fireEvent.press(await screen.findByLabelText('Withdraw your ask to Velvet Heron'))
    expect(await screen.findByText(/They said yes/)).toBeTruthy()
    expect(mockShowToast).not.toHaveBeenCalled()
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

describe('report and block, by the ask', () => {
  type Steps = { label: string; next?: () => unknown; run?: (...a: string[]) => Promise<unknown> }[]
  const menu = async () => {
    await fireEvent.press(await screen.findByLabelText('More options for the request from Arctic Falcon'))
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0] as { title: string; actions: Steps }
    return (label: string) => sheet.actions.find((a) => a.label === label)!
  }

  it('blocks the asker by the ask, after asking, and the row goes', async () => {
    api.getBoardRequests.mockResolvedValueOnce(listing([INCOMING])).mockResolvedValue(listing([]))
    api.blockBoardRequest.mockResolvedValue({ success: true, data: { blocked: true } })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    const step = await menu()
    const confirm = step('Block').next!() as { title: string; actions: Steps }
    expect(confirm.title).toBe('Block Arctic Falcon?')
    expect(await confirm.actions.find((a) => a.label === 'Block')!.run!()).toEqual({ ok: true, toast: 'Arctic Falcon is blocked' })
    expect(api.blockBoardRequest).toHaveBeenCalledWith('r-in')
    await waitFor(() => expect(screen.queryByText('Arctic Falcon')).toBeNull())
  })

  it('a block that fails stays open and says so', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.blockBoardRequest.mockResolvedValue({ success: false, errorCode: 'SERVER_ERROR', error: 'Failed to block user' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    const step = await menu()
    const confirm = step('Block').next!() as { actions: Steps }
    expect(await confirm.actions.find((a) => a.label === 'Block')!.run!()).toEqual({
      ok: false,
      error: 'Failed to block user. Try again.',
    })
    expect(screen.getByText('Arctic Falcon')).toBeTruthy()
  })

  it('reports the ask with a reason', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.reportBoardRequest.mockResolvedValue({ success: true, data: { reported: true } })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    const step = await menu()
    const reasons = step('Report').next!() as { title: string; run: (r: string, d?: string) => Promise<unknown> }
    expect(reasons.title).toBe("Report Arctic Falcon's ask")
    expect(await reasons.run('harassment')).toEqual({ ok: true, toast: 'Report sent. Our team will review it.' })
    expect(api.reportBoardRequest).toHaveBeenCalledWith('r-in', { reason: 'harassment' })
  })

  it('a rate-limited report says so', async () => {
    api.getBoardRequests.mockResolvedValue(listing([INCOMING]))
    api.reportBoardRequest.mockResolvedValue({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many requests' })
    await render(<BoardRequestsSection refreshKey={0} onCount={jest.fn()} />)

    const step = await menu()
    const reasons = step('Report').next!() as { run: (r: string) => Promise<unknown> }
    expect(await reasons.run('spam')).toEqual({ ok: false, error: "You've sent a lot of reports. Try again later." })
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
