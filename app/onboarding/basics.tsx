import { ScreenProfiler } from '../../lib/perf'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import {
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import {
  canContinue,
  joinDateOfBirth,
  splitDateOfBirth,
  type OnboardingGender,
} from '../../lib/onboarding'
import { EMBER_TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step one — a name, a gender, a birth date.
 *
 * The only step that cannot be skipped. The birth date is why: every age rule
 * on the server derives from it, and an account without one is refused dating
 * and every event with a minimum age, permanently and silently.
 */

/**
 * The four options in the design, mapped to what the API stores.
 *
 * **"Other" maps to `prefer_not_to_say`, and those are not the same thing.**
 * The API's enum is `woman | man | non_binary | prefer_not_to_say`; the frames
 * offer Woman, Man, Non-binary, Other. Someone choosing "Other" is telling us
 * something — that none of the three fit — and we are recording that they
 * declined to say, which is a different statement.
 *
 * Mapped rather than blocked because the alternative is shipping no gender
 * field at all, and `deriveInterestedIn` needs one. Recorded in
 * `docs/ONBOARDING.md` as a question for the API, not papered over here.
 */
const GENDERS: { label: string; value: OnboardingGender }[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Other', value: 'prefer_not_to_say' },
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
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)

  // Prefilled once storage has answered, not on every render — otherwise a
  // rehydrate landing mid-edit would overwrite what is being typed.
  useEffect(() => {
    if (!loaded) return
    setName(draft.name ?? '')
    setGender(draft.gender)
    setDob(splitDateOfBirth(draft.dateOfBirth))
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateOfBirth = joinDateOfBirth(dob.day, dob.month, dob.year)
  const patch = { name: name.trim(), gender, dateOfBirth }

  return (
    <OnboardingScreen
      step="basics"
      title="The basics"
      subtitle="Tell us a bit about yourself to curate your Blend'n experience."
      ctaLabel="Continue Journey"
      ctaDisabled={!canContinue('basics', patch)}
      ctaBusy={saving}
      onContinue={() => void commit(patch)}
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
        placeholder="e.g. Julian Ember"
        helper="Only your first name shows in an event room. Your full name is for people you match or talk with."
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
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
              maxLength={4}
            />
          </View>
        </View>
        {/*
         * Shown only once all three boxes are full. Complaining "that is not a
         * real date" while someone is halfway through typing 1998 is nagging,
         * not helping.
         */}
        {dob.day && dob.month && dob.year.length === 4 && !dateOfBirth ? (
          <Text style={styles.error}>That is not a date we recognise.</Text>
        ) : null}
      </EmberFieldGroup>
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
  dateRow: { flexDirection: 'row', gap: 12 },
  dateSmall: { flex: 1 },
  dateLarge: { flex: 1.5 },
  error: { ...EMBER_TYPE.helper, color: '#FF6D8D' },
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
