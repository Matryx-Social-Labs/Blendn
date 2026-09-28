import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native'
import { SwipeToDismiss } from './motion/SwipeToDismiss'
import { ZoomableImage } from './motion/ZoomableImage'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE, tint } from '../lib/theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// Module-level so its identity never changes: FlatList throws if
// `viewabilityConfig` changes after mount.
const VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 50 }

interface PhotoLightboxProps {
  photos: string[]
  initialIndex?: number
  visible: boolean
  onClose: () => void
}

export default function PhotoLightbox({ photos, initialIndex = 0, visible, onClose }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  // A zoomed photo owns every drag: the pager and swipe-to-dismiss stand down
  // until it is back at 1×. See `ZoomableImage`.
  const [zoomed, setZoomed] = useState(false)
  const listRef = useRef<FlatList>(null)

  // Sync to initialIndex when lightbox opens
  const handleShow = useCallback(() => {
    setCurrentIndex(initialIndex)
    setZoomed(false)
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false })
    }, 50)
  }, [initialIndex])

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index)
      setZoomed(false)
    }
  }, [])

  const renderItem = useCallback(({ item, index }: { item: string; index: number }) => (
    <View style={styles.page}>
      <ZoomableImage
        uri={item}
        width={SCREEN_W}
        height={SCREEN_H}
        active={index === currentIndex}
        onZoomChange={setZoomed}
      />
    </View>
  ), [currentIndex])

  const keyExtractor = useCallback((_: string, i: number) => String(i), [])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={handleShow}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SwipeToDismiss onDismiss={onClose} enabled={!zoomed}>
        <FlatList
          ref={listRef}
          data={photos}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
        />

        {/* Counter */}
        {photos.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{currentIndex + 1} / {photos.length}</Text>
          </View>
        )}

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <View style={styles.closeBtnInner}>
            <Ionicons name="close" size={ICON.md} color={EMBER.textPrimary} />
          </View>
        </TouchableOpacity>

        {/* Dot indicators */}
        {photos.length > 1 && photos.length <= 10 && (
          <View style={styles.dots} pointerEvents="none">
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
            ))}
          </View>
        )}
      </SwipeToDismiss>
    </Modal>
  )
}

const styles = StyleSheet.create({
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: GUTTER,
    zIndex: 10,
  },
  closeBtnInner: {
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: EMBER.scrim,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
  },
  counterText: {
    ...TYPE.caption,
    color: EMBER.textPrimary,
  },
  dots: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: tint(EMBER.textPrimary, 0.4),
  },
  dotActive: {
    backgroundColor: EMBER.textPrimary,
    width: 18,
  },
})
