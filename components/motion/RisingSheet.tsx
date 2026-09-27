import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useReducedMotion,
  withTiming,
  type EntryAnimationsValues,
} from 'react-native-reanimated'
import { MOTION_DURATION } from '../../lib/motion'

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1)
const SHEET_MS = 300

const rise = (values: EntryAnimationsValues) => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: values.targetHeight }] },
    animations: { transform: [{ translateY: withTiming(0, { duration: SHEET_MS, easing: EASE_SHEET }) }] },
  }
}
const fade = FadeIn.duration(MOTION_DURATION.normal).reduceMotion(ReduceMotion.Never)

/**
 * The sheet half of a bottom sheet inside a transparent `<Modal animationType="fade">`.
 *
 * `animationType="slide"` on a transparent Modal slides the *whole layer* —
 * the dim scrim rode up from the bottom of the screen with the sheet, a grey
 * wall arriving instead of the page darkening. So the Modal fades (the scrim
 * darkens in place) and only this rises, by its own height, on the iOS sheet
 * curve. Closing is the Modal's fade.
 *
 * Timed rather than sprung: the sheet opens from a tap, with no velocity to
 * carry. Reduce Motion: it fades in with the scrim.
 */
export function RisingSheet({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <Animated.View entering={reduceMotion ? fade : rise} style={style}>
      {children}
    </Animated.View>
  )
}
