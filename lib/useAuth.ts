import { useEffect, useState } from 'react'
import { apiClient, AuthUser, TokenStorage } from './apiClient'
import { Logger } from './logger'

export interface AuthState {
  session: { user: AuthUser } | null // Maintain session shape for compatibility
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}

// Global auth state to prevent duplicate checks
let globalAuthState: AuthState = {
  session: null,
  user: null,
  loading: true,
  initialized: false,
}

let authStateListeners: ((state: AuthState) => void)[] = []
let sessionCheckInterval: NodeJS.Timeout | null = null

// Update global state and notify listeners
const updateAuthState = (newState: Partial<AuthState>) => {
  globalAuthState = { ...globalAuthState, ...newState }
  authStateListeners.forEach((listener) => listener(globalAuthState))
}

// Initialize auth system once
const initializeAuth = async () => {
  if (globalAuthState.initialized) {
    return globalAuthState
  }

  Logger.info('auth', 'Initializing auth system...')

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

    return globalAuthState
  } catch (error) {
    Logger.error('auth', 'Failed to initialize auth', { error })
    updateAuthState({
      session: null,
      user: null,
      loading: false,
      initialized: true,
    })
    return globalAuthState
  }
}

// Clear auth state
const clearAuthState = async () => {
  await TokenStorage.clearAll()
  stopSessionRefresh()
  updateAuthState({
    session: null,
    user: null,
    loading: false,
    initialized: true,
  })
}

// Start periodic session refresh (every 10 minutes)
const startSessionRefresh = () => {
  stopSessionRefresh()
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
  deviceInfo?: { platform?: string; device?: string; appVersion?: string }
): Promise<{ success: boolean; error?: string }> => {
  try {
    Logger.info('auth', 'Signing up...')
    updateAuthState({ loading: true })

    const result = await apiClient.signUp(email, password, name, deviceInfo)

    if (result.success && result.data) {
      const { user } = result.data
      Logger.info('auth', 'Sign up successful', { userId: user.id })

      updateAuthState({
        session: { user },
        user,
        loading: false,
        initialized: true,
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
export const signOut = async (revokeAll: boolean = false): Promise<{ success: boolean }> => {
  try {
    Logger.info('auth', 'Signing out...')

    await apiClient.signOut(revokeAll)
    await clearAuthState()

    Logger.info('auth', 'Sign out successful')
    return { success: true }
  } catch (error) {
    Logger.error('auth', 'Sign out exception', { error })
    // Clear local state even if API call fails
    await clearAuthState()
    return { success: true }
  }
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
  }
}

// Reinitialize auth (useful after background refresh or app resume)
export const reinitializeAuth = async (): Promise<AuthState> => {
  globalAuthState = {
    session: null,
    user: null,
    loading: true,
    initialized: false,
  }
  return initializeAuth()
}
