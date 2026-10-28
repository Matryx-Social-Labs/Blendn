import { router, type Href, type useNavigationContainerRef } from 'expo-router'

import { tellLinkClosers } from './linkClosers'

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
    // As a link does (`+native-intent`): the modal is gone before the push, not only queued ahead of it.
    void dismissModals().then(() => router.push(target))
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
  if (target && typeof target === 'object') {
    const t = target as { pathname?: unknown; params?: { token?: unknown } }
    if (t.pathname === '/f/[token]' && typeof t.params?.token === 'string') return t.params.token || null
  }
  const match = pendingPath()?.match(/^\/f\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

/** The held target's path, whichever shape it was held in. */
function pendingPath(): string | null {
  const target = pending as unknown
  if (typeof target === 'string') return target
  if (target && typeof target === 'object') {
    const t = target as { pathname?: unknown }
    if (typeof t.pathname === 'string') return t.pathname
  }
  return null
}

/**
 * Whether an event's link is waiting for sign-in (Flow 15 15.12 "Sign in to open this"): the landing says a link is held,
 * so the sign-in does not look like it dropped it. `pendingEventId` names which event, and `HeldLink` reads its name
 * and day from the public share read (SYS-15): the link says nothing more to someone who has not signed in.
 */
export function pendingEventLink(): boolean {
  return /^\/event\//.test(pendingPath() ?? '')
}

/** The id of the event whose link is waiting for sign-in, or null (a link is held as its path: `/event/<id>`). */
export function pendingEventId(): string | null {
  const m = pendingPath()?.match(/^\/event\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Tests only. */
export function resetPendingRoute(): void {
  ready = false
  pending = null
}

/**
 * The root stack's modal routes: those with a modal `presentation` in `app/_layout.tsx` (`__tests__/linkOverModal.test.tsx`
 * reads it back).
 */
export const ROOT_MODAL_ROUTES: readonly string[] = ['event-preferences/[eventId]', 'crews/new', 'plus', 'f/[token]']

type LinkNavigator = Pick<ReturnType<typeof useNavigationContainerRef>, 'isReady' | 'getRootState' | 'dispatch' | 'addListener'>
type NavigationState = ReturnType<LinkNavigator['getRootState']>
let linkNavigator: LinkNavigator | null = null

/** The root navigation container, set by the root layout while it is mounted. */
export function setLinkNavigator(next: LinkNavigator | null): void {
  linkNavigator = next
}

/** How long a link waits for a modal's hold (`holdLinks`) before it closes the modal anyway. */
export const LINK_HOLD_MAX_MS = 30_000
let holds = 0
let released: (() => void)[] = []

/**
 * Hold incoming links off the modal while something in it must finish (a purchase or a restore in flight on the
 * paywall). Returns the release; idempotent. A link that arrives meanwhile waits for the last release, or
 * `LINK_HOLD_MAX_MS`, whichever comes first.
 */
export function holdLinks(): () => void {
  holds += 1
  let done = false
  return () => {
    if (done) return
    done = true
    holds -= 1
    if (holds > 0) return
    const waiting = released
    released = []
    waiting.forEach((resolve) => resolve())
  }
}

function linkHoldsReleased(): Promise<void> {
  if (holds === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      released = released.filter((r) => r !== settle)
      resolve()
    }, LINK_HOLD_MAX_MS)
    const settle = () => {
      clearTimeout(timer)
      resolve()
    }
    released = [...released, settle]
  })
}

/** How long a link waits for the modal it closed to leave the navigation state, if the state never says so. */
const DISMISS_FALLBACK_MS = 1000

/**
 * A link or a notification tap that arrives while a modal route is up closes it first, and opens over whatever presented
 * it (RC drive 5). A link is somewhere new to go, not a step inside the paywall or a sheet: pushed over the modal, the
 * stack lays it out as part of the modal, a modal's own hold on the screen (`RouteModal`) stays up under it, and closing
 * the modal later takes the linked screen with it.
 *
 * Not while a modal is in the middle of something that must not be cut off (a purchase or a restore on the paywall:
 * `holdLinks`): the link waits for it to settle, at most `LINK_HOLD_MAX_MS`, then closes it and goes.
 *
 * Every route from the lowest modal up is popped, in one action on the stack that holds them. Resolves once the state
 * has taken it: a link's own navigation dispatched in the same tick was lost under the pop (measured in
 * `__tests__/plusManageOverPlus.test.tsx`), so `+native-intent` and `openWhenReady` both wait for it. Resolves at once
 * when nothing modal is up, or before the navigator is ready (a cold start's link has nothing to close).
 */
export async function dismissModals(): Promise<void> {
  await linkHoldsReleased()
  // Told first, whether or not a modal route is up: an open sheet, the Blend'n overlay and a waiting check-in are not
  // routes, and each closes or gives up here (`onClosingForLink`) before anything is popped or unmounts.
  tellLinkClosers()
  return popModals()
}

function popModals(): Promise<void> {
  const navigator = linkNavigator
  if (!navigator?.isReady()) return Promise.resolve()
  // Down the focused chain to the stack that holds them (the container wraps the root stack in a route of its own).
  let state: NavigationState | undefined = navigator.getRootState()
  while (state) {
    const lowest = state.routes.findIndex((route) => ROOT_MODAL_ROUTES.includes(route.name))
    if (lowest > 0) {
      const { key, routes } = state
      return new Promise((resolve) => {
        const off = navigator.addListener('state', () => done())
        const timer = setTimeout(() => done(), DISMISS_FALLBACK_MS)
        const done = () => {
          off()
          clearTimeout(timer)
          resolve()
        }
        navigator.dispatch({ type: 'POP', payload: { count: routes.length - lowest }, target: key })
      })
    }
    state = state.routes[state.index]?.state as NavigationState | undefined
  }
  return Promise.resolve()
}
