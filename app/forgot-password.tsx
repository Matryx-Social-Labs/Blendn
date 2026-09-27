import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'

/**
 * Request a password reset link.
 *
 * ## DESIGN IS A PLACEHOLDER — LOGIC IS NOT
 *
 * The behaviour below is deliberate and must survive a redesign; the layout is
 * a functional stand-in. See `docs/PLACEHOLDER_SCREENS.md`.
 *
 * ## The confirmation is deliberately unconditional
 *
 * The server answers identically whether or not the address has an account, so
 * that this endpoint cannot be used to find out who is registered. This screen
 * has to preserve that: showing "no account with that email" would hand back
 * exactly the answer the server refused to give, and would undo the protection
 * entirely from the client side.
 *
 * So the confirmation says "if that address has an account" and means it.
 *
 * ## Where the link goes
 *
 * To the web reset page, opened in a browser. Deep-linking it into the app
 * needs associated domains, DNS and a native rebuild — and an https link is
 * required regardless, because a custom scheme is unreliable in mail clients
 * and dead if the app is not installed. Completing a reset revokes every
 * refresh token for that user, so all their devices are signed out.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const address = email.trim().toLowerCase()
    if (!address.includes('@')) {
      setError('Enter a valid email address.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await apiClient.forgotPassword(address)
      /*
       * A failure here is a transport or rate-limit failure, not "no such
       * account" — the route returns `ok` for an unknown address. Worth
       * surfacing, because silently claiming the mail is on its way when the
       * request never landed is the one outcome that leaves someone waiting
       * forever.
       */
      if (!result.success) {
        setError(result.error || "Couldn't send the reset link. Please try again.")
        return
      }
      setSent(true)
    } catch (e) {
      Logger.error('auth', 'Forgot password request failed', { error: e })
      setError("Couldn't send the reset link. Please try again.")
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.back()}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>

          {sent ? (
            <View style={styles.done}>
              <Ionicons name="mail-outline" size={40} color={EMBER.textSecondary} />
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.body}>
                If that address has an account, a reset link is on its way. The link opens in your
                browser and expires in an hour.
              </Text>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryLabel}>Back to sign in</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.placeholderBanner}>
                PLACEHOLDER DESIGN — logic is final, layout is not
              </Text>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.body}>
                Enter the email you signed up with and we&apos;ll send you a link to set a new
                password.
              </Text>

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
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
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
                  <Text style={styles.primaryLabel}>Send reset link</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  back: { alignSelf: 'flex-start', paddingVertical: SPACE.sm, marginLeft: -SPACE.xs },

  placeholderBanner: { ...TYPE.label, color: EMBER.destructive, marginTop: SPACE.sm },
  title: { ...TYPE.display, marginTop: SPACE.md },
  body: { ...TYPE.body, color: EMBER.textSecondary },

  field: { gap: SPACE.sm, marginTop: SPACE.sm },
  label: TYPE.label,
  input: {
    height: CONTROL.lg,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.input,
    paddingHorizontal: SPACE.xl,
    ...TYPE.body,
  },

  error: { ...TYPE.meta, color: EMBER.destructive },

  primary: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    marginTop: SPACE.sm,
  },
  primaryLabel: { ...TYPE.button, color: EMBER.onGradient },
  pressed: { opacity: 0.85 },

  done: { alignItems: 'center', gap: SPACE.md, marginTop: SPACE.xxxl, width: '100%' },
})
