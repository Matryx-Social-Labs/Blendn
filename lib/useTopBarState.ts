import { useCallback, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

import type { TopBarState } from '../components/ds/TopBar'
import { SPACE } from './design/tokens'

/** The bar goes glass once the content has moved past this (components/ds/TopBar: rest → scrolled). */
export const TOP_BAR_SCROLL_THRESHOLD = SPACE.sm

/**
 * The state a pushed screen hands its `TopBar`, from its scroll offset. Spread
 * `scrollProps` on the ScrollView or FlatList. Only a crossing re-renders: the
 * boolean bails out of the same value.
 */
export function useTopBarState(): { state: TopBarState; scrollProps: { onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void; scrollEventThrottle: number } } {
  const [scrolled, setScrolled] = useState(false)
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > TOP_BAR_SCROLL_THRESHOLD)
  }, [])
  return { state: scrolled ? 'scrolled' : 'rest', scrollProps: { onScroll, scrollEventThrottle: 16 } }
}
