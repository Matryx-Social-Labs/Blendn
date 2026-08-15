import { useEffect, useState } from 'react'
import { View } from 'react-native'

import {
  EmberChip,
  EmberChipRow,
  EmberInlineToggle,
  EmberSection,
  EmberToggle,
} from '../../components/onboarding/EmberControls'
import { LookingForCards } from '../../components/onboarding/LookingForCards'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import {
  ORIENTATIONS as ORIENTATION_VALUES,
  ORIENTATION_LABELS,
  orientationDisabled,
  toggleOrientation,
  type Orientation,
} from '../../lib/dating'
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
 * ## Three labels, not one
 *
 * People hold more than one — "queer" alongside "bisexual", "asexual" alongside
 * a romantic orientation — so a single choice made someone pick which part of
 * themselves to omit, and the frame's caption asked for something the control
 * refused. The cap, the "prefer not to say" exclusivity and the dimming rule
 * are in `lib/dating.ts` rather than here, because the Settings editor renders
 * the same field and a rule enforced in one screen is a 400 from the other.
 *
 * The server derives `interested_in` from the **union** of the labels, so
 * adding a second one never narrows who you are shown.
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

/*
 * The list and its labels come from `lib/dating.ts`, not from a copy here.
 *
 * This screen used to hold its own array of eight, which is the same shape of
 * mistake `profiles.interests` made on the server — two lists that agree until
 * one of them is edited. The Settings editor renders the same field, so a copy
 * here is a copy that has to be kept in step with a second screen as well as
 * with the API.
 *
 * "Demisexual" is in the frame and not in the server's list, so it is not
 * offered — a chip that 400s on save is worse than an absent one.
 * The five looking-for options live in `LookingForCards`, beside their artwork.
 */
const ORIENTATIONS = ORIENTATION_VALUES.map((value) => ({
  value,
  label: ORIENTATION_LABELS[value],
}))

export default function PreferencesScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('preferences')

  const [orientations, setOrientations] = useState<Orientation[]>([])
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
    setOrientations((draft.orientations ?? []) as Orientation[])
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
          orientations,
          // Clearing the last one clears the consent with it — see
          // `orientationConsent` for why that is not just tidiness.
          show_orientation: orientationConsent(orientations, showOrientation),
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
         * The frame's own caption, and it is finally true.
         *
         * It said "Select all that apply to you" against a single-select
         * control and a `String?` column, so for a while the screen said "Pick
         * the one that fits best" instead — a caption that describes what the
         * screen does beats one that asks for something it refuses.
         *
         * The column is `orientations String[]` now and this row takes three,
         * so the frame's wording comes back. The cap is stated rather than
         * discovered: chips that would be refused are dimmed, and a limit you
         * meet by tapping a dead chip is one people read as a bug.
         */
        caption="Select all that apply to you — up to three."
        /*
         * Always rendered, hidden until there is an orientation to show.
         *
         * Mounting it conditionally changed the heading row's height the moment
         * somebody tapped a chip, which pushed the heading and everything below
         * it down the page — at the exact moment they were looking at what they
         * had just tapped.
         *
         * A reserved height was the first attempt and was still slightly out,
         * because `transform: scale` on the switch is *visual only*: it still
         * occupies its full unscaled height in layout, so the pill is taller
         * than it looks and any floor is a guess at platform switch metrics.
         *
         * Rendering it always and hiding it makes the two states the same
         * layout by construction, with no number to get wrong.
         */
        right={
          <View
            style={{ opacity: orientations.length ? 1 : 0 }}
            pointerEvents={orientations.length ? 'auto' : 'none'}
            // Hidden from screen readers too — an invisible control that is
            // still announced is worse than one that shifts the layout.
            accessibilityElementsHidden={!orientations.length}
            importantForAccessibility={orientations.length ? 'auto' : 'no-hide-descendants'}
          >
            <EmberInlineToggle
              label="Show on profile"
              hint="Only people you match or talk with will see it. Never a room."
              value={showOrientation}
              onValueChange={setShowOrientation}
            />
          </View>
        }
      >
        <EmberChipRow pack>
          {ORIENTATIONS.map((option) => (
            <EmberChip
              key={option.value}
              label={option.label}
              selected={orientations.includes(option.value)}
              disabled={orientationDisabled(orientations, option.value)}
              onPress={() => setOrientations(toggleOrientation(orientations, option.value))}
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
