import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'
import { signInWithEmail, signUp } from '../lib/useAuth'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'
import { accountAgeError } from '../lib/onboarding'

const lockup = require('../assets/logo/lockup-white.png')
/*
 * Fixed height, width derived from the file. Not `width: '<pct>%'` plus
 * `aspectRatio` — that combination rendered the lockup several times too large
 * on device, overflowing the screen, because a percentage width resolving
 * against a percentage-width parent inside a flex column did not match the
 * arithmetic. A number for the height removes the ambiguity.
 */
const LOCKUP_ASPECT = (() => {
  const s = Image.resolveAssetSource(lockup)
  return s?.width && s?.height ? s.width / s.height : 816 / 242
})()
const LOCKUP_HEIGHT = 40

/**
 * Email sign-in and account creation.
 *
 * ## DESIGN IS A PLACEHOLDER — LOGIC IS NOT
 *
 * Every field, rule, error path and endpoint here is deliberate and should
 * survive a redesign. Nothing about how it *looks* is decided: no type ramp, no
 * spacing system, no brand colour beyond the ink-on-white button. It is a
 * functional stand-in so the flow can be exercised end to end and handed over.
 *
 * `docs/PLACEHOLDER_SCREENS.md` has the per-screen brief — what must not break
 * and why, and what is still missing.
 *
 * ## Why one screen and not two
 *
 * The two flows differ by one field and one endpoint. Two screens would double
 * the layout, the validation and the error handling to save a user a single
 * tap, and would need a way to move between them anyway.
 *
 * ## The plumbing already existed
 *
 * `signInWithEmail` and `signUp` have been in `lib/useAuth.ts` since the app was
 * built, calling endpoints that have been live for months. Neither had a single
 * caller. This screen is the caller — no auth logic is added here, and none
 * needed changing.
 *
 * Navigation is deliberately absent: the root layout's routing effect sees the
 * new auth state and moves the user itself, the same way the Google and Apple
 * paths work. Navigating from here as well would race it.
 */

/*
 * Mirrors `MIN_PASSWORD_LENGTH` in the API's `lib/password.ts`.
 *
 * A courtesy, not the rule. The server checks this and more — it also rejects
 * obvious choices and passwords built from the address — and it is the only
 * check that counts. This exists so someone typing eight characters is told
 * before a round trip, rather than after.
 */
const MIN_PASSWORD_LENGTH = 12

type Mode = 'signin' | 'signup'

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSignup = mode === 'signup'
  /*
   * The selected segment's background slides between the two rather than
   * jumping: 200ms ease-in-out, a movement on screen, on the UI thread. It is
   * one absolute, childless view under the labels, so only a transform moves.
   * Reduce Motion: it is simply under the selected one.
   */
  const reduceMotion = useReducedMotion()
  const [segmentWidth, setSegmentWidth] = useState(0)
  const thumbX = useSharedValue(0)
  useEffect(() => {
    const target = isSignup ? segmentWidth : 0
    thumbX.set(reduceMotion ? target : withTiming(target, { duration: 200, easing: SEGMENT_EASE }))
  }, [isSignup, segmentWidth, reduceMotion, thumbX])
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.get() }] }))
  const trimmedEmail = email.trim().toLowerCase()

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    // Errors belong to the attempt that produced them. Carrying "wrong
    // password" across to the signup form would be nonsense.
    setError(null)
  }

  const validate = (): string | null => {
    if (!trimmedEmail.includes('@')) return 'Enter a valid email address.'
    if (isSignup && !name.trim()) return 'Enter your name.'
    if (isSignup) {
      const ageProblem = accountAgeError(age, { required: true })
      if (ageProblem) return ageProblem
    }
    if (!password) return 'Enter your password.'
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters. Length beats symbols.`
    }
    return null
  }

  const submit = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const deviceInfo = {
        platform: Platform.OS,
        device: Constants.deviceName || undefined,
        appVersion: Constants.expoConfig?.version || undefined,
      }

      /*
       * Required, 18 or over, on the form and on the server: Blend'n is 18+
       * (SCRUM-330). `validate` has already refused a blank or under-18 age,
       * so this parse is of a number it checked. Google and Apple accounts
       * have no age and are held at "The basics" until a birth date is given.
       */
      const years = Number(age.trim())

      const result = isSignup
        ? await signUp(trimmedEmail, password, name.trim(), deviceInfo, years)
        : await signInWithEmail(trimmedEmail, password, deviceInfo)

      if (!result.success) {
        /*
         * Surface the server's message rather than a generic one. Signup
         * failures are specific and actionable — "that email is already
         * registered", or the password rule that was broken — and replacing
         * them with "something went wrong" would make the form unusable.
         */
        setError(result.error || (isSignup ? "Couldn't create your account." : "Couldn't sign you in."))
        return
      }
      // Both cases: the root layout's routing effect takes it from here. A new
      // account starts onboarding, a returning one resumes wherever it stopped
      // or goes to the events tab.
    } catch (e) {
      Logger.error('auth', 'Email auth failed', { error: e })
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_BEHAVIOR}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.back()}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>

          {/*
            Decorative. The wordmark is a picture of the product's name, and
            the name is not what somebody needs read to them here — the buttons
            below say what this screen does. Announced, it is one more stop
            before the first thing you can act on.
          */}
          <Image
            source={lockup}
            style={styles.lockup}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View
            style={styles.segmented}
            onLayout={(e) => setSegmentWidth((e.nativeEvent.layout.width - SEGMENTED_PADDING * 2) / 2)}
          >
            {segmentWidth > 0 ? (
              <Animated.View pointerEvents="none" style={[styles.segmentThumb, { width: segmentWidth }, thumbStyle]} />
            ) : null}
            {(['signin', 'signup'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                style={styles.segment}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              </Pressable>
            ))}
          </View>

          {isSignup && (
            <View style={styles.field}>
              <Text style={styles.label}>NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="What should we call you?"
                placeholderTextColor={EMBER.textPlaceholder}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                maxLength={100}
              />
            </View>
          )}

          {isSignup && (
            <View style={styles.field}>
              {/* Required: Blend'n is 18+ (SCRUM-330). */}
              <Text style={styles.label}>AGE</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
                placeholder="You must be 18 or over"
                placeholderTextColor={EMBER.textPlaceholder}
                keyboardType="number-pad"
                returnKeyType="next"
                maxLength={3}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={EMBER.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                placeholderTextColor={EMBER.textPlaceholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                /*
                 * `newPassword` on signup so the keychain offers to generate and
                 * save one, `password` on sign-in so it offers the saved one.
                 * Getting this wrong is why password managers so often fail to
                 * fill on React Native.
                 */
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                textContentType={isSignup ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.reveal}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={ICON.md}
                  color={EMBER.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={EMBER.onGradient} />
            ) : (
              <Text style={styles.primaryLabel}>{isSignup ? 'Create account' : 'Sign in'}</Text>
            )}
          </Pressable>

          {!isSignup && (
            <Pressable
              onPress={() => router.push('/forgot-password')}
              style={styles.linkButton}
              accessibilityRole="button"
            >
              <Text style={styles.link}>FORGOT YOUR PASSWORD?</Text>
            </Pressable>
          )}

          {isSignup && (
            <Text style={styles.legal}>
              By creating an account you agree to our Terms and Privacy Policy.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const SEGMENTED_PADDING = SPACE.xs
const SEGMENT_EASE = Easing.bezier(0.77, 0, 0.175, 1)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  back: { alignSelf: 'flex-start', paddingVertical: SPACE.sm, marginLeft: -SPACE.xs },
  lockup: {
    height: LOCKUP_HEIGHT,
    width: LOCKUP_HEIGHT * LOCKUP_ASPECT,
    maxWidth: '80%',
    alignSelf: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
  },

  segmented: {
    flexDirection: 'row',
    height: CONTROL.md,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.pill,
    padding: SEGMENTED_PADDING,
    marginBottom: SPACE.sm,
  },
  segment: { flex: 1, borderRadius: EMBER_RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  segmentThumb: {
    position: 'absolute',
    top: SEGMENTED_PADDING,
    bottom: SEGMENTED_PADDING,
    left: SEGMENTED_PADDING,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  segmentText: { ...TYPE.bodyStrong, color: EMBER.textSecondary },
  segmentTextActive: { color: EMBER.textPrimary },

  field: { gap: SPACE.sm },
  label: TYPE.label,
  input: {
    height: CONTROL.lg,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.input,
    paddingHorizontal: SPACE.xl,
    ...TYPE.body,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: SPACE.xxxl },
  reveal: { position: 'absolute', right: SPACE.lg, padding: SPACE.xs },

  error: { ...TYPE.meta, color: EMBER.destructive },

  primary: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    marginTop: SPACE.sm,
  },
  // Dark on the accent, never white — white on the orange fails AA.
  primaryLabel: { ...TYPE.button, color: EMBER.onGradient },
  pressed: { opacity: 0.85 },

  linkButton: { alignItems: 'center', paddingVertical: SPACE.md },
  link: TYPE.label,
  legal: {
    ...TYPE.meta,
    color: EMBER.textTertiary,
    textAlign: 'center',
    marginTop: SPACE.xs,
  },
})
