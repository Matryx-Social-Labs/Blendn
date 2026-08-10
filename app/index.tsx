import { AntDesign } from '@expo/vector-icons'
import {
  GoogleSignin,
  statusCodes
} from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import Constants from 'expo-constants'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Logger } from '../lib/logger'
import { APP_COLORS } from '../lib/theme'
import { signInWithApple, signInWithGoogle, useAuth } from '../lib/useAuth'

const monogram = require('../assets/logo/monogram-gradient.png')
const lockup = require('../assets/logo/lockup-white.png')

/*
 * Read the real dimensions rather than hardcoding them.
 *
 * Both assets are cropped to their artwork, so their file aspect ratio *is* the
 * logo's aspect ratio — and asking the bundler for it means a re-export can
 * change the art without silently distorting the layout. A hardcoded ratio is a
 * number that is correct exactly once.
 */
const MONOGRAM_ASPECT = (() => {
  const s = Image.resolveAssetSource(monogram)
  return s?.width && s?.height ? s.width / s.height : 1
})()
const LOCKUP_ASPECT = (() => {
  const s = Image.resolveAssetSource(lockup)
  return s?.width && s?.height ? s.width / s.height : 3.37
})()

export default function Index() {
  const { user, loading } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false)
  /*
   * Every failure here used to be `Logger.error` and nothing else: the spinner
   * stopped, the screen did not change, and the user was left to guess. This is
   * the single worst thing about the old screen, and it is why a broken Google
   * client id went unnoticed in production for as long as it did.
   */
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Configure Google Sign In once
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      offlineAccess: true,
    })
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync().then(setAppleSignInAvailable).catch(() => {})
  }, [])

  // Navigation is handled centrally in RootLayout to avoid race conditions/loops

  const handleGoogleSignIn = async () => {
    try {
      setSigningIn(true)
      setError(null)
      Logger.info('auth', 'Starting Google Sign In...')

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
          Logger.error('auth', 'Backend auth error', { error: result.error })
          throw new Error(result.error || 'Sign in failed')
        }

        Logger.info('auth', 'Google Sign In successful', { isNewUser: result.isNewUser })
        // Navigation will happen automatically via useAuth hook
      } else {
        throw new Error('No ID token received from Google')
      }
    } catch (err: any) {
      Logger.error('auth', 'Google Sign In failed', { error: err })

      // Cancelling is a choice, not a failure — saying "something went wrong"
      // when someone deliberately backed out is both wrong and irritating.
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        Logger.info('auth', 'User cancelled sign in')
      } else if (err.code === statusCodes.IN_PROGRESS) {
        Logger.info('auth', 'Sign in already in progress')
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        // Actionable, and nothing we do can fix it — so it gets its own copy
        // rather than the generic message.
        setError('Google Play services needs updating before you can sign in with Google.')
      } else {
        setError("Couldn't sign in with Google. Please try again.")
      }
    } finally {
      setSigningIn(false)
    }
  }

  const handleAppleSignIn = async () => {
    try {
      setSigningIn(true)
      setError(null)
      Logger.info('auth', 'Starting Apple Sign In...')

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple')
      }

      const deviceInfo = {
        platform: Platform.OS,
        device: Constants.deviceName || undefined,
        appVersion: Constants.expoConfig?.version || undefined,
      }

      const result = await signInWithApple(
        credential.identityToken,
        credential.fullName
          ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName }
          : undefined,
        deviceInfo
      )

      if (!result.success) {
        Logger.error('auth', 'Backend auth error', { error: result.error })
        throw new Error(result.error || 'Sign in failed')
      }

      Logger.info('auth', 'Apple Sign In successful', { isNewUser: result.isNewUser })
      // Navigation will happen automatically via useAuth hook
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        Logger.info('auth', 'User cancelled Apple sign in')
      } else {
        Logger.error('auth', 'Apple Sign In failed', { error: err })
        setError("Couldn't sign in with Apple. Please try again.")
      }
    } finally {
      setSigningIn(false)
    }
  }

  /*
   * Auth is still resolving.
   *
   * This used to draw its own `#480D37 -> #000000` gradient, a colour in no
   * palette and no token file, so the user crossed a white system splash into a
   * maroon one into a pastel sign-in. It now renders nothing but the root
   * background, which is the same black the native splash just showed — so the
   * handoff is invisible rather than a third colour.
   */
  if (loading) {
    return (
      <View style={styles.splashContainer}>
        <Image source={monogram} style={styles.splashLogo} resizeMode="contain" />
      </View>
    )
  }

  /*
   * Signed out.
   *
   * The previous version was a pastel gradient carrying six absolutely
   * positioned emoji bubbles and three fixed-diameter rings, at literal pixel
   * offsets eyeballed against one device. It contradicted every other screen in
   * the app, which is pure black, and it broke on any other screen size.
   *
   * What replaced it is deliberately plain: the mark, the name, and the ways in.
   * The brand colour arrives through the monogram rather than through a button,
   * because Google's mark has to sit on Google's chrome and Apple's button is
   * Apple's — a third brand-orange pill would make this a paint sample.
   */
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.brandBlock}>
          <Image source={monogram} style={styles.monogram} resizeMode="contain" />
          <Image source={lockup} style={styles.lockup} resizeMode="contain" />
          <Text style={styles.tagline}>Same place. Same vibe. Instant connections.</Text>
        </View>

        <View style={styles.actions}>
          {/*
            * Announced to screen readers as an alert, so someone mid-gesture is
            * told rather than left waiting. A toast would auto-dismiss and be
            * missed entirely.
            */}
          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          {/*
            * "Continue with Google", not "Get Started".
            *
            * The old label was a black pill wired to Google with no Google
            * branding anywhere on it. That is three problems: it breaks Google's
            * sign-in branding requirements, it is deceptive — a user expecting a
            * signup form gets an account chooser for an identity they may not
            * want to use — and once email sign-in exists it is ambiguous between
            * three different flows.
            */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            style={({ pressed }) => [
              styles.googleButton,
              (pressed || signingIn) && styles.pressed,
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <AntDesign name="google" size={18} color="#1F1F1F" style={styles.googleMark} />
                <Text style={styles.googleLabel}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {Platform.OS === 'ios' && appleSignInAvailable && (
            /*
             * WHITE, not BLACK. The button was BLACK, which was invisible the
             * moment the background stopped being a pastel gradient — a real bug
             * the old design was hiding rather than avoiding.
             */
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={28}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          <Text style={styles.legal}>
            By continuing you agree to our Terms and Privacy Policy.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // Authenticated — held here for the frame or two the root layout takes to
  // decide where to send them. Same black, so nothing flashes on the way out.
  return (
    <View style={styles.splashContainer}>
      <Image source={monogram} style={styles.splashLogo} resizeMode="contain" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    // Transparent so the root BackgroundGradient shows through, rather than
    // this screen owning a fourth background of its own.
    backgroundColor: 'transparent',
  },
  splashContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  splashLogo: {
    height: 120,
    aspectRatio: MONOGRAM_ASPECT,
  },

  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    width: '100%',
  },
  monogram: {
    height: 104,
    aspectRatio: MONOGRAM_ASPECT,
  },
  // Percentage width plus aspectRatio, so it scales with the screen instead of
  // being pinned to numbers measured on one device.
  lockup: {
    width: '62%',
    aspectRatio: LOCKUP_ASPECT,
  },
  tagline: {
    color: APP_COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },

  actions: {
    width: '100%',
    gap: 12,
    paddingBottom: 8,
  },
  error: {
    color: APP_COLORS.destructive,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 4,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
  googleMark: {
    marginRight: 2,
  },
  googleLabel: {
    color: '#1F1F1F',
    fontSize: 16,
    fontWeight: '500',
  },
  appleButton: {
    width: '100%',
    height: 56,
  },
  pressed: {
    opacity: 0.85,
  },
  legal: {
    color: APP_COLORS.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 8,
  },
})
