import { Easing, FadeIn, FadeOut, ReduceMotion, withTiming } from 'react-native-reanimated'
import { DURATION, EASING, REDUCE_MOTION } from '../../lib/design/tokens'

/*
 * Entering/exiting presets for small things that appear and disappear —
 * banners, a reply bar, a floating button. Seen tens of times a day, so short
 * (150ms in, 120ms out) and ease-out: fast at the start, where the eye lands.
 *
 * Fades only, no layout transition: most of these sit in flow above a
 * composer or a list, and animating the space they take would re-lay-out the
 * screen every frame (see tasks/lessons.md). The fade is what stops the
 * "pop": something arriving from nothing in one frame.
 *
 * The fades ignore Reduce Motion on purpose — a fade *is* the reduced form,
 * and it still says "this just changed". The pop is skipped under it: the
 * control simply appears. That is `ReduceMotion.System` on the pop's timings,
 * which ends them at once when the setting is on. The comment claimed this
 * before the code did — a custom entering worklet is not covered by
 * Reanimated's own reduce-motion handling, so the scale ran regardless.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

export const fadeInFast = FadeIn.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.Never)
export const fadeOutFast = FadeOut.duration(120).easing(EASE_OUT).reduceMotion(ReduceMotion.Never)

/** Opacity plus a 0.9 → 1 scale, for a floating control. Never from scale(0). */
export const popIn = () => {
  'worklet'
  const t = { duration: 150, easing: EASE_OUT, reduceMotion: ReduceMotion.System }
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, t),
      transform: [{ scale: withTiming(1, t) }],
    },
  }
}

export const popOut = () => {
  'worklet'
  const t = { duration: 120, easing: EASE_OUT, reduceMotion: ReduceMotion.System }
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, t),
      transform: [{ scale: withTiming(0.9, t) }],
    },
  }
}

/*
 * A badge arriving and leaving (DS #28, `Badge`'s own): it arrives from 0.8 and settles while it fades in over `quick`, and
 * leaves as a fade over `quick`. Reduce Motion: the fade alone, over the Reduce Motion `quick`.
 */
const GENTLE = Easing.bezier(...EASING.gentle)
const BADGE_FROM = 0.8
export const badgeIn = () => {
  'worklet'
  const t = { duration: DURATION.quick, easing: GENTLE, reduceMotion: ReduceMotion.Never }
  return {
    initialValues: { opacity: 0, transform: [{ scale: BADGE_FROM }] },
    animations: { opacity: withTiming(1, t), transform: [{ scale: withTiming(1, t) }] },
  }
}
export const badgeFadeIn = FadeIn.duration(REDUCE_MOTION.duration.quick).easing(GENTLE).reduceMotion(ReduceMotion.Never)
export const badgeOut = FadeOut.duration(DURATION.quick).easing(GENTLE).reduceMotion(ReduceMotion.Never)

/*
 * A glass pill arriving (ROUND4 B8, approved with Prompt 10): the pill rises
 * 16 pt on `base` with its glass opaque the whole way — a blur faded by
 * opacity reads as a grey smear — and only its contents fade in. Put
 * `glassRiseIn` on the pill and `glassContentsIn` on what is inside it.
 * Reduce Motion: no rise; the contents still fade.
 */
const PILL_RISE = 16
const ENTRANCE = Easing.bezier(...EASING.entrance)
const PILL_IN = DURATION.base
export const glassRiseIn = () => {
  'worklet'
  const t = { duration: PILL_IN, easing: ENTRANCE, reduceMotion: ReduceMotion.System }
  return {
    initialValues: { transform: [{ translateY: PILL_RISE }] },
    animations: { transform: [{ translateY: withTiming(0, t) }] },
  }
}
export const glassContentsIn = FadeIn.duration(PILL_IN).easing(ENTRANCE).reduceMotion(ReduceMotion.Never)

/*
 * A system banner arriving or leaving (DS #44): it slides 16 pt and fades over `base` on the entrance curve, and
 * leaves in a quick fade; the content below shifts on `M.settle` (the parent's layout transition). Reduce Motion: the
 * fade alone, and the content shifts at once.
 */
const BANNER_RISE = 16
export const bannerIn = () => {
  'worklet'
  const t = { duration: DURATION.base, easing: ENTRANCE, reduceMotion: ReduceMotion.System }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -BANNER_RISE }] },
    animations: { opacity: withTiming(1, t), transform: [{ translateY: withTiming(0, t) }] },
  }
}
export const bannerFadeIn = FadeIn.duration(DURATION.base).easing(ENTRANCE).reduceMotion(ReduceMotion.Never)
export const bannerOut = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit)).reduceMotion(ReduceMotion.Never)

/*
 * A whole state arriving (Flow 15: "replaces the landing or the current screen · base 220 ms crossfade · no haptic"): the
 * screen fades in over `base` on the gentle curve; no rise, so there is nothing for Reduce Motion to remove.
 */
export const stateScreenIn = FadeIn.duration(DURATION.base).easing(GENTLE).reduceMotion(ReduceMotion.Never)
