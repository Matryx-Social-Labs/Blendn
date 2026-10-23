import * as Notifications from 'expo-notifications'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { offCriticalPath } from './criticalPath'
import { settleWithin } from './fetchTimeout'
import { Logger } from './logger'

/** How long a permission read may take before it is given up on for the session (D1). */
export const PERMISSION_READ_MS = 4000

/** The phone's notification permission, or `unavailable`: the read did not answer, or failed. */
export type PushPermission = Notifications.NotificationPermissionsStatus | 'unavailable'

let known: Notifications.NotificationPermissionsStatus | null = null
let stuck = false
let reading: Promise<PushPermission> | null = null
/** What waits for a stuck read to answer late (Opus review M3): a push registration that was skipped for it. */
const onReadable = new Map<string, () => void>()

/**
 * Run `fn` once the stuck permission read answers (M3). One slow read (over PERMISSION_READ_MS) used to leave push
 * unregistered for the whole run, though the phone answered a moment later.
 */
export function whenPermissionReadable(key: string, fn: () => void): void {
  if (!stuck) return
  // Keyed, so a second skip waits for the same one run, not two.
  onReadable.set(key, fn)
}

/**
 * The one place the app reads the notification permission: every caller goes through here (RC drive D1).
 *
 * On iOS `getPermissionsAsync` holds Expo's single serial native queue until `usernotificationsd` answers; when it never
 * does, SecureStore's token reads and writes wait behind it for good. So the read:
 * - waits until sign-in, sign-out, a refresh or the launch's restore has finished and the first screen has painted
 *   (`lib/criticalPath`);
 * - is made once per session and kept (`fresh` re-reads: coming back to the app, after a Turn on);
 * - is bounded (`PERMISSION_READ_MS`): one that does not answer is `unavailable`, and no further read is made, since it would
 *   only queue behind the stuck one. Should the stuck one ever answer, reads resume.
 */
export function readPushPermission({ fresh = false }: { fresh?: boolean } = {}): Promise<PushPermission> {
  if (stuck) return Promise.resolve('unavailable')
  if (known && !fresh) return Promise.resolve(known)
  if (reading) return reading
  reading = (async (): Promise<PushPermission> => {
    await offCriticalPath()
    if (stuck) return 'unavailable'
    const call = Notifications.getPermissionsAsync()
    const answer = await settleWithin<Notifications.NotificationPermissionsStatus | null>(call, PERMISSION_READ_MS, null)
    if (answer) {
      known = answer
      return answer
    }
    stuck = true
    Logger.warn('notifications', 'permission:unavailable', { ms: PERMISSION_READ_MS })
    // The native queue frees when the stuck read answers; so do we.
    call.then((late) => {
      stuck = false
      known = late
      const waiting = [...onReadable.values()]
      onReadable.clear()
      waiting.forEach((fn) => fn())
    }, () => {
      stuck = false
    })
    return 'unavailable'
  })()
    .catch((): PushPermission => 'unavailable')
    .finally(() => {
      reading = null
    })
  return reading
}

/** What the OS dialog answered (`requestPermissionsAsync`): the next read need not ask the queue again. */
export function notePushPermission(answer: Notifications.NotificationPermissionsStatus): void {
  known = answer
}

/** Drop what was read (sign-out, tests). A read that is stuck stays known to be: the queue is still blocked. */
export function forgetPushPermission(): void {
  known = null
}

/**
 * What the phone itself says about notifications, apart from what the account says.
 *
 * `blocked` is a no the app can no longer ask past: iOS after the first
 * refusal, Android once "Don't ask again" is set. Only the phone's Settings can
 * undo it, so a switch shows off whatever the account says, and turning it on
 * explains that instead of saving a preference nothing will ever deliver on.
 * `askable` is a phone that has not said yes or no yet (or that can still be asked).
 */
export type OsPush = 'granted' | 'askable' | 'blocked'

/** The phone's answer, or `null` when it did not give one (a read that timed out or failed): unknown, never "off" (M3). */
export async function readOsPush({ fresh = false }: { fresh?: boolean } = {}): Promise<OsPush | null> {
  const permission = await readPushPermission({ fresh })
  if (permission === 'unavailable') return null
  if (permission.status === 'granted') return 'granted'
  return permission.canAskAgain ? 'askable' : 'blocked'
}

/**
 * The phone's answer, read now and on every return to the app: the fix for
 * `blocked` is a trip to the phone's Settings, and coming back should show
 * that it worked. `refresh` re-reads on demand (after a Turn on); `known` is false until the first read, so
 * nothing says "off" about a phone that has not answered yet.
 */
export function useOsPush(): { os: OsPush; known: boolean; refresh: () => Promise<void> } {
  const [os, setOs] = useState<OsPush>('askable')
  const [known, setKnown] = useState(false)
  const read = useCallback(async (fresh: boolean) => {
    const answer = await readOsPush({ fresh })
    // No answer is not an answer: `known` stays false, so nothing says "off" with a Turn on that cannot work (M3).
    setKnown(answer !== null)
    if (answer !== null) setOs(answer)
  }, [])
  const refresh = useCallback(() => read(true), [read])
  useEffect(() => {
    // The session's answer on mount; the phone again on every return, where Settings may have changed it.
    // `read` sets state only after its first await; the rule cannot see through the async function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read(false)
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => sub.remove()
  }, [read, refresh])
  return { os, known, refresh }
}
