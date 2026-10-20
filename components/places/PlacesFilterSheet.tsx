import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { Sheet } from '../ds/Sheet'
import { font, minTarget, useBoldText } from '../ds/shared'
import { COLOR, FONT_FAMILY, SPACE } from '../../lib/design/tokens'
import { HOW_FAR, NO_FILTERS, PLACE_TYPES, WHATS_ON, type PlaceFilters } from '../../lib/placesPane'

/** The "Show n places" count settles this long after the last tap (BUILD-SPEC B9). */
export const COUNT_DEBOUNCE_MS = 250

const sameFilters = (a: PlaceFilters, b: PlaceFilters) => a.venueType === b.venueType && a.whatsOn === b.whatsOn && a.radiusKm === b.radiusKm
/** What the count was asked of: the kind and the radius (What's on is judged here, on the strata, and has no count of its own). */
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
  const [counted, setCounted] = useState<{ key: string; n: number } | null>(null)
  const key = countKey(draft)
  useEffect(() => {
    if (!visible) return
    let live = true
    const timer = setTimeout(() => {
      countFor(draft)
        .then((n) => live && n !== null && setCounted({ key, n }))
        .catch(() => undefined)
    }, COUNT_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // The draft's kind and radius are what a count depends on (`key`); `countFor` is the list's own and changes with it.
  }, [visible, key]) // eslint-disable-line react-hooks/exhaustive-deps

  const n = draft.whatsOn === 'all' && counted?.key === key ? counted.n : null
  const label = n === null ? 'Show places' : `Show ${n.toLocaleString('en-US')} ${n === 1 ? 'place' : 'places'}`
  const label12 = [font('label', bold, FONT_FAMILY.mono[500]), styles.secondary]

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      detents={['tall']}
      actions={[{ label, kind: 'primary', onPress: () => onApply(draft), testID: 'places-filter-apply' }]}
      testID="places-filter-sheet"
    >
      <View style={styles.body}>
        <Pressable
          onPress={() => setDraft(NO_FILTERS)}
          disabled={sameFilters(draft, NO_FILTERS)}
          accessibilityRole="button"
          accessibilityLabel="Clear all"
          style={[styles.clear, { minHeight: minTarget() }]}
          testID="places-filter-clear"
        >
          <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), sameFilters(draft, NO_FILTERS) ? styles.secondary : styles.ink]}>Clear all</Text>
        </Pressable>
        <Text style={label12}>KIND</Text>
        <View style={styles.chips}>
          {PLACE_TYPES.map((t) => (
            <Chip key={t.label} label={t.label} selected={t.venueType === draft.venueType} onPress={() => setDraft((d) => ({ ...d, venueType: t.venueType }))} testID={`places-filter-kind-${t.venueType ?? 'all'}`} />
          ))}
        </View>
        <Text style={label12}>WHAT’S ON</Text>
        <View style={styles.chips}>
          {WHATS_ON.map((w) => (
            <Chip key={w.value} label={w.label} selected={w.value === draft.whatsOn} onPress={() => setDraft((d) => ({ ...d, whatsOn: w.value }))} testID={`places-filter-on-${w.value}`} />
          ))}
        </View>
        {hasFix ? (
          <>
            <Text style={label12}>HOW FAR</Text>
            <View style={styles.chips}>
              {HOW_FAR.map((h) => (
                <Chip key={h.label} label={h.label} selected={h.km === draft.radiusKm} onPress={() => setDraft((d) => ({ ...d, radiusKm: h.km }))} testID={`places-filter-far-${h.km ?? 'any'}`} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACE.md, paddingBottom: SPACE.lg },
  clear: { alignSelf: 'flex-end', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
