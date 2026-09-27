import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { memo } from 'react'
import { StyleSheet, View } from 'react-native'

import { EMBER, EMBER_RADIUS, SPACE, tint } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'
import { Text } from '../ui/Text'

/** Portrait, so two and a bit fit across a phone and the rail reads as scrollable. */
export const MEMORY_W = 148
export const MEMORY_H = 188

/**
 * An event you went to, as a photo tile for the Me tab's Recent rail.
 *
 * Days' event tiles, turned to face the past: the cover fills the tile, an
 * eyebrow says how long ago it was ("3 WEEKS AGO"), and the title sits on a
 * page-coloured scrim at the foot. The scrim is the one gradient a photo may
 * have (docs/DESIGN_SYSTEM.md, "Surfaces are flat").
 *
 * With no cover it's a `surface` tile with a calendar glyph: the words still
 * sit in the same place, so a row of mixed tiles lines up.
 */
function MemoryTileImpl({
  title,
  imageUrl,
  ago,
  onPress,
}: {
  title: string
  imageUrl: string | null
  /** From `agoLabel`, already uppercase. */
  ago: string
  onPress: () => void
}) {
  return (
    <ScalePress
      onPress={onPress}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${ago.toLowerCase()}`}
      style={styles.tile}
    >
      {imageUrl ? (
        <OptimizedImage
          source={imageUrl}
          recyclingKey={imageUrl}
          style={StyleSheet.absoluteFill as never}
          width={MEMORY_W}
          height={MEMORY_H}
          contentFit="cover"
        />
      ) : (
        <View style={styles.blank}>
          {/* design-exception: a decorative glyph standing in for a missing cover, not a control icon */}
          <Ionicons name="calendar-outline" size={28} color={EMBER.textTertiary} />
        </View>
      )}
      <LinearGradient
        pointerEvents="none"
        colors={[EMBER.bgClear, tint(EMBER.bg, 0.85)]}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.words}>
        <Text variant="label" color={EMBER.textSecondary} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {ago}
        </Text>
        <Text variant="bodyStrong" numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {title}
        </Text>
      </View>
    </ScalePress>
  )
}

export const MemoryTile = memo(MemoryTileImpl)

const styles = StyleSheet.create({
  tile: {
    width: MEMORY_W,
    height: MEMORY_H,
    borderRadius: EMBER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
    justifyContent: 'flex-end',
  },
  blank: { ...StyleSheet.absoluteFill, alignItems: 'center', paddingTop: SPACE.xxl },
  words: { padding: SPACE.md, gap: SPACE.xxs },
})
