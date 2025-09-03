import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

const logo = require('../assets/logo/ios-dark.png')

export default function Index() {
  const { session, user, loading } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    // Configure Google Sign In once
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      offlineAccess: true,
    })
  }, [])

  // Navigation is handled centrally in RootLayout to avoid race conditions/loops

  const handleGoogleSignIn = async () => {
    try {
      setSigningIn(true)
      console.log('🔐 [INDEX] Starting Google Sign In...')
      
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      }
      const userInfo = await GoogleSignin.signIn()
      
      if (userInfo.data?.idToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        })
        
        if (error) {
          console.error('❌ [INDEX] Supabase auth error:', error)
          throw error
        }
        
        console.log('✅ [INDEX] Google Sign In successful')
        // Navigation will happen automatically via useAuth hook
      } else {
        throw new Error('No ID token received from Google')
      }
    } catch (error: any) {
      console.error('❌ [INDEX] Google Sign In failed:', error)
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('🔐 [INDEX] User cancelled sign in')
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('🔐 [INDEX] Sign in already in progress')
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('🔐 [INDEX] Play services not available')
      } else {
        console.error('🔐 [INDEX] Unknown sign in error:', error)
      }
    } finally {
      setSigningIn(false)
    }
  }

  // Show loading while auth is initializing
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    )
  }

  // Show sign in screen if not authenticated
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.logoContainer}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.tagline}>Connect with people at events</Text>
        
        <GoogleSigninButton
          style={styles.googleButton}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={handleGoogleSignIn}
          disabled={signingIn}
        />
        
        {signingIn && (
          <View style={styles.signingInContainer}>
            <ActivityIndicator size="small" />
            <Text style={styles.signingInText}>Signing in...</Text>
          </View>
        )}
      </SafeAreaView>
    )
  }

  // This should not be reached due to navigation in useEffect
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ActivityIndicator size="large" />
      <Text style={styles.loadingText}>Redirecting...</Text>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 60,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    marginBottom: 32,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  googleButton: {
    width: 250,
    height: 48,
  },
  signingInContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  signingInText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#666',
  },
})
