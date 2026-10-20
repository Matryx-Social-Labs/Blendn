import Constants from 'expo-constants'
import { Image, Platform } from 'react-native'

/**
 * Width over height of a bundled image, from the bundler rather than a
 * literal: re-exporting the art cannot silently distort the layout. `fallback`
 * only when the bundler cannot say.
 */
export function assetAspect(mod: number, fallback: number): number {
  const s = Image.resolveAssetSource(mod)
  return s?.width && s?.height ? s.width / s.height : fallback
}

/** What a sign-in tells the server about this phone. */
export const currentDeviceInfo = () => ({
  platform: Platform.OS,
  device: Constants.deviceName || undefined,
  appVersion: Constants.expoConfig?.version || undefined,
})
