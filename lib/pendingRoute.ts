import { router, type Href } from 'expo-router'

/**
 * A route that arrived before the app could open it.
 *
 * A notification tapped while signed out, or on a cold start before the
 * session has come back, used to `router.push` straight away. The root guard
 * then saw a signed-in-only screen with no user and replaced it with `/`, or —
 * signed in, cold start — its pending `replace('/(tabs)/events')` landed on top
 * of the pushed screen. Either way the tap opened the app and the thing it was
 * about was gone.
 *
 * So nothing navigates until the root guard says the app is ready: signed in,
 * past any onboarding redirect, on an ordinary screen. Until then the latest
 * target waits here, and the guard opens it the moment it is. Only the latest,
 * because a second tap replaces what somebody meant by the first.
 *
 * The guard in `app/_layout.tsx` is the only caller of `setRouteReady` and
 * `takePendingRoute`. It opens the waiting route when it lands on an ordinary
 * screen, which covers both ways in: the redirect after sign-in, and the last
 * step of onboarding.
 */
let ready = false
let pending: Href | null = null

export function openWhenReady(target: Href): void {
  if (ready) {
    router.push(target)
    return
  }
  pending = target
}

export function setRouteReady(value: boolean): void {
  ready = value
}

export function takePendingRoute(): Href | null {
  const target = pending
  pending = null
  return target
}

/**
 * The token of an invite link waiting for sign-in, or null.
 *
 * Signed out, `/f/<token>` is held here while the guard shows the welcome
 * screen (`app/_layout.tsx`). The welcome and sign-in screens read it — without
 * taking it — to say whose invite is waiting (`components/friends/PendingInvite`).
 */
export function pendingInviteToken(): string | null {
  const target = pending as unknown
  let path: string | null = null
  if (typeof target === 'string') {
    path = target
  } else if (target && typeof target === 'object') {
    const t = target as { pathname?: unknown; params?: { token?: unknown } }
    if (t.pathname === '/f/[token]' && typeof t.params?.token === 'string') return t.params.token || null
    if (typeof t.pathname === 'string') path = t.pathname
  }
  const match = path?.match(/^\/f\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/** Tests only. */
export function resetPendingRoute(): void {
  ready = false
  pending = null
}
