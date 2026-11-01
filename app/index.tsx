import { ScreenProfiler } from '../lib/perf'
import { googleSignInConfig } from '../lib/googleConfig'
import {
  GoogleSignin,
  statusCodes
} from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import { router } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { currentDeviceInfo } from '../components/onboarding/authForm'
import { Backdrop, ORB_LEVEL } from '../components/onboarding/Backdrop'
import { Dock } from '../components/ds/Dock'
import { GoogleMark } from '../components/onboarding/GoogleMark'
import FadeInUp from '../components/motion/FadeInUp'
import ScalePress from '../components/motion/ScalePress'
import { DiscMark } from '../components/ds/DiscMark'
import { Spinner } from '../components/ds/Loader'
import { font, PRESSED_WASH, useBoldText, useLargeText, useAnnounced } from '../components/ds/shared'
import { Icon } from '../components/ui/Icon'
import { LegalLine } from '../components/LegalLine'
import { Logger } from '../lib/logger'
import { COLOR, DURATION, FONT_FAMILY, ICON, MAX_FONT_SCALE, PRESS, RADIUS, RISE, SIZE, SPACE, STAGGER } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'
import { setAccountState, useAccountState } from '../lib/accountState'
import { pendingEventId, pendingEventLink } from '../lib/pendingRoute'
import { accountRefusalOf, SESSION_END_NOTICE } from '../lib/sessionEnd'
import { consumeSessionEnd } from '../lib/sessionEvents'
import { socialSignInMessage } from '../lib/signInRefusal'
import { retryAuth, signInWithApple, signInWithGoogle, useAuth } from '../lib/useAuth'
import { PendingInvite } from '../components/friends/PendingInvite'
import { AccountStateScreen } from '../components/system/AccountStateScreen'
import { SystemScreen } from '../components/system/SystemScreen'
import { backByLabel, outageNote } from '../lib/outage'
import { useReducedMotion } from '../lib/motion'
import { useAutoRetry } from '../lib/useAutoRetry'
import { HeldLink } from '../components/system/HeldLink'
import { INTRO_DOCK_AT_MS, IntroLights, IntroMark, IntroWordmark, useIntroDock, useIntroLine, useIntroProgress } from '../components/onboarding/LandingIntro'

/** The mark alone, used only on the brief holding state (Flow 1 landing 08). */
const MONOGRAM_HEIGHT = 96
/** The mark starts at 17% of the screen's height, so the lights have room above it and the words clear the dock. */
const LOCKUP_TOP = 0.17
/** The landing's mark: large at an ordinary size, smaller where the words need the room. */
const INTRO_MARK_HEIGHT = 118
const INTRO_MARK_HEIGHT_LARGE = 72
/** At the accessibility sizes the lockup gives up most of its top room, so the tagline stays clear of the dock (audit A7). */
const LOCKUP_TOP_LARGE = 0.06
/** Under Reduce Motion the resting frame is already there, so the buttons do not wait for it (motion #1). */
const ENTRANCE_AT_REDUCED = 200

/*
 * Google's own button chrome — white fill, #1F1F1F ink — from its sign-in
 * branding guidelines. Brand colours, not ours, so they stay literal.
 */
// design-exception: Google sign-in button fill, per Google's branding guidelines
const GOOGLE_FILL = '#FFFFFF'
// design-exception: Google sign-in button text and mark, per Google's branding guidelines
const GOOGLE_INK = '#1F1F1F'

function IndexInner() {
  const { user, loading, unreachable, outage } = useAuth()
  // An account the server refused: a screen of its own, with no sign-in buttons on it (Flow 15 15.1 to 15.3).
  const accountState = useAccountState()
  const bold = useBoldText()
  const largeText = useLargeText()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const intro = useIntroProgress()
  const introLine = useIntroLine(intro)
  const introDock = useIntroDock(intro)
  const brandTop = window.height * (largeText ? LOCKUP_TOP_LARGE : LOCKUP_TOP)
  const markHeight = largeText ? INTRO_MARK_HEIGHT_LARGE : INTRO_MARK_HEIGHT
  /*
   * Which provider is in flight, not just whether one is. With one boolean,
   * tapping Apple put Google's button into its spinner — the wrong button
   * said it was working. Every way in is still off while either runs.
   */
  const [signingIn, setSigningIn] = useState<'google' | 'apple' | null>(null)
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
    GoogleSignin.configure(googleSignInConfig())
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync().then(setAppleSignInAvailable).catch(() => {})
  }, [])

  /*
   * Why they are looking at this screen, when the server put them here.
   *
   * A refresh token the server refused clears the session from a background
   * call, and the phone is at this screen the next morning with no
   * explanation. Same slot as a sign-in failure — it is the same kind of news.
   */
  const [notice, setNotice] = useState<string | null>(null)
  useAnnounced(error || notice)
  useEffect(() => {
    if (user || loading || unreachable) return
    consumeSessionEnd().then((end) => {
      if (!end) return
      const { reason, sentence } = end
      // Suspended, a staff account, a deleted one: not a notice over the sign-in buttons but a screen (Flow 15 15.1 to 15.3).
      if (reason === 'suspended' || reason === 'staff' || reason === 'deleted') return setAccountState({ kind: reason, sentence })
      // Signed out elsewhere, a password reset: the reason, in the dock (15.4). Otherwise the server's sentence, or the generic line.
      setNotice(reason === 'expired' && sentence ? sentence : SESSION_END_NOTICE[reason])
    })
  }, [user, loading, unreachable])

  // Navigation is handled centrally in RootLayout to avoid race conditions/loops

  /** How many times the can't-reach screen has tried, by hand or by itself ("Tried 2×"). */
  const [tries, setTries] = useState(0)
  /** Try again on the unreachable screen: a second failure is answered once (the first was the primary's press-in). */
  const retrying = useRef(false)
  /** One try at a time, by hand or by itself: a second while one runs is dropped, not stacked. */
  const attempt = async () => {
    if (retrying.current) return null
    retrying.current = true
    try {
      const state = await retryAuth()
      setTries((n) => n + 1)
      return state
    } finally {
      retrying.current = false
    }
  }
  const tryAgain = async () => {
    const state = await attempt()
    if (state?.unreachable) H.error()
  }
  // It keeps trying by itself, silently (Flow 15 15.13): no haptic, the button spins as it does for a hand's try.
  useAutoRetry(unreachable, attempt)

  const handleGoogleSignIn = async () => {
    if (signingIn) return
    try {
      setSigningIn('google')
      setError(null)
      Logger.info('auth', 'Starting Google Sign In...')

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      }
      const userInfo = await GoogleSignin.signIn()

      if (userInfo.data?.idToken) {
        // Get device info for the backend
        const deviceInfo = currentDeviceInfo()

        // Sign in via admin backend
        const result = await signInWithGoogle(userInfo.data.idToken, deviceInfo)

        if (!result.success) {
          // The server's reason when it refused the account (SCRUM-289);
          // thrown into the catch below it became the generic line.
          Logger.error('auth', 'Backend auth error', { error: result.error, errorCode: result.errorCode })
          // The server said no: answered once, as the refusal lands (not for a cancelled chooser).
          H.error()
          const refusal = accountRefusalOf(result)
          if (refusal) return setAccountState({ kind: refusal, sentence: result.error })
          setError(socialSignInMessage('Google', result))
          return
        }

        // The server's yes, once (readme #97); a refusal above played its H.error.
        H.success()
        Logger.info('auth', 'Google Sign In successful', { isNewUser: result.isNewUser })

        // Where a new account goes is decided in `app/_layout.tsx`, which
        // owns routing. Pushing from here raced that effect and lost.
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
        H.error()
      } else {
        setError("Couldn’t sign in with Google. Try again.")
        H.error()
      }
    } finally {
      setSigningIn(null)
    }
  }

  const handleAppleSignIn = async () => {
    if (signingIn) return
    try {
      setSigningIn('apple')
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

      const deviceInfo = currentDeviceInfo()

      const result = await signInWithApple(
        credential.identityToken,
        credential.fullName
          ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName }
          : undefined,
        deviceInfo
      )

      if (!result.success) {
        Logger.error('auth', 'Backend auth error', { error: result.error, errorCode: result.errorCode })
        H.error()
        const refusal = accountRefusalOf(result)
        if (refusal) return setAccountState({ kind: refusal, sentence: result.error })
        setError(socialSignInMessage('Apple', result))
        return
      }

      H.success()
      Logger.info('auth', 'Apple Sign In successful', { isNewUser: result.isNewUser })

      // Same as Google above: the layout effect routes new accounts.
      // Navigation will happen automatically via useAuth hook
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        Logger.info('auth', 'User cancelled Apple sign in')
      } else {
        Logger.error('auth', 'Apple Sign In failed', { error: err })
        setError("Couldn’t sign in with Apple. Try again.")
        H.error()
      }
    } finally {
      setSigningIn(null)
    }
  }

  /*
   * A session is stored, and the server could not be reached to confirm it.
   *
   * Nothing refused it, so this is not the sign-in screen: offering Google and
   * Apple to somebody who is already signed in sends them to redo something
   * that was never undone. Checked before `loading` so Try again keeps this
   * screen, with its button busy, instead of dropping to the splash.
   */
  if (accountState && !user) return <AccountStateScreen state={accountState} />

  if (unreachable) {
    const maintenance = outage?.kind === 'maintenance'
    const back = outage?.kind === 'maintenance' ? backByLabel(outage.until) : null
    return (
      <SystemScreen
        icon={maintenance ? 'wrench' : 'cloud-off'}
        title={maintenance ? 'Back in a moment' : 'Can’t reach Blend’n'}
        body={
          maintenance
            ? `Blend’n is being worked on. You’re still signed in.${back ? ` Expected back by ${back}.` : ''}`
            : 'You’re still signed in. Nothing you saved or said has gone anywhere.'
        }
        note={maintenance ? undefined : outageNote(tries)}
        // The state's one action: the gradient primary when the server is down (H.primary, a second failure H.error); maintenance is the secondary, since pressing it will not bring it back sooner.
        actions={[{ label: 'Try again', kind: maintenance ? 'secondary' : 'primary', loading, onPress: () => void tryAgain() }]}
        testID="unreachable"
      />
    )
  }

  /*
   * Auth is still resolving: the mark alone, for the frame or two the root layout takes to decide where to send
   * them, on the orbs. Authenticated is the same frame, held so nothing flashes on the way out.
   */
  if (loading || user) {
    return (
      <View style={styles.root}>
        <Backdrop level={ORB_LEVEL.landing} />
        <View
          testID="auth-resolving"
          accessibilityRole="progressbar"
          accessibilityLabel="Loading"
          accessibilityState={{ busy: true }}
          style={styles.resolving}
        >
          <DiscMark height={MONOGRAM_HEIGHT} fill="gradient" />
        </View>
      </View>
    )
  }

  /*
   * Signed out: the orbs as the hero, the lockup and its line, the ways in on a glass dock. The brand colour arrives
   * through the mark and the orbs rather than through a button, because Google's mark has to sit on Google's chrome and
   * Apple's button is Apple's.
   */
  const google = signingIn === 'google'
  const apple = signingIn === 'apple'
  const dimmed = (own: boolean) => (signingIn && !own ? styles.dim : null)
  // Each way in rises 12 pt, 40 ms after the one above (motion #1); the message above them is not one of them.
  const rise = (index: number) => ({ delay: (reduceMotion ? ENTRANCE_AT_REDUCED : INTRO_DOCK_AT_MS) + index * STAGGER.loose, distance: RISE.message, duration: DURATION.medium })

  return (
    <View style={styles.root}>
      <IntroLights progress={intro} centre={{ x: window.width / 2, y: brandTop + markHeight / 2 }} />

      {/* A link tapped while signed out is held through sign-in; say so (Flow 15 15.12 02). */}
      {pendingEventLink() ? (
        <View style={[styles.held, { top: insets.top + SPACE.md }]}>
          <HeldLink eventId={pendingEventId()} />
        </View>
      ) : null}

      <Animated.View style={[styles.brand, { paddingTop: brandTop }]} testID="landing-brand">
        <IntroMark progress={intro} height={markHeight} />
        <IntroWordmark progress={intro} />
        <Animated.Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.tagline, introLine]}>
          Same place. Same vibe. Instant connections.
        </Animated.Text>
        {/* Whose invite is waiting, when an invite link brought them here. */}
        <PendingInvite />
      </Animated.View>

      <Animated.View style={introDock}>
      <Dock gap={SPACE.md} testID="landing-dock">
        {/*
          * Said to screen readers as it arrives (`useAnnounced`, the live region on Android), so someone mid-gesture is
          * told rather than left waiting. A toast would auto-dismiss and be missed entirely.
          */}
        {error && (
          <View style={styles.message}>
            <Icon name="circle-alert" size={ICON.inline} color={COLOR.destructive} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.errorText]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          </View>
        )}
        {!error && notice && (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.notice]} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {notice}
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
        <FadeInUp {...rise(0)}>
          <ScalePress
            onPress={handleGoogleSignIn}
            disabled={!!signingIn}
            pressedScale={Platform.OS === 'android' ? 1 : PRESS.scale}
            android_ripple={{ color: PRESSED_WASH.android }}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityState={{ disabled: !!signingIn, busy: google }}
            style={[styles.googleButton, dimmed(google)]}
          >
            {google ? (
              <Spinner size={20} dark />
            ) : (
              <>
                <GoogleMark />
                <Text style={styles.providerLabel} maxFontSizeMultiplier={1.3}>Continue with Google</Text>
              </>
            )}
          </ScalePress>
        </FadeInUp>

        {Platform.OS === 'ios' && appleSignInAvailable && (
          /*
           * WHITE, not BLACK: the page is ink, and a black button would vanish.
           */
          <FadeInUp {...rise(1)}>
            <View pointerEvents={signingIn ? 'none' : 'auto'} style={dimmed(apple)}>
              {/* The system draws this button and has no busy state; its spinner sits over it. */}
              <AppleAuthentication.AppleAuthenticationButton
                // "Continue with Apple", parallel to Google's and email's (D11).
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={RADIUS.button}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
              {apple ? (
                <View style={styles.appleBusy} pointerEvents="none">
                  <Spinner size={20} dark />
                </View>
              ) : null}
            </View>
          </FadeInUp>
        )}

        <FadeInUp {...rise(2)}>
          <View style={[styles.dividerRow, signingIn ? styles.dim : null]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.divider} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.dividerText]}>or</Text>
            <View style={styles.divider} />
          </View>
        </FadeInUp>

        {/* Outlined rather than filled: email is the third option, and the same weight as the two providers would make the screen three shouts. */}
        <FadeInUp {...rise(3)}>
          <ScalePress
            /*
             * The notice goes with them. Somebody the server signed out who
             * picks email lands on a form that otherwise says nothing about
             * why they are there.
             */
            onPress={() =>
              router.push(notice ? { pathname: '/sign-in', params: { notice } } : '/sign-in')
            }
            disabled={!!signingIn}
            pressedScale={Platform.OS === 'android' ? 1 : PRESS.scale}
            android_ripple={{ color: PRESSED_WASH.android }}
            accessibilityRole="button"
            accessibilityLabel="Continue with email"
            accessibilityState={{ disabled: !!signingIn }}
            style={[styles.emailButton, signingIn ? styles.dim : null]}
          >
            <Icon name="mail" size={ICON.control} color={COLOR.textPrimary} />
            <Text style={[styles.providerLabel, styles.emailLabel]} maxFontSizeMultiplier={1.3}>Continue with email</Text>
          </ScalePress>
        </FadeInUp>

        <FadeInUp {...rise(4)}>
          <LegalLine lead="By continuing you" />
        </FadeInUp>
      </Dock>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.ink },
  resolving: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },

  held: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter, zIndex: 1 },
  brand: { flex: 1, alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.gutter },
  tagline: { color: COLOR.textSecondary, textAlign: 'center' },

  // Centred under the buttons like the notice (owner, 2026-10-21: the frame's left-aligned refusal read as off-centre).
  message: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: SPACE.sm },
  errorText: { flexShrink: 1, textAlign: 'center', color: COLOR.destructive },
  notice: { color: COLOR.textSecondary, textAlign: 'center' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    height: SIZE.primary,
    borderRadius: RADIUS.button,
    backgroundColor: GOOGLE_FILL,
    overflow: 'hidden',
  },
  /*
   * 21, to sit level with the Apple button beside it.
   *
   * `AppleAuthentication.AppleAuthenticationButton` draws its own label — the system renders it and there is no prop for the
   * type. Measured on device at 56pt tall it puts 20pt of glyph on screen; ours at 16 put 15, a third smaller, side by side,
   * on the first screen anybody sees. Glyphs render about a point under the font size, so 21 is what draws the Apple
   * button's 20. If the Apple button ever changes size, this is the number that has to follow it — and the way to check is
   * to measure a screenshot, not to look at one.
   */
  // design-exception: sized to the system-drawn Apple button label, which has no size prop
  providerLabel: { fontFamily: FONT_FAMILY.brand[500], fontSize: 21, lineHeight: 24, color: GOOGLE_INK },
  emailLabel: { color: COLOR.textPrimary },
  appleButton: { width: '100%', height: SIZE.primary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairlineStrong },
  // The one word between the ways in: textSecondary, 4.5:1 on ink (tertiary was under it, A28).
  dividerText: { color: COLOR.textSecondary },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    height: SIZE.primary,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLOR.hairlineStrong,
    overflow: 'hidden',
  },
  dim: { opacity: OPACITY.disabled },
  // Over the system-drawn Apple button, which has no busy state of its own.
  appleBusy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.button,
    backgroundColor: GOOGLE_FILL,
  },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Index() {
  return (
    <ScreenProfiler id="splash-signin">
      <IndexInner />
    </ScreenProfiler>
  )
}
