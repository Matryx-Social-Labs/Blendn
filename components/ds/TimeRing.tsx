import { memo, useLayoutEffect, useRef, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { COLOR, DURATION, EASING, TYPE } from '../../lib/design/tokens'
import { font, useBoldText, useIncreaseContrast } from './shared'

/** The page's ring: the baseline 7 pt inside the edge (`r = size/2 − 7`), 0.8 tracking. */
const BASELINE_INSET = 7
const TRACKING = 0.8
/** Where a 12/16 line box puts its baseline. ponytail: measured by eye, not from the font's metrics. */
const BASELINE_IN_LINE = 0.8
/** Satoshi's average advance at 12 pt; every glyph gets the same arc (ponytail: no per-glyph widths). */
const ADVANCE_EM = 0.55

/**
 * Your face in the Room wears the time (guidelines/components/TimeRing.html):
 * "In the room · 1h 12m" set on a circle around it, Satoshi 500 at the 12 pt
 * floor, 0.8 tracking, textSecondary, centred on the top. 112 with a 72 face
 * inside (`children`); the venue room reads "Live · 42 min left".
 *
 * Each glyph is its own view turned about the centre (no SVG text: an SVG
 * font lookup is not proven against the app's registered font names). It
 * never scales with text: a decoration of the count the reader gets as text,
 * so it is hidden and the caller labels the face ("You, in the room 1 hour
 * 12 minutes"). Bold Text 700; Increase Contrast white. The words change on a
 * `base` fade, once a minute; nothing rotates. Silent.
 */
export const TimeRing = memo(function TimeRing({
  text,
  size = 112,
  children,
  testID,
}: {
  text: string
  size?: number
  children?: ReactNode
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const shown = useSharedValue(1)
  const last = useRef(text)
  // Before paint, so the new words never show a frame at full strength before they fade in.
  useLayoutEffect(() => {
    if (last.current === text) return
    last.current = text
    shown.set(0)
    shown.set(withTiming(1, { duration: DURATION.base, easing: Easing.bezier(...EASING.standard) }))
  }, [text, shown])
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }))

  const glyph = [font('caption', bold), styles.glyph, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]
  const radius = size / 2 - BASELINE_INSET
  const step = (((TYPE.caption.fontSize * ADVANCE_EM + TRACKING) / radius) * 180) / Math.PI
  const chars = Array.from(text)
  const start = -((chars.length - 1) * step) / 2
  const top = BASELINE_INSET - Math.round(TYPE.caption.lineHeight * BASELINE_IN_LINE)

  return (
    <View testID={testID} style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
      <Animated.View
        testID={testID && `${testID}-words`}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, fade]}
      >
        {chars.map((c, i) => (
          <View
            key={i}
            testID={testID && `${testID}-slot`}
            style={[styles.slot, { width: size, height: size, transform: [{ rotate: `${start + i * step}deg` }] }]}
          >
            <Text testID={testID && `${testID}-glyph`} allowFontScaling={false} style={[glyph, { top }]}>
              {c}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  )
})

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
  glyph: { letterSpacing: TRACKING, textAlign: 'center' },
})
