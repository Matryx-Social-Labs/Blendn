import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
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
import { CONTROL, EMBER, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'

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
  const listRef = useRef<FlatList>(null)

  // Sync to initialIndex when lightbox opens
  const handleShow = useCallback(() => {
    setCurrentIndex(initialIndex)
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false })
    }, 50)
  }, [initialIndex])

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index)
    }
  }, [])

  const renderItem = useCallback(({ item }: { item: string }) => (
    <View style={styles.page}>
      <Image
        source={{ uri: item }}
        style={styles.image}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </View>
  ), [])

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
      <StatusBar style="light" />
      <SwipeToDismiss onDismiss={onClose}>
        <FlatList
          ref={listRef}
          data={photos}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
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
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
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
    borderRadius: CONTROL.sm / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: 12,
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
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: EMBER.textPrimary,
    width: 18,
  },
})
