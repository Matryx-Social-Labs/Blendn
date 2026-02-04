import { FontAwesome6, Ionicons } from '@expo/vector-icons'
import {
  GoogleSignin,
  statusCodes
} from '@react-native-google-signin/google-signin'
import Constants from 'expo-constants'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { signInWithGoogle, useAuth } from '../lib/useAuth'

const logo = require('../assets/logo/logo2.webp')

export default function Index() {
  const { session, user, loading } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  const gradientColors = useMemo(() => (
    ['#FFF4E8', '#F4E9FF', '#EAF7FF', '#FFF0F6'] as const
  ), [])

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
        // Get device info for the backend
        const deviceInfo = {
          platform: Platform.OS,
          device: Constants.deviceName || undefined,
          appVersion: Constants.expoConfig?.version || undefined,
        }

        // Sign in via admin backend
        const result = await signInWithGoogle(userInfo.data.idToken, deviceInfo)

        if (!result.success) {
          console.error('❌ [INDEX] Backend auth error:', result.error)
          throw new Error(result.error || 'Sign in failed')
        }

        console.log('✅ [INDEX] Google Sign In successful', { isNewUser: result.isNewUser })
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

  // Show splash screen while auth is initializing
  if (loading) {
    return (
      <View style={styles.splashContainer}>
        <LinearGradient
          colors={['#480D37', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image source={logo} style={styles.splashLogo} resizeMode="contain" />
      </View>
    )
  }

  // Show sign in screen if not authenticated
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Hero with orbits */}
        <View style={styles.heroContainer}>
          {/* Concentric rings */}
          <View style={[styles.ring, { width: 260, height: 260 }]} />
          <View style={[styles.ring, { width: 330, height: 330 }]} />
          <View style={[styles.ring, { width: 420, height: 420 }]} />

          {/* Center logo */}
          <Image source={logo} style={styles.centerLogo} resizeMode="contain" />

          {/* Floating bubbles around the rings - approximate positions */}
          <View style={[styles.bubble, { top: 10, left: 36 }]}> 
            <LinearGradient colors={["#FFE6D3", "#FFD5ED"]} style={styles.bubbleBg}>
              <Text style={styles.emoji}>🗺️</Text>
            </LinearGradient>
          </View>
          <View style={[styles.bubble, { top: 46, right: 54 }]}> 
            <LinearGradient colors={["#EAF4FF", "#F6E8FF"]} style={styles.bubbleBg}>
              <Ionicons name="location" size={18} color="#8E5CFF" />
            </LinearGradient>
          </View>
          <View style={[styles.bubble, { top: 160, left: 12 }]}> 
            <LinearGradient colors={["#FFF0F6", "#FFE7D8"]} style={styles.bubbleBg}>
              <Text style={styles.emoji}>👩🏻‍🦰</Text>
            </LinearGradient>
          </View>
          <View style={[styles.bubble, { top: 220, right: 20 }]}> 
            <LinearGradient colors={["#EAF7FF", "#F6E9FF"]} style={styles.bubbleBg}>
              <FontAwesome6 name="party-horn" size={16} color="#D96DF6" />
            </LinearGradient>
          </View>
          <View style={[styles.bubble, { bottom: 100, left: 36 }]}> 
            <LinearGradient colors={["#E8E3FF", "#F8E7FF"]} style={styles.bubbleBg}>
              <Text style={styles.emoji}>🌍</Text>
            </LinearGradient>
          </View>
          <View style={[styles.bubble, { bottom: 140, right: 54 }]}> 
            <LinearGradient colors={["#EAF7FF", "#FFECD9"]} style={styles.bubbleBg}>
              <Ionicons name="calendar" size={18} color="#4C7CFB" />
            </LinearGradient>
          </View>
        </View>

        {/* No additional copy to keep focus on centered logo */}

        {/* Bottom copy and CTA */}
        <View style={styles.ctaContainer}>
          <View style={styles.bottomCopyContainer}>
            <Text style={styles.bottomTitle}>Blend'n</Text>
            <Text style={styles.bottomSubtitle}>Same place. Same vibe. Instant connections.</Text>
          </View>
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && { opacity: 0.9 }
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Get Started</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // User is authenticated - show splash while redirecting
  return (
    <View style={styles.splashContainer}>
      <LinearGradient
        colors={['#480D37', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image source={logo} style={styles.splashLogo} resizeMode="contain" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 0,
    backgroundColor: 'transparent',
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: 120,
    height: 120,
  },
  heroContainer: {
    width: '100%',
    height: '60%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 9999,
  },
  sparkleContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  centerLogo: {
    width: 160,
    height: 160,
  },
  bubble: {
    position: 'absolute',
  },
  bubbleBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  emoji: {
    fontSize: 18,
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
  copyContainer: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 24,
  },
  brandLogo: {
    width: 64,
    height: 24,
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  subHeadline: {
    fontSize: 22,
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: '#7F53FF',
    marginTop: 2,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  ctaContainer: {
    width: '100%',
    paddingHorizontal: 24,
    position: 'absolute',
    bottom: 32,
  },
  bottomCopyContainer: {
    alignItems: 'center',
    marginBottom: 32,
    minHeight: 140,
    justifyContent: 'center',
 
  },
  bottomTitle: {
    fontSize: 44,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  bottomSubtitle: {
    fontSize: 32,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 38,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  ctaButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
