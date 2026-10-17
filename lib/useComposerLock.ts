import { useCallback, useEffect, useRef, useState } from 'react'

import type { ComposerState } from '../components/ds/Composer'
import { waitLabel } from './chatFeed'

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
export function lockFor(errorCode: string | null | undefined, serverText?: string): ComposerLock | null {
  switch (errorCode) {
    case 'USER_MUTED':
      return { state: 'muted', reason: serverText }
    case 'CHAT_LOCKED':
      return { state: 'locked', reason: serverText }
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
    (errorCode?: string | null, retryAfter?: number, serverText?: string) => {
      stop()
      const next = lockFor(errorCode, serverText)
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
