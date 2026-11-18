/*
 * Leaving Going (SCRUM-1074, board going-lifecycle 3+2+1, sheet 06's copy): what the way out is called in each state,
 * what it says, and the held cancel: the DELETE goes when the toast closes, so Undo never loses the place.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: { cancelRsvp: jest.fn() } }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/toast', () => ({ toast: jest.fn() }))
const appState: { listener?: (s: string) => void } = {}

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { showSheet } from '../lib/sheet'
import { toast } from '../lib/toast'
import { AppState } from 'react-native'
import { deferLeave, flushLeave, leaveKind, leavePending, leaveSheet, leaveToast, sendLeave, swipeLabel, undoLeave } from '../lib/goingLeave'
/* eslint-enable import/first */

const cancel = apiClient.cancelRsvp as jest.Mock
// Only AppState is faked (a module mock of react-native broke jest-expo's lazy fetch global in CI).
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => ((appState.listener = fn), { remove: jest.fn() })) as never)

describe('leaveKind: the way out, by state', () => {
  const base = { phase: 'upcoming' as const, rsvpStatus: 'going', checkedIn: false, roomOpen: false }
  it.each([
    ['upcoming', base, 'cantGo'],
    ['the room open before the doors', { ...base, roomOpen: true }, 'roomOpen'],
    ['live, not checked in', { ...base, phase: 'live' as const }, 'cantMakeIt'],
    ['waitlisted, before or during', { ...base, rsvpStatus: 'waitlisted', phase: 'live' as const }, 'waitlist'],
    ['checked in: only Check out', { ...base, phase: 'live' as const, checkedIn: true }, 'checkOut'],
    ['ended: nothing to leave', { ...base, phase: 'ended' as const }, null],
    ['called off', { ...base, phase: 'cancelled' as const }, null],
    ['not going at all', { ...base, rsvpStatus: null }, null],
  ])('%s', (_what, s, want) => expect(leaveKind(s)).toBe(want))
})

describe('the words (sheet 06)', () => {
  it('upcoming names the night, and says "full" only when it is', () => {
    expect(leaveSheet('cantGo', 'Rooftop Sundowner', false)).toEqual({ title: 'Can’t go to Rooftop Sundowner?', message: 'You’ll come off the list of people going.', keep: 'Keep my spot', leave: 'Can’t go' })
    expect(leaveSheet('cantGo', 'Rooftop Sundowner', true).message).toBe('You’ll come off the list of people going. It’s full: your place goes to the next person waiting.')
  })
  it('once the room is open, and once live', () => {
    expect(leaveSheet('roomOpen', 'X', false)).toEqual({ title: 'Can’t make it?', message: 'The room is already open. You’ll come off the list of people going.', keep: 'I’m still going', leave: 'Can’t make it' })
    expect(leaveSheet('cantMakeIt', 'X', false)).toEqual({ title: 'Not going after all?', message: 'It comes off your Going list. If you turn up later, you can still Blend’n here.', keep: 'I’m still going', leave: 'Can’t make it' })
  })
  it('the waitlist keeps today’s words', () => {
    expect(leaveSheet('waitlist', 'X', true)).toEqual({ title: 'Leave the waitlist?', message: 'You’ll lose your place in line. If you join again later, you go to the back.', keep: 'Stay on it', leave: 'Leave waitlist' })
  })
  it('never "Cancel RSVP" or "Remove" for a commitment', () => {
    const all = (['cantGo', 'roomOpen', 'cantMakeIt', 'waitlist'] as const).flatMap((k) => [...Object.values(leaveSheet(k, 'X', true)), leaveToast(k, 'X'), swipeLabel(k)])
    expect(all.join(' ')).not.toMatch(/Cancel RSVP|\bRemove\b/)
  })
  it('toasts and swipe labels', () => {
    expect(leaveToast('cantGo', 'Rooftop Sundowner')).toBe('You’re off the list for Rooftop Sundowner.')
    expect(leaveToast('roomOpen', 'X')).toBe('Removed from Going.')
    expect(leaveToast('cantMakeIt', 'X')).toBe('Removed from Going.')
    expect(leaveToast('waitlist', 'X')).toBe('You’ve left the waitlist.')
    expect([swipeLabel('cantGo'), swipeLabel('cantMakeIt'), swipeLabel('waitlist')]).toEqual(['Can’t go', 'Can’t make it', 'Leave'])
  })
})

describe('the held cancel', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('sends nothing until the toast’s time is up, then sends once', () => {
    const commit = jest.fn()
    deferLeave('e1', commit, 5000)
    jest.advanceTimersByTime(4999)
    expect(commit).not.toHaveBeenCalled()
    expect(leavePending('e1')).toBe(true)
    jest.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(leavePending('e1')).toBe(false)
  })

  it('Undo before then: nothing is ever sent', () => {
    const commit = jest.fn()
    deferLeave('e2', commit, 5000)
    expect(undoLeave('e2')).toBe(true)
    jest.advanceTimersByTime(10000)
    expect(commit).not.toHaveBeenCalled()
  })

  it('Undo after it was sent says so (the caller RSVPs again)', () => {
    const commit = jest.fn()
    deferLeave('e3', commit, 5000)
    jest.advanceTimersByTime(5000)
    expect(undoLeave('e3')).toBe(false)
  })

  it('the toast closing early sends at once; leaving the app sends what is held', () => {
    const a = jest.fn()
    const b = jest.fn()
    deferLeave('e4', a, 5000)
    flushLeave('e4')
    expect(a).toHaveBeenCalledTimes(1)
    deferLeave('e5', b, 5000)
    appState.listener?.('background')
    expect(b).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(5000)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe('sendLeave', () => {
  it('a ticket is never cancelled silently: the row comes back and the sheet says why', async () => {
    cancel.mockResolvedValueOnce({ success: false, errorCode: 'tickets_required', error: 'This event is ticketed: get a ticket to go.' })
    const back = jest.fn()
    await sendLeave('e6', 'Rooftop Sundowner', back)
    expect(back).toHaveBeenCalled()
    const sheet = (showSheet as jest.Mock).mock.calls.at(-1)[0]
    expect(sheet.title).toBe('Can’t go?')
    expect(sheet.message).toMatch(/Your ticket stays yours until it’s refunded/)
    expect(sheet.actions.map((a: { label: string }) => a.label)).toEqual(['Keep my ticket'])
  })

  it('a refusal puts the row back and says so', async () => {
    cancel.mockResolvedValueOnce({ success: false, error: 'boom' })
    const back = jest.fn()
    await sendLeave('e7', 'Rooftop Sundowner', back)
    expect(back).toHaveBeenCalled()
    expect(toast).toHaveBeenLastCalledWith('Couldn’t take Rooftop Sundowner off your list. Try again.', 'error')
  })

  it('a thrown request is a refusal too', async () => {
    cancel.mockRejectedValueOnce(new Error('offline'))
    const back = jest.fn()
    await sendLeave('e8', 'X', back)
    expect(back).toHaveBeenCalled()
  })

  it('success puts nothing back', async () => {
    cancel.mockResolvedValueOnce({ success: true, data: { rsvpStatus: null, rsvpCount: 3 } })
    const back = jest.fn()
    await sendLeave('e9', 'X', back)
    expect(back).not.toHaveBeenCalled()
  })
})
