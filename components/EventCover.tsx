import { useState } from 'react'
import { Image as ExpoImage } from 'expo-image'
import { Image, StyleSheet, View } from 'react-native'

import { EMBER, EMBER_RADIUS } from '../lib/theme'

const monogram = require('../assets/logo/monogram-gradient.png')

interface EventCoverProps {
  /** The poster to draw, or null for the placeholder. */
  uri: string | null
  height: number
  radius?: number
  /**
   * Bump to try a failed picture again (pull-to-refresh). A failure is
   * remembered for one URI and one attempt, so a new URI or a new attempt
   * loads afresh — with no frame of stale placeholder in between.
   */
  retry?: number
}

/**
 * An event's picture, and never an empty block.
 *
 * The Going card was `source={{ uri: cover || '' }}` with no `onError`, so an
 * event without a cover and a cover that failed to load both drew a dark 180 px
 * box above the title (SCRUM-286). On 2026-09-24 that was every card on
 * staging: the seed's image host began bot-checking the phone (SCRUM-285).
 * Either way this draws the brand mark on the surface colour instead.
 *
 * Nothing is drawn on the picture any more — the words sit under it — so there
 * is no darkening layer either.
 */
export function EventCover({ uri, height, radius = EMBER_RADIUS.md, retry = 0 }: EventCoverProps) {
  const attempt = `${uri}#${retry}`
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null)

  const corners = { borderRadius: radius }

  if (uri && failedAttempt !== attempt) {
    return (
      /*
       * expo-image rather than RN's ImageBackground, which cannot fade: the
       * poster used to snap in over the empty card a beat after the text. It
       * now fades over the surface colour in 150ms, and comes from the
       * memory/disk cache the rest of the app's images already share.
       */
      <View style={[styles.frame, corners, { height }]}>
        <ExpoImage
          testID="event-cover-image"
          // Remounted per attempt: the native view does not reload a source it
          // already failed on just because it rendered again.
          key={attempt}
          source={{ uri }}
          onError={() => setFailedAttempt(attempt)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      </View>
    )
  }

  return (
    <View testID="event-cover-placeholder" style={[styles.placeholder, corners, { height }]}>
      <Image
        testID="event-cover-mark"
        source={monogram}
        style={[styles.mark, { width: markSize(height), height: markSize(height) }]}
        resizeMode="contain"
        accessible={false}
        accessibilityIgnoresInvertColors
      />
    </View>
  )
}

/** The placeholder's logo mark: faint, so it reads as a mark and not as content. */
const MARK_OPACITY = 0.35
/** 72pt on the 180pt card, and the same share of a smaller box (a list row's thumb). */
const markSize = (height: number) => Math.min(72, Math.round(height * 0.4))

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: EMBER.surface, overflow: 'hidden' },
  placeholder: {
    width: '100%',
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Faint, so it reads as a mark and not as content.
  mark: { opacity: MARK_OPACITY },
})
