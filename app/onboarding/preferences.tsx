import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Avatar } from '../../components/ds/Avatar'
import { ChipSet } from '../../components/ds/ChipSet'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { Toggle } from '../../components/ds/Toggle'
import { font, minTarget, PRESSED_WASH, useBoldText } from '../../components/ds/shared'
import ScalePress from '../../components/motion/ScalePress'
import { LookingForCards } from '../../components/onboarding/LookingForCards'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import {
  ORIENTATIONS as ORIENTATION_VALUES,
  ORIENTATION_LABELS,
  orientationDisabled,
  toggleOrientation,
  withoutDatingChoice,
  type Orientation,
} from '../../lib/dating'
import { COLOR, DURATION, EASING, FONT_FAMILY, MAX_FONT_SCALE, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { anonymousByDefault, isUnder18, orientationConsent } from '../../lib/onboarding'
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
 * The Anonymity block, and the one with the sharpest consequence.
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

/** What the anonymity switch says it does, in the app's words (SCRUM-493): off only means the app offers the reveal at check-in. */
const ANONYMITY_HELP = 'Join rooms under a made-up name. Off, we’ll offer to show your name and photo when you check in.'
const ORIENTATION_PRIVACY = 'Only people you match or talk with will see it. Never a room.'
/** The anonymous example drawn beside the switch: decorative, a creature on its plate, never this person's real room name. */
const EXAMPLE_PSEUDONYM = 'Quiet Heron'
/** The anonymity row is as tall as its face. */
const ROW_MIN = 48
/** The "Show on profile" switch is drawn at 0.8 in its pill, with its 5 pt of slack taken out of the margin (Flow 2 preferences). */
const PILL_SWITCH_SCALE = 0.8
const PILL_HEIGHT = 36
/** The pill comes in as the first orientation is chosen: opacity on `quick`, on the gentle curve (a CSS transition, off the JS thread). */
const PILL_FADE = { transition: `opacity ${DURATION.quick}ms cubic-bezier(${EASING.gentle.join(', ')})` } as unknown as ViewStyle
const PILL_SWITCH_SLACK = SPACE.xs + SPACE.xxs / 2

/**
 * "Show on profile": a pill beside Orientation's heading, the one element a screen reader meets (a switch, named, with the
 * consequence as its hint). The switch inside is drawn, not operated; the pill plays `H.toggle` and flips it. Its target
 * reaches 44 / 48 by slop above and below.
 */
function ShowOnProfile({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  const bold = useBoldText()
  const slop = (minTarget() - PILL_HEIGHT) / 2
  return (
    <Pressable
      testID="onboarding-show-orientation"
      onPress={() => {
        H.toggle(!value)
        onValueChange(!value)
      }}
      hitSlop={{ top: slop, bottom: slop }}
      accessibilityRole="switch"
      accessibilityLabel="Show on profile"
      accessibilityHint={ORIENTATION_PRIVACY}
      accessibilityState={{ checked: value }}
      style={styles.pill}
    >
      <View style={styles.pillSwitch}>
        <Toggle value={value} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.pillText]}>Show on profile</Text>
    </Pressable>
  )
}

export default function PreferencesScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('preferences')
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()

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
  // Orientation is for dating, and dating is 18+: a minor is not asked, and
  // nothing is written for them (SCRUM-200). Read from the draft's birth date
  // — `basics` is not skippable, so it is there.
  const under18 = loaded && isUnder18(draft.dateOfBirth)

  // Prefilled once, in the render that first sees `loaded`.
  const [prefilled, setPrefilled] = useState(false)
  if (loaded && !prefilled) {
    setPrefilled(true)
    setOrientations((draft.orientations ?? []) as Orientation[])
    setShowOrientation(draft.show_orientation ?? false)
    setLookingFor(draft.looking_for ?? [])
    setAnonymous(anonymousByDefault(draft))
  }

  const toggle = (value: string) =>
    setLookingFor((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    )

  return (
    <OnboardingScreen
      step="preferences"
      title="Your "
      titleAccent="preferences"
      subtitle="Who you’d like to meet and why you go out. It shapes who you’re introduced to."
      ctaLabel="Continue"
      ctaBusy={saving}
      onContinue={() =>
        void commit({
          ...(under18
            ? {}
            : {
                orientations,
                // Clearing the last one clears the consent with it — see
                // `orientationConsent` for why that is not just tidiness.
                show_orientation: orientationConsent(orientations, showOrientation),
              }),
          // A draft written before the birth date said otherwise can hold it.
          looking_for: under18 ? withoutDatingChoice(lookingFor) : lookingFor,
          reveal_by_default: !anonymous,
        })
      }
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {under18 ? null : (
        <View style={styles.section}>
          <SectionHeader
            title="Orientation"
            /*
             * The frame's own caption, and it is finally true: the column is
             * `orientations String[]` and this row takes three. The cap is
             * stated rather than discovered: chips that would be refused are
             * dimmed, and a limit you meet by tapping a dead chip is one
             * people read as a bug.
             */
            caption="Select all that apply to you — up to three."
            /*
             * Always rendered, hidden until there is an orientation to show.
             *
             * Mounting it conditionally changed the heading row's height the
             * moment somebody tapped a chip, which pushed the heading and
             * everything below it down the page — at the exact moment they
             * were looking at what they had just tapped. Hidden from screen
             * readers too: an invisible control that is still announced is
             * worse than one that shifts the layout.
             */
            right={
              <View
                style={[{ opacity: orientations.length ? 1 : 0 }, PILL_FADE]}
                pointerEvents={orientations.length ? 'auto' : 'none'}
                accessibilityElementsHidden={!orientations.length}
                importantForAccessibility={orientations.length ? 'auto' : 'no-hide-descendants'}
              >
                <ShowOnProfile value={showOrientation} onValueChange={setShowOrientation} />
              </View>
            }
          />
          <ChipSet
            items={ORIENTATIONS.map((option) => ({ key: option.value, label: option.label, dimmed: orientationDisabled(orientations, option.value) }))}
            selection="multi"
            selected={orientations}
            capHint="Up to three"
            hint={orientations.length ? ORIENTATION_PRIVACY : undefined}
            onToggle={(value) => setOrientations(toggleOrientation(orientations, value as Orientation))}
            testID="onboarding-orientations"
          />
        </View>
      )}

      {/*
        Named "Anonymity" rather than "At an event", and the toggle is phrased
        as *turning anonymity off* rather than as turning visibility on.

        The concept has to be learned somewhere, and this is the only screen
        that gets to teach it. Every surface afterwards — the check-in warning,
        the room banner, the pseudonym on your own messages — says "anonymous",
        so a person who met the idea here recognises it there. "Let people see
        who I am" describes the same switch and teaches nothing.
      */}
      <View style={styles.section}>
        <SectionHeader title="Anonymity" caption="You can change this in any room." />
        <View style={styles.card}>
          <ScalePress
            testID="onboarding-anonymous"
            onPress={() => {
              H.toggle(!anonymous)
              setAnonymous(!anonymous)
            }}
            accessibilityRole="switch"
            accessibilityLabel="Stay anonymous at events"
            accessibilityHint={ANONYMITY_HELP}
            accessibilityState={{ checked: anonymous }}
            pressedScale={Platform.OS === 'android' ? 1 : PRESS.scale}
            android_ripple={{ color: PRESSED_WASH.android }}
            style={styles.cardRow}
          >
            <Avatar kind="creature" pseudonym={EXAMPLE_PSEUDONYM} size={48} ring={COLOR.surface} />
            <View style={styles.cardText}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Stay anonymous at events</Text>
              {/* The preview line changes with the switch (Flow 2 preferences 04): the new one fades in on `quick`. */}
              <Animated.Text key={anonymous ? 'anon' : 'named'} entering={FadeIn.duration(motionTokens(reduceMotion).duration.quick)} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.tertiary]}>
                {anonymous ? 'You’d appear under a made-up name' : 'Your name and photo, if you say so'}
              </Animated.Text>
            </View>
            <Toggle value={anonymous} />
          </ScalePress>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{ANONYMITY_HELP}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Looking for" caption="What brings you to Blend’n today?" />
        <LookingForCards selected={lookingFor} onToggle={toggle} withoutDating={under18} />
      </View>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    height: PILL_HEIGHT,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  pillSwitch: { transform: [{ scale: PILL_SWITCH_SCALE }], marginHorizontal: -PILL_SWITCH_SLACK },
  pillText: { color: COLOR.textPrimary },
  card: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: ROW_MIN },
  cardText: { flex: 1, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
})
