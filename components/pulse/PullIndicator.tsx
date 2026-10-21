import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { MONOGRAM_ASPECT, MONOGRAM_BOX, MONOGRAM_PATH } from '../ds/DiscMark'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** The monogram's height as it traces. */
const MARK = 22
/**
 * The longest stroke of the outline, in the path's own units (measured: 552). Every subpath restarts the dash, so each
 * traces from its start and the shorter ones finish first; one unit more, so a hair of rounding never leaves a tail.
 */
export const OUTLINE_LENGTH = 553
/** About 1.5 pt at this size, in the path's units (the box is 137 wide, drawn about 19 pt). */
const STROKE = 10

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * The branded pull's mark (motion #18): the monogram's outline is drawn as you pull, a stroke dash from nothing to the
 * whole outline as `progress` goes from 0 to 1 (the technique `DrawnGlyph` draws its strokes with). Reduce Motion shows
 * it whole and still, at the first of the pull. Decorative; the refresh it stands for belongs to the list. It never takes
 * a touch.
 */
export function PullIndicator({ progress }: { progress: SharedValue<number> }) {
  const reduceMotion = useReducedMotion()
  const traced = useAnimatedProps(() => ({
    strokeDashoffset: reduceMotion ? 0 : OUTLINE_LENGTH * (1 - progress.get()),
    opacity: progress.get() > 0 ? 1 : 0,
  }))
  const { x, y, width, height } = MONOGRAM_BOX
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.slot} testID="pull-indicator">
      <Svg width={MARK * MONOGRAM_ASPECT} height={MARK} viewBox={`${x} ${y} ${width} ${height}`} fill="none">
        <AnimatedPath
          d={MONOGRAM_PATH}
          stroke={COLOR.textPrimary}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={OUTLINE_LENGTH}
          animatedProps={traced}
        />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: SPACE.lg, left: 0, right: 0, alignItems: 'center' },
})
