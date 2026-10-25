import { useState } from 'react'
import { Image as ExpoImage } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import { Logger } from '../lib/logger'
import { hostOf } from '../lib/urlHost'
import { COLOR, RADIUS } from '../lib/design/tokens'
import { CategoryPlate } from './ds/EventCard'


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
  /** The event's category slug: with no picture, its plate carries the category's glyph (D8; a calendar with none). */
  category?: string
}

/**
 * An event's picture, and never an empty block.
 *
 * The Going card was `source={{ uri: cover || '' }}` with no `onError`, so an
 * event without a cover and a cover that failed to load both drew a dark 180 px
 * box above the title (SCRUM-286). On 2026-09-24 that was every card on
 * staging: the seed's image host began bot-checking the phone (SCRUM-285).
 * Either way this draws the event's plate instead (rc7 ruling 5: one no-cover look everywhere).
 *
 * Nothing is drawn on the picture any more — the words sit under it — so there
 * is no darkening layer either.
 */
export function EventCover({ uri, height, radius = RADIUS.rowInCard, retry = 0, category }: EventCoverProps) {
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
          // Lists reuse native views; without this a row can flash the last one's picture.
          recyclingKey={uri}
          onError={() => {
            // Said out loud: a host that starts refusing the app (SCRUM-285) is
            // otherwise a screen of quiet placeholders.
            Logger.warn('general', 'Event cover failed to load', { host: hostOf(uri) })
            setFailedAttempt(attempt)
          }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      </View>
    )
  }

  // No picture: the event's plate (rc7 ruling 5), category or not; never the faint logo.
  return (
    <View testID="event-cover-placeholder" style={[styles.placeholder, corners, { height }]}>
      <CategoryPlate category={category} size={height} testID="event-cover-plate" />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: COLOR.surface, overflow: 'hidden' },
  placeholder: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
