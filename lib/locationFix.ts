import * as Location from 'expo-location'
import { Linking, Platform } from 'react-native'
import type { ActionTrayButton } from '../components/ActionTray'
import type { ButtonKind } from '../components/ds/Button'
import type { IconName } from '../components/ui/Icon'
import { markCheckIn, type FixSource } from './checkInTiming'
import { H } from './haptics'
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

/**
 * How old a fix may be and still say where you are standing. Twenty seconds
 * at walking pace is under 30 m, inside the 50 m the door already allows.
 */
export const FRESH_FIX_MAX_AGE_MS = 20_000

/** The event door's floor for a usable fix. */
export const CHECK_IN_MAX_ACCURACY_M = 50

/**
 * A fix good enough for the door, as fast as the platform gives one.
 *
 * Not `getCurrentPositionAsync` on iOS. There it is CoreLocation's
 * `requestLocation()` (expo-location `LocationRequester.swift`), which keeps
 * listening until it reaches the requested accuracy or gives up — about ten
 * seconds — and only then answers. That was the ~10 s between the hold and the
 * request on every iOS drive (Android's fused `getCurrentLocation` answers in
 * well under a second, and stays as it was). A watch delivers the first fix at
 * once and better ones after: the first inside `maxAccuracyM` is taken and the
 * watch stopped. At the deadline it answers with the best it had, which the
 * caller judges (the weak-fix tray), or rejects as timed out when it had none.
 */
/**
 * `firstGoodFix` settles this much before the check-in's own deadline, so a
 * weak best-so-far is judged ("GPS signal is weak, 400 m") rather than lost to
 * the outer timer's "Location timed out".
 */
const SETTLE_BEFORE_DEADLINE_MS = 500

export function firstGoodFix(
  maxAccuracyM: number,
  deadlineMs: number = LOCATION_FIX_TIMEOUT_MS - SETTLE_BEFORE_DEADLINE_MS
): Promise<Location.LocationObject> {
  const timedOut = () => Object.assign(new Error('Location timed out'), { code: 'E_LOCATION_TIMEOUT' })
  if (Platform.OS !== 'ios') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(timedOut()), deadlineMs)
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true })
        .then(resolve, reject)
        .finally(() => clearTimeout(timer))
    })
  }
  return new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null
    let subscription: Location.LocationSubscription | null = null
    let settled = false
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      subscription?.remove()
      finish()
    }
    const accuracyOf = (fix: Location.LocationObject) => fix.coords.accuracy ?? Infinity
    const timer = setTimeout(() => settle(() => (best ? resolve(best) : reject(timedOut()))), deadlineMs)
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 0 }, (fix) => {
      if (!best || accuracyOf(fix) < accuracyOf(best)) best = fix
      if (accuracyOf(fix) <= maxAccuracyM) settle(() => resolve(fix))
    }).then(
      (sub) => {
        subscription = sub
        if (settled) sub.remove()
      },
      (error) => settle(() => reject(error))
    )
  })
}

/**
 * The fix asked for when the pass showed, so the hold does not start one cold.
 * Pending or done, the hold reuses it rather than asking a second time.
 */
let warming: { startedAt: number; fix: Promise<Location.LocationObject | null> } | null = null

/**
 * Start a fix now, before anybody holds. Never prompts — without permission
 * (or with Precise off) it does nothing, and the hold's own path asks and
 * explains as before. Bounded by `firstGoodFix`'s deadline.
 */
export async function warmLocationFix(): Promise<void> {
  if (warming && Date.now() - warming.startedAt < FRESH_FIX_MAX_AGE_MS) return
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null)
  if (permission?.status !== 'granted' || permission.ios?.accuracy === 'reduced') return
  warming = { startedAt: Date.now(), fix: firstGoodFix(CHECK_IN_MAX_ACCURACY_M).catch(() => null) }
}

/** Recent, and as good as the door asks: a fix that can stand in for a new one. */
function usable(fix: Location.LocationObject | null, maxAccuracyM: number): Location.LocationObject | null {
  if (!fix || Date.now() - fix.timestamp > FRESH_FIX_MAX_AGE_MS) return null
  return (fix.coords.accuracy ?? Infinity) <= maxAccuracyM ? fix : null
}

/**
 * The phone's last fix if it is fresh and good enough (instant), else the
 * warmed one (awaited if still coming), else a new one.
 */
async function freshFix(maxAccuracyM: number): Promise<{ fix: Location.LocationObject; source: FixSource }> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: FRESH_FIX_MAX_AGE_MS, requiredAccuracy: maxAccuracyM }).catch(() => null)
  const cached = usable(last, maxAccuracyM)
  if (cached) return { fix: cached, source: 'lastKnown' }
  const warmed = usable((await warming?.fix) ?? null, maxAccuracyM)
  if (warmed) return { fix: warmed, source: 'warm' }
  return { fix: await firstGoodFix(maxAccuracyM), source: 'fresh' }
}

/**
 * A tray button. `kind` is the redesign's (`<Sheet>`, Flow 4 Tonight #15–#26:
 * Open Settings is the strong neutral, Not now and Cancel are text); a screen
 * still on `ActionTray` reads `variant` and ignores it.
 */
export type TrayButton = ActionTrayButton & { kind?: ButtonKind }

/** What a redesigned tray draws besides its words: the glyph well, a Geist Mono path line (R3-D4 4.7). */
export type TrayExtra = { icon?: IconName; detail?: string }

/** The screen's tray, as `EventDetailScreen` and `ActionTray` define it; the Blend'n overlay draws it as a `<Sheet>`. */
export type ShowTray = (title: string, message: string, buttons?: TrayButton[], extra?: TrayExtra) => void

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
   * What "Try again" on the weak-fix and timed-out trays does. A fix on its
   * own goes nowhere: the action that wanted it must run again, or the retry
   * is a dead end (step 5 review, H4; Flow 4 Tonight #25, #26).
   */
  onRetry?: () => void
  /** Whose words the trays use: a check-in's (the default) or a Go Live's. */
  purpose?: 'checkIn' | 'goLive'
}

/**
 * Precise location switched off: every fix is kilometres wide, so "move
 * somewhere with better signal" is the wrong advice; the switch is (R3-D4
 * 4.7). The path to it, per platform, in Geist Mono under the body.
 */
export const PRECISE_OFF = {
  title: 'Precise location is off',
  message: (purpose: 'checkIn' | 'goLive') =>
    `${purpose === 'goLive' ? 'Going live' : 'Check-in'} needs your exact spot to confirm you’re inside. Turn on Precise Location for Blend’n.`,
  path: () =>
    Platform.OS === 'android'
      ? 'App info › Permissions › Location › Use precise location'
      : 'Settings › Blend’n › Location › Precise Location',
} as const

/** "to check you in here" / "to go live here": the one phrase that differs between the two doors. */
const TO = { checkIn: 'to check you in here', goLive: 'to go live here' } as const
const VERB = { checkIn: 'to check in here', goLive: 'to go live here' } as const

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
  purpose = 'checkIn',
}: CheckInTrays): Promise<CheckInLocation | null> {
  const settingsButtons: TrayButton[] = [
    { label: 'Not now', kind: 'tertiary', onPress: closeTray },
    {
      label: 'Open Settings',
      variant: 'primary',
      kind: 'strong',
      onPress: () => {
        closeTray()
        Linking.openSettings().catch(() => {})
      },
    },
  ]
  // "Try again" resumes what wanted the fix (Flow 4 Tonight #25–#26); without one, it asks for a fix again.
  const retryButtons: TrayButton[] = [
    { label: 'Cancel', kind: 'tertiary', onPress: closeTray },
    {
      label: 'Try again',
      variant: 'primary',
      kind: 'primary',
      onPress: () => {
        closeTray()
        if (onRetry) onRetry()
        else getCurrentLocation({ showTray, closeTray, maxAccuracyM, purpose }).catch(() => {})
      },
    },
  ]
  try {
    // Services and permission are asked together: neither waits on the other.
    const [serviceEnabled, permission] = await Promise.all([
      Location.hasServicesEnabledAsync(),
      Location.requestForegroundPermissionsAsync(),
    ])
    if (!serviceEnabled) {
      Logger.warn('events', 'location:servicesDisabled')
      showTray('Location Services are off', `Turn on Location Services ${VERB[purpose]}.`, settingsButtons, { icon: 'map-pin-off' })
      return null
    }

    const { status } = permission
    if (status === 'granted' && permission.ios?.accuracy === 'reduced') {
      Logger.warn('events', 'location:preciseOff')
      // R3-D4 4.7: the attempt failed, about you, so its one H.error.
      H.error()
      showTray(PRECISE_OFF.title, PRECISE_OFF.message(purpose), settingsButtons, { icon: 'locate-off', detail: PRECISE_OFF.path() })
      return null
    }
    if (status !== 'granted') {
      Logger.warn('events', 'location:permissionDenied')
      showTray('Location permission needed', `Blend’n needs your location once, ${TO[purpose]}.`, settingsButtons, { icon: 'map-pin' })
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
     *
     * And no fresh BestForNavigation fix started at the end of the hold: that
     * was the wait between "Checking you in…" and "You're in" (seconds cold,
     * up to this deadline). The fix warmed when the pass showed, or a recent
     * one as good as the door asks, is used; High, not BestForNavigation,
     * when a new one is needed — the door asks 50 m, not lane-level.
     */
    const location = await new Promise<Location.LocationObject>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Object.assign(new Error('Location timed out'), { code: 'E_LOCATION_TIMEOUT' })),
        LOCATION_FIX_TIMEOUT_MS
      )
      freshFix(maxAccuracyM)
        .then(({ fix, source }) => {
          clearTimeout(timer)
          markCheckIn('location', { source, ageMs: Date.now() - fix.timestamp, accuracyM: fix.coords.accuracy ?? undefined })
          resolve(fix)
        })
        .catch((err) => { clearTimeout(timer); reject(err) })
    })

    // Validate GPS accuracy for production
    const accuracy = location.coords.accuracy || 999
    if (accuracy > maxAccuracyM) {
      Logger.warn('events', 'location:lowAccuracy', { accuracy })
      showTray('GPS signal is weak', `Accuracy is ${Math.round(accuracy)} m. Step away from walls and try again.`, retryButtons, { icon: 'radar' })
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
      showTray('Location timed out', `We couldn’t get a fix in ${LOCATION_FIX_TIMEOUT_MS / 1000} seconds.`, retryButtons, { icon: 'hourglass' })
    } else if (errorCode === 'E_LOCATION_UNAVAILABLE') {
      showTray('Location unavailable', 'Location services are temporarily unavailable. Try again in a moment.', retryButtons, { icon: 'map-pin-off' })
    } else {
      showTray('Couldn’t get your location', 'Check your location settings and try again.', retryButtons, { icon: 'map-pin-off' })
    }
    return null
  }
}
