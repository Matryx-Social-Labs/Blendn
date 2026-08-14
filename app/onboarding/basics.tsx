import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import {
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { canContinue, joinDateOfBirth, splitDateOfBirth } from '../../lib/onboarding'
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
const GENDERS: { label: string; value: string }[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Other', value: 'prefer_not_to_say' },
]

export default function BasicsScreen() {
  const { draft, loaded, saving, commit } = useOnboarding('basics')

  const [name, setName] = useState('')
  const [gender, setGender] = useState<string | undefined>()
  const [dob, setDob] = useState({ day: '', month: '', year: '' })

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
      <EmberField
        label="First name"
        placeholder="e.g. Julian"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
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
              onChangeText={(day) => setDob({ ...dob, day: digits(day, 2) })}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.dateSmall}>
            <EmberField
              compact
              label="Month of birth"
              placeholder="MM"
              value={dob.month}
              onChangeText={(month) => setDob({ ...dob, month: digits(month, 2) })}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={styles.dateLarge}>
            <EmberField
              compact
              label="Year of birth"
              placeholder="YYYY"
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
