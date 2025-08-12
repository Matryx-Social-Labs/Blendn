import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface AuthState {
  session: Session | null
  user: any | null
  loading: boolean
  initialized: boolean
}

// Global auth state to prevent duplicate checks
let globalAuthState: AuthState = {
  session: null,
  user: null,
  loading: true,
  initialized: false
}

let authStateListeners: ((state: AuthState) => void)[] = []
let authSubscription: any = null

// Initialize auth system once
const initializeAuth = async () => {
  if (globalAuthState.initialized) {
    return globalAuthState
  }

  console.log('🔐 [AUTH_MANAGER] Initializing auth system...')

  try {
    // Get initial session
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.error('❌ [AUTH_MANAGER] Error getting initial session:', error)
    }

    // Update global state
    globalAuthState = {
      session,
      user: session?.user || null,
      loading: false,
      initialized: true
    }

    console.log('✅ [AUTH_MANAGER] Initial session loaded:', session?.user?.id || 'none')

    // Set up auth state listener (only once)
    if (!authSubscription) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔐 [AUTH_MANAGER] Auth state changed:', event, session?.user?.id || 'none')
        
        // Update global state
        globalAuthState = {
          ...globalAuthState,
          session,
          user: session?.user || null,
          loading: false
        }

        // Notify all listeners
        authStateListeners.forEach(listener => listener(globalAuthState))
      })
      
      authSubscription = subscription
    }

    // Notify listeners of initial state
    authStateListeners.forEach(listener => listener(globalAuthState))

    return globalAuthState
  } catch (error) {
    console.error('❌ [AUTH_MANAGER] Failed to initialize auth:', error)
    globalAuthState = {
      session: null,
      user: null,
      loading: false,
      initialized: true
    }
    return globalAuthState
  }
}

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
      authStateListeners = authStateListeners.filter(l => l !== listener)
    }
  }, [])

  return authState
}

// Helper function to get current user without hooks
export const getCurrentUser = async () => {
  if (!globalAuthState.initialized) {
    await initializeAuth()
  }
  return globalAuthState.user
}

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  return !!globalAuthState.user
}

// Cleanup function for app shutdown
export const cleanupAuth = () => {
  if (authSubscription) {
    authSubscription.unsubscribe()
    authSubscription = null
  }
  authStateListeners = []
  globalAuthState = {
    session: null,
    user: null,
    loading: true,
    initialized: false
  }
} 