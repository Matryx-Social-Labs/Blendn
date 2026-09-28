import type { Href } from 'expo-router'
import { Platform } from 'react-native'
import { apiClient } from './apiClient'
import { CHECK_IN_CODES, checkInRefusal, type CheckInRefusal } from './checkInRefusal'
import { forgetEventDetailCache } from './eventDetailCache'
import { revealPromptText, revealReadiness } from './reveal'
import { forgetRoster } from './rosterMemory'
import { PUBLIC_CHECKIN_WARNING, shouldWarnBeforePublicCheckIn } from './roomVisibility'
import { hasSeenPublicCheckInWarning, markPublicCheckInWarningSeen } from './roomVisibilityStorage'

/**
 * Checking in and out, once.
 *
 * There were two check-ins — the Pulse's (`app/(tabs)/events.tsx`) and the
 * event screen's — written apart and drifting: the Pulse sent a made-up GPS
 * accuracy, showed the server's raw sentence for every refusal and never
 * offered a map, and the event screen skipped "Why do you go out?" until it
 * was copied across by hand (SCRUM-77, SCRUM-188). Check-out had five call
 * sites and none told the tab bar, so the Blend'n button kept its old target
 * for up to a poll (30s) — longer, because the list it polls is cached.
 *
 * What lives here is everything that is the same wherever the button is: the
 * request, how its answer is read, what happens next, and the signal that
 * check-in state changed. What stays on each screen is its own tray and its
 * own optimistic state, which really are different.
 */

// ---------------------------------------------------------------------------
// "Check-in state changed"
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()

/**
 * Somebody checked in or out of `eventId`. Drops every cached read that says
 * whether they are in — the active check-ins, and the event's detail with its
 * `userStatus` — so the next read is the server's, and tells whoever is
 * listening: the tab bar's Blend'n button, which otherwise found out on its
 * next 30s poll, and the event screen's CTA.
 *
 * The detail was the one left behind. Only the active list was dropped, so the
 * centre button said "Open the room" while the event screen, re-reading its
 * SWR-cached detail on focus or on the socket's check-in, was handed the
 * pre-check-in `isCheckedIn: false` and went back to "Blend in".
 */
export function checkInChanged(eventId: string): void {
  apiClient.forgetActiveCheckins()
  apiClient.forgetEvent(eventId)
  forgetEventDetailCache(eventId)
  for (const fn of listeners) fn()
}

export function subscribeCheckInChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// Check in
// ---------------------------------------------------------------------------

export const CHECK_IN_TIMEOUT_MS = 12_000

export type CheckInOutcome =
  | {
      kind: 'checkedIn'
      checkInId?: string
      /** No `intent_default` yet: ask "Why do you go out?" after the tray. */
      askIntent: boolean
      /** `reveal_by_default` is set: offer to show their name, never apply it. */
      revealSuggestion: boolean
    }
  | {
      kind: 'refused'
      refusal: CheckInRefusal
      /** Refused only because they already are — treat as checked in. */
      alreadyCheckedIn: boolean
    }
  | { kind: 'timeout' }

export async function submitCheckIn(
  eventId: string,
  at: { latitude: number; longitude: number; accuracy?: number | null }
): Promise<CheckInOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), CHECK_IN_TIMEOUT_MS)
  })
  const result = await Promise.race([
    apiClient.checkIn(eventId, {
      latitude: at.latitude,
      longitude: at.longitude,
      // `gpsAccuracy` is the key the route reads — `deviceInfo?.gpsAccuracy` —
      // not a top-level field. Unknown is sent as absent, which the server
      // reads as "assume the usual", never as a number we made up.
      deviceInfo: { platform: Platform.OS, gpsAccuracy: at.accuracy ?? undefined },
    }),
    timeout,
  ]).finally(() => clearTimeout(timer))

  if (result === 'timeout') return { kind: 'timeout' }

  if (!result.success) {
    // Dispatch on the server's code, never on its sentence (lib/checkInRefusal.ts).
    const alreadyCheckedIn = result.errorCode === CHECK_IN_CODES.ALREADY_CHECKED_IN
    if (alreadyCheckedIn) checkInChanged(eventId)
    return { kind: 'refused', refusal: checkInRefusal(result.errorCode, result.error), alreadyCheckedIn }
  }

  checkInChanged(eventId)
  return {
    kind: 'checkedIn',
    checkInId: result.data?.checkInId,
    askIntent: result.data?.intentNeeded === true,
    revealSuggestion: result.data?.revealSuggestion === true,
  }
}

/** "Why do you go out?" — the preferences screen with the intent leading. */
export function askIntentRoute(eventId: string): Href {
  return {
    pathname: '/event-preferences/[eventId]',
    params: { eventId, revealed: '0', askIntent: '1' },
  } as Href
}

/**
 * The words for the reveal offer after a check-in.
 *
 * **The first one explains; the rest just ask.** Someone who set
 * `reveal_by_default` in onboarding agreed to a sentence on a settings screen,
 * which is not the same as picturing their name and face in a room full of
 * strangers. `shouldWarnBeforePublicCheckIn` holds the conditions; the warning
 * is marked seen as it is shown.
 *
 * Nothing is revealed here. The row is created `revealed: false`, and only the
 * confirm button — the screen's — writes `true`.
 */
export async function revealOffer(user: {
  id: string
  firstName: string | null
  image?: string | null
}): Promise<{ title: string; message: string; confirm: string; cancel: string }> {
  const firstTime = shouldWarnBeforePublicCheckIn({
    revealByDefault: true,
    hasSeenWarning: await hasSeenPublicCheckInWarning(user.id),
    // Nothing to reveal means nothing to warn about. `User.image` mirrors
    // `photos[0]`, so it is the same photo a reveal would show.
    canReveal: revealReadiness({ name: user.firstName, photos: user.image ? [user.image] : [] }).ok,
  })
  if (firstTime) await markPublicCheckInWarningSeen(user.id)
  return firstTime
    ? {
        title: PUBLIC_CHECKIN_WARNING.title,
        message: PUBLIC_CHECKIN_WARNING.body,
        confirm: PUBLIC_CHECKIN_WARNING.confirm,
        cancel: PUBLIC_CHECKIN_WARNING.cancel,
      }
    : {
        title: 'Show your name here?',
        message: revealPromptText(user.firstName),
        confirm: 'Yes, show my name',
        // Deliberately not "No" — staying anonymous is the state they are in.
        cancel: PUBLIC_CHECKIN_WARNING.cancel,
      }
}

// ---------------------------------------------------------------------------
// Check out
// ---------------------------------------------------------------------------

/**
 * Leave an event. The room's button, the Pulse's tray and the presence monitor
 * all come through here, so all three forget the room's roster and tell the
 * tab bar — which none of them did.
 */
export async function checkOutOf(eventId: string) {
  const result = await apiClient.checkOut(eventId)
  if (result.success) {
    forgetRoster(eventId)
    checkInChanged(eventId)
  }
  return result
}
