import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withSpring, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useAnnounced, useBoldText, useIncreaseContrast } from './shared'

/** Motion #13: the pill pops in from 0.6 on `M.snap` (opacity over the first `quick`). */
const POP_FROM = 0.6

const popIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: POP_FROM }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.quick }),
      transform: [{ scale: withSpring(1, SPRING.snap) }],
    },
  }
}
const FADE_OUT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))
const REDUCED_IN = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.gentle))
/** The frame (Flow 9 · 9.2 frame 13): 36 pt. */
const HEIGHT = SIZE.tag + SPACE.xs

export type NewPillProps = {
  /** "New", "new messages", "3 new posts". */
  label: string
  /** Rows landed above (`arrow-up`, the default) or below (`arrow-down`, a chat read back). */
  direction?: 'up' | 'down'
  /** A count before the label, already formatted ("48", "1.2K"), in Geist Mono. */
  count?: string
  /** Where it floats in its screen, centred: `top` under a header, or `bottom` over a composer. */
  top?: number
  bottom?: number
  /** The whole thing, with what pressing does ("48 new messages, jump to the newest"). */
  accessibilityLabel: string
  /** Said when it appears (the Lobby's held posts). */
  announce?: boolean
  onPress: () => void
  testID?: string
}

/**
 * "↑ New" (buttons board C, owner 2026-11-17: one look for the four "new" pills): a glass capsule saying rows arrived out of
 * view. Pressing it goes to them; the list never moves under the finger on its own. 36 pt on the toast tier, centred,
 * silent. It is navigation, not a yes: never lit, never a hue. Reduce Motion: it fades in.
 */
export function NewPill({ label, direction = 'up', count, top, bottom, accessibilityLabel, announce = false, onPress, testID }: NewPillProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const slop = (minTarget() - HEIGHT) / 2
  // Said on both platforms when asked (a live region is Android's alone).
  useAnnounced(announce ? accessibilityLabel : null)
  return (
    <View pointerEvents="box-none" style={[styles.place, { top, bottom }]}>
      <Animated.View entering={reduceMotion ? REDUCED_IN : popIn} exiting={FADE_OUT}>
        <Material role="toast" style={[styles.pill, contrast && IC_HAIRLINE]}>
          <Pressable
            testID={testID}
            onPress={onPress}
            hitSlop={{ top: slop, bottom: slop }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityLiveRegion={announce ? 'polite' : undefined}
            style={styles.press}
          >
            <Icon name={direction === 'up' ? 'arrow-up' : 'arrow-down'} size={ICON.inline} color={COLOR.textPrimary} />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
              {count ? <Text style={[font('meta', bold, FONT_FAMILY.mono[700]), styles.tabular]}>{`${count} `}</Text> : null}
              {label}
            </Text>
          </Pressable>
        </Material>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  pill: { height: HEIGHT, borderRadius: RADIUS.capsule },
  // 14 pt after the label and 10 before the arrow (the frame).
  press: { height: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs, paddingLeft: SPACE.md - SPACE.xxs, paddingRight: SPACE.md + SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
})
