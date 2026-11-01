import { useEffect } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { Light, LIGHT_SIZE, LIGHT_STOPS } from './LandingIntro'
import { Grain } from '../ds/Grain'
import { COLOR, DURATION, EASING } from '../../lib/design/tokens'
import { colourAt } from '../../lib/mapLit'
import { useReducedMotion } from '../../lib/motion'
import { ONBOARDING_STEPS } from '../../lib/onboarding'

/**
 * The landing's two lights behind every onboarding step (direction A): the ember one cools towards violet a little with each
 * step, so going through the flow reads as the blend happening. They sit low, below the question, so the question's gradient
 * words stay on near-ink (`titleBandAlpha`). L0: untouchable, hidden from a screen reader. No loop.
 */

const LAST = ONBOARDING_STEPS.length - 1
/** How far the ember light travels towards violet by the payoff: a little, never all the way. */
const SHIFT = 0.6
/** Both lights rest at the landing's settled strength. */
const OPACITY = 0.7
/** Centres as fractions of the window. The violet one drifts in from the right as the steps go by. */
const EMBER = { x: 0.12, y: 0.82 }
const VIOLET = { x: 0.92, y: 0.72, drift: 0.06 }
/** Where the question ends at the latest, from the top: the bar, the segments and a two-line display title, generously. */
const TITLE_BAND_BOTTOM = 300
/** The shortest window the flow is drawn on (iPhone SE, a small Android): the lights come nearest the question there. */
export const SMALLEST_HEIGHT = 640

/** The ember light's colour on step `index`: brand orange on the first, `SHIFT` of the way to violet on the payoff. */
export function lightColour(index: number): string {
  return colourAt([COLOR.brandOrange, COLOR.brandViolet], (SHIFT * index) / LAST)
}

const violetX = (index: number, width: number) => width * (VIOLET.x - VIOLET.drift * (index / LAST))

/** A light's own alpha at `d` of its radius from the centre, from `LIGHT_STOPS`, times the layer's opacity. */
function alphaAt(d: number): number {
  if (d >= 1) return 0
  const stops = LIGHT_STOPS
  const i = stops.findIndex((s, k) => k > 0 && d <= s.offset)
  const [a, b] = [stops[i - 1], stops[i]]
  return OPACITY * (a.alpha + ((b.alpha - a.alpha) * (d - a.offset)) / (b.offset - a.offset))
}

/** The most either light shows at the foot of the question on a window this tall: what the gradient words are measured against. */
export function titleBandAlpha(height: number): number {
  const nearest = Math.min(EMBER.y, VIOLET.y) * height
  return alphaAt(Math.max(0, nearest - TITLE_BAND_BOTTOM) / (LIGHT_SIZE / 2))
}

export function StepLights({ index, testID }: { index: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const { width, height } = useWindowDimensions()
  // From the last step's place to this one, once. Reduce Motion: already here.
  const from = violetX(Math.max(0, index - 1), width) - violetX(index, width)
  const offset = useSharedValue(reduceMotion ? 0 : from)
  useEffect(() => {
    if (reduceMotion) return offset.set(0)
    offset.set(withTiming(0, { duration: DURATION.moment, easing: Easing.bezier(...EASING.gentle) }))
  }, [offset, reduceMotion])
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }))

  const place = (x: number, y: number) => ({ left: x - LIGHT_SIZE / 2, top: y - LIGHT_SIZE / 2 })
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[styles.light, place(width * EMBER.x, height * EMBER.y)]}>
        <Light id={`step-ember-${index}`} color={lightColour(index)} />
      </View>
      <Animated.View style={[styles.light, place(violetX(index, width), height * VIOLET.y), drift]}>
        <Light id={`step-violet-${index}`} color={COLOR.brandViolet} />
      </Animated.View>
      <Grain />
    </View>
  )
}

const styles = StyleSheet.create({
  light: { position: 'absolute', opacity: OPACITY },
})
