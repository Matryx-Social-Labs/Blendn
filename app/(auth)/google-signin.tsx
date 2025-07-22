import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

export default function GoogleSignIn() {
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    initializeGoogleSignin()
  }, [])

  const initializeGoogleSignin = async () => {
    try {
      await GoogleSignin.hasPlayServices()
      setInitializing(false)
    } catch (error) {
      console.error('Google Play Services not available:', error)
      Alert.alert(
        'Error',
        'Google Play Services is required for Google Sign In'
      )
      setInitializing(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)

    try {
      // Check if device supports Google Play Services
      await GoogleSignin.hasPlayServices()

      // Get the user's ID token
      const userInfo = await GoogleSignin.signIn()
      console.log('Google Sign In Response:', userInfo)
      
      // The idToken is in userInfo.data for newer versions or userInfo.idToken for older versions
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken
      
      if (idToken) {
        // Sign in with Supabase using Google ID token
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        })

        if (error) {
          Alert.alert('Authentication Error', error.message)
        } else if (data.user) {
          // Check if user has completed onboarding
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('onboarded')
            .eq('id', data.user.id)
            .single()

          if (profileError) {
            console.error('Error checking profile:', profileError)
            // If profile doesn't exist, it will be created by the trigger
            // Route to onboarding
            router.replace('/onboarding/welcome' as any)
          } else {
            // Successfully authenticated and profile exists
            if (profile.onboarded) {
              // User has completed onboarding, go to main app
                                router.replace('/(tabs)/events' as any)
            } else {
              // User needs to complete onboarding
              router.replace('/onboarding/welcome' as any)
            }
          }
        }
      } else {
        Alert.alert('Error', 'Failed to get Google ID token')
      }
    } catch (error: any) {
      console.error('Google Sign In Error:', error)
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled the sign-in process
        console.log('User cancelled sign in')
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('Error', 'Sign in already in progress')
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available')
      } else {
        Alert.alert('Error', 'Something went wrong with Google Sign In')
      }
    } finally {
      setLoading(false)
    }
  }

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Initializing Google Sign In...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign in with Google</Text>
        <Text style={styles.subtitle}>
          Use your Google account to sign in securely
        </Text>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <View style={styles.buttonContent}>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.buttonText}>Sign in with Google</Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// Import status codes for error handling
import { statusCodes } from '@react-native-google-signin/google-signin'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
    lineHeight: 22,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    backgroundColor: '#fff',
    color: '#4285F4',
    width: 24,
    height: 24,
    textAlign: 'center',
    lineHeight: 24,
    borderRadius: 12,
    fontWeight: 'bold',
    marginRight: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    padding: 10,
  },
  backButtonText: {
    color: '#4285F4',
    fontSize: 16,
  },
}) 