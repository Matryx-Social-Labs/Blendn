import { useEffect } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import { COLOR, EASING, FONT_FAMILY, RADIUS, SPACE, SPRING, TYPE } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/** The page's caret: a 12 pt square turned 45°, half of it showing (a 6 pt point), 2 pt corners. */
const CARET = { size: 12, radius: 2 } as const
/** It pops from 90% (the page's "pop"; M.pop). */
const POP_FROM = 0.9
/** The design's width: min(screen − 32, 300) (round4/r4.js). At 360 dp a tip's sentence is two lines. */
export const COACH_MARK_MAX_WIDTH = 300
/** The caret's size, for a screen that centres it on what it names. */
export const COACH_MARK_CARET = CARET.size

export type CoachMarkProps = {
  /** One sentence. The same text lives in the help screen for people who dismissed it. */
  text: string
  /** "Got it", leaving the screen, or using the thing it names. */
  onDismiss: () => void
  /** The text action; `false` when it goes on use alone. */
  action?: string | false
  /** Which edge the caret points from: `top` under a control, `bottom` above one. */
  caret?: 'top' | 'bottom'
  /** The caret's distance from the card's left edge: over the thing it names. */
  caretOffset?: number
  testID?: string
}

/**
 * The app explaining one thing, once (guidelines/components/CoachMark.html):
 * a surface card with a caret at the control it names, one sentence in meta,
 * "Got it" at the right. One at a time, never a tour, never a scrim, never a
 * loop; the screen places it after the element it points at and decides
 * "once".
 *
 * Announced once as it appears, never taking focus. No haptic. It pops in on
 * `M.pop`; under Reduce Motion it fades in without the pop. Increase Contrast:
 * the 50% hairline. The page's drop shadow is not drawn: surfaces are flat.
 */
export function CoachMark({ text, onDismiss, action = 'Got it', caret = 'top', caretOffset = SPACE.xl, testID }: CoachMarkProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(reduceMotion ? 1 : POP_FROM)
  const opacity = useSharedValue(0)

  useEffect(() => {
    const fade = { duration: motionTokens(reduceMotion).duration.quick, easing: Easing.bezier(...EASING.gentle) }
    opacity.set(withTiming(1, fade))
    if (!reduceMotion) scale.set(withSpring(1, SPRING.pop))
    const spoken = action ? `${text} ${action}, button.` : text
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken)
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appear = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }))
  const origin = `${caretOffset + CARET.size / 2}px ${caret === 'top' ? '0%' : '100%'}`

  return (
    <Animated.View testID={testID} accessibilityLiveRegion="polite" style={[{ transformOrigin: origin }, appear]}>
      <View
        testID={testID && `${testID}-caret`}
        style={[styles.caret, { left: caretOffset }, caret === 'top' ? { top: -CARET.size / 2 } : { bottom: -CARET.size / 2 }]}
      />
      <View testID={testID && `${testID}-card`} style={[styles.card, contrast && IC_HAIRLINE]}>
        <Text style={[font('meta', bold), styles.text]}>{text}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            onPress={onDismiss}
            style={styles.action}
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.text]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  caret: {
    position: 'absolute',
    width: CARET.size,
    height: CARET.size,
    borderRadius: CARET.radius,
    backgroundColor: COLOR.surface,
    transform: [{ rotate: '45deg' }],
  },
  card: {
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.sm,
  },
  text: { color: COLOR.textPrimary },
  action: { alignSelf: 'flex-end' },
})
