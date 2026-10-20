import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { LegalLine } from '../components/LegalLine'
import { Logger } from '../lib/logger'
import { AUTH_FORM_STYLES, AUTH_LOCKUP, currentDeviceInfo } from '../components/onboarding/authForm'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { EmberButton } from '../components/onboarding/EmberControls'
import { EMBER, ICON, MAX_FONT_SCALE, SPACE, TYPE } from '../lib/theme'
import { signInWithEmail, signUp } from '../lib/useAuth'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'
import { accountAgeError } from '../lib/onboarding'
import { PendingInvite } from '../components/friends/PendingInvite'


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
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const ageRef = useRef<TextInput>(null)
  /*
   * A ref as well as `busy`: the keyboard's "go" and the button can land in
   * the same frame, and both read the `busy` of the render before either set
   * it — two sign-ups, and the second one's "already registered" shown over
   * an account that had just been created.
   */
  const inFlight = useRef(false)
  /*
   * Why they are here, when the server signed them out: the entry screen hands
   * its notice on. Without it, somebody signed out mid-use who chose email
   * met a blank form and had to guess whether they had done something wrong.
   */
  const params = useLocalSearchParams<{ notice?: string }>()
  const notice = typeof params.notice === 'string' && params.notice ? params.notice : null

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
    if (inFlight.current) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const deviceInfo = currentDeviceInfo()

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
      inFlight.current = false
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
            source={AUTH_LOCKUP}
            style={styles.lockup}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <PendingInvite />

          {notice && !error ? (
            <Text style={styles.notice} accessibilityRole="alert">
              {notice}
            </Text>
          ) : null}

          {/* Two tabs over one form: the design system's segmented control (it plays H.select on landing, and slides on M.snap). */}
          <View style={styles.modeSwitch}>
            <SegmentedControl
              items={MODE_LABELS}
              selected={isSignup ? 1 : 0}
              onChange={(i) => switchMode(i === 0 ? 'signin' : 'signup')}
              disabled={busy}
              testID="sign-in-mode"
            />
          </View>

          {/*
            One order for the keyboard to walk: name, email, password, then
            age last, whose "go" submits. Age sat second, between two text
            fields, so Next on the name opened a number pad and Next on the
            number pad (which has none on iOS) was a dead end.
          */}
          {isSignup && (
            <View style={styles.field}>
              <Text style={styles.label}>NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="What should we call you?"
                placeholderTextColor={EMBER.textPlaceholder}
                accessibilityLabel="Name"
                maxFontSizeMultiplier={MAX_FONT_SCALE.button}
                autoCapitalize="words"
                // A name is not a word to correct.
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => emailRef.current?.focus()}
                maxLength={100}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              ref={emailRef}
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={EMBER.textPlaceholder}
              accessibilityLabel="Email"
              maxFontSizeMultiplier={MAX_FONT_SCALE.button}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                placeholderTextColor={EMBER.textPlaceholder}
                accessibilityLabel="Password"
                maxFontSizeMultiplier={MAX_FONT_SCALE.button}
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
                // Sign-in ends here; sign-up goes on to the age.
                returnKeyType={isSignup ? 'next' : 'go'}
                submitBehavior={isSignup ? 'submit' : 'blurAndSubmit'}
                onSubmitEditing={isSignup ? () => ageRef.current?.focus() : () => void submit()}
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

          {isSignup && (
            <View style={styles.field}>
              {/* Required: Blend'n is 18+ (SCRUM-330). */}
              <Text style={styles.label}>AGE</Text>
              <TextInput
                ref={ageRef}
                style={styles.input}
                value={age}
                onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))}
                placeholder="You must be 18 or over"
                placeholderTextColor={EMBER.textPlaceholder}
                accessibilityLabel="Age"
                maxFontSizeMultiplier={MAX_FONT_SCALE.button}
                keyboardType="number-pad"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                maxLength={3}
              />
            </View>
          )}

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          <EmberButton
            label={isSignup ? 'Create account' : 'Sign in'}
            onPress={() => void submit()}
            busy={busy}
            style={styles.primary}
          />

          {!isSignup && (
            <Pressable
              // The address typed here goes with them, so it is not typed twice.
              onPress={() =>
                router.push(
                  trimmedEmail
                    ? { pathname: '/forgot-password', params: { email: trimmedEmail } }
                    : '/forgot-password'
                )
              }
              style={styles.linkButton}
              accessibilityRole="button"
            >
              <Text style={styles.link}>FORGOT YOUR PASSWORD?</Text>
            </Pressable>
          )}

          {isSignup && (
            <LegalLine lead="By creating an account you" style={styles.legal} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const MODE_LABELS = ['Sign in', 'Create account'] as const

const styles = StyleSheet.create({
  ...AUTH_FORM_STYLES,
  modeSwitch: { marginBottom: SPACE.sm },

  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: SPACE.xxxl },
  reveal: { position: 'absolute', right: SPACE.lg, padding: SPACE.xs },

  legal: { marginTop: SPACE.xs },
  notice: { ...TYPE.meta, color: EMBER.textSecondary, textAlign: 'center' },
})
