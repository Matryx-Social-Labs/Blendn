import React, { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { EMBER, TYPE } from '../../lib/theme'

/**
 * Words set around a circle — Bump's "4H 18M" ring, used for how long you have
 * been in the room.
 *
 * Typography instead of an effect. The Room used to mark presence with a halo
 * that breathed; this says the same thing ("you are here, and have been for a
 * while") in a way that survives a screenshot and needs no loop.
 *
 * Each glyph is its own absolutely placed view, rotated about the ring's centre
 * — no SVG `textPath` (there is no react-native-svg in this app) and nothing
 * animates, so the cost is paid once per minute when the label changes.
 *
 * The ring is decorative for screen readers; the caller labels the avatar.
 */
export const TimeRing = memo(function TimeRing({
  text,
  size,
  children,
  color = EMBER.textSecondary,
}: {
  /** Upper-case reads best on a curve. Kept short: ~24 characters fills a 120pt ring. */
  text: string
  /** Outer diameter; the glyphs sit just inside it. */
  size: number
  children: React.ReactNode
  color?: string
}) {
  const glyph = TYPE.caption.fontSize
  const radius = size / 2 - glyph / 2 - 1
  // Arc length per glyph ≈ the glyph's advance plus tracking, turned into an angle.
  const step = ((glyph * 0.72) / radius) * (180 / Math.PI)
  const chars = Array.from(text)
  // Centre the phrase on the top of the ring.
  const start = -((chars.length - 1) * step) / 2

  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
      {chars.map((c, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.slot,
            {
              width: size,
              height: size,
              transform: [{ rotate: `${start + i * step}deg` }],
            },
          ]}
        >
          <View style={[styles.glyphBox, { width: glyph, height: glyph + 2 }]}>
            {/*
              RN's Text with scaling off, not the role wrapper: a glyph on a
              ring that grows with Dynamic Type collides with its neighbours.
            */}
            <Text allowFontScaling={false} style={[styles.glyph, { color }]}>
              {c}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
  glyphBox: { alignItems: 'center', justifyContent: 'flex-start' },
  glyph: {
    ...TYPE.caption,
    letterSpacing: 0,
    textAlign: 'center',
  },
})
