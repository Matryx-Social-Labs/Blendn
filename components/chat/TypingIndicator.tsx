import { useEffect, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { EMBER, EMBER_RADIUS, SPACE, TYPE } from '../../lib/theme'

/**
 * Three dots and a name. Frame `1141:5574`.
 *
 * ## It sits in the list, not above the composer
 *
 * The old screen drew typing as a strip pinned between the list and the input.
 * That is the wrong place: it is a thing happening *in the conversation*, and
 * pinning it meant the row was equally present whether you were reading the
 * newest message or two hundred messages back — a note about right now,
 * hovering over history.
 *
 * The frame puts it at the end of the feed, indented to the width of an avatar
 * plus its gap (`pl-[56px]` = 40 + 16), so it lines up with the message that is
 * about to arrive. Scroll away and it scrolls away with the conversation.
 *
 * ## The dots move
 *
 * A static row of three dots is indistinguishable from a decoration, and this
 * has to read as *live*. Native-driven opacity, staggered by 160ms — cheap
 * enough to leave running, and it stops when the row unmounts. Both halves of
 * the breath are ease-in-out: the dots are changing in place, not arriving.
 *
 * Reduce Motion holds them still at 0.6. The label already says who is typing;
 * the dots are the ambience, not the message.
 */
export function TypingIndicator({ label }: { label: string }) {
  const [dots] = useState(() => [new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)])
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      dots.forEach((value) => value.setValue(0.6))
      return
    }
    const loops = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ])
      )
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [dots, reduceMotion])

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <View style={styles.dots}>
        {dots.map((value, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: value }]} />
        ))}
      </View>
      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

/** `ChatBubble`'s avatar disc. */
const AVATAR = 40

const styles = StyleSheet.create({
  /*
   * A 40pt avatar plus the 16pt gap beside it, so the dots start exactly
   * where the next inbound bubble will.
   */
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingLeft: AVATAR + SPACE.lg, opacity: 0.6 },
  dots: { flexDirection: 'row', gap: SPACE.xs },
  dot: { width: 4, height: 4, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.textSecondary },
  label: { ...TYPE.label, flexShrink: 1 },
})
