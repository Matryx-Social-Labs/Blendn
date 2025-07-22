import { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface AuthState {
  session: Session | null
  loading: boolean
  isOnboarded: boolean | null
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    session: null,
    loading: true,
    isOnboarded: null,
  })

  useEffect(() => {
    checkAuthAndOnboarding()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event)
        if (session) {
          const isOnboarded = await checkOnboardingStatus(session)
          setAuthState({
            session,
            loading: false,
            isOnboarded,
          })
        } else {
          setAuthState({
            session: null,
            loading: false,
            isOnboarded: null,
          })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const checkAuthAndOnboarding = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        const isOnboarded = await checkOnboardingStatus(session)
        setAuthState({
          session,
          loading: false,
          isOnboarded,
        })
      } else {
        setAuthState({
          session: null,
          loading: false,
          isOnboarded: null,
        })
      }
    } catch (error) {
      console.error('Error checking auth and onboarding:', error)
      setAuthState({
        session: null,
        loading: false,
        isOnboarded: null,
      })
    }
  }

  const checkOnboardingStatus = async (session: Session): Promise<boolean> => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', session.user.id)
        .single()

      if (error) {
        console.error('Error checking onboarding status:', error)
        return false
      }

      return profile.onboarded || false
    } catch (error) {
      console.error('Error in checkOnboardingStatus:', error)
      return false
    }
  }

  return authState
}

export default useAuth 