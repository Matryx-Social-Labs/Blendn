import React, { useCallback, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconButton } from './ds/IconButton'
import { monoCaption } from './ds/MonoFamily'
import { useBoldText } from './ds/shared'
import { SwipeToDismiss } from './motion/SwipeToDismiss'
import { ZoomableImage } from './motion/ZoomableImage'
import { COLOR, MATERIAL, RADIUS, SIZE, SPACE } from '../lib/design/tokens'

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
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  // The top row's height: the close circle, 44 pt on iOS and 48 dp on Android.
  const circle = Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton
  const top = insets.top + SPACE.sm

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

        {/* The photo's chrome, read before the pictures: the page is modal, Close is first, then where you are. */}
        <View accessibilityViewIsModal style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={[styles.closeBtn, { top, left: SPACE.lg }]}>
            <IconButton icon="x" tier="media" accessibilityLabel="Close" onPress={onClose} />
          </View>
          {photos.length > 1 && (
            <View style={[styles.counterRow, { top, height: circle }]} pointerEvents="none">
              <View
                accessible
                accessibilityLabel={`Photo ${currentIndex + 1} of ${photos.length}`}
                style={styles.counter}
              >
                <Text style={[monoCaption(bold), styles.counterText]}>{currentIndex + 1} / {photos.length}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Dot indicators */}
        {photos.length > 1 && photos.length <= 10 && (
          <View
            style={[styles.dots, { bottom: insets.bottom + SPACE.xl }]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
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
    zIndex: 10,
  },
  counterRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  counter: {
    backgroundColor: MATERIAL.scrimPill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.capsule,
  },
  counterText: { color: COLOR.textPrimary },
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textTertiary,
  },
  dotActive: {
    backgroundColor: COLOR.textPrimary,
    width: 18,
  },
})
