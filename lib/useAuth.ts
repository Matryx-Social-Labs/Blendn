import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { apiClient, AuthUser, TokenStorage } from './apiClient'
import { Logger } from './logger'
import { clearRoomSignal } from './roomSignal'
import { rateLimitedMessage } from './signInRefusal'
import { Sentry } from './sentry'
import { markSessionExpired, subscribeSessionExpired } from './sessionEvents'

export interface AuthState {
  session: { user: AuthUser } | null // Maintain session shape for compatibility
  user: AuthUser | null
  loading: boolean
  initialized: boolean
  /**
   * This account was created moments ago and has not seen `about-you`.
   *
   * Lives here rather than in a `router.replace` at each call site because
   * routing has exactly one owner — the effect in `app/_layout.tsx`. Pushing
   * from the sign-in screens *raced* that effect and lost: the effect fires on
   * the auth-state change with `pathname` still `/` or `/sign-in`, both of
   * which it treats as signed-out routes, so it replaced with the events tab
   * before or after the push and about-you never appeared. Two things deciding
   * where to navigate is the bug; a flag the one decider reads is the fix.
   *
   * Transient by design. It is not persisted, so a killed app lands on events —
   * the Match tab's interest gate is the backstop, and being asked once at the
   * moment matching is reached for beats a prompt that resurrects on every
   * launch.
   */
  isNewAccount: boolean
  /**
   * A session is stored on this phone, but the server could not be reached to
   * confirm it and there is no stored user to carry on with.
   *
   * Not signed out: nothing refused the session. The entry screen says
   * "Can't reach Blend'n" with Try again (`retryAuth`) instead of offering a
   * sign-in the person does not need.
   */
  unreachable: boolean
}

// Global auth state to prevent duplicate checks
let globalAuthState: AuthState = {
  session: null,
  user: null,
  isNewAccount: false,
  unreachable: false,
  loading: true,
  initialized: false,
}

let authStateListeners: ((state: AuthState) => void)[] = []
// `ReturnType<typeof setInterval>`, not `NodeJS.Timeout`: in React Native the
// timer id is a number, and whether TypeScript agrees depends on whether
// `@types/node` happens to be in scope — which varies between a fresh clone and
// one that has run `pod install`. That made the same source typecheck on one
// machine and fail on another. This form is correct under either resolution.
let sessionCheckInterval: ReturnType<typeof setInterval> | null = null
let isInitializing = false // Prevent concurrent initialization
let initializationPromise: Promise<AuthState> | null = null // Promise-based wait instead of polling
let appStateListenerRegistered = false
let isAppActive = AppState.currentState === 'active'

const registerAppStateListener = () => {
  if (appStateListenerRegistered) return

  try {
    AppState.addEventListener('change', (state) => {
      isAppActive = state === 'active'
      if (!isAppActive) {
        Logger.info('auth', 'App backgrounded; pausing session refresh')
        stopSessionRefresh()
        return
      }

      if (globalAuthState.user) {
        Logger.info('auth', 'App foregrounded; resuming session refresh')
        startSessionRefresh()
      }
    })
    appStateListenerRegistered = true
  } catch (error) {
    Logger.warn('auth', 'Failed to register AppState listener', { error })
  }
}

// Update global state and notify listeners
const updateAuthState = (newState: Partial<AuthState>) => {
  const previousUserId = globalAuthState.user?.id
  globalAuthState = { ...globalAuthState, ...newState }
  // Any path that produces a user has reached the server, or has a user to
  // carry on with. Either way the "can't reach" screen no longer applies.
  if (newState.user) globalAuthState.unreachable = false
  authStateListeners.forEach((listener) => listener(globalAuthState))

  if (globalAuthState.user?.id !== previousUserId) {
    Sentry.setUser(globalAuthState.user ? { id: globalAuthState.user.id } : null)
  }
}

// Initialize auth system once
const initializeAuth = async (): Promise<AuthState> => {
  if (globalAuthState.initialized) {
    return globalAuthState
  }

  registerAppStateListener()

  // Prevent concurrent initialization - use Promise instead of polling
  if (isInitializing && initializationPromise) {
    return initializationPromise
  }

  isInitializing = true
  Logger.info('auth', 'Initializing auth system...')

  // Create a promise that other callers can await
  initializationPromise = (async (): Promise<AuthState> => {
    // Start in loading state
    updateAuthState({ loading: true })

    try {
      // Check if we have stored tokens
      const accessToken = await TokenStorage.getAccessToken()

      if (accessToken) {
        // We have a token, verify it's still valid
        Logger.debug('auth', 'Found stored access token, verifying session...')

        const result = await apiClient.getSession()

        if (result.success && result.data) {
          await signInVerified(result.data, 'Session verified')
        } else {
          /*
           * Signed out only when the server refused the refresh token.
           *
           * This used to read `refreshSession()`, a boolean that folds "the
           * server said no" and "the server never answered" into one `false`,
           * and cleared the session on either. So opening the app on a train,
           * or during a deploy, signed somebody out of a perfectly good session
           * (P0). `request()` has already tried a refresh on a 401 and cleared
           * the tokens if it was refused, so no tokens left means refused.
           */
          Logger.debug('auth', 'Session verification failed, attempting refresh...')
          const outcome = (await TokenStorage.getAccessToken())
            ? await apiClient.refreshSessionOutcome()
            : 'rejected'

          if (outcome === 'ok') {
            const retryResult = await apiClient.getSession()
            if (retryResult.success && retryResult.data) {
              await signInVerified(retryResult.data, 'Session refreshed successfully')
            } else if (await TokenStorage.getAccessToken()) {
              // Refreshed, then the re-read did not land. Nothing refused us.
              await keepStoredSession()
            } else {
              Logger.warn('auth', 'Session refresh succeeded but session still invalid')
              await clearAuthState()
            }
          } else if (outcome === 'failed') {
            await keepStoredSession()
          } else {
            Logger.warn('auth', 'Session refresh was refused')
            // A no-op when `request()` already recorded it (the first word
            // stands), and the notice for a cold start that never got that far.
            markSessionExpired()
            await clearAuthState()
          }
        }
      } else {
        // No stored token - user is not authenticated
        Logger.info('auth', 'No stored token, user not authenticated')
        updateAuthState({
          session: null,
          user: null,
          loading: false,
          initialized: true,
          unreachable: false,
        })
      }

      isInitializing = false
      return globalAuthState
    } catch (error) {
      Logger.error('auth', 'Failed to initialize auth', { error })
      updateAuthState({
        session: null,
        user: null,
        loading: false,
        initialized: true,
      })
      isInitializing = false
      return globalAuthState
    }
  })()

  return initializationPromise
}

/** The server confirmed the session: signed in with its copy of the user. */
const signInVerified = async (user: AuthUser, message: string) => {
  Logger.info('auth', message, { userId: user.id })
  updateAuthState({
    session: { user },
    user,
    loading: false,
    initialized: true,
  })
  await TokenStorage.setUser(user)
  startSessionRefresh()
}

/**
 * The server could not be reached. The session is not over.
 *
 * Signed in as the user stored at the last sign-in, and the tokens are left
 * alone: `apiClient` retries the refresh in the background, the ten-minute
 * refresh keeps trying, and the next request that needs it tries again. With
 * no stored user there is nobody to carry on as, so the entry screen says it
 * cannot reach Blend'n and offers Try again rather than a sign-in.
 */
const keepStoredSession = async () => {
  const stored = await TokenStorage.getUser()
  if (stored) {
    Logger.warn('auth', 'Could not reach the server; carrying on with the stored user', {
      userId: stored.id,
    })
    updateAuthState({
      session: { user: stored },
      user: stored,
      loading: false,
      initialized: true,
    })
    startSessionRefresh()
    return
  }
  Logger.warn('auth', 'Could not reach the server and no user is stored')
  updateAuthState({
    session: null,
    user: null,
    loading: false,
    initialized: true,
    unreachable: true,
  })
}

// Clear auth state
const clearAuthState = async () => {
  await TokenStorage.clearAll()
  stopSessionRefresh()
  /*
   * The centre button's cache is per-account.
   *
   * Without this the next person to sign in on the same device inherits the
   * previous one's saved events, and the bar offers them somebody else's
   * plans for tonight. Cleared here rather than in `signOut` because a failed
   * background refresh reaches this path without going through it.
   */
  clearRoomSignal()
  /*
   * A Go Live remembered on this phone is that account's (step 5 review, M5).
   * Loaded when needed: `goLive` brings AsyncStorage, which nothing else on
   * the auth path does.
   */
  void import('./goLive').then((m) => m.clearLiveSession()).catch(() => {})
  updateAuthState({
    session: null,
    user: null,
    loading: false,
    initialized: true,
    // The flag belongs to the account that was just created, not the device.
    // Left set, the next sign-in on this launch — an onboarded account — was
    // routed back into onboarding step one.
    isNewAccount: false,
    unreachable: false,
  })
}

// apiClient clears tokens on a failed background refresh (e.g. a 401 whose
// retry-with-refresh also fails) without going through signOut(). Without
// this, globalAuthState still says "logged in" until the next explicit
// getSession()/refresh call, so the UI can show a stale authenticated state.
let sessionExpiredListenerRegistered = false
const registerSessionExpiredListener = () => {
  if (sessionExpiredListenerRegistered) return
  sessionExpiredListenerRegistered = true
  subscribeSessionExpired(() => {
    if (!globalAuthState.user) return
    Logger.info('auth', 'Session expired during background refresh; clearing auth state')
    void clearAuthState()
  })
}
registerSessionExpiredListener()

// Start periodic session refresh (every 10 minutes)
const startSessionRefresh = () => {
  stopSessionRefresh()
  if (!isAppActive) {
    Logger.debug('auth', 'Skipping session refresh start; app not active')
    return
  }
  sessionCheckInterval = setInterval(
    async () => {
      Logger.debug('auth', 'Periodic session refresh check')
      await apiClient.refreshSession()
    },
    10 * 60 * 1000
  ) // 10 minutes
}

const stopSessionRefresh = () => {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval)
    sessionCheckInterval = null
  }
}

// Hook for React components
export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>(globalAuthState)

  useEffect(() => {
    // Add this component as a listener
    const listener = (newState: AuthState) => {
      setAuthState(newState)
    }
    authStateListeners.push(listener)

    // Initialize auth if not already done
    if (!globalAuthState.initialized) {
      initializeAuth()
    } else {
      // If already initialized, just update this component. It catches a change
      // made between render and subscribe. The rule's answer, useSyncExternalStore,
      // renders auth consumers at sync priority, so the root layout's routing
      // effect would run before the code after `await signIn…()`, which is the
      // race `isNewAccount` exists for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthState(globalAuthState)
    }

    // Cleanup: remove listener when component unmounts
    return () => {
      authStateListeners = authStateListeners.filter((l) => l !== listener)
    }
  }, [])

  return authState
}

// Helper function to get current user without hooks
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  if (!globalAuthState.initialized) {
    await initializeAuth()
  }
  return globalAuthState.user
}

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!globalAuthState.user
}

// Sign in with Google - called from login screen
export const signInWithGoogle = async (
  idToken: string,
  deviceInfo?: { platform?: string; device?: string; appVersion?: string }
): Promise<{ success: boolean; error?: string; errorCode?: string; retryAfter?: number; isNewUser?: boolean }> => {
  try {
    Logger.info('auth', 'Signing in with Google...')
    updateAuthState({ loading: true })

    const result = await apiClient.signInWithGoogle(idToken, deviceInfo)

    if (result.success && result.data) {
      const { user, isNewUser } = result.data
      Logger.info('auth', 'Google sign in successful', { userId: user.id, isNewUser })

      updateAuthState({
        session: { user },
        user,
        loading: false,
        initialized: true,
        // The server tells us whether it created the row; only then is
        // there anything to ask about.
        isNewAccount: isNewUser === true,
      })

      startSessionRefresh()

      return { success: true, isNewUser }
    } else {
      Logger.error('auth', 'Google sign in failed', { error: result.error })
      updateAuthState({ loading: false })
      return { success: false, error: result.error || 'Sign in failed', errorCode: result.errorCode, retryAfter: result.retryAfter }
    }
  } catch (error) {
    Logger.error('auth', 'Google sign in exception', { error })
    updateAuthState({ loading: false })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Sign in with Apple - called from login screen
export const signInWithApple = async (
  identityToken: string,
  fullName?: { givenName?: string | null; familyName?: string | null },
  deviceInfo?: { platform?: string; device?: string; appVersion?: string }
): Promise<{ success: boolean; error?: string; errorCode?: string; retryAfter?: number; isNewUser?: boolean }> => {
  try {
    Logger.info('auth', 'Signing in with Apple...')
    updateAuthState({ loading: true })

    const result = await apiClient.signInWithApple(identityToken, fullName, deviceInfo)

    if (result.success && result.data) {
      const { user, isNewUser } = result.data
      Logger.info('auth', 'Apple sign in successful', { userId: user.id, isNewUser })

      updateAuthState({
        session: { user },
        user,
        loading: false,
        initialized: true,
        // The server tells us whether it created the row; only then is
        // there anything to ask about.
        isNewAccount: isNewUser === true,
      })

      startSessionRefresh()

      return { success: true, isNewUser }
    } else {
      Logger.error('auth', 'Apple sign in failed', { error: result.error })
      updateAuthState({ loading: false })
      return { success: false, error: result.error || 'Sign in failed', errorCode: result.errorCode, retryAfter: result.retryAfter }
    }
  } catch (error) {
    Logger.error('auth', 'Apple sign in exception', { error })
    updateAuthState({ loading: false })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Sign in with email/password
export const signInWithEmail = async (
  email: string,
  password: string,
  deviceInfo?: { platform?: string; device?: string; appVersion?: string }
): Promise<{ success: boolean; error?: string; errorCode?: string }> => {
  try {
    Logger.info('auth', 'Signing in with email...')
    updateAuthState({ loading: true })

    const result = await apiClient.signInWithEmail(email, password, deviceInfo)

    if (result.success && result.data) {
      const { user } = result.data
      Logger.info('auth', 'Email sign in successful', { userId: user.id })

      updateAuthState({
        session: { user },
        user,
        loading: false,
        initialized: true,
        // Signing in is never creating; say so rather than inherit the flag.
        isNewAccount: false,
      })

      startSessionRefresh()

      return { success: true }
    } else {
      Logger.error('auth', 'Email sign in failed', { error: result.error })
      updateAuthState({ loading: false })
      // The server's "Too many requests" drops the wait it sent (SCRUM-487).
      if (result.errorCode === 'RATE_LIMITED') {
        return {
          success: false,
          error: rateLimitedMessage('sign-in attempts', result.retryAfter),
          errorCode: result.errorCode,
        }
      }
      return { success: false, error: result.error || 'Sign in failed' }
    }
  } catch (error) {
    Logger.error('auth', 'Email sign in exception', { error })
    updateAuthState({ loading: false })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Sign up with email/password
export const signUp = async (
  email: string,
  password: string,
  name?: string,
  deviceInfo?: { platform?: string; device?: string; appVersion?: string },
  age?: number
): Promise<{ success: boolean; error?: string; errorCode?: string }> => {
  try {
    Logger.info('auth', 'Signing up...')
    updateAuthState({ loading: true })

    const result = await apiClient.signUp(email, password, name, deviceInfo, age)

    if (result.success && result.data) {
      const { user } = result.data
      Logger.info('auth', 'Sign up successful', { userId: user.id })

      updateAuthState({
        session: { user },
        user,
        loading: false,
        initialized: true,
        // Always true here: this endpoint only ever creates.
        isNewAccount: true,
      })

      startSessionRefresh()

      return { success: true }
    } else {
      Logger.error('auth', 'Sign up failed', { error: result.error })
      updateAuthState({ loading: false })
      // The server's "Too many requests" drops the wait it sent (SCRUM-487).
      if (result.errorCode === 'RATE_LIMITED') {
        return { success: false, error: rateLimitedMessage('sign-ups from this network', result.retryAfter), errorCode: result.errorCode }
      }
      return { success: false, error: result.error || 'Sign up failed' }
    }
  } catch (error) {
    Logger.error('auth', 'Sign up exception', { error })
    updateAuthState({ loading: false })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Sign out
/**
 * Local state is cleared whatever the server said — trapping somebody in a
 * session they asked to leave is worse than a stale token. But the RESULT
 * reports what the server did: `apiClient.signOut` returns `success: false`
 * on failure and never throws, and the first version discarded it, so
 * Settings' "Failed to sign out" branch could never fire. Offline, the
 * refresh token stayed valid and the push token stayed registered, and the
 * screen said nothing.
 */
export const signOut = async (
  revokeAll: boolean = false
): Promise<{ success: boolean; error?: string }> => {
  try {
    Logger.info('auth', 'Signing out...')
    const result = await apiClient.signOut(revokeAll)
    await clearAuthState()
    if (!result.success) {
      Logger.warn('auth', 'Signed out locally; the server did not confirm', { error: result.error })
      return { success: false, error: result.error }
    }
    Logger.info('auth', 'Sign out successful')
    return { success: true }
  } catch (error) {
    Logger.error('auth', 'Sign out exception', { error })
    await clearAuthState()
    return { success: false, error: error instanceof Error ? error.message : 'Sign out failed' }
  }
}

/**
 * Re-read the session so `user.name` / `user.image` follow a profile edit.
 *
 * `globalAuthState.user` was set once at sign-in and never again; the
 * 10-minute refresh only rotates tokens. So `lib/reveal.ts`, which reads
 * `user.image` to decide whether reveal has a photo to show, said "add a
 * photo first" to somebody who had just added one — until a relaunch.
 */
export const refreshAuthUser = async (): Promise<void> => {
  try {
    const result = await apiClient.getSession()
    if (!result.success || !result.data) {
      Logger.warn('auth', 'Session refresh did not return a user', { error: result.error })
      return
    }
    updateAuthState({ session: { user: result.data }, user: result.data })
    await TokenStorage.setUser(result.data)
  } catch (error) {
    // Called as `void refreshAuthUser()` after a photo write; a throw here
    // would be an unhandled rejection with the photo already saved.
    Logger.warn('auth', 'Session refresh failed', { error })
  }
}

export const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    Logger.info('auth', 'Deleting account...')

    const result = await apiClient.deleteAccount()

    if (!result.success) {
      Logger.error('auth', 'Account deletion failed', { error: result.error })
      return { success: false, error: result.error || 'Failed to delete account' }
    }

    await clearAuthState()
    Logger.info('auth', 'Account deleted successfully')
    return { success: true }
  } catch (error) {
    Logger.error('auth', 'Account deletion exception', { error })
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * The about-you screen has been dealt with — by saving or by skipping.
 *
 * Called by that screen either way, so the routing effect stops treating this
 * session as brand new. Skipping is a complete answer: somebody who skipped is
 * in the same state as somebody who never saw it, and the Match tab's interest
 * gate is what asks again, at the moment matching is actually reached for.
 */
export const clearNewAccountFlag = () => {
  if (globalAuthState.isNewAccount) updateAuthState({ isNewAccount: false })
}

// Cleanup function for app shutdown
export const cleanupAuth = () => {
  stopSessionRefresh()
  authStateListeners = []
  globalAuthState = {
    session: null,
    user: null,
    loading: true,
    initialized: false,
    // Cleared with everything else: a resumed or restarted app is not a
    // freshly created account, and re-prompting on resume would be a trap.
    isNewAccount: false,
    unreachable: false,
  }
}

/**
 * "Try again" on the can't-reach screen.
 *
 * Not `reinitializeAuth`, which swaps the state without telling anyone: the
 * screen would drop to the splash for the length of the round trip. This keeps
 * `unreachable` set while `loading` is, so the screen stays put with its
 * button busy, and the next state replaces it.
 */
export const retryAuth = async (): Promise<AuthState> => {
  if (isInitializing && initializationPromise) return initializationPromise
  globalAuthState = { ...globalAuthState, initialized: false }
  return initializeAuth()
}

// Reinitialize auth (useful after background refresh or app resume)
export const reinitializeAuth = async (): Promise<AuthState> => {
  globalAuthState = {
    session: null,
    user: null,
    loading: true,
    initialized: false,
    // Cleared with everything else: a resumed or restarted app is not a
    // freshly created account, and re-prompting on resume would be a trap.
    isNewAccount: false,
    unreachable: false,
  }
  return initializeAuth()
}
