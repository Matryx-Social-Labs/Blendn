import type { View } from 'react-native'

import type { Rect } from './chatShared'

/**
 * Where a view is in the window, for an overlay that lifts it (the Pulse's peek: `LongPressMenu`). Its own module so a
 * test can say where the card is: a test renderer lays nothing out.
 */
export function measureAnchor(node: View | null, then: (anchor: Rect) => void): void {
  node?.measureInWindow((x, y, width, height) => then({ x, y, width, height }))
}
