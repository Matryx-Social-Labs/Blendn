import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/**
 * "Update Blend'n to keep going" (Flow 15 15.14).
 *
 * The server says it by refusing a build it no longer serves: `426` with `errorCode: 'UPDATE_REQUIRED'` on any request,
 * decided in `middleware.ts` (`lib/mobile-gate.ts`, SV-14) from the `X-App-Version` header every request carries and the
 * `X-App-Build` number (`MOBILE_MIN_APP_VERSION` / `MOBILE_MIN_APP_BUILD_{IOS,ANDROID}`; unset means no gate). Nothing
 * here guesses: without the server's refusal this never shows. The first refusal marks it for the rest of the run,
 * because a build the server will not talk to will not recover without the store.
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
 * Where the update is: the listing itself on both stores (`ascAppId` in `eas.json` is the App Store id).
 * `EXPO_PUBLIC_APP_STORE_URL` overrides the App Store's, for a different listing.
 */
const APP_STORE_LISTING = 'https://apps.apple.com/app/id6757761059'
export const STORE_UPDATE = {
  ios: { label: 'Open the App Store', url: process.env.EXPO_PUBLIC_APP_STORE_URL || APP_STORE_LISTING },
  android: { label: 'Open Google Play', url: 'https://play.google.com/store/apps/details?id=com.matryxsociallabs.blendn' },
} as const

export const updateStore = () => (Platform.OS === 'android' ? STORE_UPDATE.android : STORE_UPDATE.ios)
