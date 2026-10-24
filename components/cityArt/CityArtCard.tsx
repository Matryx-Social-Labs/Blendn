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
import { type CityArtInfo } from '../../lib/cityArt'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import { CheckDisc } from '../ds/RadioCard'
import { CONTROL_FONT_CAP, font, useBoldText, useSelection } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { PhotoScrim } from '../ui/GradientFill'
import { CityScene, useSceneTime } from './CityScene'

function useSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width)
    const height = Math.round(e.nativeEvent.layout.height)
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
  }
  return [size, onLayout] as const
}

/**
 * The skyline card is 140 tall (Flow 3 `city`) at rest, and grows when its label does: a minimum, never a height (the
 * row rule, components/ds/shared.ts). The banner takes its own height from the caller.
 */
const CARD_HEIGHT = 140
const PILL_HEIGHT = 28

interface CardProps {
  /** The server's spelling, shown as-is — it is what the list is keyed by. */
  city: string
  art: CityArtInfo
  /** What the city holds, from `cityCountLabel`: "12 events", or "1,206 places" for a city with no events. */
  countLabel: string
  active: boolean
  /** The device is in this city. */
  here: boolean
  onPress: () => void
}

/**
 * A picker row for a city that has art (Flow 3 `city`, R4.1 3-6): the skyline, the name over it and the city's own
 * script beside its count, "You're here" as a white pill when the phone is in it. The chosen city wears the DS
 * selection mark in the screen's hue: the ring and the check disc.
 */
export function CityArtCard({ city, art, countLabel, active, here, onPress }: CardProps) {
  const bold = useBoldText()
  const sel = useSelection()
  const [{ width, height }, onLayout] = useSize()
  const tod = useSceneTime(art.timeZone)

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
      <View testID="city-art-frame" style={styles.art} onLayout={onLayout}>
        {/* The scene fills whatever the label leaves it, drawn at the card's measured size (it keeps its ground, CityScene). */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <CityScene city={art.key} width={width} height={Math.max(height, CARD_HEIGHT)} tod={tod} />
        </View>
        {/*
         * The label sits in the flow at the foot, over a scrim: the skyline is busiest at its foot, and over a day sky the
         * scene's own ink read under the towers (audit A5). White on the scrim reads at every time of day. Capped at
         * CONTROL_FONT_CAP: the card is a control (a picker row), and the card grows rather than slicing it (A4).
         */}
        <View testID="city-art-label" style={styles.label} pointerEvents="none">
          <PhotoScrim testID="city-art-scrim" style={StyleSheet.absoluteFill} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('heading', bold), styles.onScrim]} numberOfLines={1}>
            {city}
          </Text>
          {/* The script line is system-drawn: neither app family carries Kannada or Devanagari. */}
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.script, styles.onScrim]} numberOfLines={2}>
            {[art.script, countLabel].join(' · ')}
          </Text>
        </View>
        {here ? (
          <View style={[styles.here, active && styles.hereBesideCheck]}>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.onWhite]}>
              You’re here
            </Text>
          </View>
        ) : null}
        <CheckDisc selected={active} testID="city-art-check" />
        {active ? <View pointerEvents="none" style={[styles.ring, { borderColor: sel.edge }]} /> : null}
      </View>
    </ScalePress>
  )
}

/** The scene alone, cropped to a strip: sky gives way before the street does. */
export function CityArtBanner({ art, height }: { art: CityArtInfo; height: number }) {
  const [{ width }, onLayout] = useSize()
  return (
    <View style={[styles.banner, { height }]} onLayout={onLayout}>
      <CityScene city={art.key} width={width} height={height} />
    </View>
  )
}

/** The city's name in its own script sits a step behind the English name, over the art (white at 75% on the scrim's foot: 9:1). */
const SCRIPT_OPACITY = 0.75

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface, marginBottom: SPACE.md },
  art: { width: '100%', minHeight: CARD_HEIGHT, justifyContent: 'flex-end' },
  // The scrim's clear head runs up into the sky; the right inset clears the check disc and the pill's column.
  label: { paddingLeft: SPACE.lg, paddingRight: SPACE.xxxl, paddingTop: SPACE.xxl, paddingBottom: SPACE.md, gap: SPACE.xxs },
  onScrim: { color: COLOR.textPrimary },
  script: { fontFamily: undefined, opacity: SCRIPT_OPACITY },
  here: {
    position: 'absolute',
    right: SPACE.md,
    top: SPACE.md,
    minHeight: PILL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
  },
  // The check disc owns the corner (24 pt, 10 in): the pill steps left of it.
  hereBesideCheck: { right: SPACE.md + 24 + SPACE.sm },
  onWhite: { color: COLOR.ink },
  ring: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.mediaInCard, borderWidth: SPACE.xxs },
  banner: { alignSelf: 'stretch', borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface, marginBottom: SPACE.lg },
})
