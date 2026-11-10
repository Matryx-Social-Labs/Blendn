import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'

import { swapIn, swapOut } from './presence'

/**
 * A part that comes and goes with an answer, or is swapped for another (motion audit M16, M27): it fades in on `swapIn`
 * and, with `exits`, out on `swapOut`. Give `id` when one part replaces another in the same place, so the new one is a
 * new view and fades in too.
 *
 * Keep it mounted and pass the part as its child (`<Swap>{cond ? <Part /> : null}</Swap>`): what is there on the
 * screen's first paint appears as it is (`skipEntering` on mount, as `ReceiptMark` does), so only a change fades.
 * Pass `exits` only where nothing sits below it: the content below moves up at once, and a fading part would sit on it.
 */
export function Swap({ id, exits = false, style, testID, children }: {
  id?: string | number
  exits?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}) {
  const shown = children !== null && children !== undefined && children !== false
  return (
    <LayoutAnimationConfig skipEntering>
      {shown ? (
        <Animated.View key={id} entering={swapIn} exiting={exits ? swapOut : undefined} style={style} testID={testID}>
          {children}
        </Animated.View>
      ) : null}
    </LayoutAnimationConfig>
  )
}
