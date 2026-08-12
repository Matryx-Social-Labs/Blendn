import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useMemo } from 'react'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'
import { APP_COLORS } from '../lib/theme'

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

// Responsive implementation of Figma node 710:5216
export default function NearbyEventCard({ event, width, onPress, onLongPress, timeLabel, locationLabel }: NearbyEventCardProps) {
  const aspectRatio = 363 / 249
  const height = useMemo(() => width / aspectRatio, [width])

  // Scale constants from Figma using width as base
  const scale = width / 363
  const radiusImage = 23 * scale

  return (
    <Pressable
      onPress={() => onPress?.(event)}
      onLongPress={() => onLongPress?.(event)}
      delayLongPress={320}
      style={{ width, marginBottom: 18, alignSelf: 'center' }}
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
              left: 16 * scale,
              right: 16 * scale,
              bottom: 14 * scale,
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                color: APP_COLORS.textPrimary,
                fontSize: 20,
                lineHeight: 26,
                fontWeight: '700',
                marginBottom: 10 * scale,
              }}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * scale, maxWidth: '55%' }}>
                <Ionicons name="time-outline" size={13} color="#FFFFFF" />
                <Text numberOfLines={1} style={{ color: APP_COLORS.textPrimary, fontSize: 13 }}>{timeLabel}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * scale, maxWidth: '40%' }}>
                <Ionicons name="map-outline" size={13} color="#FFFFFF" />
                <Text numberOfLines={1} style={{ color: APP_COLORS.textPrimary, fontSize: 13 }}>{locationLabel}</Text>
              </View>
            </View>
          </View>
      </Frame>
    </Pressable>
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
      colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.74)']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ ...StyleSheet.absoluteFillObject, borderRadius: radius }}
    />
  )

  if (source) {
    return (
      <ImageBackground
        source={{ uri: source }}
        style={{ width: '100%', height }}
        imageStyle={{ borderRadius: radius }}
        resizeMode="cover"
      >
        {gradient}
        {children}
      </ImageBackground>
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
    backgroundColor: APP_COLORS.backgroundCard,
  },
})
