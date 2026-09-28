/**
 * What Android's hardware back does at the root, as a plain function.
 *
 * `true` means handled (nothing else runs); `false` hands the press on — to a
 * handler registered earlier, and in the end to the system, which puts the app
 * in the background.
 *
 * Three rules, each a bug it replaces:
 *
 * - **At a root (the signed-out screen, a tab) back does nothing inside the
 *   app.** Tabs arrive by `replace`, so whatever a pop would reach underneath
 *   them is a finished flow — sign-in, onboarding — not a place to go back to.
 *   With nothing to pop at all it returns `false`, so the app backgrounds the
 *   way every Android app does; the old handler returned `true` there and back
 *   on the Pulse did nothing, ever.
 * - **Elsewhere it pops, when there is something to pop.** With no history
 *   (a screen opened from a notification on a cold start) it returns `false`
 *   instead of calling `router.back()` into nothing.
 * - **The tab roots are `/events`, `/going`, `/chat`, `/profile`.** Expo
 *   Router's pathname drops the `(tabs)` group, so the old
 *   `startsWith('/(tabs)')` check never matched and back on a tab popped the
 *   root stack.
 */
export const TAB_ROOTS = ['/events', '/going', '/chat', '/profile'] as const

export function isBackRoot(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === '/' || pathname === '/index') return true
  return (TAB_ROOTS as readonly string[]).includes(pathname) || pathname.startsWith('/(tabs)')
}

export function handleAndroidBack(
  pathname: string | null | undefined,
  nav: { canGoBack: () => boolean; back: () => void }
): boolean {
  let canGoBack = false
  try {
    canGoBack = nav.canGoBack()
  } catch {
    canGoBack = false
  }
  if (!canGoBack) return false
  if (isBackRoot(pathname)) return true
  try {
    nav.back()
  } catch {
    return false
  }
  return true
}
