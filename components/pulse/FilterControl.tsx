import { StyleSheet, Text, View } from 'react-native'

import { ChipSet } from '../ds/ChipSet'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'
import {
  activeFilterCount,
  DISTANCE_OPTIONS,
  NO_FILTERS,
  WHEN_LABELS,
  WHEN_OPTIONS,
  type EventFilters,
  type When,
} from '../../lib/eventFilters'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { useDraftCount } from '../../lib/filterCount'

export interface CategoryOption {
  slug: string
  name: string
}

const NOTHING_MATCHES = 'Nothing matches. Try another day or a wider distance.'
/** What the count depends on: all three choices. */
const countKey = (d: EventFilters) => `${d.categorySlug ?? '-'}|${d.when}|${d.radiusKm ?? '-'}`

/**
 * The Pulse's filter sheet: the design system's Sheet with a ChipSet per group (What, When, Within), the same as Places.
 *
 * ## Applied on close, not on every tap
 *
 * Each choice is a network round trip, and a person picking a category, a day and a distance would fire three, the
 * first two of which they never see, against a list that flickers underneath them. So the sheet holds a draft and the
 * caller gets it once, on "Show n events". The n is the server's `totalCount` for the draft (`countFor`, a `limit: 1`
 * read), settled 250 ms after the last tap.
 *
 * ## Tapping the chosen one clears it
 *
 * A filter with no way off except a second control is one people get stuck in. (A day is always one of the four: "Any
 * time" is its clear.)
 *
 * ## "Any distance" removes the parameter
 *
 * It does not set a large radius. The server has no default on purpose, since a 10km box applied to anyone who merely
 * sent coordinates is what blanked this feed once, and widening rather than removing would quietly reintroduce it.
 * Distance is hidden entirely without a location fix, because a distance filter with nothing to measure from is a control
 * that can only disappoint.
 */
export function FilterSheet({
  visible,
  draft,
  categories,
  hasLocation,
  onChange,
  onApply,
  onClose,
  countFor,
}: {
  visible: boolean
  draft: EventFilters
  categories: CategoryOption[]
  hasLocation: boolean
  onChange: (next: EventFilters) => void
  onApply: () => void
  onClose: () => void
  /** The server's count of events for a draft; null when it cannot say. Without it the button carries no number. */
  countFor?: (draft: EventFilters) => Promise<number | null>
}) {
  const bold = useBoldText()
  const chosen = activeFilterCount(draft)
  const { n: counted, current } = useDraftCount(visible && !!countFor, countKey(draft), () => countFor?.(draft) ?? Promise.resolve(null))
  const empty = current && counted === 0

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      headerAction={{ label: 'Clear all', onPress: () => onChange(NO_FILTERS), disabled: chosen === 0 }}
      actions={[
        // "Show results" only before the first answer; after it the count rolls in one Button (keyed by its testID).
        counted === null
          ? { label: 'Show results', kind: 'primary', onPress: onApply, testID: 'pulse-filter-apply' }
          : { label: counted === 1 ? 'Show {n} event' : 'Show {n} events', count: counted, kind: 'primary', onPress: onApply, disabled: empty, testID: 'pulse-filter-apply' },
      ]}
      testID="pulse-filter-sheet"
    >
      <View style={styles.body}>
        {/* No categories (the list failed to load, or the server has none): no "What" group, since there is nothing to choose between. */}
        {categories.length > 0 ? (
          <ChipSet
            label="What"
            counter={draft.categorySlug ? '1 chosen' : 'Any'}
            selection="single"
            items={categories.map((c) => ({ key: c.slug, label: c.name }))}
            selected={draft.categorySlug ? [draft.categorySlug] : []}
            onToggle={(slug) => onChange({ ...draft, categorySlug: draft.categorySlug === slug ? undefined : slug })}
            testID="pulse-filter-what"
          />
        ) : null}
        <ChipSet
          label="When"
          selection="single"
          items={WHEN_OPTIONS.map((w: When) => ({ key: w, label: WHEN_LABELS[w] }))}
          selected={[draft.when]}
          onToggle={(w) => onChange({ ...draft, when: w as When })}
          testID="pulse-filter-when"
        />
        {hasLocation ? (
          <ChipSet
            label="Within"
            selection="single"
            items={[{ key: 'any', label: 'Any' }, ...DISTANCE_OPTIONS.map((km) => ({ key: String(km), label: `${km} km` }))]}
            selected={[String(draft.radiusKm ?? 'any')]}
            onToggle={(key) => onChange({ ...draft, radiusKm: key === 'any' || String(draft.radiusKm) === key ? undefined : Number(key) })}
            testID="pulse-filter-within"
          />
        ) : null}
        {empty ? (
          <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.nothing]}>
            {NOTHING_MATCHES}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACE.xl, paddingBottom: SPACE.lg },
  nothing: { color: COLOR.textSecondary, textAlign: 'center' },
})
