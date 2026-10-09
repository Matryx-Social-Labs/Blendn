import { router } from 'expo-router'
import { useState } from 'react'
import { Platform } from 'react-native'

import { apiClient, type GoLiveResult } from './apiClient'
import { checkInChanged } from './checkIn'
import { goLiveRefusal, rememberLiveSession, type GoLiveChoice, type GoLiveRefusal } from './goLive'
import { getCurrentLocation, type ShowTray } from './locationFix'
import { Logger } from './logger'
import { openInMaps } from './openInMaps'
import { useInteractionFeedback } from './useInteractionFeedback'

/**
 * Going live at a place, from wherever the button is: the place screen's Go
 * Live sheet and the expiry prompt's "Extend". Where you are comes through the
 * check-in's own gates (`lib/locationFix.ts`); the answer is read by its code
 * (`goLiveRefusal`). The trays are the caller's.
 */

export type GoLivePlace = { id: string; name: string; latitude: number | null; longitude: number | null; address?: string | null }

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
  { showTray, closeTray }: { showTray: ShowTray; closeTray: () => void }
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
  showTray(
    refusal.title,
    refusal.message,
    refusal.offerDirections
      ? [
          { label: 'Done', onPress: closeTray },
          {
            label: 'Open Maps',
            variant: 'primary',
            onPress: () => {
              closeTray()
              openInMaps({ latitude: place.latitude, longitude: place.longitude, address: place.address, venue_name: place.name }).catch(() => {})
            },
          },
        ]
      : undefined
  )
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
  const [busy, setBusy] = useState(false)

  /** True when live. Every other outcome has already been shown in a tray. */
  const goLive = async (choice: GoLiveChoice): Promise<boolean> => {
    if (!place || busy) return false
    setBusy(true)
    try {
      const at = await getCurrentLocation({ showTray, closeTray })
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
        await rememberLiveSession({ venueDayId: result.data.venueDayId, venueId: place.id, venueName: place.name })
        checkInChanged(result.data.venueDayId)
        onLive?.(result.data)
        return true
      }
      const refusal = goLiveRefusal(result.errorCode, result.error, result.eventId)
      if (refusal.kind === 'refused') feedback.error()
      Logger.info('events', 'go live refused', { code: result.errorCode })
      showGoLiveRefusal(refusal, place, { showTray, closeTray })
      return false
    } catch (error) {
      Logger.error('events', 'go live failed', { error: String(error) })
      showTray("Couldn't go live", 'Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return { goLive, busy }
}
