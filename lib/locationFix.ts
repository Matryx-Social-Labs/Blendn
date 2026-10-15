import * as Location from 'expo-location'
import { Linking } from 'react-native'
import type { ActionTrayButton } from '../components/ActionTray'
import { Logger } from './logger'

/**
 * The position a check-in is made from, and every way of not getting one.
 *
 * Lifted out of `EventDetailScreen` so the Blend'n room's hold-to-check-in runs
 * the same gates — services, permission, a deadline, a weak fix refused — and
 * says the same things when one of them stops it. The trays are the caller's:
 * this only decides what they say.
 */

/** How long a check-in waits for a GPS fix before saying so. */
export const LOCATION_FIX_TIMEOUT_MS = 15_000

/** The screen's tray, as `EventDetailScreen` and `ActionTray` define it. */
export type ShowTray = (title: string, message: string, buttons?: ActionTrayButton[]) => void

export type CheckInTrays = {
  showTray: ShowTray
  closeTray: () => void
  /**
   * The weakest fix to accept, in metres. The event door asks 50; Go Live sends
   * up to the server's own ceiling (`MAX_GPS_ACCURACY_METERS`, 150) and lets
   * the server judge (step 5 review, H4).
   */
  maxAccuracyM?: number
  /**
   * What "Try Again" on the weak-fix tray does. A fix on its own goes nowhere:
   * the action that wanted it must run again, or the retry is a dead end
   * (step 5 review, H4).
   */
  onRetry?: () => void
}

/** The event door's floor for a usable fix. */
export const CHECK_IN_MAX_ACCURACY_M = 50

/**
 * iOS "Precise Location" switched off: every fix is kilometres wide, so
 * "move somewhere with better signal" is the wrong advice; the switch is.
 */
export const PRECISE_OFF = {
  title: 'Turn on Precise Location',
  message: "Blend'n only has your approximate location, which can't tell which place you're at. Turn on Precise Location for Blend'n in Settings.",
} as const

export type CheckInLocation = {
  latitude: number
  longitude: number
  accuracy: number | null
}

/**
 * A fix good enough to check in with, or `null` after a tray has said why not.
 */
export async function getCurrentLocation({
  showTray,
  closeTray,
  maxAccuracyM = CHECK_IN_MAX_ACCURACY_M,
  onRetry,
}: CheckInTrays): Promise<CheckInLocation | null> {
  try {
    // Fallback if expo-location is not available
    if (!Location) {
      Logger.warn('events', 'location:moduleUnavailable')
      showTray(
        'Location service not available',
        'Location services are required to check in to events. Please ensure you have the latest version of this app.'
      )
      return null
    }

    // Check if location services are enabled
    const serviceEnabled = await Location.hasServicesEnabledAsync()
    if (!serviceEnabled) {
      Logger.warn('events', 'location:servicesDisabled')
      showTray(
        'Location services disabled',
        'Please enable location services in your device settings to check in to events.',
        [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Open Settings',
            variant: 'primary',
            onPress: () => {
              closeTray()
              Linking.openSettings().catch(() => {})
            }
          }
        ]
      )
      return null
    }

    // Request permission with better messaging
    const permission = await Location.requestForegroundPermissionsAsync()
    const { status } = permission
    if (status === 'granted' && permission.ios?.accuracy === 'reduced') {
      Logger.warn('events', 'location:preciseOff')
      showTray(PRECISE_OFF.title, PRECISE_OFF.message, [
        { label: 'Cancel', onPress: closeTray },
        {
          label: 'Open Settings',
          variant: 'primary',
          onPress: () => {
            closeTray()
            Linking.openSettings().catch(() => {})
          },
        },
      ])
      return null
    }
    if (status !== 'granted') {
      Logger.warn('events', 'location:permissionDenied')
      showTray(
        'Location permission required',
        'Blendn needs location access to verify you are at events. This keeps check-ins authentic.',
        [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Open Settings',
            variant: 'primary',
            onPress: () => {
              closeTray()
              Linking.openSettings().catch(() => {})
            }
          }
        ]
      )
      return null
    }

    /*
     * A deadline of our own. `getCurrentPositionAsync` has no timeout
     * option (`timeInterval` is a watch setting and does nothing here), and
     * BestForNavigation waits for a fresh GNSS fix — on a phone that cannot
     * get one the promise never settles, the button spins for ever, and the
     * "Location timeout" tray below was unreachable. Driven on an emulator
     * with no GPS stream: five minutes of spinner. Fifteen seconds is
     * longer than any fix worth waiting for at a venue door.
     */
    const location = await new Promise<Location.LocationObject>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Object.assign(new Error('Location timed out'), { code: 'E_LOCATION_TIMEOUT' })),
        LOCATION_FIX_TIMEOUT_MS
      )
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      })
        .then((fix) => { clearTimeout(timer); resolve(fix) })
        .catch((err) => { clearTimeout(timer); reject(err) })
    })

    // Validate GPS accuracy for production
    const accuracy = location.coords.accuracy || 999
    if (accuracy > maxAccuracyM) {
      Logger.warn('events', 'location:lowAccuracy', { accuracy })
      showTray(
        'GPS signal weak',
        `GPS accuracy is ${Math.round(accuracy)}m. Move to a location with better GPS signal for accurate check-ins.`,
        [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Try Again',
            variant: 'primary',
            onPress: () => {
              closeTray()
              if (onRetry) onRetry()
              else getCurrentLocation({ showTray, closeTray, maxAccuracyM }).catch(() => {})
            },
          },
        ]
      )
      return null
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      /*
       * The number the server has been asking for and never receiving.
       *
       * It is read six lines above to refuse a weak fix, and was then dropped
       * at this return — so `deviceInfo.gpsAccuracy` was `undefined` on every
       * check-in the app has ever sent, and four separate server mechanisms
       * that read it saw nothing:
       *
       *   - `MAX_GPS_ACCURACY_METERS` (150m) — unreachable, so the ceiling is
       *     whatever this file happens to enforce
       *   - `evaluateCheckIn`'s allowance — every fix judged as the assumed
       *     35m rather than as itself
       *   - `check_in_refusals.accuracy_metres` — the column that exists to
       *     tell a wrong pin from bad phones. Measured on staging: **zero**
       *     rows written by the API carry one
       *   - `presence_sessions.last_accuracy` — 37 sessions, none with a value
       *
       * `accuracy` is nullable on iOS and Android both, so it is passed
       * through as-is rather than coerced; `accuracyAllowance` already treats
       * null as "no information" and applies the assumed value.
       */
      accuracy: location.coords.accuracy ?? null,
    }
  } catch (error) {
    Logger.error('events', 'location:getCurrentLocation:error', { error: error as any })

    // Handle specific location errors for production
    const errorCode = (error as any)?.code
    if (errorCode === 'E_LOCATION_TIMEOUT') {
      showTray('Location timeout', 'Unable to get your location. Please try again or move to an area with better GPS signal.')
    } else if (errorCode === 'E_LOCATION_UNAVAILABLE') {
      showTray('Location unavailable', 'Location services are temporarily unavailable. Please try again.')
    } else {
      showTray('Location error', 'Failed to get your current location. Please check your GPS settings and try again.')
    }
    return null
  }
}
