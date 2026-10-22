import AsyncStorage from '@react-native-async-storage/async-storage'
import { useIsFocused } from 'expo-router'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { Logger } from './logger'
import { currentUserId, useAuth } from './useAuth'

/**
 * Coach marks: the app explaining one thing, once (`components/ds/CoachMark`,
 * the rules and the inventory in docs/NAVIGATION.md, "Coach marks").
 *
 * - Once ever, per account, per mark. Seen is written once it has stayed on
 *   screen for `COACH_SEEN_DWELL_MS` (or on Got it, or on use), so leaving the
 *   screen or the app being killed after that leaves it seen. Gone within the
 *   dwell, it is done for this launch only.
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
export type CoachMarkId =
  /** The Pulse: holding a card. */
  | 'events_preview_hint'
  /** The centre button, the first time it says you can check in. */
  | 'centre_button_checkin'
  /** The Room: who can see your name and photo (the visibility banner). */
  | 'room_reveal'
  /** The door pass, the first time one is live: the staff type the code. */
  | 'door_pass'
  /** A Blend, the first time anyone opens one: what it is, and that everyone is on tonight's names. */
  | 'blend_first_open'

type Phase = 'unseen' | 'showing' | 'done'

/** By storage key; absent until the stored flag has been read. */
const phases = new Map<string, Phase>()
const listeners = new Set<() => void>()
/** Accounts that have been shown a mark this launch. */
const taughtThisLaunch = new Set<string>()

/** How long a mark must stay on screen before it counts as seen for good. */
export const COACH_SEEN_DWELL_MS = 1000

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
  }, [key, userId, phase, ready, focused])

  const visible = phase === 'showing' && ready && focused
  // Seen once it has been on screen for the dwell: a mark gone within a frame (a scroll, a sheet) is not spent.
  useEffect(() => {
    if (!key || !visible) return
    const timer = setTimeout(() => persistSeen(key), COACH_SEEN_DWELL_MS)
    return () => clearTimeout(timer)
  }, [key, visible])

  // Leaving the screen, or the screen going, ends it.
  useEffect(() => {
    if (!key || !focused) return
    return () => {
      if (phases.get(key) === 'showing') setPhase(key, 'done')
    }
  }, [key, focused])

  const dismiss = useCallback(() => {
    if (!key) return
    setPhase(key, 'done')
    persistSeen(key)
  }, [key])

  /** What it points at went (unmounted, scrolled off): it ends, seen only if the dwell already passed. */
  const lose = useCallback(() => {
    if (key) setPhase(key, 'done')
  }, [key])

  return { visible, dismiss, lose }
}

/**
 * Every coach mark's sentence, grouped by the screen it appears on, for Settings › Help › Tips (R4-2): the same words,
 * for whoever dismissed one. Nothing replays from there; it is reading only. A mark that is not built yet (the Banter's
 * "Swipe a chat left to mute it.", whose rows have no swipe) is not listed: a tip for a thing the app cannot do is a promise.
 *
 * The sentences live with their marks (`app/(tabs)/events.tsx`, `app/(tabs)/_layout.tsx`, `components/blendn/BlendnScreen.tsx`,
 * `app/offer/[id].tsx`, `components/crews/BlendRoom.tsx`); `__tests__/tipsScreen.test.tsx` fails when one drifts from this list.
 */
export const COACH_TIPS: readonly { id: CoachMarkId; screen: string; when: string; text: string }[] = [
  { id: 'events_preview_hint', screen: 'The Pulse', when: 'The first event card is on screen', text: 'Hold an event to save, share or preview it.' },
  // The mark names the place you are at; here it is the same sentence for any place.
  { id: 'centre_button_checkin', screen: 'The centre button', when: 'The first time it changes because you can check in', text: 'You’re at the venue. Tap the button, then hold to check in.' },
  { id: 'room_reveal', screen: 'The Room', when: 'The first time you’re in a Room', text: 'People here can’t see your name or photo until you choose to show them. You decide, per event.' },
  { id: 'door_pass', screen: 'A door pass', when: 'The first time one is live', text: 'Show this to the staff. They type the code and tap Redeemed. It works once, today.' },
  { id: 'blend_first_open', screen: 'A Blend', when: 'The first time you open one', text: 'Everyone here is on tonight’s names until they reveal.' },
]
