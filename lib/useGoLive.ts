import { router } from 'expo-router'
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

import { apiClient, type GoLiveResult } from './apiClient'
import { useToast } from '../components/Toast'
import { checkInChanged } from './checkIn'
import { youLeftLine } from './leftRooms'
import { reasonOf } from './sessionEnd'
import { goLiveRefusal, noteOwnGoLive, rememberLiveSession, type GoLiveChoice, type GoLiveRefusal } from './goLive'
import { H } from './haptics'
import { validAccuracy } from './geo'
import { getCurrentLocation, type ShowTray } from './locationFix'
import { Logger } from './logger'
import { openInMaps } from './openInMaps'
import { useAuth } from './useAuth'
import { afterSheetDismissed } from './sheetDismissed'
import { openTonight } from './paywall'

/**
 * Going live at a place, from wherever the button is: the place screen's Go
 * Live sheet and the expiry prompt's "Extend" and "Stay". A "stay" refused as
 * Blend’n+'s (`PLUS_REQUIRED`) opens the Tonight sheet through the paywall's
 * policy (`lib/paywall.ts`). Where you are comes through the
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

/**
 * "Stay" is Blend’n+'s here (`PLUS_REQUIRED`) and the paywall's policy said not
 * now (it came by itself once tonight, or you are in a chat): the reason, the
 * free way on, and the paywall on a tap — a tap always opens it.
 */
export function showPlusRefusal(showTray: ShowTray, closeTray: () => void, seePlus?: () => void) {
  showTray(
    'Staying live is part of Blend’n+',
    'Pick a time instead — you can extend it for free before it ends.',
    [
      { label: 'OK', kind: 'tertiary', onPress: closeTray },
      ...(seePlus
        ? [{ label: 'See Blend’n+', variant: 'primary' as const, kind: 'lit' as const, onPress: () => { closeTray(); seePlus() } }]
        : []),
    ]
  )
}

export function showGoLiveRefusal(
  refusal: GoLiveRefusal,
  place: GoLivePlace,
  { showTray, closeTray, retry, seePlus }: { showTray: ShowTray; closeTray: () => void; retry?: () => void; seePlus?: () => void }
) {
  if (refusal.kind === 'plus') return showPlusRefusal(showTray, closeTray, seePlus)
  if (refusal.kind === 'handoff') {
    // A state, not an error: an event has the place, and its check-in is the way in (PL-CU01).
    return showTray('Check in to the event instead', refusal.message, [
      { label: 'Not now', kind: 'tertiary', onPress: closeTray },
      {
        label: 'Go to the event',
        variant: 'primary',
        kind: 'primary',
        onPress: () => {
          closeTray()
          router.push(`/event/${refusal.eventId}` as never)
        },
      },
    ])
  }
  const done = { label: 'Done', kind: 'tertiary' as const, onPress: closeTray }
  if (refusal.offerDirections) {
    return showTray(refusal.title, refusal.message, [
      done,
      {
        label: 'Open Maps',
        variant: 'primary',
        kind: 'lit',
        onPress: () => {
          closeTray()
          openInMaps({ latitude: place.latitude, longitude: place.longitude, address: place.address, venue_name: place.name }).catch(() => {})
        },
      },
    ])
  }
  if (refusal.action === 'retry' && retry) {
    return showTray(refusal.title, refusal.message, [
      { label: 'Cancel', kind: 'tertiary', onPress: closeTray },
      {
        label: 'Try Again',
        variant: 'primary',
        kind: 'lit',
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
        kind: 'lit',
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
  onPlusRequired,
  onRefusal,
}: {
  place: GoLivePlace | null
  showTray: ShowTray
  closeTray: () => void
  onLive?: (result: GoLiveResult) => void
  /**
   * "Stay" was refused as Blend’n+'s. Given, the caller decides what comes
   * after (the expiry prompt comes back without Stay, so the free Extend is
   * still there); `paywallOpened` says whether the paywall is now on screen.
   */
  onPlusRequired?: (paywallOpened: boolean) => void
  /**
   * Given, every refusal of Go Live itself (the server's answer, or none)
   * comes here to be drawn by the caller (the place page's Go Live sheet,
   * Flow 11 · 11.2) instead of in the generic tray. The location trays
   * (permission, Precise Location, a weak fix) stay `showTray`'s.
   */
  onRefusal?: (refusal: GoLiveRefusal) => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const userId = user?.id ?? null
  const busy = useGoLiveBusy()

  /** True when live. Every other outcome has already been shown in a tray. */
  const goLive = async (choice: GoLiveChoice): Promise<boolean> => {
    if (!place || inFlight) return false
    setInFlight(true)
    const again = () => void goLive(choice)
    try {
      const at = await getCurrentLocation({ showTray, closeTray, maxAccuracyM: GO_LIVE_MAX_ACCURACY_M, onRetry: again, purpose: 'goLive' })
      if (!at) return false
      const result = await apiClient.goLive(place.id, {
        latitude: at.latitude,
        longitude: at.longitude,
        // The key the server reads; unknown is absent, never a number we made up.
        deviceInfo: { platform: Platform.OS, gpsAccuracy: validAccuracy(at.accuracy) ?? undefined },
        ...choice,
      })
      if (result.success && result.data) {
        // Go Live is the check-in's twin (§21.5): the same important success.
        H.success({ important: true })
        noteOwnGoLive()
        if (userId) {
          await rememberLiveSession({ userId, venueDayId: result.data.venueDayId, venueId: place.id, venueName: place.name, choice })
        }
        checkInChanged(result.data.venueDayId, Array.isArray(result.data.left) ? result.data.left : [])
        // Never a silent switch: the room this took you out of, named by the server (ROOM-10). Queued ahead of the caller's own toast.
        const left = youLeftLine(result.data)
        if (left) showToast(left, 'info')
        onLive?.(result.data)
        return true
      }
      // No code: a timeout or no network. The POST may have landed, so everything that shows it re-reads (M2).
      if (!result.errorCode) checkInChanged()
      const refusal = goLiveRefusal(reasonOf(result), result.error, result.eventId, result.retryAfter)
      // No haptic on a refusal (R4-D11 11-1): a refusal about the place is not about you.
      Logger.info('events', 'go live refused', { code: reasonOf(result) })
      // A tap on "See Blend'n+" and the automatic ask are the same sheet: the Stay tap, with the free hour as its way on.
      const stayOffer = { trigger: 'stay' as const, venue: place.name, onFree: () => void goLive({ minutes: 60 }), onUnlocked: () => void goLive({ stay: true }) }
      const seePlus = () => void openTonight(stayOffer, { userInitiated: true })
      if (refusal.kind === 'plus') {
        // "Stay" is Blend’n+'s in this city: the paywall, if its policy lets it come now (step 11) —
        // once the tray has finished leaving (iOS will not present over a dismissing modal).
        closeTray()
        await afterSheetDismissed()
        const opened = await openTonight(stayOffer)
        if (onPlusRequired) {
          onPlusRequired(opened)
          return false
        }
        if (opened) return false
      }
      if (onRefusal) onRefusal(refusal)
      else showGoLiveRefusal(refusal, place, { showTray, closeTray, retry: again, seePlus })
      return false
    } catch (error) {
      Logger.error('events', 'go live failed', { error: String(error) })
      checkInChanged()
      const thrown = goLiveRefusal(undefined, 'Check your connection and try again.')
      if (onRefusal) onRefusal(thrown)
      else showGoLiveRefusal(thrown, place, { showTray, closeTray, retry: again })
      return false
    } finally {
      setInFlight(false)
    }
  }

  return { goLive, busy }
}
