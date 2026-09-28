import { Easing, FadeIn, FadeOut, ReduceMotion, withTiming } from 'react-native-reanimated'

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
