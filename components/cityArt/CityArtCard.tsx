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
import React, { useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { SCENE_PALETTES, type CityArtInfo } from '../../lib/cityArt'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { CheckDisc } from '../ds/RadioCard'
import { font, useBoldText } from '../ds/shared'
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

/** The skyline card is 140 tall (Flow 3 `city`); the banner takes its own height from the caller. */
const CARD_HEIGHT = 140
const PILL_HEIGHT = 28

interface CardProps {
  /** The server's spelling, shown as-is — it is what the list is keyed by. */
  city: string
  art: CityArtInfo
  /** What the city holds, from `cityCountLabel`: "12 events", or "1206 places" for a city with no events. */
  countLabel: string
  active: boolean
  /** The device is in this city. */
  here: boolean
  onPress: () => void
}

/**
 * A picker row for a city that has art (Flow 3 `city`, R4.1 3-6): the skyline, the name over it and the city's own
 * script beside its count, "You're here" as a white pill when the phone is in it. The chosen city wears the DS
 * selection mark, the white ring and the check disc.
 */
export function CityArtCard({ city, art, countLabel, active, here, onPress }: CardProps) {
  const bold = useBoldText()
  const [width, onLayout] = useWidth()
  const tod = useSceneTime(art.timeZone)
  const ink = SCENE_PALETTES[tod].ink

  return (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.97}
      style={styles.card}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${city}${here ? ', your current location' : ''}, ${countLabel}`}
    >
      <View style={styles.art} onLayout={onLayout}>
        <CityScene city={art.key} width={width} height={CARD_HEIGHT} tod={tod} />
        <View style={styles.label} pointerEvents="none">
          <Text style={[font('heading', bold), { color: ink }]} numberOfLines={1}>
            {city}
          </Text>
          {/* The script line is system-drawn: neither app family carries Kannada or Devanagari. */}
          <Text style={[font('meta', bold), styles.script, { color: ink }]} numberOfLines={1}>
            {[art.script, countLabel].join(' · ')}
          </Text>
        </View>
        {here ? (
          <View style={[styles.here, active && styles.hereBesideCheck]}>
            <Text style={[font('caption', bold), styles.onWhite]}>You’re here</Text>
          </View>
        ) : null}
        {active ? <CheckDisc testID="city-art-check" /> : null}
        {active ? <View pointerEvents="none" style={styles.ring} /> : null}
      </View>
    </ScalePress>
  )
}

/** The scene alone, cropped to a strip: sky gives way before the street does. */
export function CityArtBanner({ art, height }: { art: CityArtInfo; height: number }) {
  const [width, onLayout] = useWidth()
  return (
    <View style={[styles.banner, { height }]} onLayout={onLayout}>
      <CityScene city={art.key} width={width} height={height} />
    </View>
  )
}

/** The city's name in its own script sits a step behind the English name, over the art. */
const SCRIPT_OPACITY = 0.75

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface, marginBottom: SPACE.md },
  art: { width: '100%', height: CARD_HEIGHT },
  label: { position: 'absolute', left: SPACE.lg, bottom: SPACE.md, right: SPACE.xxxl, gap: SPACE.xxs },
  script: { fontFamily: undefined, opacity: SCRIPT_OPACITY },
  here: {
    position: 'absolute',
    right: SPACE.md,
    top: SPACE.md,
    height: PILL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
  },
  // The check disc owns the corner (24 pt, 10 in): the pill steps left of it.
  hereBesideCheck: { right: SPACE.md + 24 + SPACE.sm },
  onWhite: { color: COLOR.ink },
  ring: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.mediaInCard, borderWidth: SPACE.xxs, borderColor: COLOR.selectionFill },
  banner: { alignSelf: 'stretch', borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface, marginBottom: SPACE.lg },
})
