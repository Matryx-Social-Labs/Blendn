import React, { memo, useCallback, useMemo, useRef } from 'react'
import { FlatList, FlatListProps, ListRenderItem, ViewToken } from 'react-native'
import { Logger } from '../lib/logger'

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
  enableVirtualization?: boolean
  debug?: boolean
  forwardedRef?: React.Ref<FlatList<T>>
}

interface ViewabilityConfig {
  itemVisiblePercentThreshold: number
  minimumViewTime: number
}

// eslint-disable-next-line react/display-name
export const VirtualizedList = memo(<T extends unknown>(props: VirtualizedListProps<T>) => {
  const {
    data,
    renderItem,
    itemHeight,
    estimatedItemSize = 100,
    windowSize = 7,              // Reduced from 10 for better memory usage
    initialNumToRender = 8,      // Reduced from 10 for faster initial render
    maxToRenderPerBatch = 8,     // Increased from 5 for smoother scrolling
    updateCellsBatchingPeriod = 30, // Reduced from 50 for more responsive updates
    removeClippedSubviews = true,
    onEndReachedThreshold = 0.5,
    enableVirtualization = true,
    debug = false,
    forwardedRef,
    ...restProps
  } = props

  const listRef = useRef<FlatList<T>>(null)
  const viewabilityConfig = useRef<ViewabilityConfig>({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100
  })

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

  // Optimized viewability change handler
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (debug) {
      Logger.debug('general', `Viewable items changed: ${viewableItems.length} items visible`)
    }
  }, [debug])

  // Performance monitoring
  const onScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    Logger.warn('general', 'Scroll to index failed', info)
    
    // Attempt to scroll to the nearest measured frame
    listRef.current?.scrollToIndex({
      index: Math.min(info.index, info.highestMeasuredFrameIndex),
      animated: true
    })
  }, [])

  /*
   * The short-list branch still gets the tuning.
   *
   * It used to drop it. `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
   * `removeClippedSubviews` and `getItemLayout` are all destructured out of
   * props above, and this branch passed only `restProps` — so none of them
   * reached FlatList and it fell back to `initialNumToRender: 10`.
   *
   * That was backwards in exactly the wrong case. The Pulse computes
   * `initialNumToRender={4}` from card geometry, with fifteen lines of
   * arithmetic explaining why, and enables virtualization only above twenty
   * items. A first load is twenty items or fewer — so the one case the number
   * was calculated for is the one case it was thrown away, and the ten-image
   * first paint it existed to prevent is what shipped.
   *
   * `enableVirtualization` never disabled virtualization anyway; FlatList is
   * always virtualized. It only ever discarded the tuning.
   */
  if (!enableVirtualization) {
    return (
      <FlatList
        ref={(node) => {
          listRef.current = node as any
          if (typeof forwardedRef === 'function') forwardedRef(node as any)
          else if (forwardedRef) (forwardedRef as any).current = node
        }}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        windowSize={windowSize}
        initialNumToRender={initialNumToRender}
        maxToRenderPerBatch={maxToRenderPerBatch}
        updateCellsBatchingPeriod={updateCellsBatchingPeriod}
        removeClippedSubviews={removeClippedSubviews}
        onEndReachedThreshold={onEndReachedThreshold}
        getItemLayout={getItemLayout}
        {...restProps}
      />
    )
  }

  return (
    <FlatList
      ref={(node) => {
        listRef.current = node as any
        if (typeof forwardedRef === 'function') forwardedRef(node as any)
        else if (forwardedRef) (forwardedRef as any).current = node
      }}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      
      // Virtualization settings
      windowSize={windowSize}
      initialNumToRender={initialNumToRender}
      maxToRenderPerBatch={maxToRenderPerBatch}
      updateCellsBatchingPeriod={updateCellsBatchingPeriod}
      removeClippedSubviews={removeClippedSubviews}
      
      // Performance optimizations
      onEndReachedThreshold={onEndReachedThreshold}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig.current}
      onScrollToIndexFailed={onScrollToIndexFailed}
      
      // Memory management
      legacyImplementation={false}
      disableVirtualization={false}
      
      {...restProps}
    />
  )
}) as <T extends any>(props: VirtualizedListProps<T>) => React.JSX.Element

// Hook for managing large dataset pagination
export const useVirtualizedData = <T extends any>(
  allData: T[],
  pageSize: number = 50,
  threshold: number = 0.8
) => {
  const [displayData, setDisplayData] = React.useState<T[]>(() => 
    allData.slice(0, pageSize)
  )
  const [hasMore, setHasMore] = React.useState(allData.length > pageSize)
  
  const loadMore = useCallback(() => {
    if (!hasMore) return
    
    const currentLength = displayData.length
    const newData = allData.slice(0, currentLength + pageSize)
    
    setDisplayData(newData)
    setHasMore(newData.length < allData.length)
    
    Logger.debug('general', `Loaded more data: ${newData.length}/${allData.length}`)
  }, [allData, displayData.length, hasMore, pageSize])
  
  const onEndReached = useCallback(() => {
    if (hasMore) {
      loadMore()
    }
  }, [hasMore, loadMore])
  
  // Reset when source data changes
  React.useEffect(() => {
    const initialData = allData.slice(0, pageSize)
    setDisplayData(initialData)
    setHasMore(allData.length > pageSize)
  }, [allData, pageSize])
  
  return {
    data: displayData,
    hasMore,
    loadMore,
    onEndReached,
    onEndReachedThreshold: threshold
  }
}

// Performance monitoring hook
export const useListPerformance = (listName: string) => {
  const renderCount = useRef(0)
  const lastRenderTime = useRef(Date.now())
  
  React.useEffect(() => {
    renderCount.current += 1
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTime.current
    
    if (renderCount.current % 10 === 0) {
      Logger.debug('general', `List ${listName} performance`, {
        renders: renderCount.current,
        avgRenderInterval: timeSinceLastRender / 10
      })
    }
    
    lastRenderTime.current = now
  })
  
  return {
    renderCount: renderCount.current
  }
}

export default VirtualizedList