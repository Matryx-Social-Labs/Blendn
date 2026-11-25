import { ScrollView, StyleSheet } from 'react-native'

import { Chip } from '../ds/Chip'
import { CHIP_ROW_HEIGHT, CHIP_ROW_LEAD } from '../../lib/home'
import { SPACE } from '../../lib/design/tokens'
import { withoutFilter, type EventFilters } from '../../lib/eventFilters'
import { extraApplied, quickChips, toggleQuick, type Vibe } from '../../lib/pulseChips'

/**
 * The chips that are the Pulse's header (Flow 3 · Pulse, Option C): directly under Events | Places, filtering in place.
 *
 * Built from `quickChips`' list, so a chip is renamed or added there, not here. A filter set in the sheet that no chip
 * stands for leads the row as a removable chip; Filters ends it and says how many it holds that the row cannot show.
 * A selected chip fills ember and its ✓ draws once (the DS `Chip`, `H.select`); the row scrolls under the gutter at
 * large text instead of wrapping.
 */
export function QuickChips({
  filters,
  counts,
  nearOn,
  vibe,
  categories,
  onChange,
  onOpenFilters,
}: {
  filters: EventFilters
  counts: { tonight: number | null; weekend: number | null }
  nearOn: boolean
  vibe: Vibe | null
  categories: readonly Vibe[]
  onChange: (next: EventFilters) => void
  onOpenFilters: () => void
}) {
  const extras = extraApplied(filters, categories, vibe)
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.row}
      testID="pulse-chips"
    >
      {extras.map((a) => (
        <Chip key={a.field} size="header" label={a.label} selected onRemove={() => onChange(withoutFilter(filters, a.field))} testID={`pulse-applied-${a.field}`} />
      ))}
      {quickChips({ filters, counts, nearOn, vibe }).map((c) => (
        <Chip
          key={c.key}
          size="header"
          label={c.label}
          count={c.count}
          // The ✓ draws itself on select (Foundations C glyph verb). Near me (N1 board): its arrow at rest, the ✓ on, in the
          // DS slot that swaps the two without the chip changing width.
          icon={c.key === 'near' ? 'navigation' : c.selected ? 'check' : undefined}
          selection={c.key === 'near' ? 'multi' : undefined}
          selected={c.selected}
          accessibilityLabel={c.accessibilityLabel}
          onPress={() => onChange(toggleQuick(filters, c.key, vibe))}
          testID={`pulse-chip-${c.key}`}
        />
      ))}
      <Chip
        size="header"
        label="Filters"
        icon="sliders-horizontal"
        count={extras.length || undefined}
        accessibilityLabel={extras.length ? `Filters, ${extras.length} applied` : 'Filters'}
        onPress={onOpenFilters}
        testID="pulse-filter"
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, height: CHIP_ROW_HEIGHT, marginTop: CHIP_ROW_LEAD },
  row: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm, alignItems: 'center' },
})
