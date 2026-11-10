import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'

import { swapIn } from './presence'

/**
 * A part that comes and goes with an answer, or is swapped for another (motion audit M16, M27): it fades in on `swapIn`.
 * Give `id` when one part replaces another in the same place, so the new one is a new view and fades in too.
 *
 * No exit: every audited part has content below it (or, in a dock, above it), which moves into its place at once, and a
 * fading part would sit on it (tasks/lessons.md: no layout transitions).
 *
 * Keep it mounted and pass the part as its child (`<Swap>{cond ? <Part /> : null}</Swap>`): what is there on the
 * screen's first paint appears as it is (`skipEntering` on mount, as `ReceiptMark` does), so only a change fades.
 */
export function Swap({ id, style, testID, children }: {
  id?: string | number
  style?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}) {
  const shown = children !== null && children !== undefined && children !== false
  return (
    <LayoutAnimationConfig skipEntering>
      {shown ? (
        <Animated.View key={id} entering={swapIn} style={style} testID={testID}>
          {children}
        </Animated.View>
      ) : null}
    </LayoutAnimationConfig>
  )
}
