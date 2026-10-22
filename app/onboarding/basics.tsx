import { ScreenProfiler } from '../../lib/perf'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button } from '../../components/ds/Button'
import { ChipSet } from '../../components/ds/ChipSet'
import { DateField, type DateParts } from '../../components/ds/DateField'
import { Sheet } from '../../components/ds/Sheet'
import { TextField } from '../../components/ds/TextField'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { useRefusedPulse } from '../../components/onboarding/useRefusedPulse'
import {
  ADULTS_ONLY,
  canContinue,
  isCompleteDateOfBirth,
  isUnderAccountAge,
  joinDateOfBirth,
  NAME_LENGTH_SENTENCE,
  nameTooShort,
  splitDateOfBirth,
  type OnboardingGender,
} from '../../lib/onboarding'
import { SPACE } from '../../lib/design/tokens'
import { useOnboarding } from '../../lib/useOnboarding'
import { signOut, useAuth } from '../../lib/useAuth'
import { counterLimit, overCapMessage, PROFILE_LIMITS, serverLength } from '../../lib/profileLimits'

/**
 * Step one: a name, a gender, a birth date.
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

/** What the date's hint says while there is nothing to correct (Flow 2 basics 01). */
const DOB_HINT = 'Your age will be private and used only for verification.'
/** Under the name: what rooms show of it (SCRUM-493). */
const NAME_HINT = 'In event rooms you go by a made-up name. If you choose to show yours, people there see your full name.'
/** The server's cap on a name; typing stops there, as a `maxLength` did. */
const NOT_A_DATE = 'That is not a date we recognise.'

function BasicsScreenInner() {
  const { draft, loaded, saving, commit } = useOnboarding('basics')

  const [name, setName] = useState('')
  // The length sentence waits for the person to leave the field: one letter typed is not yet a mistake.
  const [nameLeft, setNameLeft] = useState(false)
  const { refused, refuse } = useRefusedPulse()
  const [gender, setGender] = useState<OnboardingGender | undefined>()
  const [dob, setDob] = useState({ day: '', month: '', year: '' })

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
    // A name already there (a resume, the account's) has been left: its sentence, if it needs one, shows at once.
    setNameLeft(!!(draft.name ?? user?.name))
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
  // Never cut for the person: a paste past the server's cap stays on screen, says by how much, and Continue waits.
  const nameOverCap = serverLength(name) > PROFILE_LIMITS.name
  const ready = canContinue('basics', patch) && !nameOverCap
  // Continue commits only when it could, and `commit` refuses a second save while one is running.
  const submit = () => {
    if (ready && !saving) void commit(patch)
  }

  /*
   * Why Continue is off, shown only once all three boxes are full
   * (`joinDateOfBirth` is undefined until then) — complaining while
   * someone is halfway through typing 1998 is nagging, not helping.
   *
   * Under 18 first: Blend'n is 18+ (SCRUM-330), and every Google and
   * Apple account passes this screen before it can finish onboarding.
   * Anything else that is not a usable birth date — 30 February, the
   * future — is "not a date". That branch used to test `!dateOfBirth`,
   * which is never true once the boxes are full, so it never showed.
   */
  const underAge = isUnderAccountAge(dateOfBirth)
  const notADate = !underAge && !!dateOfBirth && !isCompleteDateOfBirth(dateOfBirth)
  const dateError = underAge ? ADULTS_ONLY : notADate ? NOT_A_DATE : undefined

  return (
    <OnboardingScreen
      step="basics"
      title="The basics"
      subtitle="Tell us a bit about yourself. You can change any of it later."
      ctaLabel="Continue"
      ctaDisabled={!ready}
      // Tapping the dead button says why, when why is the name: the sentence under it, and the primary's refusal.
      onCtaDisabledPress={() => {
        setNameLeft(true)
        refuse()
      }}
      ctaRefused={refused}
      ctaBusy={saving}
      onContinue={submit}
      secondaryLabel="Not you? Sign out"
      onSecondary={() => setConfirmSignOut(true)}
    >
      <>
        {/*
      Full name; a made-up name in rooms until the person shows theirs, and
      then the whole of it (`roomIdentity`, admin lib/identity.ts). The
      helper said "only your first name" and nothing shortens it (SCRUM-493).

      `User.name` is one field and holds whatever signup wrote, so collecting
      the whole thing costs nothing and the room is protected by the pseudonym
      regardless — a full name is only ever seen by someone who has matched,
      opened a conversation, or been revealed to.
    */}
        <TextField
          label="Your name"
          placeholder="First and last name"
          hint={NAME_HINT}
          value={name}
          onChangeText={setName}
          error={nameOverCap ? overCapMessage(PROFILE_LIMITS.name, serverLength(name)) : nameLeft && nameTooShort(name) ? NAME_LENGTH_SENTENCE : undefined}
          onBlur={() => setNameLeft(true)}
          limit={counterLimit(name, PROFILE_LIMITS.name)}
          measure={serverLength}
          autoCapitalize="words"
          // A name is not a word to correct.
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          // The birth date is three boxes of its own, which the keyboard cannot walk to: done puts it away.
          returnKeyType="done"
          testID="onboarding-name"
        />

        <ChipSet
          label="Gender identity"
          items={GENDERS.map((option) => ({ key: option.value, label: option.label }))}
          selection="single"
          selected={gender ? [gender] : []}
          // Tapping the chosen one again clears it. Gender is optional and
          // there is otherwise no way back to "unanswered" once tapped.
          onToggle={(value) => setGender(gender === value ? undefined : (value as typeof gender))}
          testID="onboarding-gender"
        />

        <View style={styles.date}>
          <DateField
            label="Date of birth"
            value={[dob.day, dob.month, dob.year] as DateParts}
            onChange={([day, month, year]) => setDob({ day, month, year })}
            error={dateError}
            hint={dateError ? undefined : DOB_HINT}
            testID="onboarding-dob"
          />
          {/* Under 18 is a dead end on this account, so the exit sits beside the sentence. */}
          {underAge ? (
            <Button
              label="Sign out"
              kind="tertiary"
              size="sm"
              onPress={() => setConfirmSignOut(true)}
              testID="onboarding-under-age-sign-out"
            />
          ) : null}
        </View>

        <Sheet
          visible={confirmSignOut}
          onClose={() => setConfirmSignOut(false)}
          icon="log-out"
          title="Sign out?"
          body="What you’ve filled in stays on this phone, so you can pick up here when you sign back in."
          actions={[
            { label: 'Cancel', kind: 'secondary', onPress: () => setConfirmSignOut(false), disabled: signingOut },
            { label: 'Sign out', kind: 'primary', onPress: () => void leave(), loading: signingOut },
          ]}
          testID="sign-out-sheet"
        />
      </>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  date: { gap: SPACE.sm },
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
