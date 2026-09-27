import { LinearGradient } from 'expo-linear-gradient'
import React, { memo } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_RADIUS } from '../../lib/theme'
import { OptimizedImage } from '../OptimizedImage'

/**
 * One person's face, at any size — their photo if they revealed it, their
 * pseudonym's creature if not.
 *
 * The Room draws faces at five sizes (the arrivals row, the grid, Meet next,
 * the person card, the match moment), and GridCard's avatar was a 60-line
 * block inside a card. The mark is the same `pseudonymAvatar` the card, the
 * match sheet and Banter use, so one person is one face across the product for
 * as long as they are that pseudonym.
 *
 * `ring` draws a 2pt ring of the page colour *outside* the disc — for faces
 * that overlap (the arrivals stack) or sit on a photo, so each reads as cut out
 * rather than smudged into its neighbour. RN grows borders inward, so the ring
 * is padding on a wrapper, not a border on the image.
 */
export const Face = memo(function Face({
  name,
  photo,
  size,
  ring = false,
  ringColor = EMBER.bg,
  style,
}: {
  name: string
  photo: string | null | undefined
  size: number
  ring?: boolean
  ringColor?: string
  style?: StyleProp<ViewStyle>
}) {
  const disc = { width: size, height: size, borderRadius: EMBER_RADIUS.pill }
  const inner = photo ? (
    <OptimizedImage
      source={photo}
      recyclingKey={photo}
      style={disc as never}
      width={size}
      height={size}
      contentFit="cover"
    />
  ) : (
    <Mark name={name} size={size} />
  )

  if (!ring) return <View style={[disc, styles.clip, style]}>{inner}</View>
  return (
    <View style={[styles.ring, { borderRadius: EMBER_RADIUS.pill, backgroundColor: ringColor }, style]}>
      <View style={[disc, styles.clip]}>{inner}</View>
    </View>
  )
})

function Mark({ name, size }: { name: string; size: number }) {
  const mark = pseudonymAvatar(name)
  return (
    <LinearGradient colors={mark.colors} style={[styles.mark, { width: size, height: size }]}>
      {/* Emoji sized to the disc, not to the type scale: it is a picture, not text. */}
      <Text
        allowFontScaling={false}
        style={{ fontSize: Math.round(size * 0.46), lineHeight: Math.round(size * 0.6) }}
      >
        {mark.character}
      </Text>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', backgroundColor: EMBER.surfaceSunken },
  ring: { padding: 2 },
  mark: { alignItems: 'center', justifyContent: 'center' },
})
