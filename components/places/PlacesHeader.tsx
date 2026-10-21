import { memo, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { IconButton } from '../ds/IconButton'
import { Badge } from '../ds/MonoFamily'
import { SearchField } from '../ds/SearchField'
import { font, useBoldText } from '../ds/shared'
import { COLOR, FONT_FAMILY, SPACE } from '../../lib/design/tokens'
import { HOW_FAR, PLACE_TYPES, WHATS_ON, type PlaceFilters } from '../../lib/placesPane'

/**
 * The top of Places (BUILD-SPEC B1), in two rows of the list: the stat line (scrolls away) and the search (sticky under
 * it; see `PlacesSearch`). The title and the city are the drawer's title tabs now: the chosen word names the pane.
 */
export const PlacesTitle = memo(function PlacesTitle({ stat }: { stat: { text: string; spoken: string } | null }) {
  const bold = useBoldText()
  return (
    <View style={styles.titleWrap} testID="places-header">
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
 * The search field with its filter button, and each applied filter as a removable chip under it (B1, B8). It holds what is
 * typed itself and hands the list only the settled text, so a keystroke re-renders this row and nothing else.
 * It is a sticky row of the list, which keeps it mounted however far the list scrolls: a focused field is
 * never unmounted by a long scroll.
 */
export const PlacesSearch = memo(function PlacesSearch({
  onSearch,
  searching,
  filterCount,
  onPressFilter,
  filters,
  onClear,
}: {
  onSearch: (text: string) => void
  searching: boolean
  filterCount: number
  onPressFilter: () => void
  filters: PlaceFilters
  /** Each × clears its own field only. */
  onClear: (field: keyof PlaceFilters) => void
}) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, onSearch])
  const kind = PLACE_TYPES.find((t) => t.venueType === filters.venueType && filters.venueType !== null)
  const whatsOn = filters.whatsOn !== 'all' ? WHATS_ON.find((w) => w.value === filters.whatsOn) : undefined
  const far = filters.radiusKm !== null ? HOW_FAR.find((h) => h.km === filters.radiusKm) : undefined
  type Applied = { field: keyof PlaceFilters; label: string; testID: string }
  const applied: Applied[] = []
  if (kind) applied.push({ field: 'venueType', label: kind.label, testID: 'places-kind-chip' })
  if (whatsOn) applied.push({ field: 'whatsOn', label: whatsOn.label, testID: 'places-on-chip' })
  if (far) applied.push({ field: 'radiusKm', label: `Within ${far.label}`, testID: 'places-far-chip' })
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
              <Badge text={filterCount} arrive testID="places-filter-badge" />
            </View>
          ) : null}
        </View>
      </View>
      {applied.length ? (
        // Bled to the screen edges: the chips scroll under the gutter instead of wrapping.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.applied} contentContainerStyle={styles.appliedRow} testID="places-applied">
          {applied.map((a) => (
            <Chip key={a.field} label={a.label} selected onRemove={() => onClear(a.field)} testID={a.testID} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  titleWrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md, paddingBottom: SPACE.md },
  searchWrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  search: { flex: 1 },
  badge: { position: 'absolute', top: -SPACE.xs, right: -SPACE.xs },
  applied: { marginHorizontal: -SPACE.gutter },
  appliedRow: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
  secondary: { color: COLOR.textSecondary },
})
