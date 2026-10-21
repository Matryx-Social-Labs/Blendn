import { useEffect, useRef, useState } from 'react'
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { IconButton } from '../ds/IconButton'
import { Badge } from '../ds/MonoFamily'
import { SearchField } from '../ds/SearchField'
import { SIZE, SPACE } from '../../lib/design/tokens'
import { keyboardLeft } from '../../lib/home'

/**
 * The search row of The Pulse (Flow 3 `home`): sticky under the title, the DS `SearchField`, the filter button with its
 * badge, and each applied filter as a removable chip. The same row Places draws, so the panes read as one. The title and
 * the city control are the home shell's (`PulseTitle` until the title tabs land there).
 */

/** The search row's height: the field and the filter circle are one 48 pt row. */
export const PULSE_HEADER_HEIGHT = SIZE.control

export type AppliedChip = { key: string; label: string; onRemove: () => void }

type SearchProps = {
  query: string
  onChangeQuery: (next: string) => void
  /** A search or filter refetch is in flight, quietly, against a list already on screen: the glyph becomes the spinner. */
  searching?: boolean
  /** Opens the filter sheet. */
  onPressFilter?: () => void
  activeFilterCount?: number
  /** Each applied filter, removable: a filter you cannot see is one you forget you set. */
  applied?: AppliedChip[]
  /** "12 events": announced once when results settle. */
  resultsLabel?: string
}

/**
 * The search field and the filter button: a row of the list of its own, sticky under the title, so a focused field is
 * never unmounted by a long scroll and the filter is always in reach.
 */
export function PulseSearch({ query, onChangeQuery, searching = false, onPressFilter, activeFilterCount = 0, applied = [], resultsLabel }: SearchProps) {
  const [focused, setFocused] = useState(false)
  const input = useRef<TextInput>(null)
  /*
   * Android only: Back closes the keyboard and leaves the field focused, so a tap on it opened no keyboard. A keyboard
   * that actually left blurs it, and the next tap is a fresh focus. Never on iOS: there a hide can arrive while you type
   * (a frame change), and blurring on it closed the keyboard after every character (drive 3). The text is the screen's
   * (`query`), so it stays.
   */
  useEffect(() => {
    if (!focused || Platform.OS !== 'android') return
    const sub = Keyboard.addListener('keyboardDidHide', (e) => {
      if (keyboardLeft(e, Dimensions.get('screen').height)) input.current?.blur()
    })
    return () => sub.remove()
  }, [focused])
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Search events…"
            busy={searching}
            resultsLabel={resultsLabel}
            inputRef={input}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            testID="pulse-search"
          />
        </View>
        {onPressFilter ? (
          <View>
            <IconButton
              icon="sliders-horizontal"
              accessibilityLabel="Filters"
              accessibilityHint={activeFilterCount ? `${activeFilterCount} applied` : undefined}
              onPress={onPressFilter}
              testID="pulse-filter"
            />
            {activeFilterCount > 0 ? (
              <View style={styles.badge} pointerEvents="none">
                <Badge text={activeFilterCount} testID="pulse-filter-badge" />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {applied.length ? (
        // Bled to the screen edges: the chips scroll under the gutter instead of wrapping.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.applied} contentContainerStyle={styles.appliedRow} testID="pulse-applied">
          {applied.map((a) => (
            <Chip key={a.key} label={a.label} selected onRemove={a.onRemove} testID={`pulse-applied-${a.key}`} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: SPACE.gutter, gap: SPACE.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  search: { flex: 1 },
  badge: { position: 'absolute', top: -SPACE.xs, right: -SPACE.xs },
  applied: { marginHorizontal: -SPACE.gutter },
  appliedRow: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
})
