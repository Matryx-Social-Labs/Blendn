import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useMemo } from 'react'
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native'

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
  timeLabel: string
  locationLabel: string
}

// Responsive implementation of Figma node 710:5216
export default function NearbyEventCard({ event, width, onPress, timeLabel, locationLabel }: NearbyEventCardProps) {
  const aspectRatio = 363 / 249
  const height = useMemo(() => width / aspectRatio, [width])

  // Scale constants from Figma using width as base
  const scale = width / 363
  const radiusImage = 23 * scale
  const glassTop = 161 * scale
  const glassLeft = 5 * scale
  const glassRight = 6 * scale
  const glassBottom = 7 * scale
  const glassRadius = 20 * scale

  return (
    <Pressable onPress={() => onPress?.(event)} style={{ width, marginBottom: 18, alignSelf: 'center' }} accessibilityRole="button">
      {event.cover_image_url ? (
        <ImageBackground
          source={{ uri: event.cover_image_url }}
          style={{ width: '100%', height }}
          imageStyle={{ borderRadius: radiusImage }}
          resizeMode="cover"
        >
          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={["#00000000", "#000000D9"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ ...StyleSheet.absoluteFillObject, borderBottomLeftRadius: radiusImage, borderBottomRightRadius: radiusImage }}
          />

          {/* Glass effect group */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: glassLeft,
              right: glassRight,
              top: glassTop,
              bottom: glassBottom,
              borderRadius: glassRadius,
              overflow: 'hidden',
              backgroundColor: 'rgba(0,0,0,0.2)',
            }}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
            <LinearGradient
              colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0.08)"]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* subtle inner shadow bottom */}
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 * scale }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                borderRadius: glassRadius,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.35)'
              }}
            />

            {/* Content */}
            <Text
              numberOfLines={2}
              style={{
                position: 'absolute',
                left: 16 * scale,
                right: 16 * scale,
                top: 12 * scale,
                color: '#FFFFFF',
                fontSize: 20 * scale,
                fontWeight: '700',
              }}
            >
              {event.title}
            </Text>

            <View
              style={{
                position: 'absolute',
                left: 16 * scale,
                right: 16 * scale,
                bottom: 12 * scale,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * scale, maxWidth: '55%' }}>
                <Ionicons name="time-outline" size={13 * scale} color="#FFFFFF" />
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 12 * scale }}>{timeLabel}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * scale, maxWidth: '40%' }}>
                <Ionicons name="map-outline" size={13 * scale} color="#FFFFFF" />
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 12 * scale }}>{locationLabel}</Text>
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
    backgroundColor: '#222',
  },
})


