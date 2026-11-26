import { useState } from 'react'
import { Platform, StyleSheet, Text } from 'react-native'

import { Toggle } from '../../components/ds/Toggle'
import { font, PRESSED_WASH, useBoldText } from '../../components/ds/shared'
import ScalePress from '../../components/motion/ScalePress'
import { LookingForCards, type Intent } from '../../components/onboarding/LookingForCards'
import { normaliseIntents, toggleIntent } from '../../lib/intents'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { COLOR, MAX_FONT_SCALE, PRESS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { anonymousByDefault } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step two — what you are here for, and how you enter a room.
 *
 * No orientation question: it fed only dating matching, and dating is not an intent in 1.0 (register D-002, SCRUM-1192).
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
 * ## "Why you go out" is the intent, not free text
 *
 * The answers are the server's `intent_default` enum, Edit profile's three (`LookingForCards`): friendship, networking or
 * both, or "just here" alone (`toggleIntent`). A resumed answer shows picked, less a stored `dating` (`normaliseIntents`). It is
 * what matching ranks on and what the Board's profile gate needs: an account that never wrote it could not post, and was
 * asked again at its first check-in. `looking_for` (free text) is no longer written; old profiles keep what they have.
 */

/** What the anonymity switch says it does, in the app's words (SCRUM-493): off only means the app offers the reveal at check-in. */
const ANONYMITY_HELP = 'Join rooms under a made-up name. Off, we’ll offer to show your name and photo when you check in.'
/** The anonymity row is as tall as its face. */
const ROW_MIN = 48

export default function PreferencesScreen() {
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('preferences')
  const bold = useBoldText()

  /** Null until something is tapped: the stored answer (resumed) is sent as shown. */
  const [picked, setPicked] = useState<Intent[] | null>(null)
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

  // Prefilled once, in the render that first sees `loaded`.
  const [prefilled, setPrefilled] = useState(false)
  if (loaded && !prefilled) {
    setPrefilled(true)
    setAnonymous(anonymousByDefault(draft))
  }

  // A draft from before 1.0 can hold a stored 'dating': it is neither shown nor sent (D-002).
  const intents: Intent[] = picked ?? normaliseIntents(draft.intent_default ?? [])

  return (
    <OnboardingScreen
      step="preferences"
      title="What brings "
      titleAccent="you out?"
      subtitle="It shapes who you’re introduced to."
      ctaLabel="Continue"
      ctaBusy={saving}
      onContinue={() =>
        void commit({
          // Always present, so a stale draft value (an old 'dating') is overwritten rather than carried: stepPayload drops undefined.
          // Everything taken off is an answer too: an empty list withdraws what was stored. Untouched and empty, nothing is sent.
          intent_default: intents.length ? intents : picked ? [] : undefined,
          reveal_by_default: !anonymous,
        })
      }
      secondaryLabel="Skip"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      <LookingForCards selected={intents} onToggle={(value) => setPicked(toggleIntent(intents, value))} />

      {/*
        Anonymity is one line with its switch (direction A), and still phrased as *turning anonymity off* rather than as
        turning visibility on: every surface afterwards (the check-in warning, the room banner, the pseudonym on your own
        messages) says "anonymous", so a person who met the idea here recognises it there. What it does is the hint.
      */}
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
        style={styles.anonymity}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.anonymityText]}>
          Stay anonymous at events
        </Text>
        <Toggle value={anonymous} />
      </ScalePress>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.anonymityHelp]}>
        {ANONYMITY_HELP}
      </Text>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  anonymity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: ROW_MIN },
  anonymityText: { flex: 1, color: COLOR.textPrimary },
  anonymityHelp: { color: COLOR.textSecondary, marginTop: -SPACE.lg },
})
