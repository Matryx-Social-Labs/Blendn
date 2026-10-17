/*
 * The haptic vocabulary (DESIGN-BRIEF §10.2; the design system's
 * guidelines/haptics/haptics.js). The only place the app calls `expo-haptics`:
 * `scripts/check-design-tokens.js` fails on an import anywhere else.
 *
 * The rules, in short:
 * 1. One event, one haptic. At most one outcome haptic per action.
 * 2. Nothing unsolicited: no haptic for presence, counts, arrivals, state
 *    changes or incoming messages. The one exception is `H.arrive`.
 * 3. Outcome after truth: `success` and `error` fire on the server's answer,
 *    not when the finger lifts.
 * 4. On the frame: press cues on press-in, threshold cues once per crossing,
 *    landing cues on the landing frame.
 * 5. Most taps are silent: the screen's one primary, the centre disc and the
 *    actions below. Secondary buttons, tabs, rows, cards, toasts, copy: none.
 * 6. Reduce Motion never turns haptics off.
 * 7. Android plays system constants only (`performHapticFeedback`), never a raw
 *    vibration — on a cheap motor 40–60 ms buzzes. Each Android cue is a chain
 *    tried by API level; past the end of the chain, nothing plays. The two
 *    exceptions the vocabulary names are `notification` fallbacks below API 30
 *    for an important success and a blocking error.
 * 8. Never the only cue: every haptic goes with a visible change.
 */

import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

/*
 * Constants are named here and read from expo-haptics only when a haptic
 * plays, so importing this module never touches the native enums (a test's
 * partial mock of expo-haptics cannot break every screen that imports it).
 */
type ImpactName = keyof typeof Haptics.ImpactFeedbackStyle
type AndroidName = keyof typeof Haptics.AndroidHaptics

/** An Android system constant and the API level that introduced it. */
type Step = readonly [AndroidName, number] | 'notify-success' | 'notify-error'

const VIRTUAL_KEY: Step = ['Virtual_Key', 5]
const LONG_PRESS: Step = ['Long_Press', 3]
const KEYBOARD_TAP: Step = ['Keyboard_Tap', 8]
const CLOCK_TICK: Step = ['Clock_Tick', 21]
const CONFIRM: Step = ['Confirm', 30]
const REJECT: Step = ['Reject', 30]
const SEGMENT_TICK: Step = ['Segment_Tick', 34]
const TOGGLE_ON: Step = ['Toggle_On', 34]
const TOGGLE_OFF: Step = ['Toggle_Off', 34]
const DRAG_START: Step = ['Drag_Start', 34]
// ponytail: §10.2's GESTURE_THRESHOLD_ACTIVATE (API 34) is not in expo-haptics 57's
// AndroidHaptics, so `threshold` starts at its first fallback, SEGMENT_TICK.

const impact = (name: ImpactName) => () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle[name])
const notify = (name: 'Success' | 'Error') => () => Haptics.notificationAsync(Haptics.NotificationFeedbackType[name])
const selection = () => Haptics.selectionAsync()

function play(ios: () => Promise<void>, android: readonly Step[]) {
  if (Platform.OS === 'ios') {
    ios().catch(() => {})
    return
  }
  if (Platform.OS !== 'android') return
  const api = Number(Platform.Version)
  const step = android.find((s) => typeof s === 'string' || api >= s[1])
  if (!step) return
  const played =
    step === 'notify-success'
      ? notify('Success')()
      : step === 'notify-error'
        ? notify('Error')()
        : Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics[step[0]])
  played.catch(() => {})
}

/** `H.tick`'s iOS ramp: 25% Soft, 50% Light, 75% Medium. */
const TICK_RAMP = { 1: 'Soft', 2: 'Light', 3: 'Medium' } as const
/** `H.match`'s "lub-dub": the second beat lands this long after the first. */
const MATCH_SECOND_BEAT_MS = 180

export const H = {
  /** Press-in on the screen's one gradient primary. Skip it when the action's own outcome haptic follows within ~1s. */
  primary: () => play(impact('Light'), [VIRTUAL_KEY]),
  /** Press-in on the centre Blend'n disc. */
  disc: () => play(impact('Medium'), [VIRTUAL_KEY]),
  /** A chip, segment or option changes value (not on re-tap); picker detents. */
  select: () => play(selection, [SEGMENT_TICK, CLOCK_TICK]),
  /** A custom switch changes. The native switch plays its own. */
  toggle: (on: boolean) => play(impact('Light'), [on ? TOGGLE_ON : TOGGLE_OFF, CLOCK_TICK]),
  /** Pull-to-refresh armed, swipe-to-reply armed (Medium on iOS), a deck card past its threshold. Once per crossing. */
  threshold: ({ swipeToReply = false }: { swipeToReply?: boolean } = {}) =>
    play(impact(swipeToReply ? 'Medium' : 'Light'), [SEGMENT_TICK, CLOCK_TICK]),
  /** A context menu or peek opens. */
  longPress: () => play(impact('Medium'), [LONG_PRESS]),
  /** Picking up a photo to reorder. */
  drag: () => play(impact('Medium'), [DRAG_START, LONG_PRESS]),
  /** A like (double-tap or button). None on unlike or an already-liked. */
  like: () => play(impact('Soft'), [TOGGLE_ON, VIRTUAL_KEY]),
  /** Hold-to-check-in quarters: 1, 2, 3 (25 / 50 / 75%). */
  tick: (quarter: 1 | 2 | 3) => play(impact(TICK_RAMP[quarter]), [SEGMENT_TICK, CLOCK_TICK]),
  /** The hold reaches 100%: committed, not yet successful. */
  commit: () => play(impact('Rigid'), [LONG_PRESS]),
  /**
   * The server confirmed: check-in, RSVP, post, save profile, reveal complete.
   * `important` (check-in, the end of onboarding) also plays below Android 11.
   */
  success: ({ important = false }: { important?: boolean } = {}) =>
    play(notify('Success'), important ? [CONFIRM, 'notify-success'] : [CONFIRM]),
  /**
   * The server refused, a submit failed. Not for as-you-type validation.
   * `blocking` (the person cannot go on) also plays below Android 11.
   */
  error: ({ blocking = false }: { blocking?: boolean } = {}) =>
    play(notify('Error'), blocking ? [REJECT, 'notify-error'] : [REJECT]),
  /** A message is committed from the composer. */
  send: () => play(impact('Light'), [VIRTUAL_KEY]),
  /** The reaction bar: `scrub` while the finger moves across it, `land` when the reaction lands. */
  reaction: (phase: 'scrub' | 'land') =>
    phase === 'scrub'
      ? play(selection, [SEGMENT_TICK, KEYBOARD_TAP])
      : play(impact('Soft'), [TOGGLE_ON, VIRTUAL_KEY]),
  /** The destructive button in a confirm (unmatch, leave, delete, check out). None when the sheet opens. */
  destructive: () => play(impact('Rigid'), [CONFIRM, VIRTUAL_KEY]),
  /** A dragged sheet settles at a different detent. */
  detent: () => play(impact('Light'), [SEGMENT_TICK]),
  /** A wave or like-back aimed at you, while you're in the Room. Once. */
  arrive: () => play(impact('Light'), [CLOCK_TICK]),
  /** The match landing frame, the app's one signature: Medium, then Soft 180ms later. */
  match: () =>
    play(() => {
      setTimeout(() => impact('Soft')().catch(() => {}), MATCH_SECOND_BEAT_MS)
      return impact('Medium')()
    }, [CONFIRM, 'notify-success']),
} as const
