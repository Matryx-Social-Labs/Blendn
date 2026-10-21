import { useCallback, useRef } from 'react'
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'

import { H } from './haptics'

/** How far the list is pulled to arm a refresh, and where it holds while it loads (DS #18: the pull is the page's 64). */
export const PULL_ARM = 64
/** The overscroll is at half speed against the finger already (0.5× resistance is the platform's); this is where "armed" is judged. */
export const pullProgress = (offsetY: number) => Math.min(1, Math.max(0, -offsetY / PULL_ARM))

/**
 * The branded pull to refresh (Flow 3, motion #18), iOS: the list's own bounce is the pull, the monogram's outline traces
 * as you pull (`progress`, 0 to 1), `H.threshold` plays once when it arms, it holds while loading (`holdInset`), and
 * returns when the refresh settles. A refresh by release past the arm point only.
 *
 * Android has no overscroll to read: it keeps the platform's `RefreshControl` (`native`), tinted. Reduce Motion changes
 * nothing: the pull is direct manipulation.
 */
export function usePullToRefresh({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  const progress: SharedValue<number> = useSharedValue(0)
  const armed = useRef(false)
  const native = Platform.OS !== 'ios'

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (native) return
      const p = pullProgress(e.nativeEvent.contentOffset.y)
      progress.set(refreshing ? 1 : p)
      if (p >= 1 && !armed.current) {
        armed.current = true
        H.threshold()
      }
      if (p < 1) armed.current = false
    },
    [native, progress, refreshing]
  )
  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (native || refreshing) return
      if (pullProgress(e.nativeEvent.contentOffset.y) >= 1) onRefresh()
      armed.current = false
    },
    [native, refreshing, onRefresh]
  )
  return {
    native,
    progress,
    /** Hold the list down while it loads (iOS `contentInset`). */
    holdInset: refreshing && !native ? PULL_ARM : 0,
    scrollProps: { onScroll, onScrollEndDrag },
  }
}
