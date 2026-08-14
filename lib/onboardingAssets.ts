import { Asset } from 'expo-asset'
import { Image } from 'expo-image'

/*
 * Every image the onboarding screens render, in one list.
 *
 * It exists so the preload cannot drift from what is actually used. A screen
 * that adds an image and forgets to add it here shows a hole on first paint,
 * and nothing fails — which is exactly the bug this list is meant to prevent,
 * so the list has to be the thing the screens import from.
 *
 * ## Why the first paint was slow
 *
 * Three reasons, and the first was the embarrassing one:
 *
 *  1. `you.jpg` was **4 MB** — for a circle that renders at 60 points. It came
 *     straight out of Figma at full resolution and nothing resized it.
 *  2. Two of the images were photographs stored as **PNG**, which is lossless
 *     and therefore about six times the size of the same picture as JPEG.
 *  3. Nothing preloaded them, so the first render of a screen was also the
 *     first time its artwork was fetched and decoded.
 *
 * Together: 4.8 MB down to 388 KB, and now warmed before anyone arrives.
 *
 * In development this is worse than it will be in production — Metro serves
 * assets over HTTP on demand, so every one is a round trip. A release build
 * reads them from the bundle. Both get faster from this; dev gets much faster.
 */

/*
 * ...and warming them has to use the same cache the screens read from.
 *
 * `Asset.loadAsync` downloads into **Expo's** asset cache. React Native's
 * `<Image>` keeps its own, so a prefetched file was fetched again by the
 * component that actually drew it — which is why the globe and the "you" pin
 * still arrived a beat late despite being preloaded.
 *
 * The screens use `expo-image` now, which reads the cache `Image.prefetch`
 * writes to, so `prefetchOnboardingImages` below is the warm-up that matches.
 * `Asset.loadAsync` stays for the splash gate: it is what makes the promise
 * resolve only once the bytes are on disk.
 */
export const ONBOARDING_IMAGES = [
  require('../assets/onboarding/notifications.jpg'),
  require('../assets/onboarding/location-map.jpg'),
  require('../assets/onboarding/you.jpg'),
  require('../assets/onboarding/nearby-1.jpg'),
  require('../assets/onboarding/nearby-2.jpg'),
  require('../assets/onboarding/nearby-3.jpg'),
  require('../assets/onboarding/looking-dating.jpg'),
  require('../assets/onboarding/looking-friendship.jpg'),
  require('../assets/onboarding/looking-networking.jpg'),
  require('../assets/onboarding/looking-travel.jpg'),
  require('../assets/onboarding/looking-open.jpg'),
]

/**
 * Warm `expo-image`'s own cache, which is the one the screens read.
 *
 * Fire-and-forget: a failure here costs a fade-in on one screen, and blocking
 * startup on decorative artwork would be the worse trade.
 */
export async function prefetchOnboardingImages(): Promise<void> {
  try {
    await Image.prefetch(
      ONBOARDING_IMAGES.map((m) => Asset.fromModule(m).uri).filter(Boolean),
      { cachePolicy: 'memory-disk' }
    )
  } catch {
    // Decorative. Nothing here is worth failing a launch over.
  }
}
