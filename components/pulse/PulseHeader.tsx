import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { EMBER, EMBER_FONTS, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

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
 * The heading row is 366 wide and "The Pulse" uses about 250 of it; the chip
 * goes in the dead space that was already there, and the block stays exactly
 * 133pt.
 *
 * The date went with the row. It was decoration — every card carries the date
 * that matters, and today's is on the status bar three inches above. Raised for
 * the designer in `docs/PULSE.md` rather than silently invented.
 *
 * ## The accent is flat, not a gradient
 *
 * The frame fills "Pulse" with the 135° gradient. React Native cannot gradient
 * a glyph without `@react-native-masked-view`, which is a native module and
 * therefore a new dev client for everyone testing. The onboarding headlines
 * already print their accent half in flat `EMBER.accent` for the same reason,
 * so this matches eight screens that shipped rather than introducing a ninth
 * treatment. Noted in `docs/PULSE.md`.
 */
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
  onPressFilter,
  activeFilterCount = 0,
}: Props) {
  return (
    <View style={styles.wrap}>
      {/*
        The city sits **on** the headline, not under it.

        Frame `1141:4644` makes `Section - Header & Search` exactly 133pt —
        heading 48, gap 29, input 56 — and draws no city line at all. We need
        one anyway: it is the way out of "Nothing on in Bengaluru", and it is the
        only control that answers "why is this screen empty".

        A third row cost 70pt and pushed the search field away from the title it
        belongs to, which is what made the top of the screen read as loose next
        to the design. The heading row is 366 wide and "The Pulse" only uses
        about 250 of it, so the control goes in the ~116pt of dead space that was
        already there. Zero added height, and it reads as "The Pulse *in*
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
          <Ionicons name="location-outline" size={13} color={EMBER.textSecondary} />
          {/*
            Truncated rather than wrapped. "Thiruvananthapuram" would otherwise
            take a second line and reintroduce the height this change removes;
            the first several characters are enough to recognise, and tapping it
            opens the full list.
          */}
          <Text style={styles.cityText} numberOfLines={1}>
            {city ?? 'Choose city'}
          </Text>
          <Ionicons name="chevron-down" size={13} color={EMBER.textSecondary} />
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
        <Ionicons
          name="search"
          size={18}
          color={EMBER.textPlaceholder}
          style={styles.searchIcon}
        />
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
              <Ionicons name="close-circle" size={18} color={EMBER.textTertiary} />
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
          together, and `SectionHeader`'s "VIEW ALL" already gives the pattern
          for an accent text action. The block stays 133pt because this shares
          the search field's 56.

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
            hitSlop={{ top: 12, right: 8, bottom: 12, left: 8 }}
            style={({ pressed }) => [styles.filterAction, pressed && styles.pressed]}
          >
            <Text style={styles.filterLabel}>FILTER</Text>
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
  // Frame: heading 48 → **29** → input 56, for a block of exactly 133.
  wrap: { gap: 29, paddingHorizontal: 12 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Only the title flexes. The city must never be the thing that truncates
  // first: a clipped headline is cosmetic, a clipped city is the control you
  // cannot read.
  title: { ...EMBER_TYPE.screenTitle, flexShrink: 1 },
  titleAccent: { color: EMBER.accent },

  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // Bounded so a long name cannot squeeze the headline to nothing; the text
    // truncates inside it instead.
    maxWidth: '42%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    // The chip is 27pt tall on its own, under the 44pt touch floor. It is the
    // only way out of "Nothing on in Bengaluru", so it gets `hitSlop` at the
    // call site rather than a taller box that would break the 48pt heading row.
  },
  cityText: { ...EMBER_TYPE.meta, flexShrink: 1, color: EMBER.textPrimary },
  pressed: { opacity: 0.6 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Only the field flexes; FILTER is sized by its word.
  searchBoxFlex: { flex: 1 },
  filterAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterLabel: EMBER_TYPE.link,
  filterCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    color: EMBER.onGradientChip,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    // Frame: `pl-[48px] pr-[24px] py-[17px]`. The left inset is wide because
    // the search glyph sits inside it at `left-[16px]`; 20 put the icon and the
    // placeholder almost on top of each other.
    paddingLeft: 48,
    paddingRight: 24,
    paddingVertical: 17,
  },
  searchIcon: { position: 'absolute', left: 16 },
  searchInput: { ...EMBER_TYPE.input, flex: 1, padding: 0 },
})
