import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import type { RoomWave } from '../../lib/roomWaves'
import { COLOR, EASING, FONT_FAMILY, ICON, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { toastDwell } from '../ds/Toast'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'

/** #19: in from 16 pt above. */
const ENTER_FROM = -SPACE.lg

/**
 * "{name} waved at you" (Flow 4 Room #07, R3-D4 4.2): the ✓ capsule at the top
 * of the Room, between the close chevron and the settings circle, on the toast
 * glass. It names the wave once, then leaves; it is never the only way to
 * answer (the dock row stays). A tap opens their PersonCard, where Wave back is.
 *
 * `H.arrive` once, as it lands (SCRUM-630: it used to be two). The ring on
 * their face is the grid's (#51). In from 16 pt on `M.snap`, out over `quick`
 * (#19). Glass never fades (§5.2 rule 6): on iOS it slides out; Android's
 * solid tier fades too. Reduce Motion: no movement. Read once, politely.
 */
export function WaveToast({ wave, onOpen, onDone, testID = 'wave-toast' }: { wave: RoomWave; onOpen: () => void; onDone: () => void; testID?: string }) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const text = `${wave.fromName} waved at you`
  const android = Platform.OS === 'android'
  const y = useSharedValue(reduceMotion ? 0 : ENTER_FROM)
  const opacity = useSharedValue(android ? 0 : 1)
  const [leaving, setLeaving] = useState(false)
  const { duration } = motionTokens(reduceMotion)

  useEffect(() => {
    H.arrive()
    AccessibilityInfo.announceForAccessibility(`${text}. Their card is one tap away.`)
    if (!reduceMotion) y.set(withSpring(0, SPRING.snap))
    if (android) opacity.set(withTiming(1, { duration: duration.base, easing: Easing.bezier(...EASING.entrance) }))
    const dwell = setTimeout(() => setLeaving(true), toastDwell(text, {}))
    return () => clearTimeout(dwell)
    // Once, as it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!leaving) return
    const exit = { duration: duration.quick, easing: Easing.bezier(...EASING.exit) }
    if (android) opacity.set(withTiming(0, exit))
    else if (!reduceMotion) y.set(withTiming(-(insets.top + SPACE.md + SIZE.circleButton), exit))
    const gone = setTimeout(onDone, reduceMotion && !android ? 0 : duration.quick)
    return () => clearTimeout(gone)
  }, [leaving, android, reduceMotion, insets.top, duration.quick, opacity, y, onDone])

  const motion = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: y.get() }] }))

  return (
    <Animated.View
      testID={testID}
      pointerEvents={leaving ? 'none' : 'box-none'}
      style={[styles.place, { top: insets.top + SPACE.md }, motion]}
    >
      <ScalePress
        onPress={() => {
          onOpen()
          setLeaving(true)
        }}
        pressedScale={PRESS.scale}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint="Opens their card"
        testID={`${testID}-press`}
      >
        <Material role="toast" style={[styles.capsule, contrast && IC_HAIRLINE]}>
          <Icon name="check" size={ICON.control} />
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.text]}>
            {text}
          </Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
          </View>
        </Material>
      </ScalePress>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, alignItems: 'center', zIndex: 2 },
  capsule: {
    height: SIZE.circleButton,
    borderRadius: RADIUS.capsule,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    overflow: 'hidden',
  },
  text: { color: COLOR.textPrimary, flexShrink: 1 },
})
