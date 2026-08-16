import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ConnectSheet } from '../../components/grid/ConnectSheet'
import { GridCard, type GridPerson } from '../../components/grid/GridCard'
import {
  applyGridFilters,
  availableWorkFields,
  emptyReason,
  hasActiveFilters,
  NO_GRID_FILTERS,
  type GridFilters,
} from '../../lib/gridFilters'
import { EMBER, EMBER_FONTS } from '../../lib/theme'

/**
 * The Grid's card and filters, against fixtures — frame `1141:4951`.
 *
 * Deep-link `exp+blendn:///__preview-grid`.
 *
 * The real screen needs a check-in, a roster and people who exist. None of that
 * decides whether a card's tags wrap or whether the filter chips read as
 * pressable, which is what this is for.
 *
 * The fixtures deliberately include a suppressed profession and a zero overlap,
 * because those are the rows most likely to be drawn wrong.
 */
const ROOM: GridPerson[] = [
  {
    userId: '1',
    name: 'Cosmic Panda',
    age: 29,
    workField: 'Design',
    sharedInterests: ['Techno', 'Board games'],
    insideNow: true,
  },
  {
    userId: '2',
    name: 'Wry Otter',
    age: 34,
    workField: 'Engineering',
    sharedInterests: ['Board games', 'Techno', 'Film'],
  },
  {
    userId: '3',
    name: 'Julian Ember',
    age: 24,
    workField: 'Design',
    sharedInterests: ['Film'],
    photo: 'https://i.pravatar.cc/300?img=12',
    insideNow: true,
    liked: true,
  },
  /* Suppressed profession — every room under 8 people looks like this. */
  { userId: '4', name: 'Quiet Heron', age: 31, workField: null, sharedInterests: ['Techno'] },
  /* Nothing in common: the card must not render an empty "IN COMMON" block. */
  { userId: '5', name: 'Amber Lynx', age: 27, workField: 'Finance', sharedInterests: [] },
]

export default function GridPreview() {
  const insets = useSafeAreaInsets()
  const [filters, setFilters] = useState<GridFilters>(NO_GRID_FILTERS)
  /** Who the composer is open for, so the disclosure can name them. */
  const [connectTo, setConnectTo] = useState<GridPerson | null>(null)

  const fields = useMemo(() => availableWorkFields(ROOM), [])
  const shown = useMemo(() => applyGridFilters(ROOM, filters), [filters])
  const empty = emptyReason(ROOM.length, shown.length, filters)

  const toggleField = (field: string) =>
    setFilters((f) => ({
      ...f,
      workFields: f.workFields.includes(field)
        ? f.workFields.filter((x) => x !== field)
        : [...f.workFields, field],
    }))

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">
          The <Text style={styles.titleAccent}>Grid</Text>
        </Text>

        {/*
          Frame `1141:4966`. Horizontal because the number of professions in a
          room is unbounded, and a wrapping row of chips would push the first
          card off the screen in a mixed crowd.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRail}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label={`2+ shared`}
            selected={filters.minShared > 0}
            onPress={() =>
              setFilters((f) => ({ ...f, minShared: f.minShared > 0 ? 0 : 2 }))
            }
          />
          {fields.map((field) => (
            <Chip
              key={field}
              label={field}
              selected={filters.workFields.includes(field)}
              onPress={() => toggleField(field)}
            />
          ))}
        </ScrollView>

        {empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.4}>
              {empty === 'filtered-out' ? 'Nobody here matches' : 'Nobody here yet'}
            </Text>
            <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
              {empty === 'filtered-out'
                ? 'Try widening the filters — the room has people in it.'
                : 'When people check in, they show up here.'}
            </Text>
            {hasActiveFilters(filters) ? (
              <Pressable
                onPress={() => setFilters(NO_GRID_FILTERS)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
              >
                <Text style={styles.clearLabel}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {shown.map((person) => (
              <GridCard
                key={person.userId}
                person={person}
                onOpenProfile={() => {}}
                onLike={() => {}}
                onConnect={() => setConnectTo(person)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ConnectSheet
        visible={!!connectTo}
        displayName={connectTo?.name ?? ''}
        /* The fixture with a photo is the revealed one, so both copies show. */
        theyAreRevealed={!!connectTo?.photo}
        onSend={() => setConnectTo(null)}
        onDismiss={() => setConnectTo(null)}
      />
    </View>
  )
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} filter`}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelOn]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  scroll: { gap: 24 },
  title: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1,
    color: EMBER.textPrimary,
    paddingHorizontal: 12,
  },
  titleAccent: { color: EMBER.accent },

  chipRail: { marginHorizontal: -12 },
  chipRow: { gap: 8, paddingHorizontal: 24 },
  // Frame `1141:4969`: px24 py8, radius full.
  chip: {
    paddingHorizontal: 24,
    paddingVertical: 9,
    borderRadius: 9999,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: EMBER.surface, borderColor: EMBER.accent },
  chipLabel: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },
  chipLabelOn: { color: EMBER.accent, fontFamily: EMBER_FONTS.bodyBold },

  list: { paddingHorizontal: 12, gap: 24 },

  empty: { paddingHorizontal: 24, paddingTop: 48, gap: 8, alignItems: 'flex-start' },
  emptyTitle: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 28,
    color: EMBER.textPrimary,
  },
  emptyBody: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },
  clear: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    backgroundColor: EMBER.surface,
  },
  clearLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textPrimary,
  },
  pressed: { opacity: 0.7 },
})
