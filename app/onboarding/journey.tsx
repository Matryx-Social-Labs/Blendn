import { useCallback, useEffect, useState } from 'react'

import { StyleSheet, View } from 'react-native'

import { ChipSet } from '../../components/ds/ChipSet'
import { FieldLabel, TextField } from '../../components/ds/TextField'
import { useBoldText, useIncreaseContrast } from '../../components/ds/shared'
import { CardSection } from '../../components/onboarding/CardSection'
import { ListLoadState, type ListStatus } from '../../components/onboarding/ListLoadState'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { apiClient, type WorkFieldsResponse } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { DEFAULT_MAX_EXPERTISE, keepExpertise, toggleExpertise } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'
import { PROFILE_LIMITS } from '../../lib/profileLimits'

/**
 * Step five — where you are, what you do, where you studied.
 *
 * The occupation chips in the frame read Freelance / Full-time / Founder, which
 * is *employment type* and has no column behind it. `work_field` is what the
 * server stores — a coarse bucket like "design" or "engineering", from
 * `GET /work-fields` — and it is the one thing here that appears on a card in a
 * pseudonymous room, because "works in design" is an attribute while
 * "Principal Designer at Swiggy" is an address. So the chips are the real work
 * fields; the employment-type question is noted in `docs/ONBOARDING.md` rather
 * than stored somewhere it would never be read from.
 *
 * The frame's Education block also has a "class year" box with no column. Left
 * out for the same reason — a field that saves nowhere is a lie told in a form.
 */

export default function JourneyScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('journey')
  const bold = useBoldText()
  const contrast = useIncreaseContrast()

  const [location, setLocation] = useState('')
  const [occupation, setOccupation] = useState('')
  const [education, setEducation] = useState('')
  const [workField, setWorkField] = useState<string | undefined>()
  const [fields, setFields] = useState<{ slug: string; label: string }[]>([])
  /** What someone does within each field, from the same response (the server's curated list), and how many they may pick. */
  const [expertiseByField, setExpertiseByField] = useState<WorkFieldsResponse['expertiseByField']>()
  const [maxExpertise, setMaxExpertise] = useState(DEFAULT_MAX_EXPERTISE)
  const [expertise, setExpertise] = useState<string[]>([])
  // Sent only once it has been seen or answered: a person who never reached the field's specialisms has not said "none".
  const [expertiseTouched, setExpertiseTouched] = useState(false)
  const [fieldsStatus, setFieldsStatus] = useState<ListStatus>('loading')

  // Prefilled once, in the render that first sees `loaded`.
  const [prefilled, setPrefilled] = useState(false)
  if (loaded && !prefilled) {
    setPrefilled(true)
    setLocation(draft.location ?? '')
    setOccupation(draft.occupation ?? '')
    setEducation(draft.education ?? '')
    setWorkField(draft.work_field)
    setExpertise(draft.expertise ?? [])
  }

  /*
   * The list comes from the server, never from a copy in the app.
   *
   * `profiles.interests` is the counter-example in the same table: free text,
   * so "Software" and "software engineering" never matched, and unpicking it
   * took two PRs. A hardcoded list here would diverge the first time someone
   * adds a field on the server.
   */
  const loadFields = useCallback(async () => {
    setFieldsStatus('loading')
    try {
      const result = await apiClient.getWorkFields()
      if (result.success && result.data) {
        setFields(result.data.workFields)
        setExpertiseByField(result.data.expertiseByField)
        setMaxExpertise(result.data.maxExpertise ?? DEFAULT_MAX_EXPERTISE)
        setFieldsStatus('ready')
        return
      }
      Logger.warn('profile', 'Work fields did not load', { error: result.error })
    } catch (error) {
      Logger.warn('profile', 'Work fields threw', { error })
    }
    setFieldsStatus('error')
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch's own loading flag
    void loadFields()
  }, [loadFields])

  const patch = {
    location: location.trim(),
    occupation: occupation.trim(),
    education: education.trim(),
    work_field: workField,
    // Only once it has been touched, or the draft already held it: sending `[]` unasked would clear what was set elsewhere.
    ...(expertiseTouched || draft.expertise !== undefined ? { expertise } : {}),
  }

  /** The field moves, and the specialisms that were under the old one go with it. */
  const chooseField = (slug: string) => {
    const next = workField === slug ? undefined : slug
    setWorkField(next)
    const kept = keepExpertise(expertise, next, expertiseByField)
    if (kept.length !== expertise.length) {
      setExpertise(kept)
      setExpertiseTouched(true)
    }
  }
  const specialisms = workField ? (expertiseByField?.[workField] ?? []) : []
  const fieldLabel = fields.find((field) => field.slug === workField)?.label

  return (
    <OnboardingScreen
      step="journey"
      title="Your "
      titleAccent="journey"
      subtitle="Where you live, what you do and where you studied. All optional."
      ctaLabel="Continue"
      ctaBusy={saving}
      onContinue={() => void commit(patch)}
      // "Skip", because that is what `skip()` does: it advances and persists the
      // draft as it stands — nothing typed on this screen goes with it. The
      // frame's "Save as Draft" promised the one thing this button cannot do
      // (SCRUM-185). If a draft-save is wanted, it is a new hook function.
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {(reveal) => (
        <>
          {/*
        Three cards, not seven stacked fields.

        The screen asks three unrelated questions — where you are, what you do,
        where you studied — and without a boundary between them they read as one
        long form. Enclosing each is what makes them three things, which is what
        the frame does and what "just casual boxes" was describing.
      */}
          <CardSection icon="map-pin" title="Where you live" caption="Used to show you events nearby">
            <TextField
              label="City"
              placeholder="Search city"
              value={location}
              onChangeText={(value) => setLocation(value.slice(0, PROFILE_LIMITS.location))}
              autoCapitalize="words"
              testID="onboarding-city"
              {...reveal}
            />
          </CardSection>

          <CardSection icon="briefcase" title="Occupation" caption="Your job title and where you work">
            <TextField
              label="Job title"
              placeholder="e.g. Product designer"
              value={occupation}
              onChangeText={(value) => setOccupation(value.slice(0, PROFILE_LIMITS.occupation))}
              autoCapitalize="sentences"
              testID="onboarding-job"
              {...reveal}
            />

            {/* The chips once the server has answered; until then, or if it did
            not, the section says so rather than silently missing. */}
            {fieldsStatus !== 'ready' ? (
              <View style={styles.fieldBlock}>
                <FieldLabel text="Field of work" bold={bold} contrast={contrast} />
                <ListLoadState status={fieldsStatus} what="fields of work" onRetry={() => void loadFields()} />
              </View>
            ) : fields.length > 0 ? (
              <ChipSet
                label="Field of work"
                hint="The only part of this shown in a room. Your job title and employer are not."
                items={fields.map((field) => ({ key: field.slug, label: field.label }))}
                selection="single"
                selected={workField ? [workField] : []}
                onToggle={chooseField}
                testID="onboarding-field-of-work"
              />
            ) : null}

            {/* Step two of the field: what you do within it. Not drawn for a field with none ("Something else"). */}
            {fieldsStatus === 'ready' && specialisms.length > 0 ? (
              <View style={styles.expertise}>
                <ChipSet
                  label={`Expertise · ${fieldLabel ?? ''}`}
                  items={specialisms.map((entry) => ({ key: entry.slug, label: entry.label }))}
                  selection="multi"
                  selected={expertise}
                  max={maxExpertise}
                  capHint={`Up to ${maxExpertise}`}
                  hint="Up to three. If you change the field, these clear."
                  onToggle={(slug) => {
                    setExpertise((current) => toggleExpertise(current, slug, maxExpertise))
                    setExpertiseTouched(true)
                  }}
                  testID="onboarding-expertise"
                />
              </View>
            ) : null}
          </CardSection>

          <CardSection icon="graduation-cap" title="Education" caption="Where you studied, if you want to say">
            <TextField
              label="School / University"
              placeholder="Where you studied"
              value={education}
              onChangeText={(value) => setEducation(value.slice(0, PROFILE_LIMITS.education))}
              autoCapitalize="words"
              testID="onboarding-school"
              {...reveal}
            />
          </CardSection>
        </>
      )}
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  fieldBlock: { gap: SPACE.sm },
  // Under the field's chips, set off by the card's hairline: it is the second half of the same question.
  expertise: { gap: SPACE.sm, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
})
