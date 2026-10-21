import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import ScalePress from '../motion/ScalePress'
import { COLOR, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { PresenceDot } from './MonoFamily'
import { spoken, type SegmentBadge } from './SegmentedControl'
import { CONTROL_FONT_CAP, focusRing, font, useBoldText, useSelection } from './shared'

type Place = { x: number; w: number }

export type TitleTabsProps = {
  /** Two or three words: the panes of a screen that are peers. */
  items: readonly string[]
  selected: number
  onChange: (index: number) => void
  /** After a word: `'dot'` (someone is live). `null` draws none. */
  badges?: readonly SegmentBadge[]
  /** The right end of the row (the city chip). */
  trailing?: ReactNode
  testID?: string
}

/**
 * The pane's title as a switch (the home drawer's Events | Places; foundations, direction C): the chosen word is white and
 * underlined in the screen's hue, the others are tertiary. No track, no thumb, no drag: the words are content-wide, and
 * weight and size never change, so nothing reflows.
 *
 * The underline stretches into place on two springs: moving right its right edge leaves on `snap` and its left follows on
 * `settle`; moving left, the reverse. It is drawn in the hue's edge colour, flat, with no glow. Reduce Motion jumps it; a
 * relayout (text size, a longer city) re-places it without a spring. `H.select` plays once, on a change.
 */
export function TitleTabs({ items, selected, onChange, badges, trailing, testID }: TitleTabsProps) {
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const sel = useSelection()
  const [places, setPlaces] = useState<readonly (Place | undefined)[]>([])
  const [focused, setFocused] = useState<number | null>(null)
  const lead = useSharedValue(0)
  const tail = useSharedValue(0)
  // The word the underline was last placed under; none until the first measurement.
  const placedAt = useRef<number | null>(null)

  const place = places[selected]
  useEffect(() => {
    if (!place) return
    const from = placedAt.current
    placedAt.current = selected
    const right = place.x + place.w
    if (from === null || from === selected || reduceMotion) {
      tail.set(place.x)
      lead.set(right)
      return
    }
    const forward = selected > from
    tail.set(withSpring(place.x, forward ? SPRING.settle : SPRING.snap))
    lead.set(withSpring(right, forward ? SPRING.snap : SPRING.settle))
  }, [place, selected, reduceMotion, lead, tail])

  const underline = useAnimatedStyle(() => ({ left: tail.get(), width: Math.max(0, lead.get() - tail.get()) }))

  const measure = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout
    setPlaces((prev) => {
      if (prev[i]?.x === x && prev[i]?.w === width) return prev
      const next = [...prev]
      next[i] = { x, w: width }
      return next
    })
  }

  return (
    <View testID={testID} accessibilityRole="tablist" style={styles.row}>
      <View style={styles.words}>
        {items.map((item, i) => {
          const on = i === selected
          const badge = badges?.[i] ?? null
          return (
            // Measured here, not on the pressable: a position inside its own parent is always 0.
            <View key={item} testID={testID && `${testID}-${i}-place`} onLayout={measure(i)}>
              <ScalePress
                testID={testID && `${testID}-${i}`}
                haptic={false}
                onPress={() => {
                  if (on) return
                  H.select()
                  onChange(i)
                }}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused((f) => (f === i ? null : f))}
                hitSlop={{ left: SPACE.md, right: SPACE.md }}
                accessibilityRole="tab"
                accessibilityLabel={spoken(item, badge)}
                accessibilityState={{ selected: on }}
                style={styles.word}
              >
                <Text
                  style={[font('title', bold), { color: on ? COLOR.textPrimary : COLOR.textTertiary }]}
                  maxFontSizeMultiplier={CONTROL_FONT_CAP}
                  numberOfLines={1}
                >
                  {item}
                </Text>
                {badge === 'dot' ? <PresenceDot kind="live" testID={testID && `${testID}-${i}-dot`} /> : null}
              </ScalePress>
              {focused === i
                ? focusRing(RADIUS.rowInCard).map((ring, k) => (
                    <View key={k} testID={k ? undefined : testID && `${testID}-${i}-focus`} pointerEvents="none" style={ring} />
                  ))
                : null}
            </View>
          )
        })}
        {/* Childless, so it is laid out by `left` and `width` alone. Not there to a screen reader: the tab says it is selected. */}
        <Animated.View
          testID={testID && `${testID}-underline`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.underline, { backgroundColor: sel.edge, opacity: place ? 1 : 0 }, underline]}
        />
      </View>
      {/* The words keep their width; a long city truncates inside the chip rather than pushing the row wider. */}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { height: SIZE.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  words: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xl, flexShrink: 0 },
  trailing: { flexShrink: 1, minWidth: 0 },
  word: { height: SIZE.control, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  underline: { position: 'absolute', bottom: SPACE.xxs, height: SPACE.xs, borderRadius: RADIUS.capsule },
})
