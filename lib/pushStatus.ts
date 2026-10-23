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

export async function readOsPush({ fresh = false }: { fresh?: boolean } = {}): Promise<OsPush> {
  const permission = await readPushPermission({ fresh })
  // Unknown reads as askable: the switch then behaves as it always did.
  if (permission === 'unavailable') return 'askable'
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
    setOs(await readOsPush({ fresh }))
    setKnown(true)
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
