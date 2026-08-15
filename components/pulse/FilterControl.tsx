import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  activeFilterCount,
  DISTANCE_OPTIONS,
  NO_FILTERS,
  WHEN_LABELS,
  WHEN_OPTIONS,
  type EventFilters,
  type When,
} from '../../lib/eventFilters'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

export interface CategoryOption {
  slug: string
  name: string
}

/**
 * The sheet.
 *
 * ## Applied on close, not on every tap
 *
 * Each choice is a network round trip, and a person picking a category, a day
 * and a distance would fire three — the first two of which they never see,
 * against a list that flickers underneath them. So the sheet holds a draft and
 * the caller gets it once, on "Show results".
 *
 * ## "Any distance" removes the parameter
 *
 * It does not set a large radius. The server has no default on purpose — a 10km
 * box applied to anyone who merely sent coordinates is what blanked this feed
 * once — and widening rather than removing would quietly reintroduce it.
 *
 * Distance is hidden entirely without a location fix, because a distance filter
 * with nothing to measure from is a control that can only disappoint.
 */
export function FilterSheet({
  visible,
  draft,
  categories,
  hasLocation,
  onChange,
  onApply,
  onClose,
}: {
  visible: boolean
  draft: EventFilters
  categories: CategoryOption[]
  hasLocation: boolean
  onChange: (next: EventFilters) => void
  onApply: () => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const count = activeFilterCount(draft)

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
        <View style={styles.grabber} />

        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Filters
          </Text>
          {count > 0 ? (
            <Pressable
              onPress={() => onChange(NO_FILTERS)}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Text style={styles.clear}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetBody}>
          <Group label="What">
            <Chip
              label="Anything"
              on={!draft.categorySlug}
              onPress={() => onChange({ ...draft, categorySlug: undefined })}
            />
            {categories.map((c) => (
              <Chip
                key={c.slug}
                label={c.name}
                on={draft.categorySlug === c.slug}
                onPress={() =>
                  onChange({
                    ...draft,
                    // Tapping the chosen one clears it. A filter with no way off
                    // except a second control is one people get stuck in.
                    categorySlug: draft.categorySlug === c.slug ? undefined : c.slug,
                  })
                }
              />
            ))}
          </Group>

          <Group label="When">
            {WHEN_OPTIONS.map((w: When) => (
              <Chip
                key={w}
                label={WHEN_LABELS[w]}
                on={draft.when === w}
                onPress={() => onChange({ ...draft, when: w })}
              />
            ))}
          </Group>

          {hasLocation ? (
            <Group label="How far">
              <Chip
                label="Any distance"
                on={draft.radiusKm === undefined}
                onPress={() => onChange({ ...draft, radiusKm: undefined })}
              />
              {DISTANCE_OPTIONS.map((km) => (
                <Chip
                  key={km}
                  label={`${km} km`}
                  on={draft.radiusKm === km}
                  onPress={() =>
                    onChange({ ...draft, radiusKm: draft.radiusKm === km ? undefined : km })
                  }
                />
              ))}
            </Group>
          ) : null}
        </ScrollView>

        <Pressable
          onPress={onApply}
          accessibilityRole="button"
          accessibilityLabel="Show results"
          style={({ pressed }) => [styles.apply, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.applyText}>Show results</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  )
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: EMBER.surfaceSunken,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: EMBER.textTertiary,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...EMBER_TYPE.cardTitle },
  clear: { ...EMBER_TYPE.meta, color: EMBER.accent },
  sheetBody: { flexGrow: 0 },

  group: { gap: 12, marginBottom: 24 },
  groupLabel: { ...EMBER_TYPE.meta, color: EMBER.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  chipOn: { backgroundColor: EMBER.accent },
  chipText: { ...EMBER_TYPE.meta, color: EMBER.textPrimary },
  chipTextOn: { color: EMBER.onGradientChip },

  apply: {
    height: 52,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  applyText: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.onGradient,
  },
  pressed: { opacity: 0.7 },
})
