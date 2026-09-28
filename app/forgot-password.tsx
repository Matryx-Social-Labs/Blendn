import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'

const lockup = require('../assets/logo/lockup-white.png')
// Same lockup, same arithmetic as `sign-in.tsx`: this is the next screen of
// that form and should look like it, not like a different app.
const LOCKUP_ASPECT = (() => {
  const s = Image.resolveAssetSource(lockup)
  return s?.width && s?.height ? s.width / s.height : 816 / 242
})()
const LOCKUP_HEIGHT = 40

/**
 * How long before Resend works again. Long enough that an impatient second
 * tap does not send two mails before the first can arrive, short enough that
 * somebody whose mail really did not come is not left waiting.
 */
const RESEND_COOLDOWN_S = 30

/**
 * Request a password reset link.
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
 *
 * ## After sending
 *
 * "Check your inbox", with the two things somebody does next: open their mail,
 * and ask again when nothing arrives. The address typed on sign-in arrives as
 * a param, so it is not typed twice.
 */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>()
  const { showToast } = useToast()
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const address = email.trim().toLowerCase()

  // One tick a second while the cooldown runs, and none after.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  /** Returns whether the request landed. Both the form and Resend use it. */
  const send = async (): Promise<boolean> => {
    if (!address.includes('@')) {
      setError('Enter a valid email address.')
      return false
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
        return false
      }
      setCooldown(RESEND_COOLDOWN_S)
      return true
    } catch (e) {
      Logger.error('auth', 'Forgot password request failed', { error: e })
      setError("Couldn't send the reset link. Please try again.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (await send()) setSent(true)
  }

  const resend = async () => {
    if (await send()) showToast('Sent again. Give it a minute to arrive.', 'success')
  }

  /*
   * The inbox, not a new message.
   *
   * `message:` opens Mail on iOS at the inbox. Android has no URL for "the
   * inbox", so it falls through to `mailto:`, which opens the mail app the
   * person chose — one tap from their inbox, which is the best a URL can do.
   */
  const openMail = async () => {
    try {
      await Linking.openURL('message:')
      return
    } catch {}
    try {
      await Linking.openURL('mailto:')
    } catch (e) {
      Logger.warn('auth', 'No mail app to open', { error: e })
      showToast('No mail app found. Open your email to find the link.', 'info')
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
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

          {/* Decorative, as on sign-in: the buttons say what the screen does. */}
          <Image
            source={lockup}
            style={styles.lockup}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          {sent ? (
            <View style={styles.sent}>
              <View
                style={styles.iconWell}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons name="mail-outline" size={ICON.lg} color={EMBER.textPrimary} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                Check your inbox
              </Text>
              <Text style={styles.body}>
                If <Text style={styles.address}>{address}</Text> has an account, a reset link is
                on its way. It opens in your browser and expires in an hour.
              </Text>

              {error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}

              <Pressable
                onPress={() => void openMail()}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryLabel}>Open mail app</Text>
              </Pressable>

              <Pressable
                onPress={() => void resend()}
                disabled={busy || cooldown > 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy || cooldown > 0, busy }}
                style={({ pressed }) => [
                  styles.secondary,
                  (pressed || busy) && styles.pressed,
                  cooldown > 0 && styles.waiting,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={EMBER.textSecondary} />
                ) : (
                  <Text style={styles.secondaryLabel}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setSent(false)
                  setError(null)
                }}
                style={styles.linkButton}
                accessibilityRole="button"
              >
                <Text style={styles.link}>USE A DIFFERENT EMAIL</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.headline}>
                <Text style={styles.title} accessibilityRole="header">
                  Forgot your password?
                </Text>
                <Text style={styles.body}>
                  Enter the email you signed up with and we&apos;ll send you a link to set a new
                  one.
                </Text>
              </View>

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
                  onSubmitEditing={() => void submit()}
                  autoFocus={!email}
                />
              </View>

              {error && (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              )}

              <Pressable
                onPress={() => void submit()}
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
  lockup: {
    height: LOCKUP_HEIGHT,
    width: LOCKUP_HEIGHT * LOCKUP_ASPECT,
    maxWidth: '80%',
    alignSelf: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
  },

  headline: { gap: SPACE.sm },
  title: TYPE.title,
  body: { ...TYPE.body, color: EMBER.textSecondary },
  address: { color: EMBER.textPrimary },

  field: { gap: SPACE.sm },
  label: TYPE.label,
  input: {
    height: CONTROL.lg,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
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
  // Dark on the accent, never white — white on the orange fails AA.
  primaryLabel: { ...TYPE.button, color: EMBER.onGradient },
  secondary: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surface,
  },
  secondaryLabel: { ...TYPE.button, color: EMBER.textPrimary },
  // Counting down: still readable, plainly not ready.
  waiting: { opacity: 0.6 },
  pressed: { opacity: 0.85 },

  sent: { gap: SPACE.lg },
  // A decorative well: `surface` fill, `textPrimary` glyph (DESIGN_SYSTEM.md).
  iconWell: {
    width: CONTROL.lg,
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkButton: { alignItems: 'center', paddingVertical: SPACE.md },
  // A text action, so it reads as one: primary, not the grey of a caption.
  link: { ...TYPE.label, color: EMBER.textPrimary },
})
