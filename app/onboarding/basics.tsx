import { ScreenProfiler } from '../../lib/perf'
import { useRef, useState } from 'react'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import ActionTray from '../../components/ActionTray'

import {
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import {
  ADULTS_ONLY,
  canContinue,
  isCompleteDateOfBirth,
  isUnderAccountAge,
  joinDateOfBirth,
  splitDateOfBirth,
  type OnboardingGender,
} from '../../lib/onboarding'
import { EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'
import { signOut, useAuth } from '../../lib/useAuth'

const CURATION_ART = require('../../assets/onboarding/curation.png')

/**
 * Step one — a name, a gender, a birth date.
 *
 * The only step that cannot be skipped. The birth date is why: every age rule
 * on the server derives from it, and an account without one is refused dating
 * and every event with a minimum age, permanently and silently.
 */

/**
 * The four options the API stores, each labelled as what it stores.
 *
 * The frames offer Woman, Man, Non-binary, **Other**, and the fourth chip was
 * labelled "Other" while it saved `prefer_not_to_say`. Someone choosing
 * "Other" is saying none of the three fit; we recorded that they declined to
 * answer, a different statement. The API's enum is
 * `woman | man | non_binary | prefer_not_to_say`, so the label now says what
 * is stored. An `other` value is still a question for the API
 * (`docs/ONBOARDING.md`).
 */
const GENDERS: { label: string; value: OnboardingGender }[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
]

function BasicsScreenInner() {
  const { draft, loaded, saving, commit } = useOnboarding('basics')

  const [name, setName] = useState('')
  const [gender, setGender] = useState<OnboardingGender | undefined>()
  const [dob, setDob] = useState({ day: '', month: '', year: '' })

  /*
   * Three boxes, and the keyboard should walk between them.
   *
   * Typing `1` `7` into DD and then having to *aim* at MM is the kind of
   * friction that reads as the app being slow rather than as one extra tap.
   * Advancing on a full box is what every date field and every OTP field does,
   * so it is also what people already expect.
   */
  const dayRef = useRef<TextInput>(null)
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)

  // Prefilled once storage has answered, not on every render — otherwise a
  // rehydrate landing mid-edit would overwrite what is being typed. Done during
  // the render that first sees `loaded`, so the fields never paint empty first.
  /*
   * The draft first, then the account.
   *
   * Sign-up creates the account WITH a name — `User.name` and `profiles.name`
   * both hold it — and this screen rendered the field empty, showing the
   * placeholder "e.g. Julian Ember". So somebody typed their name, tapped
   * Create account, and was asked for it again, blank, seconds later.
   *
   * The order matters and is not the obvious one: the draft wins, because a
   * draft value is something this person typed HERE and may be a correction of
   * the account name. The account is the seed for the first visit only, when
   * there is no draft to prefer.
   */
  const { user } = useAuth()

  const [prefilled, setPrefilled] = useState(false)
  if (loaded && !prefilled) {
    setPrefilled(true)
    setName(draft.name ?? user?.name ?? '')
    setGender(draft.gender)
    setDob(splitDateOfBirth(draft.dateOfBirth))
  }

  /*
   * The way out, on the one step with no back.
   *
   * Somebody who signed in with the wrong Google account, or who is under 18
   * and cannot continue, had no exit: no back button here, swipe-back off at
   * the root, and Settings is behind the flow. Confirmed first because it
   * ends the session; what they have typed stays on this phone (the draft is
   * keyed by account), so signing back in resumes here.
   */
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const leave = async () => {
    setSigningOut(true)
    // The root layout routes to the entry screen when the user clears.
    await signOut()
    setSigningOut(false)
    setConfirmSignOut(false)
  }

  const dateOfBirth = joinDateOfBirth(dob.day, dob.month, dob.year)
  const patch = { name: name.trim(), gender, dateOfBirth }
  const ready = canContinue('basics', patch)
  // The keyboard's own "go" on the last box does what Continue does, and only
  // when Continue could. `commit` refuses a second save while one is running.
  const submit = () => {
    if (ready && !saving) void commit(patch)
  }

  return (
    <OnboardingScreen
      step="basics"
      title="The basics"
      subtitle="Tell us a bit about yourself. You can change any of it later."
      ctaLabel="Continue"
      ctaDisabled={!ready}
      ctaBusy={saving}
      onContinue={submit}
      secondaryLabel="Not you? Sign out"
      onSecondary={() => setConfirmSignOut(true)}
    >
      {/*
        Full name, first name displayed.
        
        `User.name` is one field and holds whatever signup wrote, so collecting
        the whole thing costs nothing and the room is protected by the pseudonym
        regardless — a full name is only ever seen by someone who has matched,
        opened a conversation, or been revealed to.
        
        It also matters at exactly the moment it is seen. "Julian" is thin for
        someone deciding whether to trust a stranger they are about to meet;
        the reveal is supposed to be a real identity, and half of one is a
        strange thing to reveal.
      */}
      <EmberField
        label="Your name"
        placeholder="First and last name"
        helper="Only your first name shows in an event room. Your full name is for people you match or talk with."
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        // A name is not a word to correct.
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        // Next goes to the birth date, and the keyboard stays up on the way.
        submitBehavior="submit"
        onSubmitEditing={() => dayRef.current?.focus()}
        maxLength={100}
      />

      <EmberFieldGroup label="Gender identity">
        <EmberChipRow>
          {GENDERS.map((option) => (
            <EmberChip
              key={option.value}
              label={option.label}
              selected={gender === option.value}
              // Tapping the chosen one again clears it. Gender is optional and
              // there is otherwise no way back to "unanswered" once tapped.
              onPress={() => setGender(gender === option.value ? undefined : option.value)}
            />
          ))}
        </EmberChipRow>
      </EmberFieldGroup>

      <EmberFieldGroup
        label="Date of birth"
        helper="Your age will be private and used only for verification."
      >
        <View style={styles.dateRow}>
          <View style={styles.dateSmall}>
            <EmberField
              compact
              label="Day of birth"
              placeholder="DD"
              ref={dayRef}
              value={dob.day}
              onChangeText={(value) => {
                const day = digits(value, 2)
                setDob({ ...dob, day })
                // Two digits, or a leading digit that cannot start a valid day
                // (`4`–`9` means April..., not the 4th of a two-digit day).
                if (day.length === 2 || Number(day) > 3) monthRef.current?.focus()
              }}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.dateSmall}>
            <EmberField
              compact
              label="Month of birth"
              placeholder="MM"
              ref={monthRef}
              value={dob.month}
              onChangeText={(value) => {
                const month = digits(value, 2)
                setDob({ ...dob, month })
                if (month.length === 2 || Number(month) > 1) yearRef.current?.focus()
              }}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.dateLarge}>
            <EmberField
              compact
              label="Year of birth"
              placeholder="YYYY"
              ref={yearRef}
              value={dob.year}
              onChangeText={(year) => setDob({ ...dob, year: digits(year, 4) })}
              keyboardType="number-pad"
              returnKeyType="go"
              onSubmitEditing={submit}
              maxLength={4}
            />
          </View>
        </View>
        {/*
         * Why Continue is off, shown only once all three boxes are full
         * (`joinDateOfBirth` is undefined until then) — complaining while
         * someone is halfway through typing 1998 is nagging, not helping.
         *
         * Under 18 first: Blend'n is 18+ (SCRUM-330), and every Google and
         * Apple account passes this screen before it can finish onboarding.
         * Anything else that is not a usable birth date — 30 February, the
         * future — is "not a date". That branch used to test `!dateOfBirth`,
         * which is never true once the boxes are full, so it never showed.
         */}
        {isUnderAccountAge(dateOfBirth) ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">{ADULTS_ONLY}</Text>
        ) : dateOfBirth && !isCompleteDateOfBirth(dateOfBirth) ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">That is not a date we recognise.</Text>
        ) : null}
        {/* Under 18 is a dead end on this account, so the exit sits beside it. */}
        {isUnderAccountAge(dateOfBirth) ? (
          <Pressable
            onPress={() => setConfirmSignOut(true)}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={SPACE.md}
            style={styles.signOutInline}
          >
            <Text style={styles.textAction}>SIGN OUT</Text>
          </Pressable>
        ) : null}
      </EmberFieldGroup>

      {/*
        Purely decorative — a preview of the feed personalization the app does
        after onboarding, not a control. Hidden from screen readers for that
        reason, same as the permission-screen illustrations.
      */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.curationCard}
      >
        <Image
          source={CURATION_ART}
          style={styles.curationArt}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={[EMBER.bgClear, EMBER.bg]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.curationText}>
          <Text style={styles.curationEyebrow}>NEXT</Text>
          <Text style={styles.curationCaption}>A few quick questions, then your Pulse is personalised around you.</Text>
        </View>
      </View>

      <ActionTray
        visible={confirmSignOut}
        title="Sign out?"
        message="What you've filled in stays on this phone, so you can pick up here when you sign back in."
        onClose={() => setConfirmSignOut(false)}
        buttons={[
          { label: 'Cancel', variant: 'secondary', onPress: () => setConfirmSignOut(false), disabled: signingOut },
          { label: 'Sign out', variant: 'primary', onPress: () => void leave(), loading: signingOut },
        ]}
      />
    </OnboardingScreen>
  )
}

/**
 * Digits only, capped.
 *
 * `keyboardType="number-pad"` is a hint, not a constraint — a hardware
 * keyboard, a paste, and several Android IMEs all put letters into a number
 * pad, and `'1a'` would sail through `maxLength` into the date string.
 */
function digits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', gap: SPACE.md },
  dateSmall: { flex: 1 },
  dateLarge: { flex: 1.5 },
  error: { ...TYPE.meta, color: EMBER.destructive },
  signOutInline: { alignSelf: 'flex-start' },
  // A text action (DESIGN_SYSTEM.md): `label` in `textPrimary`.
  textAction: { ...TYPE.label, color: EMBER.textPrimary },

  curationCard: {
    width: '100%',
    height: 192,
    borderRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceMedia,
    justifyContent: 'flex-end',
  },
  curationArt: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', opacity: 0.6 },
  curationText: { padding: SPACE.xl, gap: SPACE.xs },
  curationEyebrow: { ...TYPE.label, color: EMBER.textSecondary },
  curationCaption: TYPE.meta,
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function BasicsScreen() {
  return (
    <ScreenProfiler id="onboard-basics">
      <BasicsScreenInner />
    </ScreenProfiler>
  )
}
