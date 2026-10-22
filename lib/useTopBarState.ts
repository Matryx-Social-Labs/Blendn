import { useCallback, useState } from 'react'
import { Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { TopBarState } from '../components/ds/TopBar'
import { barHeight } from './barGeometry'
import { SPACE } from './design/tokens'

/** The bar goes glass once the content has moved past this (components/ds/TopBar: rest → scrolled). */
export const TOP_BAR_SCROLL_THRESHOLD = SPACE.sm

/**
 * The state a pushed screen hands its `TopBar`, from its scroll offset. Spread
 * `scrollProps` on the ScrollView or FlatList. Only a crossing re-renders: the
 * boolean bails out of the same value.
 */
export function useTopBarState(): {
  state: TopBarState
  scrollProps: { onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void; scrollEventThrottle: number }
  /** Back to the rest state, for a screen that swaps its scroller for a new one at the top (Rate's next person). */
  reset: () => void
} {
  const [scrolled, setScrolled] = useState(false)
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > TOP_BAR_SCROLL_THRESHOLD)
  }, [])
  const reset = useCallback(() => setScrolled(false), [])
  return { state: scrolled ? 'scrolled' : 'rest', scrollProps: { onScroll, scrollEventThrottle: 16 }, reset }
}

/**
 * How tall the pushed screen's `TopBar` is at rest: the top inset and 2, the back circle (44 iOS · 48 Android), and 10
 * under it (`lib/barGeometry`). Pure, so a screen's layout can be pinned without a device.
 */
export function topBarHeight(insetTop: number, android: boolean): number {
  return barHeight(insetTop, android)
}

/**
 * The bar over its content, as the TopBar page draws it: the content scrolls UNDER the bar, and the glass tier fades
 * in behind the title once it has (`state`). So the bar is pinned over the scroller (`barPin`), and the scroller's
 * first row starts below it (`contentTop`: the bar and 8 more, the frame's 124 pt under a 59 pt status bar) with its
 * indicator clear of it (`indicatorTop`).
 *
 * ```tsx
 * <View style={styles.fill}>
 *   <ScrollView {...bar.scrollProps} contentContainerStyle={{ paddingTop: bar.contentTop }} scrollIndicatorInsets={{ top: bar.indicatorTop }}>…</ScrollView>
 *   <View style={bar.barPin}><TopBar state={bar.state} … /></View>
 * </View>
 * ```
 */
export function useTopBarOverlay() {
  const insets = useSafeAreaInsets()
  const bar = useTopBarState()
  const height = topBarHeight(insets.top, Platform.OS === 'android')
  return {
    ...bar,
    contentTop: height + SPACE.sm,
    indicatorTop: height,
    barPin: { position: 'absolute', top: 0, left: 0, right: 0 } as const,
  }
}
