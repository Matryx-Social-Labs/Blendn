import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
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

import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { APP_COLORS } from '../lib/theme'

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.back()}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color={APP_COLORS.textPrimary} />
          </Pressable>

          {sent ? (
            <View style={styles.done}>
              <Ionicons name="mail-outline" size={40} color={APP_COLORS.textSecondary} />
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
                  <ActivityIndicator color="#1B1931" />
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
  scroll: { paddingHorizontal: 28, paddingBottom: 40, gap: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, marginLeft: -6 },

  placeholderBanner: {
    color: APP_COLORS.destructive,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 8,
  },
  title: { color: APP_COLORS.textPrimary, fontSize: 26, fontWeight: '700', marginTop: 12 },
  body: { color: APP_COLORS.textSecondary, fontSize: 15, lineHeight: 21 },

  field: { gap: 8, marginTop: 8 },
  label: { color: APP_COLORS.textSecondary, fontSize: 13 },
  input: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: APP_COLORS.textPrimary,
    fontSize: 16,
  },

  error: { color: APP_COLORS.destructive, fontSize: 14, lineHeight: 19 },

  primary: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  primaryLabel: { color: '#1B1931', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },

  done: { alignItems: 'center', gap: 14, marginTop: 48, width: '100%' },
})
