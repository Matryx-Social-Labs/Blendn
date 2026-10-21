import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Grain } from '../ds/Grain'
import { Orbs } from '../ds/Orbs'
import { motionTokens, useReducedMotion } from '../../lib/motion'

/**
 * How strong the orbs are behind each kind of screen, as the Flow 1 and Flow 2 frames draw them: the landing is the hero
 * (full), the email forms sit back, and an onboarding step is under a form (0.45).
 */
export const ORB_LEVEL = { landing: 1, form: 0.6, onboarding: 0.45 } as const

/** Motion #1: the landing's orbs fade in over 600 ms (`gentle`). Reduce Motion places them in `base`. */
const ENTRANCE_MS = 600

/**
 * The backdrop of the entry and onboarding screens (guidelines/backdrop): the brand orbs at the frame's level, the grain
 * over them. L0 only: it fills its parent, is untouchable and is hidden from a screen reader. `paused` holds the drift
 * while the keyboard is up (#22), on top of what Orbs holds itself (Android, Reduce Motion, the background).
 *
 * `enter` fades it in once (the landing). The level is a view's opacity, so Orbs keeps its own tokens.
 */
export function Backdrop({ level, paused = false, enter = false, testID }: { level: number; paused?: boolean; enter?: boolean; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const fade = enter ? FadeIn.duration(reduceMotion ? motionTokens(true).duration.base : ENTRANCE_MS) : undefined
  return (
    <Animated.View testID={testID} entering={fade} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { opacity: level }]}>
        <Orbs set="brand" paused={paused} />
      </View>
      <Grain />
    </Animated.View>
  )
}
