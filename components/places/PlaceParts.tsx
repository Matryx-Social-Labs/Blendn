import { memo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Banner } from '../ds/Banner'
import { Badge } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { VenuePlate } from '../ds/VenuePlate'
import { Icon } from '../ui/Icon'
import type { VenueListItem } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { bucketLabel, distanceText, foldNoun, moreLine, placeArea, placeLabel, plateFor, type PlaceTypeFilter } from '../../lib/placesPane'
import { openPlace } from './openPlace'

/** The quiet row: 56 tall, a 40 thumb. */
const QUIET_ROW = SIZE.primary
const QUIET_THUMB = 40
// design-exception: places.js quiet rows draw the thumb at radius 10 (RADIUS.thumb is 8, rowInCard 16)
const QUIET_THUMB_RADIUS = 10

/** "Brewery · 350 m": the type, and the distance in Geist Mono. */
function TypeLine({ venue, area = false, small = false }: { venue: VenueListItem; area?: boolean; small?: boolean }) {
  const bold = useBoldText()
  const distance = distanceText(venue.distance)
  // A row that carries the area leads with it: five "The Pub" rows are told apart by where they are (audit A40).
  const lead = (area ? [placeArea(venue), venue.venueTypeLabel] : [venue.venueTypeLabel]).filter(Boolean).join(' · ')
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
export function QuietFold({
  count,
  more,
  open,
  nearest,
  placeKind = null,
  onPress,
}: {
  count: number
  more: boolean
  open: boolean
  nearest: boolean
  placeKind?: PlaceTypeFilter
  onPress: () => void
}) {
  const bold = useBoldText()
  const line = moreLine(count, more, placeKind)
  const figure = line.slice(0, line.indexOf(' more '))
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
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('body', bold), styles.ink, styles.foldLine]}>
          <Text style={[font('body', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{figure}</Text>
          {` more ${foldNoun(count, more, placeKind)}`}
        </Text>
        <View style={styles.foldEnd}>
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary]}>
            {order}
          </Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={ICON.control} color={COLOR.textSecondary} />
        </View>
      </Pressable>
    </View>
  )
}

/** A quiet place (and, with `n`, one of Near you's five: the design system's Badge numbers it, as it numbers the map's pin): a small type plate (no photo), the name, the type and area, and a live count at the end only when it shows one (never under 5). */
export const QuietRow = memo(function QuietRow({ venue, n, label, testID }: { venue: VenueListItem; n?: number; label?: string; testID?: string }) {
  const bold = useBoldText()
  const words = bucketLabel(venue.liveNow)
  return (
    <Pressable
      testID={testID ?? `place-quiet-${venue.id}`}
      onPress={() => openPlace(venue)}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole="button"
      accessibilityLabel={label ?? placeLabel(venue)}
      style={({ pressed }) => [styles.quietRow, styles.gutter, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      {n !== undefined ? <Badge text={n} size={22} /> : null}
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

/** "Places didn’t refresh." over a list already shown: the list stays, and one tap tries again. The design system's destructive-tint Banner. */
export function RefreshFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.failed} testID="places-refresh-failed">
      <Banner kind="offline" icon="cloud-off" text="Places didn’t refresh." action={{ label: 'Try again', onPress: onRetry }} />
    </View>
  )
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: SPACE.gutter },
  foldGap: { paddingVertical: SPACE.sm },
  foldEnd: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  rowText: { flex: 1, minWidth: 0 },
  quietRow: { height: QUIET_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xs },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  foldLine: { flexShrink: 1 },
  fold: {
    minHeight: SIZE.control,
    gap: SPACE.sm,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
  },
  failed: { marginHorizontal: SPACE.gutter, marginBottom: SPACE.md },
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
