import { StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Grain } from '../ds/Grain'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { GalaxyBackdrop, type Shelf } from './GalaxyBackdrop'

/**
 * How strong the sky is behind each kind of screen: the landing is the hero (full), the forms and system screens sit
 * back. (`onboarding` is the steps' level; they draw their own lights, StepLights, not this.)
 */
export const ORB_LEVEL = { landing: 1, form: 0.6, onboarding: 0.45 } as const

/** Motion #1: the landing's sky fades in over 600 ms (`gentle`). Reduce Motion places it in `base`. */
const ENTRANCE_MS = 600

/**
 * The backdrop of the entry screens (Flow 1b, 2026-11-02): two galaxies colliding. `enter` is the landing: the collision
 * plays once as it fades in, then what it left turns until the landing is left (owner, 2026-11-03). Every other screen
 * gets the remnant, at its level, from where the landing was left. The grain over it. L0 only: it fills its parent, is
 * untouchable and is hidden from a screen reader. `paused` holds it while the keyboard is up or another screen is over
 * it; it holds itself in the background and under Reduce Motion.
 * `shelf` is the landing tagline's box, for the ink band that keeps the words at AA.
 */
export function Backdrop({ level, paused = false, enter = false, shelf, testID }: { level: number; paused?: boolean; enter?: boolean; shelf?: Shelf | null; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const fade = enter ? FadeIn.duration(reduceMotion ? motionTokens(true).duration.base : ENTRANCE_MS) : undefined
  return (
    <Animated.View testID={testID} entering={fade} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { opacity: level }]}>
        <GalaxyBackdrop mode={enter ? 'collision' : 'remnant'} paused={paused} shelf={shelf} />
      </View>
      <Grain />
    </Animated.View>
  )
}
