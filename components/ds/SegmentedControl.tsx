import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { OPACITY } from '../../lib/theme'
import { CONTROL_FONT_CAP, focusRing, font, useBoldText, useIncreaseContrast } from './shared'

/** Under a finger, a segment the thumb isn't on dims before the thumb moves (the page's pressed state). */
const PRESSED_SEGMENT = 0.7

export type SegmentedControlProps = {
  /** Two or three; four options are chips or a list. */
  items: readonly string[]
  selected: number
  onChange: (index: number) => void
  /** Disabled while busy: 45% of the whole control. */
  disabled?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'focused'
  /** The design gallery only: draws this segment pressed. */
  previewPressed?: number
  testID?: string
}

/**
 * The segmented control (guidelines/components/SegmentedControl.html; ROUND3
 * B10): a 48 pt solid surface capsule with a white thumb. The thumb is the one
 * selection colour, so the control is never on glass and never coloured
 * (§12). Equal segments, 16 pt labels, 700 on the thumb.
 *
 * The thumb slides on `M.snap`; Reduce Motion jumps it. `H.select` when it
 * changes, none on the current segment. Labels cap at 1.3× inside 48 pt;
 * past that Android wraps to two lines and iOS keeps one. Increase Contrast
 * adds the 50% hairline to the track. Read as a tab list.
 */
export function SegmentedControl({ items, selected, onChange, disabled = false, previewState, previewPressed, testID }: SegmentedControlProps) {
  const android = Platform.OS === 'android'
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  const n = items.length

  const pos = useSharedValue(selected)
  useEffect(() => {
    if (pos.get() === selected) return
    pos.set(reduceMotion ? selected : withSpring(selected, { ...SPRING.snap, reduceMotion: ReduceMotion.Never }))
  }, [selected, reduceMotion, pos])
  // Percentages of the track, so the thumb is right on the first frame, before any layout.
  const thumbStyle = useAnimatedStyle(() => ({ left: `${(pos.get() * 100) / n}%` }))

  return (
    <View>
      <View
        testID={testID}
        accessibilityRole="tablist"
        style={[styles.control, contrast && styles.contrast, disabled && { opacity: OPACITY.disabled }]}
      >
        <View style={styles.track} pointerEvents="none">
          <Animated.View testID={testID && `${testID}-thumb`} style={[styles.thumb, { width: `${100 / n}%` }, thumbStyle]} />
        </View>
        {items.map((item, i) => {
          const on = i === selected
          return (
            <Pressable
              key={item}
              testID={testID && `${testID}-${i}`}
              onPress={() => {
                if (on) return
                H.select()
                onChange(i)
              }}
              disabled={disabled}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityRole="tab"
              accessibilityLabel={item}
              accessibilityState={{ selected: on, disabled }}
              style={({ pressed }) => [styles.segment, !on && (pressed || previewPressed === i) && { opacity: PRESSED_SEGMENT }]}
            >
              <Text
                style={[font('button', bold, on ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]), styles.label, { color: on ? COLOR.selectionInk : COLOR.textPrimary }]}
                maxFontSizeMultiplier={CONTROL_FONT_CAP}
                numberOfLines={android ? 2 : 1}
              >
                {item}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {focused || previewState === 'focused'
        ? focusRing(SIZE.control / 2).map((ring, i) => (
            <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
          ))
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  control: {
    height: SIZE.control,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    padding: SPACE.xs,
  },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  track: { position: 'absolute', top: SPACE.xs, bottom: SPACE.xs, left: SPACE.xs, right: SPACE.xs },
  thumb: { position: 'absolute', top: 0, bottom: 0, borderRadius: RADIUS.capsule, backgroundColor: COLOR.selectionFill },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xs },
  label: { textAlign: 'center' },
})
