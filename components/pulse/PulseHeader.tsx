import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

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
 * So the line stays, directly under the headline where it reads as a subtitle
 * rather than as a control bolted on. Raised for the designer in
 * `docs/PULSE.md` rather than silently invented.
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
  /** `null` while the city is still being resolved — the row holds its height. */
  city: string | null
  /** "Fri 15 Aug", already formatted by the caller. */
  dateLabel: string
  onPressCity: () => void
  query: string
  onChangeQuery: (next: string) => void
  onSubmitQuery?: () => void
  placeholder?: string
}

export function PulseHeader({
  title,
  titleAccent,
  city,
  dateLabel,
  onPressCity,
  query,
  onChangeQuery,
  onSubmitQuery,
  placeholder = 'Search experiences...',
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
        <Text style={styles.titleAccent}>{titleAccent}</Text>
      </Text>

      <Pressable
        onPress={onPressCity}
        accessibilityRole="button"
        accessibilityLabel={city ? `Browsing ${city}. Change city` : 'Choose a city'}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={({ pressed }) => [styles.cityRow, pressed && styles.pressed]}
      >
        <Ionicons name="location-outline" size={14} color={EMBER.textSecondary} />
        <Text style={styles.cityText} numberOfLines={1}>
          {city ? `${city} • ${dateLabel}` : dateLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={EMBER.textSecondary} />
      </Pressable>

      {/*
        One box, with the icon absolutely placed inside its padding.

        The alternative — an icon and a `TextInput` as siblings in a row — makes
        the row the measured box and the input a child of unknown width, which
        is the same mistake the chips made: the thing being measured stops being
        the thing being drawn.
      */}
      <View style={styles.searchBox}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 16, paddingHorizontal: 12 },
  title: EMBER_TYPE.screenTitle,
  titleAccent: { color: EMBER.accent },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // The row is text-height on its own, which put the only way out of an empty
    // state under the touch floor. `hitSlop` alone was not enough.
    minHeight: 44,
  },
  cityText: { ...EMBER_TYPE.meta, flexShrink: 1 },
  pressed: { opacity: 0.6 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    paddingLeft: 20,
    paddingRight: 20,
    // Not `EMBER_CONTROL_HEIGHT`: 64 is the onboarding form control, and this
    // sits under a 48pt headline where that reads as a second heading.
    height: 56,
  },
  searchIcon: { marginTop: 1 },
  searchInput: { ...EMBER_TYPE.input, flex: 1, padding: 0 },
})
