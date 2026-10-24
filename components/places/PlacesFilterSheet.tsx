import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ChipSet } from '../ds/ChipSet'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'
import { VENUE_PLATE_GLYPHS } from '../ds/VenuePlate'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { useDraftCount } from '../../lib/filterCount'
import { HOW_FAR, KIND_TILES, NO_FILTERS, plateFor, WHATS_ON, type PlaceFilters } from '../../lib/placesPane'

const sameFilters = (a: PlaceFilters, b: PlaceFilters) => a.venueType === b.venueType && a.whatsOn === b.whatsOn && a.radiusKm === b.radiusKm
/** What the count was asked of: the kind and the radius (What's on is judged here, on the strata, and has no count of its own). */
/** What an empty result tells you to do: only what is on the sheet. Without a fix there is no Within to widen. */
const nothingMatches = (hasFix: boolean) => (hasFix ? 'Nothing matches. Try a wider distance or another kind.' : 'Nothing matches. Try another kind.')
const countKey = (f: PlaceFilters) => `${f.venueType ?? '-'}|${f.radiusKm ?? '-'}`

/**
 * The filter sheet (B9): Kind (single-select until the server takes a list, §C7), What's on and How far.
 * Area waits for §C4. Changes are a draft until the primary button; "Show n places" reads the server's
 * `totalCount` for the draft (`countFor`, a `limit: 1` read), debounced. What's on is applied here to the
 * strata, so with it set the button carries no number it cannot vouch for.
 */
export function PlacesFilterSheet({
  visible,
  onClose,
  filters,
  hasFix,
  onApply,
  countFor,
}: {
  visible: boolean
  onClose: () => void
  filters: PlaceFilters
  /** How far is a distance from a fix: without one the group is not offered. */
  hasFix: boolean
  onApply: (next: PlaceFilters) => void
  countFor: (draft: PlaceFilters) => Promise<number | null>
}) {
  const bold = useBoldText()
  const [draft, setDraft] = useState(filters)
  const [seenVisible, setSeenVisible] = useState(visible)
  // Opening starts the draft from what is applied.
  if (visible !== seenVisible) {
    setSeenVisible(visible)
    if (visible) setDraft(filters)
  }
  const { n: counted, current } = useDraftCount(visible, countKey(draft), () => countFor(draft))
  const n = draft.whatsOn === 'all' ? counted : null
  const empty = current && n === 0
  const kindKeys = draft.venueType ? [draft.venueType] : []

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      headerAction={{ label: 'Clear all', onPress: () => setDraft(NO_FILTERS), disabled: sameFilters(draft, NO_FILTERS) }}
      actions={[
        // One Button throughout (keyed by its testID), so the number rolls from count to count instead of remounting.
        n === null
          ? { label: 'Show places', kind: 'primary', onPress: () => onApply(draft), testID: 'places-filter-apply' }
          : { label: n === 1 ? 'Show {n} place' : 'Show {n} places', count: n, kind: 'primary', onPress: () => onApply(draft), disabled: empty, testID: 'places-filter-apply' },
      ]}
      testID="places-filter-sheet"
    >
      <View style={styles.body}>
        <ChipSet
          label="Kind"
          counter={kindKeys.length ? `${kindKeys.length} chosen` : 'Any'}
          // One kind until the server takes a list (§C7); an empty selection is "Any", so there is no "All" chip.
          selection="single"
          items={KIND_TILES.map((t) => ({ key: t.venueType, label: t.label, icon: VENUE_PLATE_GLYPHS[plateFor(t.venueType)] }))}
          selected={kindKeys}
          onToggle={(key) => setDraft((d) => ({ ...d, venueType: d.venueType === key ? null : (key as PlaceFilters['venueType']) }))}
          testID="places-filter-kind"
        />
        <ChipSet
          label="What’s on"
          selection="single"
          items={WHATS_ON.map((w) => ({ key: w.value, label: w.label, icon: w.icon }))}
          selected={[draft.whatsOn]}
          // Tapping the chosen one returns it to everything, as the filter contract says.
          onToggle={(key) => setDraft((d) => ({ ...d, whatsOn: d.whatsOn === key ? 'all' : (key as PlaceFilters['whatsOn']) }))}
          testID="places-filter-on"
        />
        {hasFix ? (
          <ChipSet
            label="Within"
            selection="single"
            items={HOW_FAR.map((h) => ({ key: String(h.km ?? 'any'), label: h.label }))}
            selected={[String(draft.radiusKm ?? 'any')]}
            onToggle={(key) => setDraft((d) => ({ ...d, radiusKm: key === 'any' || String(d.radiusKm) === key ? null : (Number(key) as PlaceFilters['radiusKm']) }))}
            testID="places-filter-far"
          />
        ) : null}
        {empty ? (
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.nothing]}>
            {nothingMatches(hasFix)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACE.xl, paddingBottom: SPACE.lg },
  group: { gap: SPACE.sm },
  nothing: { color: COLOR.textSecondary, textAlign: 'center' },
})
