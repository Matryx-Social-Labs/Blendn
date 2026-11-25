import { AppState, type NativeEventSubscription } from 'react-native'

import { apiClient } from './apiClient'
import type { AttendancePhase } from './attendanceState'
import { checkInChanged } from './checkIn'
import { showSheet } from './sheet'
import { toast } from './toast'

/**
 * Leaving Going (SCRUM-1074, owner-approved 3+2+1 on `going-lifecycle/`): the event page's "Change" and "Can’t make it",
 * "Can’t go" in every Going card's ⋯, and the row's swipe, all through here so they say the same thing (sheet 06).
 * Checked in, the only way out is Check out (its own sheet, unchanged). Ended and called-off nights have nothing to leave.
 */
export type LeaveKind = 'cantGo' | 'roomOpen' | 'cantMakeIt' | 'waitlist'

export function leaveKind(s: { phase: AttendancePhase; rsvpStatus: string | null | undefined; checkedIn: boolean; roomOpen: boolean }): LeaveKind | 'checkOut' | null {
  if (s.phase === 'ended' || s.phase === 'cancelled') return null
  if (s.checkedIn) return 'checkOut'
  if (s.rsvpStatus === 'waitlisted') return 'waitlist'
  if (s.rsvpStatus !== 'going') return null
  if (s.phase === 'live') return 'cantMakeIt'
  return s.roomOpen ? 'roomOpen' : 'cantGo'
}

const OFF_THE_LIST = 'You’ll come off the list of people going.'

/** The confirm (the event page and the ⋯). `full` only when the night is: the place really goes to somebody waiting. */
export function leaveSheet(kind: LeaveKind, title: string, full: boolean): { title: string; message: string; keep: string; leave: string } {
  switch (kind) {
    case 'cantGo':
      return { title: `Can’t go to ${title}?`, message: full ? `${OFF_THE_LIST} It’s full: your place goes to the next person waiting.` : OFF_THE_LIST, keep: 'Keep my spot', leave: 'Can’t go' }
    case 'roomOpen':
      return { title: 'Can’t make it?', message: `The room is already open. ${OFF_THE_LIST}`, keep: 'I’m still going', leave: 'Can’t make it' }
    case 'cantMakeIt':
      return { title: 'Not going after all?', message: 'It comes off your Going list. If you turn up later, you can still Blend’n here.', keep: 'I’m still going', leave: 'Can’t make it' }
    case 'waitlist':
      return { title: 'Leave the waitlist?', message: 'You’ll lose your place in line. If you join again later, you go to the back.', keep: 'Stay on it', leave: 'Leave waitlist' }
  }
}

/** What the toast says, with its Undo. The name is the toast's own variable text (it wraps to two lines). */
export function leaveToast(kind: LeaveKind, title: string): string {
  if (kind === 'cantGo') return `You’re off the list for ${title}.`
  return kind === 'waitlist' ? 'You’ve left the waitlist.' : 'Removed from Going.'
}

/** The ⋯ entry and the swipe's action: 72 pt wide, so the waitlist's is one word. */
export const menuLabel = (kind: LeaveKind) => leaveSheet(kind, '', false).leave
export const swipeLabel = (kind: LeaveKind) => (kind === 'waitlist' ? 'Leave' : menuLabel(kind))

/*
 * The held cancel. The DELETE goes when the toast closes (its dwell, or it is swiped away), so Undo only drops it: nothing
 * reached the server, no place went to the waitlist, no "a place opened up" push went out. Held here, not in a screen, so
 * leaving the screen does not lose it; leaving the app sends what is held.
 * ponytail: a phone killed inside the toast's seconds never sends it; the row is simply still there on the next read.
 */
const held = new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>()
let watching: NativeEventSubscription | null = null

export function deferLeave(eventId: string, commit: () => void, ms: number): void {
  flushLeave(eventId)
  held.set(eventId, { timer: setTimeout(() => flushLeave(eventId), ms), commit })
  watching ??= AppState.addEventListener('change', (state) => {
    if (state !== 'active') for (const id of [...held.keys()]) flushLeave(id)
  })
}

export function flushLeave(eventId: string): void {
  const h = held.get(eventId)
  if (!h) return
  clearTimeout(h.timer)
  held.delete(eventId)
  h.commit()
}

/** True when it was still held (nothing was sent). False: it already went, so the caller RSVPs again. */
export function undoLeave(eventId: string): boolean {
  const h = held.get(eventId)
  if (!h) return false
  clearTimeout(h.timer)
  held.delete(eventId)
  return true
}

/** A read that lands while a cancel is held must not put the row back. */
export const leavePending = (eventId: string) => held.has(eventId)

/**
 * The DELETE. Refused, the row comes back (`putBack`) and the person is told. A ticket is never cancelled here: the server
 * answers `tickets_required` (only a refund removes a paid RSVP), and the sheet says so. The host's refund policy and an
 * "Ask for a refund" join it when the server sends them (ROADMAP § Backend later, Going lifecycle 3).
 */
export async function sendLeave(eventId: string, title: string, putBack: () => void): Promise<void> {
  let result: Awaited<ReturnType<typeof apiClient.cancelRsvp>> | null = null
  try {
    result = await apiClient.cancelRsvp(eventId)
  } catch {
    result = null
  }
  if (result?.success) return
  putBack()
  if (result?.errorCode === 'tickets_required') {
    showSheet({
      kind: 'actions',
      title: 'Can’t go?',
      message: 'Your ticket stays yours until it’s refunded. Ask the host about their refund policy.',
      actions: [{ label: 'Keep my ticket', variant: 'secondary', then: () => {} }],
    })
    return
  }
  // Checked in here, maybe on another phone this one has not polled yet (SCRUM-1092): read the status again now, so ⋯ offers
  // Check out, and say the server's sentence. Not sent again: only a check-out ends it.
  if (result?.reasonCode === 'ALREADY_CHECKED_IN') {
    checkInChanged(eventId)
    toast(result.error ?? 'You’re checked in here. Check out first.', 'error')
    return
  }
  toast(`Couldn’t take ${title} off your list. Try again.`, 'error')
}
