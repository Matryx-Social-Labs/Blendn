import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { apiClient, AuthUser, TokenStorage } from './apiClient'
import { Logger } from './logger'
import { clearRoomSignal } from './roomSignal'
import { Sentry } from './sentry'
import { subscribeSessionExpired } from './sessionEvents'

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
}

// Global auth state to prevent duplicate checks
let globalAuthState: AuthState = {
  session: null,
  user: null,
  isNewAccount: false,
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
          const user = result.data
          Logger.info('auth', 'Session verified', { userId: user.id })

          updateAuthState({
            session: { user },
            user,
            loading: false,
            initialized: true,
          })

          // Store updated user data
          await TokenStorage.setUser(user)

          // Start session refresh interval
          startSessionRefresh()
        } else {
          // Token might be expired, try to refresh
          Logger.debug('auth', 'Session verification failed, attempting refresh...')

          const refreshed = await apiClient.refreshSession()

          if (refreshed) {
            // Retry getting session after refresh
            const retryResult = await apiClient.getSession()

            if (retryResult.success && retryResult.data) {
              const user = retryResult.data
              Logger.info('auth', 'Session refreshed successfully', { userId: user.id })

              updateAuthState({
                session: { user },
                user,
                loading: false,
                initialized: true,
              })

              await TokenStorage.setUser(user)
              startSessionRefresh()
            } else {
              // Refresh worked but session still invalid - clear everything
              Logger.warn('auth', 'Session refresh succeeded but session still invalid')
              await clearAuthState()
            }
          } else {
            // Refresh failed - user needs to sign in again
            Logger.warn('auth', 'Session refresh failed')
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
  updateAuthState({
    session: null,
    user: null,
    loading: false,
    initialized: true,
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
      // If already initialized, just update this component
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
): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
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
      return { success: false, error: result.error || 'Sign in failed' }
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
): Promise<{ success: boolean; error?: string; isNewUser?: boolean }> => {
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
      return { success: false, error: result.error || 'Sign in failed' }
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
): Promise<{ success: boolean; error?: string }> => {
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
      })

      startSessionRefresh()

      return { success: true }
    } else {
      Logger.error('auth', 'Email sign in failed', { error: result.error })
      updateAuthState({ loading: false })
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
): Promise<{ success: boolean; error?: string }> => {
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
  }
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
  }
  return initializeAuth()
}
