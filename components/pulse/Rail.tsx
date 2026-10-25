import { useCallback, useState, type ReactNode, type RefObject } from 'react'
import { FlatList, StyleSheet, type ListRenderItemInfo } from 'react-native'

import FadeInUp from '../motion/FadeInUp'
import { DURATION, EASING, RISE, SPACE, STAGGER } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** The gap between a rail's cards: a snap interval is the card's width plus this. */
export const RAIL_GAP = SPACE.md

/* -------------------------------------------------------------------------- */
/* Entrance                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A section rising in, once (BUILD-SPEC §0 `enter`): the first load of the pane
 * only, never on a refresh, a tab return or a pane switch. Decided at mount and
 * frozen, so a later render never swaps a wrapper in or out (that would remount
 * the rail and re-decode its photos). Stagger is `STAGGER.loose` per section,
 * capped at `STAGGER.windowMax`; Reduce Motion is opacity only over 200 ms.
 */
export function SectionReveal({ index, pending, children }: { index: number; pending: RefObject<boolean>; children: ReactNode }) {
  const [animate] = useState(() => pending.current)
  const reduceMotion = useReducedMotion()
  if (!animate) return <>{children}</>
  return (
    <FadeInUp
      delay={Math.min(STAGGER.loose * index, STAGGER.windowMax)}
      distance={reduceMotion ? 0 : RISE.list}
      duration={reduceMotion ? 200 : DURATION.base}
      easing={EASING.entrance}
    >
      {children}
    </FadeInUp>
  )
}

/* -------------------------------------------------------------------------- */
/* Rails                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A snapping horizontal rail (`snap`): native `snapToInterval`, fast deceleration,
 * the gutter as padding and a fixed item width so layout is known. No JS spring,
 * no haptic.
 */
export function Rail<T extends { id: string }>({
  data,
  itemWidth,
  gap = RAIL_GAP,
  renderItem,
  testID,
  onViewableItemsChanged,
  viewabilityConfig,
}: {
  data: T[]
  itemWidth: number
  gap?: number
  renderItem: (info: ListRenderItemInfo<T>) => ReactNode
  testID?: string
  onViewableItemsChanged?: (info: { viewableItems: { index: number | null }[] }) => void
  viewabilityConfig?: { itemVisiblePercentThreshold: number; minimumViewTime: number }
}) {
  const interval = itemWidth + gap
  const layout = useCallback((_: unknown, index: number) => ({ length: interval, offset: interval * index, index }), [interval])
  return (
    <FlatList
      testID={testID}
      horizontal
      data={data}
      keyExtractor={byId}
      renderItem={renderItem as never}
      getItemLayout={layout}
      showsHorizontalScrollIndicator={false}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={styles.rail}
      // The pane's list lets a card's first tap through with the keyboard up.
      keyboardShouldPersistTaps="handled"
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  )
}
const byId = (item: { id: string }) => item.id


const styles = StyleSheet.create({
  rail: { paddingHorizontal: SPACE.gutter, gap: RAIL_GAP },
})
