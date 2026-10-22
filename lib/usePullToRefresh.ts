import { createElement, useCallback, useMemo, useRef, type ReactElement } from 'react'
import { Platform, RefreshControl, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'

import { PullIndicator } from '../components/pulse/PullIndicator'
import { COLOR } from './design/tokens'
import { H } from './haptics'

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>

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
 *
 * ## Wiring a screen (the whole of it)
 *
 * ```tsx
 * const pull = usePullToRefresh({ refreshing, onRefresh })
 * <FlatList {...pull.listProps} ... />   // FlatList, ScrollView, FlashList, VirtualizedList
 * {pull.indicator}                        // a sibling of the list inside the same positioned parent; null on Android
 * ```
 *
 * `listProps` is `onScroll`, `scrollEventThrottle`, `onScrollEndDrag`, `contentInset` (iOS) and `refreshControl`
 * (Android). Do not set a `refreshControl` of your own. Your own scroll handler (a top bar's, a list's) goes in as
 * `onScroll` here and is called first with every event; spreading `listProps` and then setting `onScroll` replaces the pull.
 * A list under a floating bar passes `indicatorTop` (the bar's bottom edge, where the monogram sits); the Android control
 * is offset by the same amount.
 *
 * A worklet `onScroll` (`useAnimatedScrollHandler`) cannot be chained: spread `listProps`, set your handler after it, and
 * from the worklet `scheduleOnRN(pull.onOffset, y)` while `y < 0 || pull.progress.get() > 0` (Me does).
 */
export function usePullToRefresh({
  refreshing,
  onRefresh,
  onScroll: chainedOnScroll,
  indicatorTop = 0,
}: {
  refreshing: boolean
  onRefresh: () => void
  /** The screen's own scroll handler; called with every event before the pull reads it. */
  onScroll?: (e: ScrollEvent) => void
  /** The top of the monogram's slot, in the list's parent. Default 0: the parent's top edge. */
  indicatorTop?: number
}) {
  const progress: SharedValue<number> = useSharedValue(0)
  const armed = useRef(false)
  const native = Platform.OS !== 'ios'

  const onOffset = useCallback(
    (offsetY: number) => {
      if (native) return
      const p = pullProgress(offsetY)
      progress.set(refreshing ? 1 : p)
      if (p >= 1 && !armed.current) {
        armed.current = true
        H.threshold()
      }
      if (p < 1) armed.current = false
    },
    [native, progress, refreshing]
  )
  const onPullScroll = useCallback((e: ScrollEvent) => onOffset(e.nativeEvent.contentOffset.y), [onOffset])
  const onScrollEndDrag = useCallback(
    (e: ScrollEvent) => {
      if (native || refreshing) return
      if (pullProgress(e.nativeEvent.contentOffset.y) >= 1) onRefresh()
      armed.current = false
    },
    [native, refreshing, onRefresh]
  )
  const onScroll = useCallback(
    (e: ScrollEvent) => {
      chainedOnScroll?.(e)
      onPullScroll(e)
    },
    [chainedOnScroll, onPullScroll]
  )
  const holdInset = refreshing && !native ? PULL_ARM : 0

  const listProps = useMemo(
    () => ({
      onScroll,
      scrollEventThrottle: 16,
      onScrollEndDrag,
      contentInset: { top: holdInset },
      refreshControl: native
        ? createElement(RefreshControl, { refreshing, onRefresh, tintColor: COLOR.textSecondary, progressViewOffset: indicatorTop })
        : undefined,
    }),
    [onScroll, onScrollEndDrag, holdInset, native, refreshing, onRefresh, indicatorTop]
  )
  const indicator: ReactElement | null = native
    ? null
    : createElement(
        View,
        { pointerEvents: 'none', style: { position: 'absolute', top: indicatorTop, left: 0, right: 0 } },
        createElement(PullIndicator, { progress })
      )

  return {
    native,
    progress,
    /** Hold the list down while it loads (iOS `contentInset`). */
    holdInset,
    scrollProps: { onScroll, onScrollEndDrag },
    /**
     * The pull from a bare offset, for a list whose `onScroll` is a worklet (`useAnimatedScrollHandler`): hand it over with
     * `scheduleOnRN` while the list is above its top or `progress` is still up, and set your handler after `listProps`.
     */
    onOffset,
    /** Spread onto the list: everything it needs, on either platform. */
    listProps,
    /** The monogram that traces as you pull (iOS); null on Android, where the platform control draws itself. */
    indicator,
  }
}
