/**
 * The current device's Expo push token, held where both sides can reach it.
 *
 * `lib/notifications.ts` imports `apiClient`, so `apiClient` cannot import it
 * back to ask what the token is. Same shape as `lib/sessionEvents.ts`, which
 * exists for the same reason: a leaf module both halves can depend on.
 *
 * This is here so sign-out can send the token in the *same* authenticated
 * request that revokes the session. The previous design fired a separate
 * authenticated DELETE after `TokenStorage.clearAll()` had already run, so it
 * always 401'd, and the row survived — which meant the next person to sign in
 * on that phone received the previous account's notifications, message
 * previews included.
 *
 * Module-level, so it is empty after a cold start. That case is handled on the
 * server: a sign-out that names no device clears every token the user holds,
 * because clearing too many costs a re-registration and clearing too few leaks
 * someone's DMs.
 */
let currentPushToken: string | null = null

export function setPushTokenRef(token: string | null) {
  currentPushToken = token
}

export function getPushTokenRef(): string | null {
  return currentPushToken
}
