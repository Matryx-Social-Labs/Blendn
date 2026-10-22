import { useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Animated from 'react-native-reanimated'

import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { forgotPasswordMessage } from '../lib/signInRefusal'
import { Backdrop, ORB_LEVEL } from '../components/onboarding/Backdrop'
import { CooldownRing } from '../components/onboarding/CooldownRing'
import { Dock } from '../components/ds/Dock'
import { FormHeader } from '../components/onboarding/FormHeader'
import { useRefusedPulse } from '../components/onboarding/useRefusedPulse'
import { useSettleIn } from '../components/onboarding/useSettleIn'
import { Banner } from '../components/ds/Banner'
import { Button } from '../components/ds/Button'
import { GlyphWell } from '../components/ds/StateScreen'
import { TextField } from '../components/ds/TextField'
import { font, useBoldText } from '../components/ds/shared'
import { COLOR, FONT_FAMILY, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { KEYBOARD_BEHAVIOR, useKeyboardShown } from '../lib/keyboard'


/**
 * How long before Resend works again. Long enough that an impatient second
 * tap does not send two mails before the first can arrive, short enough that
 * somebody whose mail really did not come is not left waiting.
 */
const RESEND_COOLDOWN_S = 30

/** The envelope settles in from 0.8 (Flow 1 forgot 03). */
const ENVELOPE_FROM_SCALE = 0.8
/** Past this many characters an address gets its own line, so "If" is never left alone on the first and the address is never broken mid-token. */
const LONG_ADDRESS = 24

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
  // The page has moved under the header: it wears the bar (r7 M11). Per page, so the sent page opens with a clear header.
  const [movedOn, setMovedOn] = useState<{ sent: boolean; y: boolean }>({ sent: false, y: false })
  const scrolled = movedOn.y && movedOn.sent === sent
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setMovedOn({ sent, y: e.nativeEvent.contentOffset.y > 0 })
  /** The server's refusal, or ours when it never answered: a card above the primary. */
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  /** The address is not one: under the field, in its own sentence. */
  const [invalid, setInvalid] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const bold = useBoldText()
  const keyboardUp = useKeyboardShown()
  const settle = useSettleIn(ENVELOPE_FROM_SCALE)
  // One shake, one H.error per refusal, on the button that asked (Resend is its own).
  const { refused, refuse } = useRefusedPulse()
  const { refused: resendRefused, refuse: refuseResend } = useRefusedPulse()
  // The keyboard's "go" and the button can land in one frame; one request.
  const inFlight = useRef(false)

  const address = email.trim().toLowerCase()

  // One tick a second while the cooldown runs, and none after.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  /** Returns whether the request landed. Both the form and Resend use it; a refusal answers on the button that asked. */
  const send = async (asked: 'form' | 'resend'): Promise<boolean> => {
    if (inFlight.current) return false
    const refusedBy = asked === 'form' ? refuse : refuseResend
    if (!address.includes('@')) {
      setInvalid('Enter a valid email address.')
      refusedBy()
      return false
    }

    inFlight.current = true
    setBusy(true)
    setError(null)
    setWaiting(false)
    setInvalid(null)
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
        setError(forgotPasswordMessage(result))
        setWaiting(result.errorCode === 'RATE_LIMITED')
        refusedBy()
        return false
      }
      setCooldown(RESEND_COOLDOWN_S)
      return true
    } catch (e) {
      Logger.error('auth', 'Forgot password request failed', { error: e })
      setError("Couldn’t send the reset link. Try again.")
      refusedBy()
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const submit = async () => {
    if (await send('form')) {
      // The server's yes, once; the envelope settles in as the page changes.
      H.success()
      setSent(true)
    }
  }

  // The outcome plays its success haptic with its toast, as it appears.
  const resend = async () => {
    if (await send('resend')) showToast('Sent again. Give it a minute to arrive.', 'success', { haptic: 'success' })
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
    <View style={styles.root}>
      <Backdrop level={ORB_LEVEL.form} paused={keyboardUp} />
      <FormHeader testID="forgot-header" scrolled={scrolled} />

      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        {sent ? (
          <>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
              {/* The envelope settles in once, on M.settle (Reduce Motion: it fades). */}
              <Animated.View style={[styles.well, settle]}>
                <GlyphWell icon="mail" size="screen" testID="forgot-sent-well" />
              </Animated.View>
              <View style={styles.headline}>
                <Text style={[font('title', bold), styles.title, styles.centre]} accessibilityRole="header">
                  Check your inbox
                </Text>
                <Text style={[font('body', bold), styles.body, styles.centre]} testID="forgot-sent-body">
                  If{address.length > LONG_ADDRESS ? '\n' : ' '}
                  <Text style={[font('body', bold, FONT_FAMILY.brand[700]), styles.address]}>{address}</Text>
                  {address.length > LONG_ADDRESS ? '\n' : ' '}
                  has an account, a reset link is on its way. It opens in your browser and expires in an hour.
                </Text>
              </View>

              {error ? <Banner kind="error" text={error} icon={waiting ? 'clock' : undefined} testID="forgot-error" /> : null}
            </ScrollView>

            <Dock glass={false} keyboardUp={false} testID="forgot-dock">
              <Button label="Open mail app" onPress={() => void openMail()} testID="forgot-open-mail" />

              {/* Counting down: still readable, plainly not ready, and the ring says how long. */}
              <Button
                label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
                kind="secondary"
                onPress={() => void resend()}
                disabled={cooldown > 0}
                loading={busy}
                refused={resendRefused}
                leading={cooldown > 0 ? <CooldownRing left={cooldown} total={RESEND_COOLDOWN_S} testID="forgot-ring" /> : undefined}
                testID="forgot-resend"
              />

              <View style={styles.other}>
                <Button
                  label="Use a different email"
                  kind="tertiary"
                  size="sm"
                  onPress={() => {
                    setSent(false)
                    setError(null)
                  }}
                  testID="forgot-different"
                  style={styles.centred}
                />
              </View>
            </Dock>
          </>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
              <View style={styles.headline}>
                <Text style={[font('title', bold), styles.title]} accessibilityRole="header">
                  Forgot your password?
                </Text>
                <Text style={[font('body', bold), styles.body]}>
                  Enter your email and we’ll send a link to reset it. The link opens in your browser.
                </Text>
              </View>

              <TextField
                label="Email"
                value={email}
                onChangeText={(value) => {
                  setEmail(value)
                  if (invalid) setInvalid(null)
                }}
                error={invalid ?? undefined}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                autoFocus={!email}
                testID="forgot-email"
              />

              {error ? <Banner kind="error" text={error} icon={waiting ? 'clock' : undefined} testID="forgot-error" /> : null}
            </ScrollView>

            <Dock glass={keyboardUp} keyboardUp={keyboardUp} testID="forgot-dock">
              {/* The server's answer plays its own haptic within a second (H.success, or the refusal's H.error), so the press-in is silent. */}
              <Button label="Send reset link" onPress={() => void submit()} loading={busy} refused={refused} pressHaptic={false} testID="forgot-send" />
            </Dock>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  root: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xl, gap: SPACE.lg },
  headline: { gap: SPACE.sm },
  title: { color: COLOR.textPrimary },
  body: { color: COLOR.textSecondary },
  centre: { textAlign: 'center' },
  address: { color: COLOR.textPrimary },
  well: { alignSelf: 'center' },
  other: { alignItems: 'center' },
})
