import { useEffect, useState } from 'react'

import {
  EmberChip,
  EmberChipRow,
  EmberFieldGroup,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { previousStep } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step four — orientation, and what you are here for.
 *
 * ## Two deliberate departures from the frames
 *
 * **The "Show on profile" toggle is not built.** The frame puts a switch beside
 * Orientation offering to display it. Orientation is a *matching input* and has
 * never been shown to anyone: `GET /profiles/:userId` withholds it from every
 * caller who is not its owner, by an allow-list written specifically because a
 * deny-list once leaked exactly this field along with `gender`. Shipping the
 * toggle would mean either building an exposure the product decided against, or
 * shipping a switch that does nothing — and a privacy control that lies is
 * worse than no control. Raised in `docs/ONBOARDING.md`.
 *
 * **"Looking for" writes `looking_for`, not `intent_default`.** The frame's
 * cards are Dating, Friendship, Networking, Travel and Open. The intent enum
 * the matcher reads is `dating | networking | friendship | just_here` — Travel
 * and Open are not in it and would be rejected. `looking_for` is free text and
 * takes all five, so nothing is lost from the profile; what is lost is that
 * these answers do not reach matching. Also in `docs/ONBOARDING.md`.
 */

const ORIENTATIONS = [
  { label: 'Straight', value: 'straight' },
  { label: 'Gay', value: 'gay' },
  { label: 'Lesbian', value: 'lesbian' },
  { label: 'Bisexual', value: 'bisexual' },
  { label: 'Asexual', value: 'asexual' },
  { label: 'Queer', value: 'queer' },
  { label: 'Pansexual', value: 'pansexual' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
]

// "Demisexual" is in the frame and not in the server's list, so it is not
// offered — a chip that 400s on save is worse than an absent one.
const LOOKING_FOR = ['Dating', 'Friendship', 'Networking', 'Travel', 'Open']

export default function PreferencesScreen() {
  const { draft, loaded, saving, commit, skip, goTo } = useOnboarding('preferences')

  const [orientation, setOrientation] = useState<string | undefined>()
  const [lookingFor, setLookingFor] = useState<string[]>([])

  useEffect(() => {
    if (!loaded) return
    setOrientation(draft.orientation)
    setLookingFor(draft.looking_for ?? [])
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (value: string) =>
    setLookingFor((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    )

  return (
    <OnboardingScreen
      step="preferences"
      title="Your "
      titleAccent="preferences"
      subtitle="Your authentic self. Help us curate the right connections for your journey."
      ctaLabel="Continue"
      ctaBusy={saving}
      onContinue={() => void commit({ orientation, looking_for: lookingFor })}
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={() => goTo(previousStep('preferences')!)}
    >
      <EmberFieldGroup
        label="Orientation"
        helper="Used to find compatible matches. Never shown on your profile."
      >
        <EmberChipRow>
          {ORIENTATIONS.map((option) => (
            <EmberChip
              key={option.value}
              label={option.label}
              selected={orientation === option.value}
              onPress={() =>
                setOrientation(orientation === option.value ? undefined : option.value)
              }
            />
          ))}
        </EmberChipRow>
      </EmberFieldGroup>

      <EmberFieldGroup label="Looking for" helper="Select all that apply.">
        <EmberChipRow>
          {LOOKING_FOR.map((option) => (
            <EmberChip
              key={option}
              label={option}
              selected={lookingFor.includes(option)}
              onPress={() => toggle(option)}
            />
          ))}
        </EmberChipRow>
      </EmberFieldGroup>
    </OnboardingScreen>
  )
}
