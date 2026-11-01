import type { LocationPermissionResponse } from 'expo-location'

/**
 * Whether location is allowed but only roughly (Flow 2 location 04): iOS "Precise Location" off (`reduced`), or Android's
 * approximate grant (`coarse`). Check-in needs the exact spot, so the step says so before the person is at a door. A refusal
 * or a question not yet asked is not this: that is the step's own button.
 */
export function isPreciseLocationOff(permission: Pick<LocationPermissionResponse, 'granted' | 'ios' | 'android'> | null | undefined): boolean {
  if (!permission?.granted) return false
  return permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse'
}
