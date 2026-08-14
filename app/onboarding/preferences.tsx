import { useEffect, useState } from 'react'

import {
  EmberChip,
  EmberChipRow,
  EmberFieldGroup,
  EmberToggle,
} from '../../components/onboarding/EmberControls'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { orientationConsent, previousStep } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step four — orientation, and what you are here for.
 *
 * ## The orientation switch, and what it actually does
 *
 * The frame offers a "Show on profile" switch beside Orientation. It is built,
 * and it does something narrower than that label implies.
 *
 * Turning it on shows your orientation to people who **can already see who you
 * are** — a mutual match, an open conversation, a room you revealed yourself
 * in. Not to every caller. The server gates it twice and this flag is only the
 * first gate; the second is `maySeeIdentity`, the same one that decides who
 * sees your real name and face.
 *
 * That ordering is the reason. This app withholds someone's name and
 * photograph from anyone who has not earned them, so a field more sensitive
 * than a name cannot be less protected than one. The label here says so rather
 * than saying "Show on profile", because a privacy switch whose blast radius is
 * not on the screen is one people mis-set.
 *
 * Default off, and it stays off unless somebody turns it on.
 *
 * ## How you enter a room
 *
 * The last block on this screen, and the one with the sharpest consequence.
 *
 * It is a *suggestion*, not a setting that acts at a distance: the server
 * creates every check-in row `revealed: false` whatever this says, so being
 * named in a room is always a tap taken in that room. What this changes is
 * whether the tap is offered when you walk in.
 *
 * Anonymous is the default and stays the default. The two safeguards that make
 * the named option safe to offer at all — a warning the first time, and a
 * banner for as long as you are inside — live in `lib/roomVisibility.ts`.
 *
 * ## One deliberate departure from the frames
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
  const [showOrientation, setShowOrientation] = useState(false)
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [revealByDefault, setRevealByDefault] = useState(false)

  useEffect(() => {
    if (!loaded) return
    setOrientation(draft.orientation)
    setShowOrientation(draft.show_orientation ?? false)
    setLookingFor(draft.looking_for ?? [])
    setRevealByDefault(draft.reveal_by_default ?? false)
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
      onContinue={() =>
        void commit({
          orientation,
          // Clearing the orientation clears the consent with it — see
          // `orientationConsent` for why that is not just tidiness.
          show_orientation: orientationConsent(orientation, showOrientation),
          looking_for: lookingFor,
          reveal_by_default: revealByDefault,
        })
      }
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={() => goTo(previousStep('preferences')!)}
    >
      <EmberFieldGroup
        label="Orientation"
        helper="Used to find compatible matches. Hidden unless you choose otherwise below."
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

      {/*
        Rendered only once there is an orientation to show. A switch offering to
        publish a field nobody has filled in has no meaning, and leaving it
        visible invites someone to turn it on and assume it did something.
      */}
      {orientation ? (
        <EmberToggle
          label="Show it on my profile"
          helper="Only people you've matched with or are talking to will see it. Never anyone else, and never in an event room."
          value={showOrientation}
          onValueChange={setShowOrientation}
        />
      ) : null}

      <EmberFieldGroup
        label="At an event"
        helper="You can change this in the room, every time. Anonymous is the default."
      >
        <EmberToggle
          label="Let people see who I am"
          helper="Your name and first photo, to everyone in that room. Off means you appear under a made-up name instead."
          value={revealByDefault}
          onValueChange={setRevealByDefault}
        />
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
