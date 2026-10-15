import AsyncStorage from '@react-native-async-storage/async-storage'
import { useIsFocused } from 'expo-router'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { Logger } from './logger'
import { currentUserId, useAuth } from './useAuth'

/**
 * Coach marks: the app explaining one thing, once (`components/ds/CoachMark`,
 * the rules and the inventory in docs/NAVIGATION.md, "Coach marks").
 *
 * - Once ever, per account, per mark. Seen is written the moment it appears, so
 *   Got it, using the thing, leaving the screen (or the app being killed) all
 *   leave it seen.
 * - Used first, never shown: `markCoachUsed` before it ever appeared counts.
 * - One new mark per account per launch, which also makes it one on screen at
 *   a time: a new person is not taught three things in their first minute.
 * - Never before the screen says `ready`: what it points at is on screen, the
 *   data under it has loaded, and none of the screen's own sheets is open. The
 *   screen folds those into `ready`; there is no app-wide record of open sheets.
 * - Signed out, nothing.
 * - Leaving the screen (blur, unmount) ends it. Not ready for a moment only
 *   hides it: a sheet over it closes and it is back, still the same showing.
 */

/**
 * Every mark, by the name its flag is stored under: `<id>_seen_<userId>` in
 * AsyncStorage. The Pulse's is the old "Got it" banner's key, so whoever
 * dismissed that is not taught again. A flow adds its own when it places one.
 */
export type CoachMarkId = 'events_preview_hint'

type Phase = 'unseen' | 'showing' | 'done'

/** By storage key; absent until the stored flag has been read. */
const phases = new Map<string, Phase>()
const listeners = new Set<() => void>()
/** Accounts that have been shown a mark this launch. */
const taughtThisLaunch = new Set<string>()

const storageKey = (id: CoachMarkId, userId: string) => `${id}_seen_${userId}`

function setPhase(key: string, phase: Phase) {
  if (phases.get(key) === phase) return
  phases.set(key, phase)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function persistSeen(key: string) {
  AsyncStorage.setItem(key, '1').catch((error) =>
    Logger.warn('general', 'Could not record a coach mark as seen', { key, error: String(error) })
  )
}

/** They did the thing the mark explains: it goes, or it never comes. */
export function markCoachUsed(id: CoachMarkId) {
  const userId = currentUserId()
  if (!userId) return
  const key = storageKey(id, userId)
  if (phases.get(key) === 'done') return
  setPhase(key, 'done')
  persistSeen(key)
}

export function useCoachMark(id: CoachMarkId, { ready }: { ready: boolean }) {
  const { user } = useAuth()
  const focused = useIsFocused()
  const userId = user?.id ?? null
  const key = userId ? storageKey(id, userId) : null
  const phase = useSyncExternalStore(subscribe, () => (key ? phases.get(key) : undefined))

  useEffect(() => {
    if (!key || phases.has(key)) return
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (!phases.has(key)) setPhase(key, seen === '1' ? 'done' : 'unseen')
      })
      .catch((error) => {
        // Unknown is seen: a store that cannot be read must not show it every launch.
        Logger.warn('general', 'Could not read a coach mark flag', { key, error: String(error) })
        if (!phases.has(key)) setPhase(key, 'done')
      })
  }, [key])

  useEffect(() => {
    if (!key || !userId || phase !== 'unseen' || !ready || !focused || taughtThisLaunch.has(userId)) return
    taughtThisLaunch.add(userId)
    setPhase(key, 'showing')
    persistSeen(key)
  }, [key, userId, phase, ready, focused])

  // Leaving the screen, or the screen going, ends it.
  useEffect(() => {
    if (!key || !focused) return
    return () => {
      if (phases.get(key) === 'showing') setPhase(key, 'done')
    }
  }, [key, focused])

  const dismiss = useCallback(() => {
    if (key) setPhase(key, 'done')
  }, [key])

  return { visible: phase === 'showing' && ready && focused, dismiss }
}
