import { useEffect, useState } from 'react'

import {
  EmberChip,
  EmberChipRow,
  EmberInlineToggle,
  EmberSection,
  EmberToggle,
} from '../../components/onboarding/EmberControls'
import { LookingForCards } from '../../components/onboarding/LookingForCards'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { anonymousByDefault, orientationConsent } from '../../lib/onboarding'
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
// The five live in `LookingForCards` now, beside the artwork each one uses.

export default function PreferencesScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('preferences')

  const [orientation, setOrientation] = useState<string | undefined>()
  const [showOrientation, setShowOrientation] = useState(false)
  const [lookingFor, setLookingFor] = useState<string[]>([])
  /*
   * Holds *anonymity*, not its opposite.
   *
   * The stored field is `reveal_by_default` and the switch says "stay
   * anonymous", so one of the two has to be inverted somewhere. Doing it once,
   * at the boundary where the value is read and written, beats a `!` at the
   * render site — that version reads as a bug every time somebody looks at it,
   * and the default being safe stops being obvious.
   *
   * The default comes from `anonymousByDefault` rather than being written here
   * as `true`. A literal in a component is a thing any future edit can flip
   * with nothing failing; the function has a test on it, so flipping it breaks
   * the build instead of breaking somebody's anonymity.
   */
  const [anonymous, setAnonymous] = useState(() => anonymousByDefault({}))

  useEffect(() => {
    if (!loaded) return
    setOrientation(draft.orientation)
    setShowOrientation(draft.show_orientation ?? false)
    setLookingFor(draft.looking_for ?? [])
    setAnonymous(anonymousByDefault(draft))
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
      subtitle="Be your authentic self. Help us curate the right connections for your journey."
      ctaLabel="Continue"
      ctaBusy={saving}
      onContinue={() =>
        void commit({
          orientation,
          // Clearing the orientation clears the consent with it — see
          // `orientationConsent` for why that is not just tidiness.
          show_orientation: orientationConsent(orientation, showOrientation),
          looking_for: lookingFor,
          reveal_by_default: !anonymous,
        })
      }
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      <EmberSection
        title="Orientation"
        /*
         * The frame says "Select all that apply to you" and that caption is
         * wrong here, twice over.
         *
         * The control is single-select — tapping a chip replaces the choice —
         * and `profiles.orientation` is a single `String?` that
         * `deriveInterestedIn` reads one value from. So the frame's caption
         * described a control nobody had built and a column that cannot hold
         * the answer, and copying it onto a single-select was worse than
         * either: a caption that tells you to do something the screen refuses.
         *
         * Whether orientation *should* be multi-select is a real question —
         * people do hold more than one label — but it is an API change
         * (`orientation` to `orientations[]`, and `deriveInterestedIn` reworked
         * around it), not a caption. Raised in docs/ONBOARDING.md.
         */
        caption="Pick the one that fits best. Tap again to clear it."
        right={
          orientation ? (
            <EmberInlineToggle
              label="Show on profile"
              hint="Only people you match or talk with will see it. Never a room."
              value={showOrientation}
              onValueChange={setShowOrientation}
            />
          ) : undefined
        }
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
      </EmberSection>

      {/*
        Named "Anonymity" rather than "At an event", and the toggle is phrased
        as *turning anonymity off* rather than as turning visibility on.
        
        The concept has to be learned somewhere, and this is the only screen
        that gets to teach it. Every surface afterwards — the check-in warning,
        the room banner, the pseudonym on your own messages — says "anonymous",
        so a person who met the idea here recognises it there. "Let people see
        who I am" describes the same switch and teaches nothing.
      */}
      <EmberSection title="Anonymity" caption="You can change this in any room.">
        <EmberToggle
          label="Stay anonymous at events"
          helper="Join rooms under a made-up name. Off, everyone there sees your name and photo."
          value={anonymous}
          onValueChange={setAnonymous}
        />
      </EmberSection>

      <EmberSection title="Looking For" caption="What brings you to Blend'n today?">
        <LookingForCards selected={lookingFor} onToggle={toggle} />
      </EmberSection>
    </OnboardingScreen>
  )
}
