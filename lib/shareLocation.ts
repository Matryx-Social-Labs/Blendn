import { useSyncExternalStore } from 'react'

/**
 * "Share location for nearby events" (Settings, onboarding; `profiles.share_location`).
 *
 * Off means no position leaves the phone for the reads that sort and label by distance: the events list, Places and an
 * event's detail (`apiClient`). It is not the check-in, which is an act the person performs and sends in a body.
 *
 * Kept here, in memory, because the reads are made from many screens and none of them holds the profile: it is set from the
 * account when a session begins (`useAuth`) and from a saved switch (`apiClient.updateProfile`). Unknown is on, the column's default.
 */
let sharing = true
const listeners = new Set<() => void>()

export const locationSharingOn = (): boolean => sharing

/** `undefined` (a profile that does not say) is the default, on. */
export function setLocationSharing(value: boolean | null | undefined): void {
  const next = value !== false
  if (next === sharing) return
  sharing = next
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The switch as a component reads it: the screen draws again when it changes. */
export const useLocationSharing = (): boolean => useSyncExternalStore(subscribe, locationSharingOn)
