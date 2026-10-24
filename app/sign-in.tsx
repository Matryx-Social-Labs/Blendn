import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import { LegalLine } from '../components/LegalLine'
import { Logger } from '../lib/logger'
import { currentDeviceInfo } from '../components/onboarding/authForm'
import { Backdrop, ORB_LEVEL } from '../components/onboarding/Backdrop'
import { FormHeader } from '../components/onboarding/FormHeader'
import { KeyboardPage } from '../components/onboarding/KeyboardPage'
import { useRefusedPulse } from '../components/onboarding/useRefusedPulse'
import { Banner } from '../components/ds/Banner'
import { Button } from '../components/ds/Button'
import { SegmentedControl } from '../components/ds/SegmentedControl'
import { TextField } from '../components/ds/TextField'
import { font, useBoldText } from '../components/ds/shared'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { setAccountState } from '../lib/accountState'
import { accountRefusalOf } from '../lib/sessionEnd'
import { signInWithEmail, signUp } from '../lib/useAuth'
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
const FIELD_ORDER: readonly Field[] = ['name', 'email', 'password', 'age']


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
  const [scrolled, setScrolled] = useState(false)
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

  /* Docked: the primary is one thumb away; over the keyboard it rides on glass with Forgot, at rest it is the button on the page. */
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
      {/* With the keyboard up too: the way out of a forgotten password rides with the primary, never under the keys (A29). */}
      {!isSignup ? (
        <View style={styles.forgot}>
          <Button
            label="Forgot your password?"
            kind="tertiary"
            size="sm"
            // The address typed here goes with them, so it is not typed twice.
            onPress={() =>
              router.push(
                trimmedEmail
                  ? { pathname: '/forgot-password', params: { email: trimmedEmail } }
                  : '/forgot-password'
              )
            }
            testID="sign-in-forgot"
            // A small button hugs its label with alignSelf flex-start, which beats the wrapper's centring: centre it here.
            style={styles.centred}
          />
        </View>
      ) : null}
      {!keyboardUp && isSignup ? <LegalLine lead="By creating an account you" /> : null}
    </>
  )

  return (
    <View style={styles.root}>
      <Backdrop level={ORB_LEVEL.form} paused={keyboardUp} />

      <FormHeader testID="sign-in-header" scrolled={scrolled} />

      {/* Four fields and a segmented control do not fit above the keyboard: the page follows the field being typed in. */}
      <KeyboardPage
        scrollProps={{
          testID: 'sign-in-scroll',
          contentContainerStyle: styles.scroll,
          onScroll: (e) => setScrolled(e.nativeEvent.contentOffset.y > 0),
          scrollEventThrottle: 16,
        }}
        dockProps={{ glass: keyboardUp, keyboardUp, testID: 'sign-in-dock' }}
        dock={dock}
      >
          <PendingInvite signIn />

          {notice && !error ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.notice]} accessibilityRole="alert">
              {notice}
            </Text>
          ) : null}

          {/* Two tabs over one form: the design system's segmented control (it plays H.select, and slides on M.snap). */}
          <SegmentedControl
            items={MODE_LABELS}
            selected={isSignup ? 1 : 0}
            onChange={(i) => switchMode(i === 0 ? 'signin' : 'signup')}
            disabled={busy}
            testID="sign-in-mode"
          />

          {/*
            One order for the keyboard to walk: name, email, password, then
            age last, whose "go" submits. Age sat second, between two text
            fields, so Next on the name opened a number pad and Next on the
            number pad (which has none on iOS) was a dead end.
          */}
          <View style={styles.fields}>
            {isSignup && (
              <TextField
                inputRef={nameRef}
                label="Name"
                value={name}
                onChangeText={edit('name', setName)}
                error={fieldErrors.name}
                placeholder="Your first name"
                autoCapitalize="words"
                // A name is not a word to correct.
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => emailRef.current?.focus()}
                testID="sign-in-name"
              />
            )}

            <TextField
              inputRef={emailRef}
              label="Email"
              value={email}
              onChangeText={edit('email', setEmail)}
              error={fieldErrors.email}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="sign-in-email"
            />

            <TextField
              inputRef={passwordRef}
              label="Password"
              secure
              value={password}
              onChangeText={edit('password', setPassword)}
              error={fieldErrors.password}
              placeholder={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
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
              testID="sign-in-password"
            />

            {isSignup && (
              // Required: Blend'n is 18+ (SCRUM-330).
              <TextField
                inputRef={ageRef}
                label="Age"
                value={age}
                onChangeText={edit('age', (value) => setAge(value.replace(/[^0-9]/g, '').slice(0, AGE_DIGITS)))}
                error={fieldErrors.age}
                // A number, not a yes: "18 or over" read as a box to confirm (A31). The rule is the hint under it.
                placeholder="Your age"
                hint="You need to be 18 or over to join."
                keyboardType="number-pad"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                testID="sign-in-age"
              />
            )}
          </View>

          {error ? <Banner kind="error" text={error} icon={waiting ? 'clock' : undefined} testID="sign-in-error" /> : null}
      </KeyboardPage>
    </View>
  )
}

const MODE_LABELS = ['Sign in', 'Create account'] as const

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  root: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.xl, gap: SPACE.lg },
  fields: { gap: SPACE.md },
  notice: { color: COLOR.textSecondary, textAlign: 'center' },
  forgot: { alignItems: 'center' },
})
