import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/**
 * "Update Blend'n to keep going" (Flow 15 15.14, a proposal until the server has a minimum version).
 *
 * The server says it by refusing a build it no longer serves: `426` with `errorCode: 'UPDATE_REQUIRED'` on any request,
 * decided from the `X-App-Version` header every request now carries (see the report: `middleware.ts`). Nothing here
 * guesses: without the server's refusal this never shows. The first refusal marks it for the rest of the run, because a
 * build the server will not talk to will not recover without the store.
 */
export const UPDATE_REQUIRED_CODE = 'UPDATE_REQUIRED'
export const UPDATE_REQUIRED_STATUS = 426

let required = false
const listeners = new Set<() => void>()

export function isUpdateRefusal(status: number | undefined, errorCode: unknown): boolean {
  return status === UPDATE_REQUIRED_STATUS || errorCode === UPDATE_REQUIRED_CODE
}

export function markUpdateRequired(): void {
  if (required) return
  required = true
  listeners.forEach((l) => l())
}

export const isUpdateRequired = () => required

/** Tests only. */
export function resetUpdateRequired(): void {
  required = false
  listeners.forEach((l) => l())
}

export function useUpdateRequired(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isUpdateRequired,
    isUpdateRequired
  )
}

/**
 * Where the update is. The Play listing is the package's; the App Store's needs the app's numeric id, which is set in
 * `EXPO_PUBLIC_APP_STORE_URL` once the listing exists (until then the button opens the store's search for the name).
 */
export const STORE_UPDATE = {
  ios: { label: 'Open the App Store', url: process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://apps.apple.com/search?term=Blend%27n' },
  android: { label: 'Open Google Play', url: 'https://play.google.com/store/apps/details?id=com.matryxsociallabs.blendn' },
} as const

export const updateStore = () => (Platform.OS === 'android' ? STORE_UPDATE.android : STORE_UPDATE.ios)
