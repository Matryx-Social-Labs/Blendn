import { Image } from 'expo-image'
import { router } from 'expo-router'
import { memo } from 'react'
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Chip } from '../ds/Chip'
import { LivePill } from '../ds/MonoFamily'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, PRESSED_WASH, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { Icon } from '../ui/Icon'
import type { VenueListItem } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import {
  distanceText,
  bucketLabel,
  placeArea,
  placeLabel,
  placesCount,
  PLACE_TYPES,
  plateFor,
  quietLine,
  tonightEvent,
  type PlaceTypeFilter,
} from '../../lib/placesPane'

/** A live tile (Places.html): 168 wide, a 124 photo at radius 24, the name and the type under it. */
export const TILE_WIDTH = 168
const TILE_PHOTO = 124
/** The open-tonight row: 72 tall, a 56 thumb at radius 8. The quiet row: 56 tall, a 40 thumb. */
const OPEN_ROW = 72
const QUIET_ROW = SIZE.primary
const QUIET_THUMB = 40
// design-exception: places.js quiet rows draw the thumb at radius 10 (RADIUS.thumb is 8, rowInCard 16)
const QUIET_THUMB_RADIUS = 10

/** A place opens with the distance the list showed, so the page need not ask where the phone is. */
function openPlace(venue: VenueListItem) {
  router.push({ pathname: '/venue/[id]', params: { id: venue.id, ...(venue.distance != null ? { km: String(venue.distance) } : {}) } } as never)
}

/**
 * A place's art: tonight's cover when it has an event, else its type's plate
 * (A87: the plate tokens as a full-bleed split, never a grey box). Decorative:
 * the name and type beside it are what is read.
 */
function PlaceArt({ venue, now, size, radius }: { venue: VenueListItem; now: number; size?: number; radius?: number }) {
  const cover = tonightEvent(venue.nextEvent, now)?.cover
  if (cover) {
    return (
      <View style={size ? { width: size, height: size, borderRadius: radius, overflow: 'hidden' } : StyleSheet.absoluteFill}>
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
      </View>
    )
  }
  return <VenuePlate type={plateFor(venue.venueType)} size={size} radius={radius} />
}

/** "Brewery · 350 m": the type, and the distance in Geist Mono. */
function TypeLine({ venue, area = false, small = false }: { venue: VenueListItem; area?: boolean; small?: boolean }) {
  const bold = useBoldText()
  const distance = distanceText(venue.distance)
  const lead = [venue.venueTypeLabel, area ? placeArea(venue) : null].filter(Boolean).join(' · ')
  return (
    <Text numberOfLines={1} style={[font('meta', bold), styles.secondary, small && styles.quietMeta]}>
      {lead}
      {distance ? (
        <>
          {lead ? ' · ' : ''}
          <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular, small && styles.quietMono]}>{distance}</Text>
        </>
      ) : null}
    </Text>
  )
}

const Tile = memo(function Tile({ venue, now }: { venue: VenueListItem; now: number }) {
  const bold = useBoldText()
  const liveText = bucketLabel(venue.liveNow)
  return (
    <ScalePress
      haptic={false}
      pressedScale={Platform.OS === 'android' ? 1 : PRESS.scale}
      android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
      onPress={() => openPlace(venue)}
      accessibilityRole="button"
      accessibilityLabel={placeLabel(venue, now)}
      testID={`place-tile-${venue.id}`}
      style={styles.tile}
    >
      <View style={styles.tilePhoto}>
        <PlaceArt venue={venue} now={now} />
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
        <TypeLine venue={venue} />
      </View>
    </ScalePress>
  )
})

/** Live now: the heading with the count, then the tiles in one horizontal row (the only place with photos). */
export const LiveRail = memo(function LiveRail({ venues, now }: { venues: VenueListItem[]; now: number }) {
  return (
    <View style={styles.section}>
      <View style={styles.gutter}>
        <SectionHeader
          live
          title="Live now"
          right={<RailCount text={placesCount(venues.length)} />}
          testID="places-live-header"
        />
      </View>
      <FlatList
        horizontal
        data={venues}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <Tile venue={item} now={now} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        initialNumToRender={3}
        windowSize={5}
        testID="places-live-rail"
      />
    </View>
  )
})

function RailCount({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>{text}</Text>
}

export function OpenHeader() {
  return (
    <View style={[styles.gutter, styles.headerGap]}>
      <SectionHeader title="Open tonight" testID="places-open-header" />
    </View>
  )
}

/** Open tonight: a row with the event line ("9 PM · Vinyl Night"). */
export const OpenRow = memo(function OpenRow({ venue, now }: { venue: VenueListItem; now: number }) {
  const bold = useBoldText()
  const tonight = tonightEvent(venue.nextEvent, now)
  return (
    <Pressable
      testID={`place-open-${venue.id}`}
      onPress={() => openPlace(venue)}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={placeLabel(venue, now)}
      style={({ pressed }) => [styles.row, styles.gutter, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      <View style={styles.openThumb}>
        <PlaceArt venue={venue} now={now} />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
          {venue.name}
        </Text>
        <TypeLine venue={venue} area />
        {tonight ? (
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink]}>
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{tonight.when}</Text>
            {` · ${tonight.title}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
})

/** The quiet places, folded behind one line with a count; it unfolds in place. */
export function QuietFold({ count, more, open, onPress }: { count: number; more: boolean; open: boolean; onPress: () => void }) {
  const bold = useBoldText()
  const line = quietLine(count, more)
  return (
    <View style={[styles.gutter, styles.foldGap]}>
      <Pressable
        testID="places-quiet-fold"
        onPress={() => {
          H.select()
          onPress()
        }}
        android_ripple={{ color: PRESSED_WASH.android }}
        accessibilityRole="button"
        accessibilityLabel={line}
        accessibilityHint={open ? 'Hides the quiet places' : 'Shows the quiet places'}
        accessibilityState={{ expanded: open }}
        style={styles.fold}
      >
        <Text style={[font('body', bold), styles.ink]}>
          <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{`${count}${more ? '+' : ''}`}</Text>
          {count === 1 && !more ? ' quiet place' : ' quiet places'}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={ICON.control} color={COLOR.textSecondary} />
      </Pressable>
    </View>
  )
}

/** A quiet place: a small type plate (no photo), the name, the type and area, and a live count at the end only when it shows one (never under 5). */
export const QuietRow = memo(function QuietRow({ venue }: { venue: VenueListItem }) {
  const bold = useBoldText()
  const words = bucketLabel(venue.liveNow)
  return (
    <Pressable
      testID={`place-quiet-${venue.id}`}
      onPress={() => openPlace(venue)}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={placeLabel(venue)}
      style={({ pressed }) => [styles.quietRow, styles.gutter, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      <VenuePlate type={plateFor(venue.venueType)} size={QUIET_THUMB} radius={QUIET_THUMB_RADIUS} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[font('bodyStrong', bold), styles.quietName, styles.ink]}>
          {venue.name}
        </Text>
        <TypeLine venue={venue} area small />
      </View>
      {words ? (
        <Text numberOfLines={1} style={[font('meta', bold), styles.tertiary]}>
          {words}
        </Text>
      ) : null}
    </Pressable>
  )
})

/** The type chips: one selected, white; each re-asks the server for that type. */
export function TypeChips({ selected, onSelect }: { selected: PlaceTypeFilter; onSelect: (venueType: PlaceTypeFilter) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chips}
      style={styles.chipsScroll}
      testID="places-type-chips"
    >
      {PLACE_TYPES.map((t) => (
        <Chip key={t.label} label={t.label} selected={t.venueType === selected} onPress={() => onSelect(t.venueType)} />
      ))}
    </ScrollView>
  )
}

/** Loading: four static blocks at the rows' geometry. Nothing loops. */
export function PlacesSkeleton() {
  return (
    <View style={[styles.skeleton, styles.gutter]} accessibilityLabel="Loading places" accessibilityState={{ busy: true }} testID="places-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonBlock} />
      ))}
    </View>
  )
}

/** "Places didn’t refresh." over a list already shown: the list stays, and one tap tries again. */
export function RefreshFailed({ onRetry }: { onRetry: () => void }) {
  const bold = useBoldText()
  return (
    <View style={[styles.failed, styles.gutter]} accessibilityLiveRegion="polite" testID="places-refresh-failed">
      <Text style={[font('meta', bold), styles.secondary]}>Places didn’t refresh.</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again" style={[styles.retry, { minHeight: minTarget() }]}>
        <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>Try again</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  section: { gap: SPACE.md, paddingBottom: SPACE.xl },
  rail: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  tile: { width: TILE_WIDTH, gap: SPACE.sm },
  tilePhoto: { height: TILE_PHOTO, borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  // places.js: the pill sits 10 in from the photo's corner.
  tilePill: { position: 'absolute', left: SPACE.sm + SPACE.xxs, top: SPACE.sm + SPACE.xxs },
  tileText: { gap: SPACE.xxs, paddingHorizontal: SPACE.xs },
  row: { height: OPEN_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm },
  headerGap: { paddingBottom: SPACE.md },
  foldGap: { paddingVertical: SPACE.sm },
  rowText: { flex: 1, minWidth: 0 },
  openThumb: { width: SIZE.primary, height: SIZE.primary, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surface },
  quietRow: { height: QUIET_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xs },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  fold: {
    height: SIZE.control,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
  },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm, paddingBottom: SPACE.lg },
  skeleton: { gap: SPACE.md },
  skeletonBlock: { height: OPEN_ROW, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surfaceSunken },
  failed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.sm },
  retry: { justifyContent: 'center' },
  // design-exception: places.js quiet rows are 15/20 with a 13 meta and a 12 mono — between the type roles
  quietName: { fontSize: 15, lineHeight: 20 },
  // design-exception: places.js quiet rows meta 13/20
  quietMeta: { fontSize: 13 },
  // design-exception: places.js quiet rows distance 12 mono
  quietMono: { fontSize: 12 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary },
  tabular: { fontVariant: ['tabular-nums'] },
})
