import { Image } from 'expo-image'
import { memo, useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

import ScalePress from '../motion/ScalePress'
import { LivePill, MonoRun } from '../ds/MonoFamily'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { LocationAskCard } from '../pulse/LocationAskCard'
import { Rail, RAIL_GAP } from '../pulse/Rail'
import { SectionHeader } from '../ds/SectionHeader'
import type { VenueListItem } from '../../lib/apiClient'
import { COLOR, DURATION, EASING, FONT_FAMILY, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import {
  bucketLabel,
  distanceText,
  glowFor,
  guestTypeLabel,
  hoursLine,
  KIND_TILES,
  nearLabel,
  openLabel,
  placeArea,
  plateFor,
  tileLabel,
  tonightEvent,
  type PlaceTypeFilter,
} from '../../lib/placesPane'
import { QuietRow } from './PlaceParts'
import { openPlace } from './openPlace'

/** The live tile is a square (BUILD-SPEC B2); the open card is 200 × 132 (B3). */
export const TILE_WIDTH = 156
export const OPEN_CARD_WIDTH = 200
export const OPEN_CARD_ART = 132
/**
 * The glow is brand rose, `COLOR.brandRose`: the colour the map's own venue lights are drawn from (`lib/mapTheme.ts`:
 * the venue roof's foot and a later pin). The design tokens' `map.glow` colour is oklch, which the generator cannot emit.
 */
const GLOW_COLOUR = COLOR.brandRose

/** Art for a place: tonight's cover when it has an event with one, else its type's plate. Decorative. */
function PlaceArt({ venue, now, size, radius }: { venue: VenueListItem; now: number; size: number; radius: number }) {
  const cover = tonightEvent(venue.nextEvent, now)?.cover
  const frame = { width: size, height: size, borderRadius: radius, overflow: 'hidden' as const }
  if (cover) {
    return (
      <View style={frame}>
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
      </View>
    )
  }
  return <VenuePlate type={plateFor(venue.venueType)} size={size} radius={radius} />
}

type Bucket = VenueListItem['liveNow']

/** One glow: the bucket's radial gradient at the tile's bottom centre, at `fadeTo` opacity (1 or 0), starting from `from`. */
function GlowLayer({ bucket, size, from, fadeTo, layer }: { bucket: Bucket; size: number; from: 0 | 1; fadeTo: 0 | 1; layer: 'now' | 'old' }) {
  const step = glowFor(bucket)
  const opacity = useSharedValue<number>(from)
  useEffect(() => {
    opacity.set(withTiming(fadeTo, { duration: DURATION.medium, easing: Easing.bezier(...EASING.standard) }))
  }, [fadeTo, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  if (!step) return null
  // Distinct per layer: the old and the new gradient of one tile are on screen together while they cross.
  const id = `glow-${bucket}-${layer}`
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`place-glow-${bucket}-${layer}`}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx={size / 2} cy={size} r={step.radius} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={GLOW_COLOUR} stopOpacity={step.alpha} />
            <Stop offset="1" stopColor={GLOW_COLOUR} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}

/**
 * The bucket's glow (B2). Static; when the bucket changes while the tile is on screen it is a true cross-fade
 * over `DURATION.medium`: the previous bucket's glow fades 1 to 0 under the new one's 0 to 1, then is dropped.
 * A tile scrolling into view is not a change, and under Reduce Motion the swap is instant. Decorative.
 */
function Glow({ bucket, size }: { bucket: Bucket; size: number }) {
  const reduceMotion = useReducedMotion()
  const [layers, setLayers] = useState<{ now: Bucket; old: Bucket | null }>({ now: bucket, old: null })
  // The bucket moved: keep the one it left, to fade it out.
  if (layers.now !== bucket) setLayers({ now: bucket, old: reduceMotion ? null : layers.now })
  const { now, old } = layers
  useEffect(() => {
    if (old === null) return
    const done = setTimeout(() => setLayers((l) => ({ ...l, old: null })), DURATION.medium)
    return () => clearTimeout(done)
  }, [old])
  return (
    <>
      {old !== null ? <GlowLayer key={`old-${old}`} bucket={old} size={size} from={1} fadeTo={0} layer="old" /> : null}
      <GlowLayer key={`now-${now}`} bucket={now} size={size} from={old !== null ? 0 : 1} fadeTo={1} layer="now" />
    </>
  )
}

/** "{area} · {distance mono}" or the type line; one line. */
function MetaLine({ parts, distance }: { parts: (string | null)[]; distance: string | null }) {
  const bold = useBoldText()
  const lead = parts.filter(Boolean).join(' · ')
  return (
    <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
      {lead}
      {distance ? (
        <>
          {lead ? ' · ' : ''}
          <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{distance}</Text>
        </>
      ) : null}
    </Text>
  )
}

const pressProps = {
  haptic: false,
  pressedScale: Platform.OS === 'android' ? 1 : PRESS.scale,
  android_ripple: { color: PRESSED_WASH.android, foreground: true },
} as const

/** A live tile: the plate (or tonight's cover) at 156 square, the bucket's glow, the pill. */
export const LiveTile = memo(function LiveTile({ venue, now }: { venue: VenueListItem; now: number }) {
  const bold = useBoldText()
  const liveText = bucketLabel(venue.liveNow)
  return (
    <ScalePress {...pressProps} onPress={() => openPlace(venue)} accessibilityRole="button" accessibilityLabel={tileLabel(venue)} testID={`place-tile-${venue.id}`} style={styles.tile}>
      <View style={styles.tileArt}>
        <PlaceArt venue={venue} now={now} size={TILE_WIDTH} radius={RADIUS.mediaInCard} />
        <Glow bucket={venue.liveNow} size={TILE_WIDTH} />
        {liveText ? (
          <View style={styles.tilePill}>
            <LivePill text={liveText} />
          </View>
        ) : null}
      </View>
      <View style={styles.tileText}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
          {venue.name}
        </Text>
        <MetaLine parts={[placeArea(venue)]} distance={distanceText(venue.distance)} />
      </View>
    </ScalePress>
  )
})

/** An Open tonight card: 200 × 132 art, then the name, the type line and one line about tonight. */
export const OpenCard = memo(function OpenCard({ venue, now }: { venue: VenueListItem; now: number }) {
  const bold = useBoldText()
  const tonight = tonightEvent(venue.nextEvent, now)
  const hours = tonight ? null : hoursLine(venue.tonight, now)
  return (
    <ScalePress {...pressProps} onPress={() => openPlace(venue)} accessibilityRole="button" accessibilityLabel={openLabel(venue, now)} testID={`place-open-${venue.id}`} style={styles.openCard}>
      <View style={styles.openArt}>
        <PlaceArt venue={venue} now={now} size={OPEN_CARD_WIDTH} radius={RADIUS.mediaInCard} />
      </View>
      <View style={styles.tileText}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
          {venue.name}
        </Text>
        <MetaLine parts={[guestTypeLabel(venue), placeArea(venue)]} distance={distanceText(venue.distance)} />
        {tonight ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>
              <MonoRun text={tonight.when} />
            </Text>
            {` · ${tonight.title}`}
          </Text>
        ) : hours ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            {`${hours.lead} `}
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>
              <MonoRun text={hours.time} />
            </Text>
          </Text>
        ) : null}
      </View>
    </ScalePress>
  )
})

/** Live now: the heading with its count, then the tiles (one snapping rail). */
export const LiveSection = memo(function LiveSection({ venues, total, now, onSeeAll, focused }: { venues: VenueListItem[]; total: number; now: number; onSeeAll: () => void; focused: boolean }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader live title="Live now" count={total} action={focused ? undefined : { label: 'See all', onPress: onSeeAll }} testID="places-live-header" />
      </View>
      <Rail data={venues} itemWidth={TILE_WIDTH} renderItem={({ item }) => <LiveTile venue={item} now={now} />} testID="places-live-rail" />
    </View>
  )
})

/** Open tonight: the heading with its count, then the cards. */
export const OpenSection = memo(function OpenSection({ venues, total, now, onSeeAll, focused }: { venues: VenueListItem[]; total: number; now: number; onSeeAll: () => void; focused: boolean }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="Open tonight" count={total} action={focused ? undefined : { label: 'See all', onPress: onSeeAll }} testID="places-open-header" />
      </View>
      <Rail data={venues} itemWidth={OPEN_CARD_WIDTH} renderItem={({ item }) => <OpenCard venue={item} now={now} />} testID="places-open-rail" />
    </View>
  )
})

/** Near you: five rows, or (without a fix) the location card. "Show on map" lifts the drawer to half and fits the pins. */
export const NearSection = memo(function NearSection({ venues, hasFix, onAsk, onShowOnMap }: { venues: VenueListItem[]; hasFix: boolean; onAsk: () => void; onShowOnMap?: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="Near you" action={hasFix && onShowOnMap ? { label: 'Show on map', onPress: onShowOnMap } : undefined} testID="places-near-header" />
      </View>
      {hasFix ? (
        <View>
          {venues.map((venue, i) => (
            <QuietRow key={venue.id} venue={venue} n={i + 1} label={nearLabel(venue, i + 1)} testID={`place-near-${venue.id}`} />
          ))}
        </View>
      ) : (
        <LocationAskCard body="Turn on location to see the places closest to you, numbered on the map." label="Turn on location" icon="navigation" onAsk={onAsk} testID="places-near-ask" />
      )}
    </View>
  )
})

/** "What kind of night": a plate per kind, three across (two at large text). Tapping one asks the server for that kind. */
export const KINDS_AT_LARGE_TEXT = 1.5
export const KindGrid = memo(function KindGrid({ onSelect }: { onSelect: (venueType: PlaceTypeFilter) => void }) {
  const bold = useBoldText()
  const { width, fontScale } = useWindowDimensions()
  const columns = fontScale >= KINDS_AT_LARGE_TEXT ? 2 : 3
  const tile = Math.floor((width - SPACE.gutter * 2 - RAIL_GAP * (columns - 1)) / columns)
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="What kind of night" testID="places-kinds-header" />
      </View>
      <View style={styles.kinds}>
        {KIND_TILES.map((t) => (
          <ScalePress
            key={t.venueType}
            {...pressProps}
            onPress={() => {
              H.select()
              onSelect(t.venueType)
            }}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            testID={`places-kind-${t.venueType}`}
            style={{ width: tile, gap: SPACE.sm }}
          >
            <View style={{ width: tile, height: tile, borderRadius: RADIUS.mediaInCard, overflow: 'hidden' }}>
              <VenuePlate type={plateFor(t.venueType)} />
            </View>
            <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
              {t.label}
            </Text>
          </ScalePress>
        ))}
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  section: { gap: SPACE.md, paddingBottom: SPACE.xl },
  gutter: { paddingHorizontal: SPACE.gutter },
  tile: { width: TILE_WIDTH, gap: SPACE.sm },
  tileArt: { width: TILE_WIDTH, height: TILE_WIDTH, borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  // places.js: the pill sits 10 in from the art's corner.
  tilePill: { position: 'absolute', left: SPACE.sm + SPACE.xxs, top: SPACE.sm + SPACE.xxs },
  tileText: { gap: SPACE.xxs, paddingHorizontal: SPACE.xs },
  openCard: { width: OPEN_CARD_WIDTH, gap: SPACE.sm },
  openArt: { width: OPEN_CARD_WIDTH, height: OPEN_CARD_ART, borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACE.gutter, columnGap: RAIL_GAP, rowGap: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})
