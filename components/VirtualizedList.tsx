import React, { memo, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { FlatList, FlatListProps, ListRenderItem } from 'react-native'
import { Logger } from '../lib/logger'
import { useReducedMotion } from '../lib/motion'

interface VirtualizedListProps<T> extends Omit<FlatListProps<T>, 'renderItem' | 'getItemLayout'> {
  data: T[]
  renderItem: ListRenderItem<T>
  itemHeight?: number
  estimatedItemSize?: number
  windowSize?: number
  initialNumToRender?: number
  maxToRenderPerBatch?: number
  updateCellsBatchingPeriod?: number
  removeClippedSubviews?: boolean
  onEndReachedThreshold?: number
  forwardedRef?: React.Ref<FlatList<T>>
}

// eslint-disable-next-line react/display-name
export const VirtualizedList = memo(<T extends unknown>(props: VirtualizedListProps<T>) => {
  const {
    data,
    renderItem,
    itemHeight,
    windowSize = 7,              // Reduced from 10 for better memory usage
    initialNumToRender = 8,      // Reduced from 10 for faster initial render
    maxToRenderPerBatch = 8,     // Increased from 5 for smoother scrolling
    updateCellsBatchingPeriod = 30, // Reduced from 50 for more responsive updates
    removeClippedSubviews = true,
    onEndReachedThreshold = 0.5,
    forwardedRef,
    ...restProps
  } = props

  const listRef = useRef<FlatList<T>>(null)
  const reduceMotion = useReducedMotion()
  // Hands the caller the same FlatList instance `listRef` holds, whether its
  // ref is an object or a callback. React re-runs this if the ref changes.
  useImperativeHandle(forwardedRef, () => listRef.current as FlatList<T>, [])

  // Memoized getItemLayout for better performance when itemHeight is known
  const getItemLayout = useMemo(() => {
    if (!itemHeight) return undefined
    
    return (data: any, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    })
  }, [itemHeight])

  // Memoized keyExtractor with proper typing
  const keyExtractor = useCallback((item: T, index: number): string => {
    if (item && typeof item === 'object' && 'id' in item) {
      return String((item as any).id)
    }
    return `item-${index}`
  }, [])

  // Performance monitoring
  const onScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    Logger.warn('general', 'Scroll to index failed', info)
    
    // Attempt to scroll to the nearest measured frame
    listRef.current?.scrollToIndex({
      index: Math.min(info.index, info.highestMeasuredFrameIndex),
      animated: !reduceMotion
    })
  }, [reduceMotion])

  /*
   * One FlatList, one shape, whatever the data. This used to return one of two FlatLists by
   * `enableVirtualization`, and only one carried `onViewableItemsChanged`. They sit at the same
   * place in the tree, so React kept the instance when the Pulse finished loading with more than
   * twenty rows, and FlatList threw ("Changing onViewableItemsChanged nullability on the fly is
   * not supported"): every signed-in launch with a full Pulse hit the root ErrorBoundary (RC drive 3).
   * The handler only logged, so it is gone, and with it the prop that only chose a branch:
   * FlatList is always virtualized.
   */
  return (
    <FlatList
      ref={listRef}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      windowSize={windowSize}
      initialNumToRender={initialNumToRender}
      maxToRenderPerBatch={maxToRenderPerBatch}
      updateCellsBatchingPeriod={updateCellsBatchingPeriod}
      removeClippedSubviews={removeClippedSubviews}
      onEndReachedThreshold={onEndReachedThreshold}
      onScrollToIndexFailed={onScrollToIndexFailed}
      {...restProps}
    />
  )
}) as <T extends any>(props: VirtualizedListProps<T>) => React.JSX.Element

export default VirtualizedList