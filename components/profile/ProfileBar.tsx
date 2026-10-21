import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, SIZE, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import { IconButton } from '../ds/IconButton'

/** DS #30: the glass bar mounts once the page has moved past this (8 pt). */
export const BAR_GLASS_AT = SPACE.sm
/** DS #30: the small title crossfades in between these offsets; Reduce Motion swaps it at their middle (40 pt). */
export const BAR_TITLE_FROM = 24
export const BAR_TITLE_TO = 56
export const BAR_TITLE_SWAP = (BAR_TITLE_FROM + BAR_TITLE_TO) / 2

export type BarAction = { icon: IconName; label: string; onPress: () => void }

export type ProfileBarProps = {
  /** The page's scroll offset, written by the screen's scroll handler (a shared value, so a frame costs no render). */
  scrollY: SharedValue<number>
  /** The small title that crossfades in as the page's own heading scrolls away. */
  title?: string
  /** Absent on a tab root (Me), where there is nowhere to go back to. */
  onBack?: () => void
  /** Glass circles on the right, in drawing order (the last is the rightmost). */
  actions?: readonly BarAction[]
  /** Over a hero photo the circles are `media` glass until the bar takes over. */
  overPhoto?: boolean
  testID?: string
}

/** Where the bar starts to paint, as a pure function so the thresholds are testable without a scroll view. */
export function barStateAt(y: number) {
  return {
    glass: y > BAR_GLASS_AT,
    // The glass is always mounted and comes up over the first 8 pt (as the Scene's bar does): mounting it popped.
    glassOpacity: interpolate(y, [0, BAR_GLASS_AT], [0, 1], Extrapolation.CLAMP),
    titleOpacity: interpolate(y, [BAR_TITLE_FROM, BAR_TITLE_TO], [0, 1], Extrapolation.CLAMP),
  }
}

/**
 * The bar a profile-shaped screen wears (Flow 6 `me`, `user`, `friend`; DS #30, scroll-edge chrome): at rest only glass circles
 * (`media` over a hero photo, `control` otherwise), straight on the page. The bar's glass is always mounted behind them and comes up over
 * the first 8 pt (as the Scene's bar does), and between 24 and 56 pt the page's own heading hands over to a 17 pt centred title. Reduce Motion:
 * the title swaps at 40 pt.
 *
 * First in the screen's tree, over the scroll view by `zIndex`, so a screen reader starts here (WCAG 2.4.3). The small title is
 * decoration for sighted people: the page's heading is the one that is read.
 */
export function ProfileBar({ scrollY, title, onBack, actions = [], overPhoto = false, testID }: ProfileBarProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const circle = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const [glass, setGlass] = useState(false)

  useAnimatedReaction(
    () => scrollY.get() > BAR_GLASS_AT,
    (on, was) => {
      if (on !== was) scheduleOnRN(setGlass, on)
    },
    []
  )
  const glassStyle = useAnimatedStyle(() => ({ opacity: barStateAt(scrollY.get()).glassOpacity }))
  const titleStyle = useAnimatedStyle(() => {
    const y = scrollY.get()
    return { opacity: reduceMotion ? (y >= BAR_TITLE_SWAP ? 1 : 0) : barStateAt(y).titleOpacity }
  })

  const side = Math.max(onBack ? circle : 0, actions.length ? actions.length * circle + (actions.length - 1) * SPACE.sm : 0)
  const inset = SPACE.lg + side + SPACE.md
  const tier = overPhoto && !glass ? 'media' : 'control'

  return (
    <View testID={testID} pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top + SPACE.sm }]}>
      <Animated.View testID={testID && `${testID}-glass`} pointerEvents="none" style={[StyleSheet.absoluteFill, glassStyle]}>
        <Material role="bar" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.row, { minHeight: circle }]}>
        {onBack ? <IconButton icon={android ? 'arrow-left' : 'chevron-left'} tier={tier} accessibilityLabel="Back" onPress={onBack} testID={testID && `${testID}-back`} /> : null}
        <View pointerEvents="none" style={styles.fill} />
        {actions.map((a) => (
          <IconButton key={a.label} icon={a.icon} tier={tier} accessibilityLabel={a.label} onPress={a.onPress} testID={testID && `${testID}-${a.label}`} />
        ))}
      </View>
      {title ? (
        <Animated.View
          testID={testID && `${testID}-title`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.title, { top: insets.top + SPACE.sm, height: circle, left: inset, right: inset }, titleStyle]}
        >
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold, FONT_FAMILY.brand[700]), styles.ink]}>
            {title}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  fill: { flex: 1 },
  title: { position: 'absolute', justifyContent: 'center' },
  ink: { color: COLOR.textPrimary, textAlign: 'center' },
})
