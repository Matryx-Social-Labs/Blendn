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

import { createElement, useSyncExternalStore } from 'react'
import { AccessibilityInfo } from 'react-native'
// The one place Reanimated's hook is read: everywhere else imports `useReducedMotion` from here (eslint.config.js bans the other).
import { ReducedMotionConfig, ReduceMotion, useReducedMotion as reanimatedAtLaunch } from 'react-native-reanimated'

import { DURATION, EASING, ORBS, PRESS, REDUCE_MOTION, RISE, SHAKE, SPRING, STAGGER } from './design/tokens'

export { DURATION, EASING, PRESS, SPRING, STAGGER }

/*
 * Reduce Motion, followed live (audit M1). Reanimated's own hook is a constant read at launch, so somebody who turns the
 * setting on mid-session (typically because the motion is making them unwell) kept every loop and spring until a
 * restart. The launch value is still Reanimated's (synchronous, so the first frame is already right); a change is the
 * system's `reduceMotionChanged`, held here once for the whole app and shared by every reader.
 */
let changedTo: boolean | null = null
const readers = new Set<() => void>()
let listening: { remove: () => void } | null = null

function follow(onChange: () => void) {
  readers.add(onChange)
  listening ??= AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
    changedTo = on
    readers.forEach((read) => read())
  })
  return () => {
    readers.delete(onChange)
    if (readers.size) return
    listening?.remove()
    listening = null
  }
}

/** The system Reduce Motion setting, now: re-renders its reader when it changes. */
export function useReducedMotion(): boolean {
  const atLaunch = reanimatedAtLaunch()
  return useSyncExternalStore(follow, () => changedTo ?? atLaunch)
}

/**
 * Mounted once, at the root: once the setting has changed mid-session, every Reanimated animation left on its default
 * (`ReduceMotion.System`, which reads a value Reanimated set at launch) follows it too. Not mounted before a change, so
 * the launch value stays Reanimated's own and a dev build does not warn that it was overwritten.
 */
export function ReducedMotionFollower() {
  const changed = useSyncExternalStore(follow, () => changedTo)
  return changed === null ? null : createElement(ReducedMotionConfig, { mode: changed ? ReduceMotion.Always : ReduceMotion.Never })
}

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
