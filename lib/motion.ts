/*
 * Motion, on the redesign's tokens (DESIGN-BRIEF §9.2, lib/design/tokens.ts).
 *
 * Seven springs, one table for both platforms: press · snap · settle · travel
 * · fling · pop · celebrate. Spatial moves use a spring; effects (opacity,
 * colour, blur) use a duration and an easing and never overshoot.
 *
 * Reduce Motion has its own table (REDUCE_MOTION in the tokens): durations
 * shorten, rises and drift go to zero, the shake stops. Read it through
 * `useMotion()`, never by checking the setting and picking numbers inline.
 * Kept under Reduce Motion: the hold (its speed is information), drags,
 * press feedback and every haptic.
 */

import { useReducedMotion } from 'react-native-reanimated'

import { DURATION, EASING, ORBS, PRESS, REDUCE_MOTION, RISE, SHAKE, SPRING, STAGGER } from './design/tokens'

export { DURATION, EASING, PRESS, SPRING, STAGGER }

/**
 * The system Reduce Motion setting.
 *
 * ponytail: Reanimated's, read once at launch, as every animated component
 * here already reads it. Swap for an AccessibilityInfo listener if a change
 * mid-session must apply without a restart.
 */
export { useReducedMotion }

/** The motion values to use, with Reduce Motion's table laid over the base one. */
export function motionTokens(reduceMotion: boolean) {
  if (!reduceMotion) return { duration: DURATION, rise: RISE, orbs: ORBS, shake: SHAKE }
  return {
    duration: { ...DURATION, ...REDUCE_MOTION.duration },
    rise: REDUCE_MOTION.rise,
    orbs: REDUCE_MOTION.orbs,
    shake: { ...SHAKE, ...REDUCE_MOTION.shake },
  }
}

/** `motionTokens` for the current Reduce Motion setting. */
export function useMotion() {
  return motionTokens(useReducedMotion())
}

/*
 * The names today's screens use, kept so they keep working unchanged. The
 * first three are the tokens under their old names; the springs predate the
 * seven and keep their values until their screens are redesigned.
 */

/** @deprecated `DURATION`: fast = quick, normal = base, slow = medium, relaxed = long. */
export const MOTION_DURATION = {
  fast: DURATION.quick,
  normal: DURATION.base,
  slow: DURATION.medium,
  /** First-load entrances on the Me tab: seen once, so they can be seen. */
  relaxed: DURATION.long,
} as const

/** @deprecated `EASING`. */
export const MOTION_EASING = {
  entrance: EASING.entrance,
  gentle: EASING.gentle,
} as const

/** @deprecated `STAGGER`: fast = base, normal = loose. */
export const MOTION_STAGGER = {
  fast: STAGGER.base,
  normal: STAGGER.loose,
} as const

/** @deprecated Not among the seven: a screen moves to `SPRING.settle` / `SPRING.snap` when it is redesigned. */
export const MOTION_SPRING = {
  gentle: {
    damping: 18,
    stiffness: 220,
    mass: 0.9,
  },
  snappy: {
    damping: 16,
    stiffness: 280,
    mass: 0.75,
  },
} as const
