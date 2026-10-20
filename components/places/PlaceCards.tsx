import { Image } from 'expo-image'
import { memo, useEffect, useRef } from 'react'
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

import ScalePress from '../motion/ScalePress'
import { Button } from '../ds/Button'
import { LivePill, PresenceDot } from '../ds/MonoFamily'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { Icon } from '../ui/Icon'
import { Rail, RAIL_GAP } from '../pulse/Rail'
import { SectionHeader } from '../ds/SectionHeader'
import type { VenueListItem } from '../../lib/apiClient'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import {
  bucketLabel,
  distanceText,
  glowFor,
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
import { openPlace } from './openPlace'

/** The live tile is a square (BUILD-SPEC B2); the open card is 200 × 132 (B3). */
export const TILE_WIDTH = 156
export const OPEN_CARD_WIDTH = 200
const OPEN_CARD_ART = 132
/** Near you's row (B4): 60 tall, a 28 pt numbered disc, a 40 pt plate. */
const NEAR_ROW = 60
const NEAR_DISC = 28
const NEAR_PLATE = 40
// design-exception: places.js quiet rows and Near you draw the thumb at radius 10 (RADIUS.thumb is 8, rowInCard 16)
const NEAR_PLATE_RADIUS = 10
// design-exception: the map glow colour is oklch(0.68 0.14 345), which the token generator does not emit (React Native cannot parse oklch); sRGB per BUILD-SPEC B2, to be confirmed against the export
const GLOW_COLOUR = '#D87AA6'

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

/**
 * The bucket's glow, anchored at the tile's bottom centre: a radial gradient of the bucket's alpha and radius.
 * Static; when the bucket changes it cross-fades over `DURATION.medium` (Reduce Motion: a cut). Decorative.
 */
function Glow({ bucket, size }: { bucket: VenueListItem['liveNow']; size: number }) {
  const step = glowFor(bucket)
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  const first = useRef(true)
  useEffect(() => {
    // A tile scrolling into view is not a change: only a bucket moving while it is on screen fades.
    if (first.current) {
      first.current = false
      return
    }
    if (reduceMotion) return
    opacity.value = 0
    opacity.value = withTiming(1, { duration: DURATION.medium, easing: Easing.bezier(...EASING.standard) })
  }, [bucket, reduceMotion, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  if (!step) return null
  const id = `glow-${bucket}`
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`place-glow-${bucket}`}>
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
        <MetaLine parts={[venue.venueTypeLabel, placeArea(venue)]} distance={distanceText(venue.distance)} />
        {tonight ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{tonight.when}</Text>
            {` · ${tonight.title}`}
          </Text>
        ) : hours ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            {`${hours.lead} `}
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{hours.time}</Text>
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

/** One of the five nearest: the number the map's pin carries, the plate, the name, the distance and the live caption (≥ 5 only). */
export const NearRow = memo(function NearRow({ venue, n }: { venue: VenueListItem; n: number }) {
  const bold = useBoldText()
  const live = bucketLabel(venue.liveNow)
  return (
    <Pressable
      testID={`place-near-${venue.id}`}
      onPress={() => openPlace(venue)}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={nearLabel(venue, n)}
      style={({ pressed }) => [styles.nearRow, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      <View style={styles.nearDisc} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[font('meta', bold, FONT_FAMILY.mono[700]), styles.nearNumber]}>{n}</Text>
      </View>
      <VenuePlate type={plateFor(venue.venueType)} size={NEAR_PLATE} radius={NEAR_PLATE_RADIUS} />
      <View style={styles.nearText}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.nearName, styles.ink]}>
          {venue.name}
        </Text>
        <Text numberOfLines={1} style={[font('meta', bold), styles.secondary, styles.nearMeta]}>
          {[venue.venueTypeLabel, placeArea(venue)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.nearEnd}>
        <Text style={[font('bodyStrong', bold, FONT_FAMILY.mono[500]), styles.ink, styles.tabular, styles.nearDistance]}>{distanceText(venue.distance) ?? ''}</Text>
        {live ? (
          <View style={styles.nearLive}>
            <PresenceDot kind="live" />
            <Text style={[font('caption', bold), styles.secondary]}>{live}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
})

/** The location card: no fix, no distances and no pins; one button asks. */
function NearLocationCard({ onAsk }: { onAsk: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.askCard} testID="places-near-ask">
      <Icon name="map-pin" size={ICON.control} color={COLOR.textSecondary} />
      <Text style={[font('body', bold), styles.ink]}>Turn on location to see the places closest to you, numbered on the map.</Text>
      <View style={styles.askButton}>
        <Button label="Turn on location" kind="secondary" size="sm" onPress={onAsk} testID="places-near-ask-button" />
      </View>
    </View>
  )
}

/** Near you: five rows, or (without a fix) the location card. "Show on map" lifts the drawer to half and fits the pins. */
export const NearSection = memo(function NearSection({ venues, hasFix, onAsk, onShowOnMap }: { venues: VenueListItem[]; hasFix: boolean; onAsk: () => void; onShowOnMap?: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader title="Near you" action={hasFix && onShowOnMap ? { label: 'Show on map', onPress: onShowOnMap } : undefined} testID="places-near-header" />
      </View>
      {hasFix ? (
        <View style={styles.nearList}>
          {venues.map((venue, i) => (
            <NearRow key={venue.id} venue={venue} n={i + 1} />
          ))}
        </View>
      ) : (
        <NearLocationCard onAsk={onAsk} />
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
            <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.kindLabel, styles.ink]}>
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
  nearList: { paddingHorizontal: SPACE.gutter },
  nearRow: { height: NEAR_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  nearDisc: { width: NEAR_DISC, height: NEAR_DISC, borderRadius: NEAR_DISC / 2, backgroundColor: COLOR.textPrimary, alignItems: 'center', justifyContent: 'center' },
  nearNumber: { color: COLOR.ink },
  nearText: { flex: 1, minWidth: 0 },
  // design-exception: Near you rows are 15/20 names with a 13 meta, as the quiet row (between the type roles)
  nearName: { fontSize: 15, lineHeight: 20 },
  // design-exception: Near you meta 13/20
  nearMeta: { fontSize: 13, lineHeight: 20 },
  nearEnd: { alignItems: 'flex-end' },
  // design-exception: Near you's distance is Geist Mono 15
  nearDistance: { fontSize: 15, lineHeight: 20 },
  nearLive: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  // design-exception: 20, as the Pulse's location card (between SPACE.lg and SPACE.xl)
  askCard: { marginHorizontal: SPACE.gutter, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, padding: 20, gap: SPACE.sm + SPACE.xxs },
  askButton: { alignSelf: 'flex-start' },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACE.gutter, columnGap: RAIL_GAP, rowGap: SPACE.lg },
  // design-exception: kind labels are 15/20 medium (places.html), between the type roles
  kindLabel: { fontSize: 15, lineHeight: 20 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})
