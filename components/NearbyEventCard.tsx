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
      {event.cover_image_url ? (
        <ImageBackground
          source={{ uri: event.cover_image_url }}
          style={{ width: '100%', height }}
          imageStyle={{ borderRadius: radiusImage }}
          resizeMode="cover"
        >
          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.74)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ ...StyleSheet.absoluteFillObject, borderRadius: radiusImage }}
          />

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
        </ImageBackground>
      ) : (
        <View style={[styles.placeholder, { width, height, borderRadius: radiusImage }]} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: APP_COLORS.backgroundCard,
  },
})
