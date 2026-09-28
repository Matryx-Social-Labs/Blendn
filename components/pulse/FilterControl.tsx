import * as Haptics from 'expo-haptics'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
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
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { RisingSheet, SheetModal, SheetScrollView } from '../motion/RisingSheet'
import { Grabber } from '../ui/Grabber'

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
    <SheetModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
      <RisingSheet style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.xl) + SPACE.sm }]}>
        <Grabber />

        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Filters
          </Text>
          {count > 0 ? (
            <Pressable
              onPress={() => onChange(NO_FILTERS)}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              hitSlop={SPACE.md}
            >
              <Text style={styles.clear}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        <SheetScrollView showsVerticalScrollIndicator={false} style={styles.sheetBody}>
          {/*
            No categories (the list failed to load, or the server has none):
            no "What" group. "Anything" alone would be a group with one chip
            and nothing to choose between.
          */}
          {categories.length > 0 ? (
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
          ) : null}

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
        </SheetScrollView>

        <Pressable
          onPress={onApply}
          accessibilityRole="button"
          accessibilityLabel="Show results"
          style={({ pressed }) => [styles.apply, pressed && styles.pressed]}
        >
          <Text style={styles.applyText}>Show results</Text>
        </Pressable>
      </RisingSheet>
    </SheetModal>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  )
}

/*
 * The fill and the label colour ease across in 150ms rather than snapping.
 *
 * These are wrapping rows of chips, not a segmented control, so there is no
 * single track for an indicator to slide along — a pill travelling from the end
 * of one row to the start of the next would cut diagonally across the sheet.
 * The chip itself changing is the honest version: the old one lets go as the
 * new one fills, in the same beat.
 *
 * A CSS transition, because it is a two-state change with no finger dragging
 * it. It runs under Reduce Motion too: a colour change *is* the reduced form,
 * and it is what says which chip is on. The tick is a selection haptic, on the
 * frame of the tap.
 *
 * Written as the `transition` shorthand, not `transitionProperty` & co.: SDK
 * 53's react-native-web typings declare those as strings on `ViewStyle`, and
 * the two definitions intersect into something neither side can satisfy.
 * Reanimated parses the shorthand, `cubic-bezier` included.
 */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        onPress()
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: on ? EMBER.textPrimary : EMBER.surface,
            transition: `background-color 150ms ${EASE_OUT}`,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.chipText,
            {
              color: on ? EMBER.bg : EMBER.textPrimary,
              transition: `color 150ms ${EASE_OUT}`,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({

  // Transparent: `SheetModal` draws the dim and fades it on its own.
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: EMBER.surfaceSunken,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.md,
    gap: SPACE.xl,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: TYPE.title,
  clear: { ...TYPE.label, color: EMBER.textPrimary },
  sheetBody: { flexGrow: 0 },

  group: { gap: SPACE.md, marginBottom: SPACE.xl },
  groupLabel: TYPE.label,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    height: CONTROL.md,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
  },
  // Fill and label colour are set inline, where the transition can see them.
  chipText: TYPE.bodyStrong,

  apply: {
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { ...TYPE.button, color: EMBER.onGradient },
  pressed: { opacity: OPACITY.pressed },
})
