import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import React, { useState } from 'react'
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
import { SafeAreaView } from 'react-native-safe-area-context'

import { Logger } from '../lib/logger'
import { APP_COLORS } from '../lib/theme'
import { signInWithEmail, signUp } from '../lib/useAuth'

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
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSignup = mode === 'signup'
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

      const result = isSignup
        ? await signUp(trimmedEmail, password, name.trim(), deviceInfo)
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
      // Success: the root layout's routing effect takes it from here.
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            <Ionicons name="chevron-back" size={26} color={APP_COLORS.textPrimary} />
          </Pressable>

          <Image source={lockup} style={styles.lockup} resizeMode="contain" />

          <Text style={styles.placeholderBanner}>
            PLACEHOLDER DESIGN — logic is final, layout is not
          </Text>

          <View style={styles.segmented}>
            {(['signin', 'signup'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                style={[styles.segment, mode === m && styles.segmentActive]}
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
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="What should we call you?"
                placeholderTextColor={APP_COLORS.textTertiary}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                maxLength={100}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={APP_COLORS.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                placeholderTextColor={APP_COLORS.textTertiary}
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
                  size={20}
                  color={APP_COLORS.textSecondary}
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
              <ActivityIndicator color="#1B1931" />
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
              <Text style={styles.link}>Forgot your password?</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, paddingBottom: 40, gap: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, marginLeft: -6 },
  lockup: {
    height: LOCKUP_HEIGHT,
    width: LOCKUP_HEIGHT * LOCKUP_ASPECT,
    maxWidth: '80%',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
  },

  placeholderBanner: {
    color: APP_COLORS.destructive,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: APP_COLORS.backgroundCard },
  segmentText: { color: APP_COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
  segmentTextActive: { color: APP_COLORS.textPrimary },

  field: { gap: 8 },
  label: { color: APP_COLORS.textSecondary, fontSize: 13 },
  input: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: APP_COLORS.textPrimary,
    fontSize: 16,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  reveal: { position: 'absolute', right: 14, padding: 4 },

  error: {
    color: APP_COLORS.destructive,
    fontSize: 14,
    lineHeight: 19,
  },

  primary: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  // Ink on light, never white — white on the brand orange is 3.4:1 and fails
  // AA, and the same reasoning applies to any light button.
  primaryLabel: { color: '#1B1931', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },

  linkButton: { alignItems: 'center', paddingVertical: 12 },
  link: { color: APP_COLORS.textSecondary, fontSize: 14 },
  legal: {
    color: APP_COLORS.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 4,
  },
})
