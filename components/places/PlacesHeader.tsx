import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { IconButton } from '../ds/IconButton'
import { Badge } from '../ds/MonoFamily'
import { SearchField } from '../ds/SearchField'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, SPACE } from '../../lib/design/tokens'
import { PLACE_TYPES, type PlaceTypeFilter } from '../../lib/placesPane'

/**
 * The top of Places (BUILD-SPEC B1, B8): the title with the city chip, the stat line (one text for a screen
 * reader), the search with its filter button, and the chosen kind as a removable chip. It is a row of the
 * list, so it scrolls away at full height.
 * ponytail: not sticky at full height yet (no scroll-edge fade); the list's `stickyHeaderIndices` is the way.
 */
export const PlacesHeader = memo(function PlacesHeader({
  city,
  onPressCity,
  stat,
  query,
  onChangeQuery,
  searching,
  filterCount,
  onPressFilter,
  venueType,
  onClearKind,
}: {
  city: string | null
  onPressCity: () => void
  stat: { text: string; spoken: string } | null
  query: string
  onChangeQuery: (text: string) => void
  searching: boolean
  filterCount: number
  onPressFilter: () => void
  venueType: PlaceTypeFilter
  onClearKind: () => void
}) {
  const bold = useBoldText()
  const kind = PLACE_TYPES.find((t) => t.venueType === venueType && venueType !== null)
  return (
    <View style={styles.wrap} testID="places-header">
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[font('display', bold), styles.ink, styles.title]} numberOfLines={1}>
          Places
        </Text>
        <Pressable
          onPress={onPressCity}
          android_ripple={{ color: PRESSED_WASH.android }}
          accessibilityRole="button"
          accessibilityLabel={city ? `Browsing ${city}. Change city` : 'Choose a city'}
          hitSlop={SPACE.md}
          style={styles.city}
          testID="places-city"
        >
          <Icon name="map-pin" size={ICON.inline} color={COLOR.textSecondary} />
          <Text numberOfLines={1} style={[font('meta', bold), styles.ink, styles.cityText]}>
            {city ?? 'Choose city'}
          </Text>
          <Icon name="chevron-down" size={ICON.inline} color={COLOR.textSecondary} />
        </Pressable>
      </View>
      {stat ? (
        <Text
          accessibilityLabel={stat.spoken}
          style={[font('label', bold, FONT_FAMILY.mono[500]), styles.secondary]}
          numberOfLines={1}
          testID="places-stat"
        >
          {stat.text.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={onChangeQuery} placeholder="Search places or areas" busy={searching} testID="places-search" />
        </View>
        <View>
          <IconButton icon="sliders-horizontal" accessibilityLabel="Filters" accessibilityHint={filterCount ? `${filterCount} applied` : undefined} onPress={onPressFilter} testID="places-filter" />
          {filterCount > 0 ? (
            <View style={styles.badge} pointerEvents="none">
              <Badge text={filterCount} testID="places-filter-badge" />
            </View>
          ) : null}
        </View>
      </View>
      {kind ? (
        <View style={styles.kindChip}>
          <Chip label={kind.label} selected onRemove={onClearKind} accessibilityLabel={`${kind.label}, remove filter`} testID="places-kind-chip" />
        </View>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md, paddingBottom: SPACE.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  title: { flexShrink: 1 },
  city: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, flexShrink: 0, maxWidth: '50%' },
  cityText: { flexShrink: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  search: { flex: 1 },
  badge: { position: 'absolute', top: -SPACE.xs, right: -SPACE.xs },
  kindChip: { flexDirection: 'row' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
