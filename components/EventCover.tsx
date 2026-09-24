import React, { useState } from 'react'
import { Image, ImageBackground, StyleSheet, View } from 'react-native'

import { EMBER } from '../lib/theme'

const monogram = require('../assets/logo/monogram-gradient.png')

interface EventCoverProps {
  /** The poster to draw, or null for the placeholder. */
  uri: string | null
  height: number
  /** Top corners only: the card's action row sits underneath. */
  radius?: number
  /**
   * Bump to try a failed picture again (pull-to-refresh). A failure is
   * remembered for one URI and one attempt, so a new URI or a new attempt
   * loads afresh — with no frame of stale placeholder in between.
   */
  retry?: number
  children: React.ReactNode
}

/**
 * An event's picture with its text on top, and never an empty block.
 *
 * The Going card was `source={{ uri: cover || '' }}` with no `onError`, so an
 * event without a cover and a cover that failed to load both drew a dark 180 px
 * box above the title (SCRUM-286). On 2026-09-24 that was every card on
 * staging: the seed's image host began bot-checking the phone (SCRUM-285).
 * Either way this draws the brand mark on the surface colour instead, and the
 * title, venue and time stay readable over it.
 */
export function EventCover({ uri, height, radius = 12, retry = 0, children }: EventCoverProps) {
  const attempt = `${uri}#${retry}`
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null)

  const corners = { borderTopLeftRadius: radius, borderTopRightRadius: radius }
  const overlay = <View style={[StyleSheet.absoluteFill, styles.overlay, corners]} />

  if (uri && failedAttempt !== attempt) {
    return (
      <ImageBackground
        testID="event-cover-image"
        // Remounted per attempt: the native view does not reload a source it
        // already failed on just because it rendered again.
        key={attempt}
        source={{ uri }}
        onError={() => setFailedAttempt(attempt)}
        style={{ height, width: '100%' }}
        imageStyle={corners}
        resizeMode="cover"
      >
        {overlay}
        {children}
      </ImageBackground>
    )
  }

  return (
    <View testID="event-cover-placeholder" style={[styles.placeholder, corners, { height }]}>
      <Image source={monogram} style={styles.mark} resizeMode="contain" accessible={false} accessibilityIgnoresInvertColors />
      {overlay}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Faint and above centre, so it reads as a mark and not as content, and the
  // title at the bottom never sits on it.
  mark: { width: 72, height: 72, opacity: 0.35, marginBottom: 40 },
  overlay: { backgroundColor: 'rgba(0,0,0,0.4)' },
})
