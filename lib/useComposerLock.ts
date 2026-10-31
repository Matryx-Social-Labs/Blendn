import { useCallback, useEffect, useRef, useState } from 'react'

import type { ComposerState } from '../components/ds/Composer'
import { waitLabel } from './chatFeed'
import type { ChatHistoryData, RoomWriteRead } from './apiClient'

export type ComposerLock = { state: ComposerState; reason?: string }

/** Without the server's `retryAfter`, a rate limit lifts quietly after this (it shows no clock). */
const DEFAULT_WAIT_S = 5
const MAX_WAIT_S = 120

/**
 * A server refusal as the composer's state, in its words (Flow 5 §0.7, ROUND3
 * C2–C4, R3-D5 5.4). The failed bubble says this message did not go; the lock
 * says the next one won't either, and why. Mutes, locks and closed rooms hold
 * until a send gets through; a rate limit (or the spam filter's burst) lifts
 * on its own, counting the server's `retryAfter` down in Geist Mono — and with
 * no `retryAfter` (SPAM_BLOCKED has none yet, SCRUM-624) it shows no clock.
 * A mute never has one (R11).
 */
export function lockFor(errorCode: string | null | undefined, serverText?: string, reasonCode?: string | null): ComposerLock | null {
  // The server's own word for why (`write.reason`, SV-5) beats parsing its sentence.
  const byReason = lockForReason(reasonCode, serverText)
  if (byReason) return byReason
  switch (errorCode) {
    case 'USER_MUTED':
      return { state: 'muted', reason: serverText }
    case 'CHAT_LOCKED':
      // No organizer lock (SCRUM-893): a server that still answers it is a room closed to you, in the closed state's own
      // words: the server's sentence for it still says "locked by the organizer".
      return { state: 'closed' }
    case 'NOT_CHECKED_IN':
      return { state: 'notcheckedin', reason: serverText }
    case 'CHAT_CLOSED': {
      // The server words its closed reasons apart (lib/chat-window.ts there); archived reads as closed.
      const text = serverText ?? ''
      const state: ComposerState = /opens 24 hours/i.test(text) ? 'notopen' : /no longer available/i.test(text) ? 'hidden' : 'closed'
      return { state, reason: serverText }
    }
    case 'RATE_LIMITED':
    case 'SPAM_BLOCKED':
      return { state: 'ratelimited' }
    default:
      return null
  }
}

/**
 * `write.reason` / `reasonCode` (blendn-admin `lib/chat-window.ts` WriteDenial) as the composer's state. `banned`,
 * `left` and `not_live` are not locks: the room has its own states for them. Unknown → null, so the caller falls back.
 */
export function lockForReason(reason: string | null | undefined, serverText?: string | null): ComposerLock | null {
  const text = serverText ?? undefined
  switch (reason) {
    case 'muted':
      return { state: 'muted', reason: text }
    case 'locked':
      return { state: 'closed' }
    case 'window_closed':
    case 'archived':
      return { state: 'closed', reason: text }
    case 'not_open_yet':
      return { state: 'notopen', reason: text }
    case 'hidden':
      return { state: 'hidden', reason: text }
    default:
      return null
  }
}

/** The `write` / `status` a read carried: a bare array (an older server's history) carries none. */
const writeReadOf = (data: RoomWriteRead | ChatHistoryData | null | undefined): RoomWriteRead => (!data || Array.isArray(data) ? {} : data)

/** Whether a read said anything about writing (`write`): a server older than SV-5 does not, and the caller asks the door instead. */
export function saidWrite(data: RoomWriteRead | ChatHistoryData | null | undefined): boolean {
  const write = writeReadOf(data).write
  return !!write && typeof write === 'object'
}

/**
 * What `GET /events/:id/chat` says about whether you may write, as the composer's lock on open (ROOM-05): the room's
 * own `status: 'locked'` (read as closed; nothing writes it, SCRUM-893), else your `write.reason`. A room that has not opened yet is the countdown's, not a lock here.
 */
export function lockFromDoor(data: RoomWriteRead | ChatHistoryData | null | undefined): ComposerLock | null {
  const d = writeReadOf(data)
  const message = typeof d.write?.message === 'string' ? d.write.message : undefined
  if (d.status === 'locked') return lockForReason('locked', message)
  if (!d.write || d.write.allowed !== false || typeof d.write.reason !== 'string' || d.write.reason === 'not_open_yet') return null
  return lockForReason(d.write.reason, message)
}

/**
 * A lock no retry gets past: the room's window closed, its event was hidden. Unlike a mute, a
 * rate limit or an RSVP away, waiting does not open it, so a "Not sent · Tap to retry" under it is a promise it cannot
 * keep (RC drive 4 D-6).
 */
export function isReadOnlyLock(lock: ComposerLock | null | undefined): boolean {
  return lock?.state === 'closed' || lock?.state === 'hidden'
}

export function useComposerLock() {
  const [lock, setLock] = useState<ComposerLock | null>(null)
  const [waitLeft, setWaitLeft] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setWaitLeft(null)
  }, [])
  useEffect(() => stop, [stop])

  /** Every send's answer re-decides the lock: a refusal sets it, a send that got through lifts it. */
  const apply = useCallback(
    (errorCode?: string | null, retryAfter?: number, serverText?: string, reasonCode?: string | null) => {
      stop()
      const next = lockFor(errorCode, serverText, reasonCode)
      setLock(next)
      if (next?.state !== 'ratelimited') return
      let left = Math.min(Math.max(retryAfter ?? DEFAULT_WAIT_S, 1), MAX_WAIT_S)
      if (retryAfter) setWaitLeft(left)
      timer.current = setInterval(() => {
        left -= 1
        if (left > 0) return setWaitLeft(retryAfter ? left : null)
        stop()
        setLock(null)
      }, 1000)
    },
    [stop]
  )

  return {
    lock,
    /** Set directly: a mute arriving over the socket, an RSVP that unlocked it. */
    setLock: useCallback(
      (next: ComposerLock | null) => {
        stop()
        setLock(next)
      },
      [stop]
    ),
    apply,
    countdown: waitLeft !== null ? waitLabel(waitLeft) : undefined,
  }
}
