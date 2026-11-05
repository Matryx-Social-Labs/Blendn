import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { LegalLine } from '../components/LegalLine'
import { Logger } from '../lib/logger'
import { currentDeviceInfo } from '../components/onboarding/authForm'
import { EmailSheet, SheetItem } from '../components/onboarding/EmailSheet'
import { useRefusedPulse } from '../components/onboarding/useRefusedPulse'
import { Banner } from '../components/ds/Banner'
import { Button } from '../components/ds/Button'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { TextField } from '../components/ds/TextField'
import { font, useBoldText, useAnnounced } from '../components/ds/shared'
import { COLOR, DURATION, FONT_FAMILY, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { useReducedMotion } from '../lib/motion'
import { setAccountState } from '../lib/accountState'
import { accountRefusalOf } from '../lib/sessionEnd'
import { signInWithEmail, signUp } from '../lib/useAuth'
import { H } from '../lib/haptics'
import { useKeyboardShown } from '../lib/keyboard'
import { accountAgeError, NAME_LENGTH_SENTENCE, nameTooShort } from '../lib/onboarding'
import { PendingInvite } from '../components/friends/PendingInvite'
import { forgetHeldForm, heldForm } from '../lib/heldSignInForm'


/**
 * Email sign-in and account creation (Flow 1 `/sign-in`).
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
 * built, calling endpoints that have been live for months. This screen is the
 * caller — no auth logic is added here, and none needed changing.
 *
 * Navigation is deliberately absent: the root layout's routing effect sees the
 * new auth state and moves the user itself, the same way the Google and Apple
 * paths work. Navigating from here as well would race it.
 *
 * ## What it says, and where
 *
 * Each problem with the form is its own sentence under its own field, all at once, with focus on the first. The server's
 * refusal of the whole form is a tinted card above the primary. The primary is docked, and shakes with one `H.error` when
 * either happens (its `refused`): the screen plays no haptic of its own for the same failure.
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
/** The busy button is released after this long if the screen has not been replaced: a routing that never came must not leave the form dead. */
const BUSY_SAFETY_MS = 8_000

/** The age box takes three digits. */
const AGE_DIGITS = 3

type Mode = 'signin' | 'signup'
type Field = 'name' | 'email' | 'password' | 'age'
type FieldErrors = Partial<Record<Field, string>>

/** The order the form walks in, which is the order the first bad field is found in. */
const FIELD_ORDER: readonly Field[] = ['email', 'password', 'name', 'age']


export default function SignIn() {
  const bold = useBoldText()
  const keyboardUp = useKeyboardShown()
  const [mode, setMode] = useState<Mode>(heldForm.mode)
  const [email, setEmail] = useState(heldForm.email)
  const [password, setPassword] = useState('')
  const [name, setName] = useState(heldForm.name)
  const [age, setAge] = useState(heldForm.age)
  useEffect(() => {
    Object.assign(heldForm, { mode, email, name, age })
  }, [mode, email, name, age])
  const [busy, setBusy] = useState(false)
  /** The server's sentence for the whole form (wrong password, already registered, the wait), or ours when it never answered. */
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const nameRef = useRef<TextInput>(null)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const ageRef = useRef<TextInput>(null)
  const refs: Record<Field, React.RefObject<TextInput | null>> = { name: nameRef, email: emailRef, password: passwordRef, age: ageRef }
  const { refused, refuse } = useRefusedPulse()
  // The page has moved under the header: it wears the bar (r7 M11).
  /** The field with the focus, for the sheet to keep in view while the keyboard is up. */
  const [focusedField, setFocusedField] = useState<Field | null>(null)
  const reduceMotion = useReducedMotion()
  /*
   * A ref as well as `busy`: the keyboard's "go" and the button can land in
   * the same frame, and both read the `busy` of the render before either set
   * it — two sign-ups, and the second one's "already registered" shown over
   * an account that had just been created.
   */
  const inFlight = useRef(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current) }, [])
  /*
   * Why they are here, when the server signed them out: the entry screen hands
   * its notice on. Without it, somebody signed out mid-use who chose email
   * met a blank form and had to guess whether they had done something wrong.
   */
  const params = useLocalSearchParams<{ notice?: string }>()
  const notice = typeof params.notice === 'string' && params.notice ? params.notice : null

  // The error has its own Banner, which says itself.
  useAnnounced(notice && !error ? notice : null)
  const isSignup = mode === 'signup'
  const trimmedEmail = email.trim().toLowerCase()

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    // Errors belong to the attempt that produced them. Carrying "wrong
    // password" across to the signup form would be nonsense.
    setError(null)
    setWaiting(false)
    setFieldErrors({})
  }

  /** A field's sentence stays until its value changes (DS: the ring stays until the value changes). */
  const edit = (field: Field, set: (value: string) => void) => (value: string) => {
    set(value)
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  /** Every problem with the form, each under its own field (Flow 1 R4.1 sign-in 06). */
  const validate = (): FieldErrors => {
    const problems: FieldErrors = {}
    if (!trimmedEmail.includes('@')) problems.email = 'Enter a valid email address.'
    if (isSignup && !name.trim()) problems.name = 'Enter your name.'
    else if (isSignup && nameTooShort(name)) problems.name = NAME_LENGTH_SENTENCE
    if (isSignup) {
      const ageProblem = accountAgeError(age, { required: true })
      if (ageProblem) problems.age = ageProblem
    }
    if (!password) problems.password = 'Enter your password.'
    else if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      problems.password = `Use at least ${MIN_PASSWORD_LENGTH} characters. Length beats symbols.`
    }
    return problems
  }

  const submit = async () => {
    if (inFlight.current) return
    const problems = validate()
    const first = FIELD_ORDER.find((field) => problems[field])
    if (first) {
      setFieldErrors(problems)
      setError(null)
      // The first bad field takes focus; the primary shakes with the one H.error.
      refs[first].current?.focus()
      refuse()
      return
    }

    inFlight.current = true
    let stayBusy = false
    setBusy(true)
    setError(null)
    setWaiting(false)
    setFieldErrors({})
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
         * A suspended or a staff account is not a form to fix: the landing says so on a screen of its own (Flow 15 #1, #2),
         * with no way to retry, so the form steps aside for it.
         */
        const refusal = isSignup ? null : accountRefusalOf(result)
        if (refusal === 'suspended' || refusal === 'staff') {
          setAccountState({ kind: refusal, sentence: result.error })
          router.back()
          return
        }
        /*
         * Surface the server's message rather than a generic one. Signup
         * failures are specific and actionable — "that email is already
         * registered", or the password rule that was broken — and replacing
         * them with "something went wrong" would make the form unusable.
         */
        setError(result.error || (isSignup ? "Couldn’t create your account." : "Couldn’t sign you in."))
        setWaiting(result.errorCode === 'RATE_LIMITED')
        refuse()
        return
      }
      // Both cases: the root layout's routing effect takes it from here. A new
      // account starts onboarding, a returning one resumes wherever it stopped
      // or goes to the events tab.
      // The button stays busy until this screen is replaced: freeing it here left an idle form for the frames the next screen
      // takes to draw (a blank frame on Android).
      stayBusy = true
      // The server's yes, once (readme #97); a refusal above played its H.error.
      H.success()
      // In: nothing of this form is kept for the next one (M4; `useAuth` drops it on every sign-in too).
      forgetHeldForm()
    } catch (e) {
      Logger.error('auth', 'Email auth failed', { error: e })
      setError('Something went wrong. Please try again.')
      refuse()
    } finally {
      inFlight.current = false
      if (!stayBusy) setBusy(false)
      else busyTimer.current = setTimeout(() => setBusy(false), BUSY_SAFETY_MS)
    }
  }

  const goForgot = () =>
    router.push(trimmedEmail ? { pathname: '/forgot-password', params: { email: trimmedEmail } } : '/forgot-password')

  /* The sheet's foot (Flow 1c): the primary alone, on the keyboard when it is up; sign-up's legal line under it at rest. */
  const dock = (
    <>
      {/* A refusal plays its H.error within the press (the button's `refused`), so the press-in is silent: one haptic, not two. */}
      <Button
        label={isSignup ? 'Create account' : 'Sign in'}
        onPress={() => void submit()}
        loading={busy}
        refused={refused}
        pressHaptic={false}
        testID="sign-in-primary"
      />
      {!keyboardUp && isSignup ? (
        // 8 pt under the primary, as the board draws it: the dock's 4 and 4 more.
        <View testID="sign-in-legal" style={styles.legal}>
          <LegalLine lead="By creating an account you" />
        </View>
      ) : null}
    </>
  )

  /*
   * "Forgot password?" at the end of the Password label (Flow 1c, owner's pick C; Trainline, Tock): above the keys with
   * the keyboard up (A29), and the dock keeps one action. 20 pt of line, a 44 pt target.
   */
  const forgot = (
    <Pressable
      onPress={goForgot}
      accessibilityRole="button"
      accessibilityLabel="Forgot password?"
      hitSlop={FORGOT_SLOP}
      testID="sign-in-forgot"
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.forgot]}>
        Forgot password?
      </Text>
    </Pressable>
  )

  return (
    <EmailSheet
      testID="sign-in"
      drivesLanding
      reveal={focusedField}
      title={
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} accessibilityRole="header" style={[font('title', bold), styles.title]}>
          {isSignup ? 'Create your account' : 'Sign in with email'}
        </Text>
      }
      dock={dock}
    >
      <PendingInvite signIn />

      {notice && !error ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.notice]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      {/* Two tabs over one form: the design system's segmented control (it plays H.select, and slides on M.snap). */}
      <SheetItem name="switch">
        <SegmentedControl
          items={MODE_LABELS}
          selected={isSignup ? 1 : 0}
          onChange={(i) => switchMode(i === 0 ? 'signin' : 'signup')}
          disabled={busy}
          testID="sign-in-mode"
        />
      </SheetItem>

      {/*
        One order in both modes (M7): Email and Password first, so switching never moves them; sign-up's Name and Age open
        below. The keyboard walks it in that order, and the last field's "go" submits.
      */}
      <SheetItem name="email">
        <TextField
          inputRef={emailRef}
          label="Email"
          value={email}
          onChangeText={edit('email', setEmail)}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          onFocus={() => setFocusedField('email')}
          testID="sign-in-email"
        />
      </SheetItem>

      <SheetItem name="password">
        <TextField
          inputRef={passwordRef}
          label="Password"
          labelAside={isSignup ? undefined : forgot}
          secure
          value={password}
          onChangeText={edit('password', setPassword)}
          error={fieldErrors.password}
          hint={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
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
          // Sign-in ends here; sign-up goes on to the name.
          returnKeyType={isSignup ? 'next' : 'go'}
          submitBehavior={isSignup ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={isSignup ? () => nameRef.current?.focus() : () => void submit()}
          onFocus={() => setFocusedField('password')}
          testID="sign-in-password"
        />
      </SheetItem>

      {isSignup ? (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(DURATION.base)} style={styles.more}>
          <SheetItem name="name">
            <TextField
              inputRef={nameRef}
              label="Name"
              value={name}
              onChangeText={edit('name', setName)}
              error={fieldErrors.name}
              autoCapitalize="words"
              // A name is not a word to correct.
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => ageRef.current?.focus()}
              onFocus={() => setFocusedField('name')}
              testID="sign-in-name"
            />
          </SheetItem>
          {/* Required: Blend'n is 18+ (SCRUM-330). A number, not a yes (A31): the rule is the hint under it. */}
          <SheetItem name="age">
            <TextField
              inputRef={ageRef}
              label="Age"
              value={age}
              onChangeText={edit('age', (value) => setAge(value.replace(/[^0-9]/g, '').slice(0, AGE_DIGITS)))}
              error={fieldErrors.age}
              hint="You need to be 18 or over to join."
              keyboardType="number-pad"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              onFocus={() => setFocusedField('age')}
              testID="sign-in-age"
            />
          </SheetItem>
        </Animated.View>
      ) : null}

      {error ? <Banner kind="error" text={error} icon={waiting ? 'clock' : undefined} testID="sign-in-error" /> : null}
    </EmailSheet>
  )
}

const MODE_LABELS = ['Sign in', 'Create account'] as const

const styles = StyleSheet.create({
  title: { color: COLOR.textPrimary, textAlign: 'center' },
  notice: { color: COLOR.textSecondary, textAlign: 'center' },
  forgot: { color: COLOR.textPrimary },
  more: { gap: SPACE.lg },
  legal: { marginTop: SPACE.xs },
})

/** "Forgot password?" is 20 pt of line on a 16 pt row: 12 pt over and under makes its 44 pt target. */
const FORGOT_SLOP = { top: SPACE.md, bottom: SPACE.md, left: SPACE.xs, right: SPACE.xs }
