import { useEffect, useSyncExternalStore } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'

/**
 * Home (travel plan §1.1): `profile.homeCitySlug`, one copy for the Pulse and Settings, so a change in Settings moves
 * the travel chip without a refetch. Stored at city level on the server (SCRUM-709, owner default), never a position.
 *
 * `undefined` until the profile has been read: the travel UI waits rather than treating "not loaded" as "no home".
 *
 * Kept per user: a read for the previous account that lands after a quick switch goes to that account, never to the one
 * now signed in. Each user is read again whenever a screen starts showing them, and a failed read is tried again while
 * one still does.
 */
let homes: Readonly<Record<string, string | null>> = {}
// Bumped by every save, so a read that started before it cannot put the old value back.
let saves: Readonly<Record<string, number>> = {}
const inFlight = new Map<string, Promise<boolean>>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const set = (userId: string, slug: string | null) => {
  homes = { ...homes, [userId]: slug }
  listeners.forEach((listener) => listener())
}

/** Waits before the 2nd, 3rd and 4th read of a profile that failed; then the next screen to show the user asks again. */
export const HOME_RETRY_MS = [2_000, 10_000, 30_000] as const

/** One read at a time per user. True when it landed. */
function load(userId: string): Promise<boolean> {
  const pending = inFlight.get(userId)
  if (pending) return pending
  const saveCount = saves[userId] ?? 0
  const read = Promise.resolve()
    .then(() => apiClient.getProfile(userId))
    .then((response) => {
      // A failed read leaves home unknown (no travel UI), never "unset": a write must not follow from a read that failed.
      if (!response?.success) return false
      if ((saves[userId] ?? 0) === saveCount) set(userId, response.data?.profile?.homeCitySlug ?? null)
      return true
    })
    .catch((error) => {
      Logger.warn('events', 'Could not read the home city', { error })
      return false
    })
    .finally(() => inFlight.delete(userId))
  inFlight.set(userId, read)
  return read
}

export function useHomeCitySlug(userId: string | null | undefined): string | null | undefined {
  const snapshot = useSyncExternalStore(subscribe, () => homes)
  useEffect(() => {
    if (!userId) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = (n: number) => {
      void load(userId).then((ok) => {
        if (!ok && live && n < HOME_RETRY_MS.length) timer = setTimeout(() => attempt(n + 1), HOME_RETRY_MS[n])
      })
    }
    attempt(0)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [userId])
  return userId && Object.prototype.hasOwnProperty.call(snapshot, userId) ? snapshot[userId] : undefined
}

/** `PUT /profiles/:id` with `homeCitySlug` (null clears). False, and nothing changed here, when the server refused. */
export async function saveHomeCity(userId: string, slug: string | null): Promise<boolean> {
  const response = await Promise.resolve()
    .then(() => apiClient.updateProfile(userId, { homeCitySlug: slug }))
    .catch(() => null)
  if (!response?.success) {
    Logger.warn('events', 'Could not save the home city', { error: response?.error })
    return false
  }
  saves = { ...saves, [userId]: (saves[userId] ?? 0) + 1 }
  set(userId, slug)
  return true
}
