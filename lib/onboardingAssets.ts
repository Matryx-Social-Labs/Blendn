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
