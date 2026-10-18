import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { COLOR, EASING, SPACE } from '../../lib/design/tokens'
import { madeLine } from '../../lib/crewsScreens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'

const EMBLEM = 160
/** flow10.js `make` success: the emblem scales 0.8 → 1 on `base`. */
const FROM_SCALE = 0.8
// design-exception: flow10.js `make` success sits its column 20 apart, between the 16 and 24 steps
const COLUMN_GAP = 20
// design-exception: and the name over its line 6 apart, off the SPACE scale
const TEXT_GAP = 6

/**
 * The crew is made (Flow 10 · 10.2, Success): the emblem appears, the name in
 * the moment role, "Your crew. 3 invited; it starts when someone joins.", and
 * "The crew chat opens next." Tap anywhere to go on at once. Under Reduce
 * Motion the emblem is simply there.
 */
export function MadeBeat({ name, emblemSeed, invited, onContinue }: { name: string; emblemSeed: string; invited: number; onContinue: () => void }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(reduceMotion ? 1 : FROM_SCALE)
  useEffect(() => {
    if (reduceMotion) return
    scale.set(withTiming(1, { duration: motionTokens(false).duration.base, easing: Easing.bezier(...EASING.standard) }))
  }, [reduceMotion, scale])
  const emblem = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return (
    <Pressable
      testID="make-done"
      onPress={onContinue}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${madeLine(invited)} The crew chat opens next.`}
      style={styles.fill}
    >
      <View style={styles.column}>
        <Animated.View style={emblem}>
          <CrewEmblem seed={emblemSeed} size={EMBLEM} />
        </Animated.View>
        <View style={styles.text}>
          <Text style={[font('moment', bold), styles.centre, styles.ink]} numberOfLines={2} adjustsFontSizeToFit>
            {name}
          </Text>
          <Text style={[font('body', bold), styles.centre, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{madeLine(invited)}</Text>
        </View>
        <Text style={[font('meta', bold), styles.centre, styles.tertiary]}>The crew chat opens next.</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center' },
  column: { alignItems: 'center', gap: COLUMN_GAP, paddingVertical: SPACE.xxl },
  text: { alignItems: 'center', gap: TEXT_GAP },
  centre: { textAlign: 'center' },
  ink: { color: COLOR.textPrimary },
  tertiary: { color: COLOR.textTertiary },
})
