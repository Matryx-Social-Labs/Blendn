import { Easing, withDelay, withTiming } from 'react-native-reanimated'

import { DURATION, EASING, SPACE } from '../../lib/design/tokens'

/** How far a step travels: the sheet's own 24 pt gutter, never the screen's width. */
export const STEP_SHIFT = SPACE.xl
/** The direction of travel: forward (Next) comes from the right, back comes from the left (spatial consistency). */
export type StepDir = 1 | -1
/** The direction, held where the UI thread can read it when the animation starts: the leaving step's props are from before the tap. */
export type StepDirSource = { get: () => StepDir }

/**
 * A step coming in (DS Flow 10 · 10.2: the step "slides on base"): 24 pt from the side it is travelling from, fading in, on
 * the entrance curve. It waits for the old step's exit (`DURATION.press`) so the two are never on screen at once.
 * Reduce Motion: no travel, a fade over 200.
 */
export const stepIn = (source: StepDirSource, reduceMotion: boolean) => () => {
  'worklet'
  const dir = source.get()
  return {
    initialValues: { opacity: 0, transform: [{ translateX: reduceMotion ? 0 : dir * STEP_SHIFT }] },
    animations: {
      opacity: withDelay(DURATION.press, withTiming(1, { duration: reduceMotion ? 200 : DURATION.base, easing: Easing.bezier(...EASING.gentle) })),
      transform: [{ translateX: withDelay(DURATION.press, withTiming(0, { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) })) }],
    },
  }
}

/** The step leaving: it drifts the way it was going and fades over `press` (100), fast, because the system is responding. */
export const stepOut = (source: StepDirSource, reduceMotion: boolean) => () => {
  'worklet'
  const dir = source.get()
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: DURATION.press, easing: Easing.bezier(...EASING.exit) }),
      transform: [{ translateX: withTiming(reduceMotion ? 0 : -dir * SPACE.sm, { duration: DURATION.press, easing: Easing.bezier(...EASING.exit) }) }],
    },
  }
}
