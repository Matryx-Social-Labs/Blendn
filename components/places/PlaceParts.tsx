import { memo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { font, minTarget, PRESSED_WASH, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { Icon } from '../ui/Icon'
import type { VenueListItem } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { bucketLabel, distanceText, moreLine, placeArea, placeLabel, plateFor } from '../../lib/placesPane'
import { OPEN_CARD_WIDTH, TILE_WIDTH } from './PlaceCards'
import { openPlace } from './openPlace'

/** The quiet row: 56 tall, a 40 thumb. */
const QUIET_ROW = SIZE.primary
const QUIET_THUMB = 40
// design-exception: places.js quiet rows draw the thumb at radius 10 (RADIUS.thumb is 8, rowInCard 16)
const QUIET_THUMB_RADIUS = 10
/** The skeleton's open card is the card's height. */
const OPEN_CARD_ART = 132

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

/** The quiet places, folded behind one line with a count; it unfolds in place. */
export function QuietFold({ count, more, open, nearest, onPress }: { count: number; more: boolean; open: boolean; nearest: boolean; onPress: () => void }) {
  const bold = useBoldText()
  const line = moreLine(count, more)
  const order = nearest ? 'Nearest first' : 'A–Z'
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
        accessibilityLabel={`${line}. ${order}`}
        accessibilityHint={open ? 'Hides these places' : 'Shows these places'}
        accessibilityState={{ expanded: open }}
        style={styles.fold}
      >
        <Text style={[font('body', bold), styles.ink]}>
          <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{`${count}${more ? '+' : ''}`}</Text>
          {count === 1 && !more ? ' more place' : ' more places'}
        </Text>
        <View style={styles.foldEnd}>
          <Text style={[font('meta', bold), styles.secondary]}>{order}</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={ICON.control} color={COLOR.textSecondary} />
        </View>
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

/**
 * Loading (B10): static blocks at the new sections' geometry. A 130 × 26 bar and three 156 squares with two
 * text bars each; a 150 × 26 bar and two 200 × 132; a 100 × 26 bar and four 132-tall area blocks. Nothing loops.
 */
const SKELETON = { bar: 26, text: 12, area: 132, headers: [130, 150, 100] } as const
const block = (width: number | string, height: number, radius: number, key?: string) => (
  <View key={key} style={{ width: width as number, height, borderRadius: radius, backgroundColor: COLOR.surfaceSunken }} />
)
export function PlacesSkeleton() {
  return (
    <View accessibilityLabel="Loading places" accessibilityState={{ busy: true }} testID="places-skeleton">
      <View style={styles.section}>
        <View style={styles.gutter}>{block(SKELETON.headers[0], SKELETON.bar, RADIUS.thumb)}</View>
        <View style={styles.rail}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ gap: SPACE.sm }}>
              {block(TILE_WIDTH, TILE_WIDTH, RADIUS.mediaInCard)}
              {block(TILE_WIDTH * 0.8, SKELETON.text, RADIUS.capsule)}
              {block(TILE_WIDTH * 0.5, SKELETON.text, RADIUS.capsule)}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>{block(SKELETON.headers[1], SKELETON.bar, RADIUS.thumb)}</View>
        <View style={styles.rail}>{[0, 1].map((i) => block(OPEN_CARD_WIDTH, OPEN_CARD_ART, RADIUS.mediaInCard, `o${i}`))}</View>
      </View>
      <View style={styles.section}>
        <View style={styles.gutter}>{block(SKELETON.headers[2], SKELETON.bar, RADIUS.thumb)}</View>
        <View style={[styles.gutter, styles.areas]}>{[0, 1, 2, 3].map((i) => <View key={i} style={styles.area} />)}</View>
      </View>
    </View>
  )
}

/** "Places didn’t refresh." over a list already shown: the list stays, and one tap tries again. Styled as the destructive banner. */
export function RefreshFailed({ onRetry }: { onRetry: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.failed} accessibilityLiveRegion="polite" testID="places-refresh-failed">
      <Icon name="cloud-off" size={ICON.control} color={COLOR.textPrimary} />
      <Text style={[font('meta', bold), styles.ink, styles.failedText]}>Places didn’t refresh.</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again" style={[styles.retry, { minHeight: minTarget() }]}>
        <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>Try again</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  section: { gap: SPACE.md, paddingBottom: SPACE.xl },
  rail: { paddingHorizontal: SPACE.gutter, gap: SPACE.md, flexDirection: 'row' },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  area: { width: '47%', height: SKELETON.area, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken },
  foldGap: { paddingVertical: SPACE.sm },
  foldEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  rowText: { flex: 1, minWidth: 0 },
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
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginHorizontal: SPACE.gutter,
    marginBottom: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.destructiveTint,
  },
  failedText: { flex: 1 },
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
