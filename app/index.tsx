import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function Index() {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Configure Google Sign In
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
      iosClientId: '438961177346-4sul4brn7h5c773c2mnt1ohqb8bnju7f.apps.googleusercontent.com',
      offlineAccess: true,
    })

    checkAuthStatus()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true)
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices()
      const userInfo = await GoogleSignin.signIn()
      
      if (userInfo.data?.idToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        })
        console.log(error, data)
      } else {
        throw new Error('no ID token present!')
      }
    } catch (error: any) {
      console.error('Google Sign In Error:', error)
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
        console.log('User cancelled sign in')
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // operation (e.g. sign in) is in progress already
        console.log('Sign in already in progress')
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        // play services not available or outdated
        console.log('Google Play Services not available')
      } else {
        // some other error happened
        console.log('Other error:', error)
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  if (isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome to Blendn!</Text>
          <Text style={styles.subtitle}>You are successfully authenticated</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Blendn</Text>
        <Text style={styles.subtitle}>
          Connect with others using secure Google authentication
        </Text>

        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={handleGoogleSignIn}
          style={styles.googleButton}
        />

        <Text style={styles.footerText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  )
}

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
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
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
    width: 250,
    height: 48,
    marginBottom: 30,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#999',
    lineHeight: 16,
  },
})
