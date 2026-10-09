import { router } from 'expo-router'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

import { apiClient, type GoLiveResult } from './apiClient'
import { checkInChanged } from './checkIn'
import { goLiveRefusal, rememberLiveSession, type GoLiveChoice, type GoLiveRefusal } from './goLive'
import { getCurrentLocation, type ShowTray } from './locationFix'
import { Logger } from './logger'
import { openInMaps } from './openInMaps'
import { useAuth } from './useAuth'
import { useInteractionFeedback } from './useInteractionFeedback'

/**
 * Going live at a place, from wherever the button is: the place screen's Go
 * Live sheet and the expiry prompt's "Extend". Where you are comes through the
 * check-in's own gates (`lib/locationFix.ts`); the answer is read by its code
 * (`goLiveRefusal`). The trays are the caller's.
 */

export type GoLivePlace = { id: string; name: string; latitude: number | null; longitude: number | null; address?: string | null }

/**
 * Go Live sends any fix up to the server's own ceiling and lets the server
 * judge (blendn-admin `MAX_GPS_ACCURACY_METERS`). The event door's stricter
 * 50 m turned a usable fix into a dead end (step 5 review, H4).
 */
export const GO_LIVE_MAX_ACCURACY_M = 150

/*
 * One Go Live at a time, across every button that starts one — the sheet and
 * the expiry prompt are different components, and a ref in each let a second
 * tap through while the first was on the wire (step 5 review, M1).
 */
let inFlight = false
const busyListeners = new Set<() => void>()
function setInFlight(next: boolean) {
  inFlight = next
  for (const fn of busyListeners) fn()
}
const subscribeBusy = (fn: () => void) => {
  busyListeners.add(fn)
  return () => {
    busyListeners.delete(fn)
  }
}
/** True while any Go Live is on its way, wherever it was started. */
export function useGoLiveBusy(): boolean {
  return useSyncExternalStore(subscribeBusy, () => inFlight)
}

/** "Stay" behind Blendn+ — a placeholder until the paywall exists (step 11; docs/PLACEHOLDER_SCREENS.md §11). */
export function showPlusPlaceholder(showTray: ShowTray, closeTray: () => void) {
  showTray(
    'Blendn+ is coming',
    "Staying live for as long as you're here will be part of Blendn+. Until then, pick a time — you can extend it for free before it ends.",
    [{ label: 'OK', variant: 'primary', onPress: closeTray }]
  )
}

export function showGoLiveRefusal(
  refusal: GoLiveRefusal,
  place: GoLivePlace,
  { showTray, closeTray, retry }: { showTray: ShowTray; closeTray: () => void; retry?: () => void }
) {
  if (refusal.kind === 'plus') return showPlusPlaceholder(showTray, closeTray)
  if (refusal.kind === 'handoff') {
    // A state, not an error: an event has the place, and its check-in is the way in (PL-CU01).
    return showTray('Check in to the event instead', refusal.message, [
      { label: 'Not now', onPress: closeTray },
      {
        label: 'Go to the event',
        variant: 'primary',
        onPress: () => {
          closeTray()
          router.push(`/event/${refusal.eventId}` as never)
        },
      },
    ])
  }
  const done = { label: 'Done', onPress: closeTray }
  if (refusal.offerDirections) {
    return showTray(refusal.title, refusal.message, [
      done,
      {
        label: 'Open Maps',
        variant: 'primary',
        onPress: () => {
          closeTray()
          openInMaps({ latitude: place.latitude, longitude: place.longitude, address: place.address, venue_name: place.name }).catch(() => {})
        },
      },
    ])
  }
  if (refusal.action === 'retry' && retry) {
    return showTray(refusal.title, refusal.message, [
      { label: 'Cancel', onPress: closeTray },
      {
        label: 'Try Again',
        variant: 'primary',
        onPress: () => {
          closeTray()
          retry()
        },
      },
    ])
  }
  if (refusal.action === 'add_age') {
    return showTray(refusal.title, refusal.message, [
      done,
      {
        label: 'Add your age',
        variant: 'primary',
        onPress: () => {
          closeTray()
          router.push('/edit-profile' as never)
        },
      },
    ])
  }
  showTray(refusal.title, refusal.message)
}

export function useGoLive({
  place,
  showTray,
  closeTray,
  onLive,
}: {
  place: GoLivePlace | null
  showTray: ShowTray
  closeTray: () => void
  onLive?: (result: GoLiveResult) => void
}) {
  const feedback = useInteractionFeedback()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const busy = useGoLiveBusy()

  /** True when live. Every other outcome has already been shown in a tray. */
  const goLive = async (choice: GoLiveChoice): Promise<boolean> => {
    if (!place || inFlight) return false
    setInFlight(true)
    const again = () => void goLive(choice)
    try {
      const at = await getCurrentLocation({ showTray, closeTray, maxAccuracyM: GO_LIVE_MAX_ACCURACY_M, onRetry: again })
      if (!at) return false
      const result = await apiClient.goLive(place.id, {
        latitude: at.latitude,
        longitude: at.longitude,
        // The key the server reads; unknown is absent, never a number we made up.
        deviceInfo: { platform: Platform.OS, gpsAccuracy: at.accuracy ?? undefined },
        ...choice,
      })
      if (result.success && result.data) {
        feedback.success()
        if (userId) {
          await rememberLiveSession({ userId, venueDayId: result.data.venueDayId, venueId: place.id, venueName: place.name, choice })
        }
        checkInChanged(result.data.venueDayId)
        onLive?.(result.data)
        return true
      }
      // No code: a timeout or no network. The POST may have landed, so everything that shows it re-reads (M2).
      if (!result.errorCode) checkInChanged()
      const refusal = goLiveRefusal(result.errorCode, result.error, result.eventId, result.retryAfter)
      if (refusal.kind === 'refused') feedback.error()
      Logger.info('events', 'go live refused', { code: result.errorCode })
      showGoLiveRefusal(refusal, place, { showTray, closeTray, retry: again })
      return false
    } catch (error) {
      Logger.error('events', 'go live failed', { error: String(error) })
      checkInChanged()
      showGoLiveRefusal(goLiveRefusal(undefined, 'Check your connection and try again.'), place, { showTray, closeTray, retry: again })
      return false
    } finally {
      setInFlight(false)
    }
  }

  return { goLive, busy }
}
