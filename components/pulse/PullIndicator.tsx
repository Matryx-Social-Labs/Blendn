import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { DiscMark } from '../ds/DiscMark'
import { SPACE } from '../../lib/design/tokens'

/** The monogram's height as it traces. */
const MARK = 22

/**
 * The branded pull's mark (motion #18): the monogram, revealed from the top down as `progress` goes from 0 to 1, so the
 * outline traces as you pull. Decorative; the refresh it stands for is announced by the list. It never takes a touch.
 */
export function PullIndicator({ progress }: { progress: SharedValue<number> }) {
  const reveal = useAnimatedStyle(() => ({ height: MARK * progress.get(), opacity: progress.get() > 0 ? 1 : 0 }))
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.slot} testID="pull-indicator">
      <Animated.View style={[styles.clip, reveal]}>
        <DiscMark height={MARK} fill="white" />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: SPACE.lg, left: 0, right: 0, alignItems: 'center' },
  clip: { overflow: 'hidden', alignItems: 'center' },
})
