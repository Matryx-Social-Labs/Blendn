import { Easing, ReduceMotion, withDelay, withTiming } from 'react-native-reanimated'

import { DURATION, EASING, RISE, STAGGER } from '../../lib/design/tokens'

/**
 * The Board's list motion (DS #16 list enter, #47 empty to first item).
 *
 * First load only: each card fades in with an 8 pt rise on `base`/entrance, 28 ms apart, for the first eight; a post
 * that arrives where there was nothing, or one you just wrote, rises the same way (#47). Pagination, polls and scroll
 * inserts never animate. Reduce Motion is a crossfade: opacity only, no rise.
 */
const ENTRANCE = Easing.bezier(...EASING.entrance)
const EXIT = Easing.bezier(...EASING.exit)

/** The delay of the nth card of a first load: 28 ms apart, only the first eight. */
export const riseDelay = (index: number) => Math.min(index, STAGGER.itemsMax - 1) * STAGGER.base

/** A card rising into place after `delay`. */
export const riseIn = (delay: number) => () => {
  'worklet'
  const t = { duration: DURATION.base, easing: ENTRANCE, reduceMotion: ReduceMotion.Never }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE.list }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, t)),
      transform: [{ translateY: withDelay(delay, withTiming(0, t)) }],
    },
  }
}

/** Reduce Motion: the same entrance as a crossfade. */
export const fadeIn = (delay: number) => () => {
  'worklet'
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withDelay(delay, withTiming(1, { duration: DURATION.base, easing: ENTRANCE, reduceMotion: ReduceMotion.Never })) },
  }
}

/** The empty state leaves over `quick` with an 8 pt drop (#47); Reduce Motion: it crossfades with no drop. */
export const emptyOut = (reduceMotion: boolean) => () => {
  'worklet'
  const t = { duration: DURATION.quick, easing: EXIT, reduceMotion: ReduceMotion.Never }
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, t), transform: [{ translateY: withTiming(reduceMotion ? 0 : RISE.list, t) }] },
  }
}
