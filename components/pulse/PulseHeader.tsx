import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE, TYPE } from '../../lib/theme'

/**
 * The top of The Pulse — the headline, where you are, and the search field.
 *
 * ## The city line is not in the frame, and it has to be
 *
 * Frame `1141:4643` draws a headline and a search field, and nothing that says
 * which city you are looking at. This screen filters by city, and the picker is
 * the **only way out of an empty state**: a city we have not launched in
 * returns nothing, refreshing will never help, and the copy that used to say
 * "try refreshing or explore with location enabled" named the cause as the cure.
 *
 * So it stays — but **on** the headline rather than under it. As its own row it
 * cost 70pt and pushed the search field away from the title it belongs to,
 * which is what made the top of this screen read as loose beside the design.
 * "The Pulse" uses about two thirds of the heading row; the chip goes in the
 * space that was already there, and adds no height.
 *
 * The date went with the row. It was decoration — every card carries the date
 * that matters, and today's is on the status bar three inches above. Raised for
 * the designer in `docs/PULSE.md` rather than silently invented.
 *
 * ## The accent is flat, not a gradient
 *
 * The frame fills "Pulse" with the 135° gradient. React Native cannot gradient
 * a glyph without `@react-native-masked-view`, which is a native module and
 * therefore a new dev client for everyone testing, so the accent word is flat
 * `EMBER.accent`. The Pulse has no primary action, so its title's accent word
 * is the screen's one accent (docs/DESIGN_SYSTEM.md). The onboarding headlines
 * print their second half in `textPrimary` instead: there the accent is the
 * CTA's. Noted in `docs/PULSE.md`.
 */
/** The block's height: the headline row, the gap, and the search row. */
export const PULSE_HEADER_HEIGHT = TYPE.display.lineHeight + SPACE.lg + CONTROL.md

interface Props {
  /** Second half of the headline, in the accent colour. */
  title: string
  titleAccent: string
  /** `null` while the city is still being resolved — the chip reads "Choose city". */
  city: string | null
  onPressCity: () => void
  query: string
  onChangeQuery: (next: string) => void
  onSubmitQuery?: () => void
  placeholder?: string
  /**
   * A search or filter refetch is in flight, quietly, against a list already
   * on screen — see `events.tsx`'s `refining`. Swaps the search glyph for a
   * spinner so typing and being ignored do not look identical; nothing else
   * on the screen moves, because that fetch is deliberately silent.
   */
  searching?: boolean
  /**
   * Opens the filter sheet. The count is drawn beside the label so an active
   * filter is visible without opening anything — a filter you cannot see is one
   * you forget you set, and then the app looks like it has no events.
   */
  onPressFilter?: () => void
  activeFilterCount?: number
}

export function PulseHeader({
  title,
  titleAccent,
  city,
  onPressCity,
  query,
  onChangeQuery,
  onSubmitQuery,
  placeholder = 'Search experiences...',
  searching = false,
  onPressFilter,
  activeFilterCount = 0,
}: Props) {
  return (
    <View style={styles.wrap}>
      {/*
        The city sits **on** the headline, not under it.

        The frame (`1141:4644`) draws no city line at all. We need one anyway: it is the way out of "Nothing on in Bengaluru", and it is the
        only control that answers "why is this screen empty".

        A third row cost 70pt and pushed the search field away from the title it
        belongs to, which is what made the top of the screen read as loose next
        to the design. The control goes in the dead space beside the title.
        Zero added height, and it reads as "The Pulse *in*
        Bengaluru" — which is what it means.

        Right-aligned with a pin and a chevron so it reads as a control rather
        than as a subtitle. The date that used to ride along with it is gone:
        every card carries the date that actually matters, and today's date is on
        the status bar three inches above.
      */}
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
          <Text style={styles.titleAccent}>{titleAccent}</Text>
        </Text>

        <Pressable
          onPress={onPressCity}
          accessibilityRole="button"
          accessibilityLabel={city ? `Browsing ${city}. Change city` : 'Choose a city'}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          style={({ pressed }) => [styles.cityChip, pressed && styles.pressed]}
        >
          <Ionicons name="location-outline" size={ICON.sm} color={EMBER.textSecondary} />
          {/*
            Truncated rather than wrapped. "Thiruvananthapuram" would otherwise
            take a second line and reintroduce the height this change removes;
            the first several characters are enough to recognise, and tapping it
            opens the full list.
          */}
          <Text style={styles.cityText} numberOfLines={1}>
            {city ?? 'Choose city'}
          </Text>
          <Ionicons name="chevron-down" size={ICON.sm} color={EMBER.textSecondary} />
        </Pressable>
      </View>

      {/*
        One box, with the icon absolutely placed inside its padding.

        The alternative — an icon and a `TextInput` as siblings in a row — makes
        the row the measured box and the input a child of unknown width, which
        is the same mistake the chips made: the thing being measured stops being
        the thing being drawn.
      */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, styles.searchBoxFlex]}>
        {searching ? (
          <ActivityIndicator
            size="small"
            color={EMBER.textPlaceholder}
            style={styles.searchIcon}
          />
        ) : (
          <Ionicons
            name="search"
            size={ICON.md}
            color={EMBER.textPlaceholder}
            style={styles.searchIcon}
          />
        )}
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmitQuery}
          placeholder={placeholder}
          placeholderTextColor={EMBER.textPlaceholder}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search experiences"
          style={styles.searchInput}
        />
          {query.length > 0 ? (
            <Pressable
              onPress={() => onChangeQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={{ top: 14, right: 14, bottom: 14, left: 14 }}
            >
              <Ionicons name="close-circle" size={ICON.md} color={EMBER.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        {/*
          FILTER, beside the search field rather than floating over the feed.

          The frame draws a floating button (`1141:4815`) bottom-right. It reads
          well on an artboard and badly on a device: it sits on top of the card
          artwork it is meant to help you search, and it has to negotiate z-order
          with a nav that is itself an overlay.

          Search and filter are the same job — narrowing — so they belong
          together: an icon button at the search field's height and fill, so
          the row reads as one control group rather than a pill and a word.

          The cost, stated rather than hidden: this scrolls away, so somebody
          deep in the feed must scroll up to change a filter. Accepted, because
          the count below means they can always *see* one is on, which is the
          failure that actually matters.
        */}
        {onPressFilter ? (
          <Pressable
            onPress={onPressFilter}
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0
                ? `Filters, ${activeFilterCount} active. Change filters`
                : 'Filter events'
            }
            style={({ pressed }) => [styles.filterAction, pressed && styles.pressed]}
          >
            <Ionicons name="options-outline" size={ICON.md} color={EMBER.textPrimary} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterCount}>
                <Text style={styles.filterCountText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // The page supplies the side margin (`GUTTER`); this block adds none.
  wrap: { gap: SPACE.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  // Only the title flexes. The city must never be the thing that truncates
  // first: a clipped headline is cosmetic, a clipped city is the control you
  // cannot read.
  title: { ...TYPE.display, flexShrink: 1 },
  titleAccent: { color: EMBER.accent },

  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    // Bounded so a long name cannot squeeze the headline to nothing; the text
    // truncates inside it instead.
    maxWidth: '42%',
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    // `CONTROL.sm` is under the 44pt touch floor, so it gets `hitSlop` at the
    // call site rather than a box taller than the headline beside it.
  },
  cityText: { ...TYPE.meta, flexShrink: 1, color: EMBER.textPrimary },
  pressed: { opacity: 0.6 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  // Only the field flexes; the filter button is a fixed square.
  searchBoxFlex: { flex: 1 },
  // Same height and fill as the search field beside it: one row, one control style.
  filterAction: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCount: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: CONTROL.badge,
    height: CONTROL.badge,
    paddingHorizontal: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: { ...TYPE.caption, color: EMBER.bg },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    height: CONTROL.md,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    // The search glyph sits inside this inset: 16 + a 20pt icon + 12 of air.
    paddingLeft: SPACE.xxxl,
    paddingRight: SPACE.lg,
  },
  searchIcon: { position: 'absolute', left: SPACE.lg },
  searchInput: { ...TYPE.body, flex: 1, padding: 0 },
})
