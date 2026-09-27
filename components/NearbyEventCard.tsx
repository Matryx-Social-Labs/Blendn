import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useMemo } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import { EMBER, EMBER_RADIUS, ICON, SPACE, TYPE, tint } from '../lib/theme'
import ScalePress from './motion/ScalePress'

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
/** For placeholders that have to be this card's shape (nearby-events loading). */
export const NEARBY_CARD_ASPECT = ASPECT_RATIO

// Responsive implementation of Figma node 710:5216
export default function NearbyEventCard({ event, width, onPress, onLongPress, timeLabel, locationLabel }: NearbyEventCardProps) {
  const height = useMemo(() => width / ASPECT_RATIO, [width])

  const radiusImage = EMBER_RADIUS.lg

  // Shrinks under the finger, no haptic: a card in a scrolling list is touched
  // on the way into every scroll.
  return (
    <ScalePress
      haptic={false}
      onPress={() => onPress?.(event)}
      onLongPress={() => onLongPress?.(event)}
      delayLongPress={320}
      style={{ width, marginBottom: SPACE.lg, alignSelf: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={`Open event ${event.title}`}
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
              position: 'absolute',
              left: SPACE.lg,
              right: SPACE.lg,
              bottom: SPACE.lg,
            }}
          >
            <Text
              numberOfLines={2}
              style={{ ...TYPE.title, marginBottom: SPACE.sm }}
            >
              {event.title}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, maxWidth: '55%' }}>
                <Ionicons name="time-outline" size={ICON.sm} color={EMBER.textPrimary} />
                <Text numberOfLines={1} style={{ ...TYPE.meta, color: EMBER.textPrimary }}>{timeLabel}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, maxWidth: '40%' }}>
                <Ionicons name="map-outline" size={ICON.sm} color={EMBER.textPrimary} />
                <Text numberOfLines={1} style={{ ...TYPE.meta, color: EMBER.textPrimary }}>{locationLabel}</Text>
              </View>
            </View>
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
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
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
  placeholder: {
    backgroundColor: EMBER.surface,
  },
})
