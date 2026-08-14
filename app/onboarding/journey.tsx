import { useEffect, useState } from 'react'

import {
  EmberCardSection,
  EmberChip,
  EmberChipRow,
  EmberField,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { previousStep } from '../../lib/onboarding'
import { Dimensions } from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { useOnboarding } from '../../lib/useOnboarding'

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

  const [location, setLocation] = useState('')
  const [occupation, setOccupation] = useState('')
  const [education, setEducation] = useState('')
  const [workField, setWorkField] = useState<string | undefined>()
  const [fields, setFields] = useState<{ slug: string; label: string }[]>([])

  useEffect(() => {
    if (!loaded) return
    setLocation(draft.location ?? '')
    setOccupation(draft.occupation ?? '')
    setEducation(draft.education ?? '')
    setWorkField(draft.work_field)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * The list comes from the server, never from a copy in the app.
   *
   * `profiles.interests` is the counter-example in the same table: free text,
   * so "Software" and "software engineering" never matched, and unpicking it
   * took two PRs. A hardcoded list here would diverge the first time someone
   * adds a field on the server.
   */
  useEffect(() => {
    apiClient.getWorkFields().then((result) => {
      if (result.success && result.data) setFields(result.data.workFields)
    })
  }, [])

  const patch = {
    location: location.trim(),
    occupation: occupation.trim(),
    education: education.trim(),
    work_field: workField,
  }

  return (
    <OnboardingScreen
      step="journey"
      title="Your "
      titleAccent="journey"
      subtitle="Almost there. Fill in your professional and educational milestones."
      ctaLabel="Continue Exploration"
      ctaBusy={saving}
      onContinue={() => void commit(patch)}
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {/*
        Three cards, not seven stacked fields.
        
        The screen asks three unrelated questions — where you are, what you do,
        where you studied — and without a boundary between them they read as one
        long form. Enclosing each is what makes them three things, which is what
        the frame does and what "just casual boxes" was describing.
      */}
      <EmberCardSection
        icon="location-outline"
        title="Current Base"
        caption="Where you are making your impact"
      >
        <EmberField
          label="City"
          placeholder="Search city"
          value={location}
          onChangeText={setLocation}
          autoCapitalize="words"
          maxLength={200}
        />
      </EmberCardSection>

      <EmberCardSection
        icon="briefcase-outline"
        title="Occupation"
        caption="Your professional identity and role"
      >
        <EmberField
          label="Job title"
          placeholder="e.g. Creative Director"
          value={occupation}
          onChangeText={setOccupation}
          autoCapitalize="sentences"
          maxLength={100}
        />

        {/* Only once the server has answered — an empty chip row under a label
            reads as a section that failed to load. */}
        {fields.length > 0 ? (
          <EmberFieldGroup
            label="Field of work"
            helper="The only part of this shown in a room. Your job title and employer are not."
          >
            <EmberChipRow pack width={Dimensions.get('window').width - 48 - 32}>
              {fields.map((field) => (
                <EmberChip
                  key={field.slug}
                  label={field.label}
                  selected={workField === field.slug}
                  onPress={() => setWorkField(workField === field.slug ? undefined : field.slug)}
                />
              ))}
            </EmberChipRow>
          </EmberFieldGroup>
        ) : null}
      </EmberCardSection>

      <EmberCardSection
        icon="school-outline"
        title="Education"
        caption="The foundation of your knowledge"
      >
        <EmberField
          label="School / University"
          placeholder="Where you studied"
          value={education}
          onChangeText={setEducation}
          autoCapitalize="words"
          maxLength={100}
        />
      </EmberCardSection>
    </OnboardingScreen>
  )
}
