/**
 * The city, as a place rather than a word.
 *
 * `CityArtCard` is a city picker row for a city that has art: the skyline, the
 * name over its sky in English and in the city's own script, and the same event
 * count the plain rows carry. `CityArtBanner` is the scene alone, for the
 * Pulse's empty state.
 *
 * Both measure their own width and hand it to `CityScene`, because the scene is
 * drawn at an exact size rather than stretched — a stretched skyline is a
 * blurry one.
 */
import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { SCENE_PALETTES, type CityArtInfo } from '../../lib/cityArt'
import { EMBER, EMBER_FONTS, EMBER_RADIUS, ICON, SPACE, TYPE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { CityScene, useSceneTime } from './CityScene'

function useWidth() {
  const [width, setWidth] = useState(0)
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width)
    setWidth((prev) => (prev === w ? prev : w))
  }
  return [width, onLayout] as const
}

interface CardProps {
  /** The server's spelling, shown as-is — it is what the list is keyed by. */
  city: string
  art: CityArtInfo
  eventCount: number
  active: boolean
  /** The device is in this city. */
  here: boolean
  onPress: () => void
}

export function CityArtCard({ city, art, eventCount, active, here, onPress }: CardProps) {
  const [width, onLayout] = useWidth()
  const tod = useSceneTime(art.timeZone)
  const ink = SCENE_PALETTES[tod].ink
  const events = `${eventCount} event${eventCount === 1 ? '' : 's'}`

  return (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.98}
      style={[styles.card, active && styles.cardActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${city}${here ? ', your current location' : ''}, ${events}`}
    >
      <View style={styles.art} onLayout={onLayout}>
        <CityScene city={art.key} width={width} height={Math.round(width * 0.5)} fit="slice" tod={tod} />
        <View style={styles.label} pointerEvents="none">
          <Text style={[styles.name, { color: ink }]} numberOfLines={1}>{city}</Text>
          <Text style={[styles.script, { color: ink }]}>{art.script}</Text>
        </View>
        {active ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={ICON.sm} color={EMBER.onGradient} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={styles.count}>{events}</Text>
        {here ? (
          <View style={styles.here}>
            <Ionicons name="navigate" size={ICON.sm} color={EMBER.textSecondary} />
            <Text style={styles.count}>You&rsquo;re here</Text>
          </View>
        ) : null}
      </View>
    </ScalePress>
  )
}

/** The scene alone, cropped to a strip: sky gives way before the street does. */
export function CityArtBanner({ art, height }: { art: CityArtInfo; height: number }) {
  const [width, onLayout] = useWidth()
  return (
    <View style={[styles.banner, { height }]} onLayout={onLayout}>
      <CityScene city={art.key} width={width} height={height} fit="slice" />
    </View>
  )
}

/** The city's name in its own script sits a step behind the English name, over the art. */
const SCRIPT_OPACITY = 0.75

const styles = StyleSheet.create({
  card: {
    borderRadius: EMBER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
    marginBottom: SPACE.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardActive: { borderColor: EMBER.accent },
  art: { width: '100%' },
  label: { position: 'absolute', left: SPACE.lg, top: SPACE.md, right: SPACE.xxxl },
  name: { ...TYPE.title, fontFamily: EMBER_FONTS.displayExtraBold },
  // The script line is system-drawn: neither app family carries Kannada or Devanagari.
  script: { ...TYPE.meta, fontFamily: undefined, opacity: SCRIPT_OPACITY },
  check: {
    position: 'absolute',
    top: SPACE.md,
    right: SPACE.md,
    width: 24,
    height: 24,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  count: { ...TYPE.meta },
  here: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  banner: {
    alignSelf: 'stretch',
    borderRadius: EMBER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
    marginBottom: SPACE.lg,
  },
})
