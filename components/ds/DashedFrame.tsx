import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'

import { COLOR } from '../../lib/design/tokens'

/** Flow 5 #11 and round 4 #37: a 1.5 pt dash of 6 with gaps of 4. */
const STROKE = 1.5
const DASH = '6 4'

/**
 * The dashed outline of something that keeps its place but is gone (a message removed by moderation): drawn in SVG over
 * its parent's box, at the given radius, in `inputBorder`. Not a `borderStyle: 'dashed'`: Android dashes at 3x the
 * stroke (a near-solid line at 1 dp), iOS uses its own pattern, and any per-side width or colour silently draws solid
 * on Android. The SVG is the same on both platforms and cannot fall back. Decorative: hidden from screen readers.
 */
export function DashedFrame({ radius, testID }: { radius: number; testID?: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const inset = STROKE / 2
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Rect
            x={inset}
            y={inset}
            width={size.width - STROKE}
            height={size.height - STROKE}
            rx={Math.max(0, radius - inset)}
            fill="none"
            stroke={COLOR.inputBorder}
            strokeWidth={STROKE}
            strokeDasharray={DASH}
          />
        </Svg>
      ) : null}
    </View>
  )
}
