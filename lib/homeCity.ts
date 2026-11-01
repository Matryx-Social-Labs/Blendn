import { useEffect, useSyncExternalStore } from 'react'

import { apiClient } from './apiClient'
import { Logger } from './logger'

/**
 * Home (travel plan §1.1): `profile.homeCitySlug`, one copy for the Pulse and Settings, so a change in Settings moves
 * the travel chip without a refetch. Stored at city level on the server (SCRUM-709, owner default), never a position.
 *
 * `undefined` until the profile has been read: the travel UI waits rather than treating "not loaded" as "no home".
 */
let home: { userId: string; slug: string | null } | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const set = (next: { userId: string; slug: string | null }) => {
  home = next
  listeners.forEach((listener) => listener())
}

async function load(userId: string): Promise<void> {
  try {
    const response = await apiClient.getProfile(userId)
    // A failed read leaves home unknown (no travel UI), never "unset": a write must not follow from a read that failed.
    if (!response?.success) return
    set({ userId, slug: response.data?.profile?.homeCitySlug ?? null })
  } catch (error) {
    Logger.warn('events', 'Could not read the home city', { error })
  }
}

export function useHomeCitySlug(userId: string | null | undefined): string | null | undefined {
  const snapshot = useSyncExternalStore(subscribe, () => home)
  useEffect(() => {
    if (userId && home?.userId !== userId) void load(userId)
  }, [userId])
  return userId && snapshot?.userId === userId ? snapshot.slug : undefined
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
  set({ userId, slug })
  return true
}
