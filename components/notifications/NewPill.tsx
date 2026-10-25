import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withSpring, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'

/** Motion #13: the pill pops in from 0.6 on `M.snap` (opacity over the first 120 ms). */
const POP_FROM = 0.6
const FADE_IN_MS = 120

const popIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: POP_FROM }] },
    animations: {
      opacity: withTiming(1, { duration: FADE_IN_MS }),
      transform: [{ scale: withSpring(1, SPRING.snap) }],
    },
  }
}
const FADE_OUT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))
const REDUCED_IN = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.gentle))

/**
 * "↑ New" (Flow 9 · 9.2 frame 13): the glass pill that says rows landed above while you were scrolled down.
 * Pressing it goes to the top; the list never moves under the finger on its own. A 36 pt capsule on the
 * toast tier at the bar's foot, silent. Reduce Motion: it fades in.
 */
export function NewPill({ top, onPress, testID }: { top: number; onPress: () => void; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const slop = (minTarget() - SIZE.tag - SPACE.xs) / 2
  return (
    <View pointerEvents="box-none" style={[styles.place, { top }]}>
      <Animated.View entering={reduceMotion ? REDUCED_IN : popIn} exiting={FADE_OUT}>
        <Material role="toast" style={[styles.pill, contrast && IC_HAIRLINE]}>
          <Pressable
            testID={testID}
            onPress={onPress}
            hitSlop={{ top: slop, bottom: slop }}
            accessibilityRole="button"
            accessibilityLabel="New notifications, go to the top"
            style={styles.press}
          >
            <Icon name="arrow-up" size={ICON.inline} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
              New
            </Text>
          </Pressable>
        </Material>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // The frame: 36 pt, 14 pt after the label and 10 before the arrow.
  pill: { height: SIZE.tag + SPACE.xs, borderRadius: RADIUS.capsule },
  press: { height: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs, paddingLeft: SPACE.md - SPACE.xxs, paddingRight: SPACE.md + SPACE.xxs },
  ink: { color: COLOR.textPrimary },
})
