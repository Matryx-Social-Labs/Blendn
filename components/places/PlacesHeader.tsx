import { memo, useEffect, useState } from 'react'
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
 * The top of Places (BUILD-SPEC B1), in two rows of the list: the title (headline, city control, stat line;
 * scrolls away) and the search (sticky under it; see `PlacesSearch`).
 */
export const PlacesTitle = memo(function PlacesTitle({
  city,
  onPressCity,
  stat,
}: {
  city: string | null
  onPressCity: () => void
  stat: { text: string; spoken: string } | null
}) {
  const bold = useBoldText()
  return (
    <View style={styles.titleWrap} testID="places-header">
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
        <Text accessibilityLabel={stat.spoken} style={[font('label', bold, FONT_FAMILY.mono[500]), styles.secondary]} numberOfLines={1} testID="places-stat">
          {stat.text.toUpperCase()}
        </Text>
      ) : null}
    </View>
  )
})

/** A typed search reaches the list this long after the last key. */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * The search field with its filter button, and the chosen kind as a removable chip (B1, B8). It holds what is
 * typed itself and hands the list only the settled text, so a keystroke re-renders this row and nothing else.
 * It is a sticky row of the list, which keeps it mounted however far the list scrolls: a focused field is
 * never unmounted by a long scroll.
 */
export const PlacesSearch = memo(function PlacesSearch({
  onSearch,
  searching,
  filterCount,
  onPressFilter,
  venueType,
  onClearKind,
}: {
  onSearch: (text: string) => void
  searching: boolean
  filterCount: number
  onPressFilter: () => void
  venueType: PlaceTypeFilter
  onClearKind: () => void
}) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, onSearch])
  const kind = PLACE_TYPES.find((t) => t.venueType === venueType && venueType !== null)
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search places or areas" busy={searching} testID="places-search" />
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
  titleWrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md, paddingBottom: SPACE.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  title: { flexShrink: 1 },
  city: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, flexShrink: 0, maxWidth: '50%' },
  cityText: { flexShrink: 1 },
  searchWrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  search: { flex: 1 },
  badge: { position: 'absolute', top: -SPACE.xs, right: -SPACE.xs },
  kindChip: { flexDirection: 'row' },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
