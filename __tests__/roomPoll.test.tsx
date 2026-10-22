/**
 * An organiser's poll in a room (Flow 5 poll bubbles, Flow 15 #17, R4.1 Polls · C8), against the routes' real shape
 * (blendn-admin lib/polls.ts `PollResults`): open, voted, counts withheld under five, results hidden by the organiser,
 * closed, and the one 409 the room keeps. Without the poll's id on the message the room says it as a notice (SV8).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { RoomMessageRow, type RowHandlers } from '../components/chat/RoomFeed'
import { optionIdAt, pollView, type PollResults } from '../lib/chatPoll'
import { roomMessageFromSocket, roomMessagesFrom, type RoomMessage } from '../lib/roomMessages'

const mockToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: (...a: unknown[]) => mockToast(...a) }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: jest.fn() } }))
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { H } from '../lib/haptics'
/* eslint-enable import/first */

const queued = apiClient.queuedRequest as jest.Mock
const handlers: RowHandlers = { menu: jest.fn(), retry: jest.fn(), react: jest.fn(), reply: jest.fn(), sender: jest.fn(), link: jest.fn() }

const O1 = '11111111-1111-4111-8111-111111111111'
const O2 = '22222222-2222-4222-8222-222222222222'
const poll = (over: Partial<PollResults> = {}): PollResults => ({
  id: 'p1',
  question: 'Which set first?',
  closed: false,
  resultsVisible: false,
  options: [
    { id: O1, label: 'Vinyl', position: 0, votes: null },
    { id: O2, label: 'Live band', position: 1, votes: null },
  ],
  myVote: null,
  ...over,
})
const message = (over: Partial<RoomMessage> = {}): RoomMessage => ({
  message_id: 'm1',
  sender_id: 'u-org',
  sender_name: 'Organiser',
  message_text: 'Which set first?',
  message_type: 'poll',
  reply_to_message_id: null,
  created_at: '2026-10-22T20:00:00.000Z',
  poll_id: 'p1',
  ...over,
})
const row = (item: RoomMessage, eventId: string | null = 'e1') =>
  render(<RoomMessageRow item={item} roomId="g1" mine={false} first last senderTappable eventId={eventId} handlers={handlers} />)
const flush = async () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })

beforeEach(() => {
  queued.mockReset()
  mockToast.mockReset()
})

describe('the poll message', () => {
  it('names its poll from whichever field the server uses, and only on a poll', () => {
    expect(roomMessagesFrom([{ id: 'a', type: 'poll', content: 'Q', userId: 'u', createdAt: 't', pollId: 'p9' }])[0].poll_id).toBe('p9')
    expect(roomMessagesFrom([{ id: 'a', type: 'poll', content: 'Q', userId: 'u', createdAt: 't', metadata: { pollId: 'p8' } }])[0].poll_id).toBe('p8')
    expect(roomMessagesFrom([{ id: 'a', type: 'text', content: 'Q', userId: 'u', createdAt: 't', pollId: 'p9' }])[0].poll_id).toBeUndefined()
    expect(roomMessageFromSocket({ id: 'a', userId: 'u', content: 'Q', type: 'poll', createdAt: 't', pollId: 'p7' }, 'me').poll_id).toBe('p7')
  })

  it('is the notice it always was while the message names no poll, and never reads one', async () => {
    await row(message({ poll_id: undefined }))
    expect(screen.getByText('Poll: Which set first?')).toBeTruthy()
    expect(queued).not.toHaveBeenCalled()
  })

  it('is the notice in a room that has no event to vote through', async () => {
    await row(message(), null)
    expect(screen.getByText('Poll: Which set first?')).toBeTruthy()
    expect(queued).not.toHaveBeenCalled()
  })
})

describe('the poll bubble, from the server’s disclosed state', () => {
  it('open and not voted: the question, the options as radios, "Tap to vote"', async () => {
    queued.mockResolvedValue({ success: true, data: poll() })
    await row(message())
    await flush()
    expect(queued).toHaveBeenCalledWith('/api/mobile/events/e1/polls/p1')
    expect(screen.getByLabelText('Poll from the organiser: Which set first?')).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByText(/Tap to vote/)).toBeTruthy()
  })

  it('voted while results are hidden: your pick is checked and the foot says when counts come', async () => {
    queued.mockResolvedValue({ success: true, data: poll({ myVote: O2 }) })
    await row(message())
    await flush()
    expect(screen.getByRole('radio', { name: 'Live band', checked: true })).toBeTruthy()
    expect(screen.getByText('Results appear when the poll closes')).toBeTruthy()
  })

  it('counts withheld under five say "Fewer than 5", never a zero', async () => {
    queued.mockResolvedValue({ success: true, data: poll({ resultsVisible: true, myVote: O1 }) })
    await row(message())
    await flush()
    expect(screen.getAllByText('Fewer than 5').length).toBe(2)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('counts the server discloses are drawn as sent, with their total', async () => {
    queued.mockResolvedValue({
      success: true,
      data: poll({ resultsVisible: true, myVote: O1, options: [{ id: O1, label: 'Vinyl', position: 0, votes: 7 }, { id: O2, label: 'Live band', position: 1, votes: 5 }] }),
    })
    await row(message())
    await flush()
    expect(screen.getByRole('radio', { name: 'Vinyl, 7 votes' })).toBeTruthy()
    expect(screen.getByText('12 votes')).toBeTruthy()
  })

  it('closed: no option presses, and it says Closed', async () => {
    queued.mockResolvedValue({ success: true, data: poll({ closed: true, myVote: O1, options: [{ id: O1, label: 'Vinyl', position: 0, votes: 9 }, { id: O2, label: 'Live band', position: 1, votes: 6 }] }) })
    await row(message())
    await flush()
    expect(screen.getByText('Closed · 15 votes')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Live band, 6 votes' }).props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('a poll that will not load stays the notice, never an empty bubble', async () => {
    queued.mockResolvedValue({ success: false, error: 'offline' })
    await row(message())
    await flush()
    expect(screen.getByText('Poll: Which set first?')).toBeTruthy()
  })
})

describe('voting', () => {
  it('sends the option, redraws from the server’s answer (never a local count), and plays H.select once', async () => {
    const select = jest.spyOn(H, 'select').mockImplementation(() => {})
    queued.mockResolvedValueOnce({ success: true, data: poll() })
    await row(message())
    await flush()
    queued.mockResolvedValueOnce({ success: true, data: poll({ myVote: O2 }) })
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Live band' })))
    expect(queued).toHaveBeenLastCalledWith('/api/mobile/events/e1/polls/p1/vote', expect.objectContaining({ method: 'POST', body: JSON.stringify({ optionId: O2 }) }), true, 2)
    expect(screen.getByRole('radio', { name: 'Live band', checked: true })).toBeTruthy()
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('a vote on a poll that closed says so once, and the bubble goes closed', async () => {
    queued.mockResolvedValueOnce({ success: true, data: poll() })
    await row(message())
    await flush()
    queued.mockResolvedValueOnce({ success: false, errorCode: 'CONFLICT', error: 'This poll has closed' })
    queued.mockResolvedValueOnce({ success: true, data: poll({ closed: true }) })
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Vinyl' })))
    await flush()
    expect(mockToast).toHaveBeenCalledWith('This poll has closed.', 'info')
    expect(screen.getByText('Closed')).toBeTruthy()
  })

  it('any other refusal is a plain error and the bubble stays as it was', async () => {
    queued.mockResolvedValueOnce({ success: true, data: poll() })
    await row(message())
    await flush()
    queued.mockResolvedValueOnce({ success: false, errorCode: 'CONFLICT', error: 'You are not in this chatroom' })
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Vinyl' })))
    // The app's own sentence for a refusal the person cannot act on from here (lib/userMessage).
    expect(mockToast).toHaveBeenCalledWith("Couldn't save your vote. Try again.", 'error', expect.anything())
    expect(screen.getByText(/Tap to vote/)).toBeTruthy()
  })

  it('maps options in the order the bubble draws them', () => {
    const r = poll({ options: [{ id: O2, label: 'B', position: 1, votes: null }, { id: O1, label: 'A', position: 0, votes: null }], myVote: O1 })
    expect(pollView(r).options.map((o) => o.label)).toEqual(['A', 'B'])
    expect(pollView(r).picked).toBe(0)
    expect(optionIdAt(r, 1)).toBe(O2)
  })
})
