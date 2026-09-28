import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EMBER, EMBER_RADIUS, ICON, SPACE, TYPE, tint } from '../lib/theme'
import ScalePress from './motion/ScalePress'
import { OptimizedImage } from './OptimizedImage'

type NearbyEvent = {
  id: string
  title: string
  venue_name?: string | null
  address?: string | null
  cover_image_url: string | null
  start_time: string
  end_time: string
}

interface NearbyEventCardProps {
  event: NearbyEvent
  width: number
  onPress?: (e: NearbyEvent) => void
  onLongPress?: (e: NearbyEvent) => void
  timeLabel: string
  locationLabel: string
}

const ASPECT_RATIO = 363 / 249
/** Hoisted so the prop keeps one identity across renders. */
const QUICK_ACTIONS = [{ name: 'quickActions', label: 'Quick actions' }]
/** For placeholders that have to be this card's shape (nearby-events loading). */
export const NEARBY_CARD_ASPECT = ASPECT_RATIO

// Responsive implementation of Figma node 710:5216
export default function NearbyEventCard({ event, width, onPress, onLongPress, timeLabel, locationLabel }: NearbyEventCardProps) {
  const height = useMemo(() => width / ASPECT_RATIO, [width])

  // A large card: `card`, the same radius as the Featured photo.
  const radiusImage = EMBER_RADIUS.card

  /*
   * Shrinks under the finger, no haptic: a card in a scrolling list is touched
   * on the way into every scroll.
   *
   * No margin of its own: the list it sits in owns the gap between cards (the
   * Pulse's stack gap, the Nearby screen's row wrapper). A card that also
   * carried a margin made the two gaps add up differently on each screen.
   */
  return (
    <ScalePress
      haptic={false}
      onPress={() => onPress?.(event)}
      onLongPress={onLongPress ? () => onLongPress(event) : undefined}
      delayLongPress={320}
      style={{ width, alignSelf: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={[event.title, timeLabel, locationLabel].filter(Boolean).join(', ')}
      accessibilityActions={onLongPress ? QUICK_ACTIONS : undefined}
      onAccessibilityAction={
        onLongPress
          ? (e) => {
              if (e.nativeEvent.actionName === 'quickActions') onLongPress(event)
            }
          : undefined
      }
    >
      {/*
        The frame is chosen by whether there is an image. The CONTENT is not.

        This used to be `cover_image_url ? <ImageBackground>…</> : <View/>`,
        with the title, time and venue nested inside the image branch — so an
        event without a cover rendered as an **empty grey rectangle**. Not a
        degraded card: no title, no time, no venue, nothing to read and nothing
        to explain why. The seeded event has no cover, which is how it surfaced,
        and real organisers publish without images all the time.

        Same class as the checked-in carousel that used to filter on
        `!!item.cover_image_url` and silently hid exactly the small events most
        likely to lack one.
      */}
      <Frame
        source={event.cover_image_url}
        width={width}
        height={height}
        radius={radiusImage}
      >
          {/* Content */}
          <View
            pointerEvents="none"
            style={{
              // `xl`, the card padding: at the `card` radius a 16 inset sat in the curve.
              position: 'absolute',
              left: SPACE.xl,
              right: SPACE.xl,
              bottom: SPACE.xl,
            }}
          >
            <Text
              numberOfLines={2}
              style={{ ...TYPE.title, marginBottom: SPACE.sm }}
            >
              {event.title}
            </Text>

            {/*
              One line each. The time used to share a row with the venue and
              was capped at 55% of it, which cut "Tomorrow · 9:00 PM" to
              "Tomorrow · 9…" on a phone; the date is the part that matters.
            */}
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={ICON.sm} color={EMBER.textPrimary} />
              <Text numberOfLines={1} style={styles.metaText}>{timeLabel}</Text>
            </View>
            {locationLabel ? (
              <View style={[styles.metaItem, styles.metaGap]}>
                <Ionicons name="map-outline" size={ICON.sm} color={EMBER.textPrimary} />
                <Text numberOfLines={1} style={styles.metaText}>{locationLabel}</Text>
              </View>
            ) : null}
          </View>
      </Frame>
    </ScalePress>
  )
}

/**
 * The card's backdrop: the cover photo when there is one, a flat brand surface
 * when there is not. Either way it renders its children.
 *
 * Both branches keep the same size, radius and gradient, so a card without a
 * cover reads as a card with a plain background rather than as something that
 * failed to load. The gradient stays because the text sits on top of it and
 * needs the same contrast in both cases.
 */
function Frame({
  source,
  width,
  height,
  radius,
  children,
}: {
  source?: string | null
  width: number
  height: number
  radius: number
  children: React.ReactNode
}) {
  const gradient = (
    <LinearGradient
      colors={[tint(EMBER.bg, 0.08), tint(EMBER.bg, 0.42), tint(EMBER.bg, 0.74)]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ ...StyleSheet.absoluteFill, borderRadius: radius }}
    />
  )

  if (source) {
    return (
      // expo-image so the photo fades in (150ms) over the placeholder colour
      // instead of snapping in a beat after the text; ImageBackground cannot.
      <View style={[styles.placeholder, { width: '100%', height, borderRadius: radius, overflow: 'hidden' }]}>
        {/* Sized, so the CDN serves this card's pixels rather than the original upload. */}
        <OptimizedImage
          source={source}
          recyclingKey={source}
          style={StyleSheet.absoluteFill as never}
          width={width}
          height={height}
          contentFit="cover"
          transition={150}
        />
        {gradient}
        {children}
      </View>
    )
  }

  return (
    <View style={[styles.placeholder, { width, height, borderRadius: radius }]}>
      {gradient}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  metaGap: { marginTop: SPACE.xs },
  metaText: { ...TYPE.meta, color: EMBER.textPrimary, flexShrink: 1 },
  placeholder: {
    backgroundColor: EMBER.surface,
  },
})
