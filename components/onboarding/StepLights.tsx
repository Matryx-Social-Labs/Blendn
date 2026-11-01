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
 * step, so going through the flow reads as the blend happening. They sit away from the words (`textAlpha`), so the gradient
 * words and the subtitle stay on near-ink. L0: untouchable, hidden from a screen reader. No loop.
 */

const LAST = ONBOARDING_STEPS.length - 1
/** How far the ember light travels towards violet by the payoff: a little, never all the way. */
const SHIFT = 0.6
/** Both lights rest at the landing's settled strength. */
const OPACITY = 0.7
/**
 * Centres as fractions of the window. On a question they sit low, under the words (the chips, the cards and the dock take
 * the light); behind a hero (the payoff's card) they sit high, behind it, and the words under the card stay on ink. The
 * violet one drifts in from the right as the steps go by.
 */
const PLACEMENT = {
  low: { ember: { x: 0.12, y: 0.95 }, violet: { x: 0.92, y: 0.88 } },
  hero: { ember: { x: 0.22, y: 0.34 }, violet: { x: 0.82, y: 0.26 } },
} as const
const DRIFT = 0.06
/** The foot of a question's words, from the top: the bar, the segments, a two-line title and a three-line subtitle, generously. */
const QUESTION_TEXT_FOOT = 440
/** The top of the payoff's words, from the top: the bar and the card above them, at the least. */
const HERO_TEXT_TOP = 440
/** The shortest window the flow is drawn on (iPhone SE, a small Android): the lights come nearest the words there. */
export const SMALLEST_HEIGHT = 640

/** The ember light's colour on step `index`: brand orange on the first, `SHIFT` of the way to violet on the payoff. */
export function lightColour(index: number): string {
  return colourAt([COLOR.brandOrange, COLOR.brandViolet], (SHIFT * index) / LAST)
}

const violetX = (index: number, width: number, x: number) => width * (x - DRIFT * (index / LAST))

/** A light's own alpha at `d` of its radius from the centre, from `LIGHT_STOPS`, times the layer's opacity. */
function alphaAt(d: number): number {
  if (d >= 1) return 0
  const stops = LIGHT_STOPS
  const i = stops.findIndex((s, k) => k > 0 && d <= s.offset)
  const [a, b] = [stops[i - 1], stops[i]]
  return OPACITY * (a.alpha + ((b.alpha - a.alpha) * (d - a.offset)) / (b.offset - a.offset))
}

/**
 * The most either light shows under the screen's words on a window this tall, straight above or below a centre (the worst
 * case): what the gradient words and the subtitle are measured against.
 */
export function textAlpha(height: number, hero: boolean): number {
  const lights = Object.values(PLACEMENT[hero ? 'hero' : 'low'])
  return Math.max(...lights.map(({ y }) => alphaAt(Math.max(0, hero ? HERO_TEXT_TOP - y * height : y * height - QUESTION_TEXT_FOOT) / (LIGHT_SIZE / 2))))
}

export function StepLights({ index, hero = false, testID }: { index: number; hero?: boolean; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const { ember, violet } = PLACEMENT[hero ? 'hero' : 'low']
  // From the last step's place to this one, once. Reduce Motion: already here.
  const from = violetX(Math.max(0, index - 1), width, violet.x) - violetX(index, width, violet.x)
  const offset = useSharedValue(reduceMotion ? 0 : from)
  useEffect(() => {
    if (reduceMotion) return offset.set(0)
    offset.set(withTiming(0, { duration: DURATION.moment, easing: Easing.bezier(...EASING.gentle) }))
  }, [offset, reduceMotion])
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }))

  const place = (x: number, y: number) => ({ left: x - LIGHT_SIZE / 2, top: y - LIGHT_SIZE / 2 })
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[styles.light, place(width * ember.x, height * ember.y)]}>
        <Light id={`step-ember-${index}`} color={lightColour(index)} />
      </View>
      <Animated.View style={[styles.light, place(violetX(index, width, violet.x), height * violet.y), drift]}>
        <Light id={`step-violet-${index}`} color={COLOR.brandViolet} />
      </Animated.View>
      <Grain />
    </View>
  )
}

const styles = StyleSheet.create({
  light: { position: 'absolute', opacity: OPACITY },
})
