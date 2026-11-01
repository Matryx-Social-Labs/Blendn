import { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { CityArtCard } from '../cityArt/CityArtCard'
import { drawableCityArt } from '../cityArt/drawable'
import { SearchField } from '../ds/SearchField'
import { Sheet } from '../ds/Sheet'
import { font, PRESSED_WASH, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { cityCount, cityCountLabel, isCityRow, pickerGroups, sameCity, type CatalogueCountry, type CityOption, type CityRef } from '../../lib/city'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useLocationSharing } from '../../lib/shareLocation'

/** The locate row: 52 pt, a dashed 38% hairline at the row radius (Flow 3 `city`). */
const LOCATE_HEIGHT = 52

/** Cities whose name has the typed text in it, case and accents aside. */
export function matchingCities(cities: readonly CityOption[], query: string): CityOption[] {
  const needle = query.trim().toLowerCase()
  return needle ? cities.filter((c) => c.city.toLowerCase().includes(needle)) : [...cities]
}

type PickerProps = {
  visible: boolean
  onClose: () => void
  cities: readonly CityOption[]
  /** The served countries (`/events/cities` `countries`): the rows group under them, home first. Empty: one plain list. */
  countries?: readonly CatalogueCountry[]
  homeCountry?: string | null
  deviceCountry?: string | null
  /** "Browse in", or "Your home city" when Settings sets home with the same sheet (travel plan §4.5). */
  title?: string
  /** The dashed "Use my current location" row; off where a position means nothing (choosing home). */
  showLocate?: boolean
  selectedCity: string | null
  /** The chosen city's slug: with it, a namesake in another country is not marked chosen. */
  selectedSlug?: string | null
  /** Where the phone is, when that is known. */
  deviceCity: string | null
  /** A city was chosen, with its slug when the catalogue has one; `here` when it is the one the phone is in. */
  onChoose: (choice: { city: string; slug: string | null }, here: boolean) => void
  /** The phone's place is not known yet: ask for it. */
  onLocate: () => void
}

/**
 * The city picker (Flow 3 `city`): the DS Sheet, a SearchField ("Search cities"), the dashed "Use my current location"
 * row, then a 48 pt row a city with a check on the chosen one and its count in Geist Mono. A city with art is its
 * skyline card instead (R4.1 3-6).
 *
 * ## The locate row is never conditional
 *
 * The list only ever contains cities with something on, so without this a person standing where we have not launched
 * has no way to say so: absent from the list, absent from the switch banner, stuck in whichever city the busiest-city
 * fallback picked. With a place known it chooses it (an empty city is allowed and useful: an honest "we're not here
 * yet" and the clearest signal of where to launch next); without one it asks for the position.
 *
 * Choosing a different city plays `H.select`, once; the chosen city again is a quiet close.
 */
export function CityPicker({ visible, onClose, cities, countries = [], homeCountry = null, deviceCountry = null, title = 'Browse in', showLocate = true, selectedCity, selectedSlug = null, deviceCity, onChoose, onLocate }: PickerProps) {
  const bold = useBoldText()
  // Off: nothing here asks the phone where it is (SCRUM-908).
  const sharing = useLocationSharing()
  const [query, setQuery] = useState('')
  // By country, home first; search keeps only the groups that still match (travel plan §4.1).
  const groups = useMemo(() => pickerGroups({ cities, countries, homeCountry, deviceCountry, query }), [cities, countries, homeCountry, deviceCountry, query])

  const selected: CityRef | null = selectedCity ? { city: selectedCity, slug: selectedSlug } : null
  const choose = (choice: { city: string; slug: string | null }, here: boolean) => {
    const same = choice.slug && selectedSlug ? choice.slug === selectedSlug : sameCity(choice.city, selectedCity)
    if (!same) H.select()
    setQuery('')
    onChoose(choice, here)
  }
  const locate = () => {
    if (!deviceCity) {
      onLocate()
      onClose()
      return
    }
    choose({ city: deviceCity, slug: null }, true)
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title} detents={['medium', 'tall']} testID="city-picker">
      <SearchField value={query} onChangeText={setQuery} placeholder="Search cities" inSheet testID="city-search" />

      {sharing && showLocate ? (
        <Pressable
          testID="city-locate"
          onPress={locate}
          accessibilityRole="button"
          accessibilityLabel={deviceCity ? `Use my current location, ${deviceCity}` : 'Use my current location'}
          android_ripple={{ color: PRESSED_WASH.android }}
          style={({ pressed }) => [styles.locate, pressed && Platform.OS === 'ios' && styles.pressed]}
        >
          <Icon name="navigation" size={ICON.control} />
          <View style={styles.fill}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>Use my current location</Text>
            {deviceCity ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{deviceCity}</Text> : null}
          </View>
        </Pressable>
      ) : null}

      {cities.length === 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]} testID="city-none">
          {deviceCity || !sharing ? 'No cities have published events yet.' : 'No cities have published events yet. Turn on location to browse where you are.'}
        </Text>
      ) : groups.length === 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]} testID="city-no-match">
          No cities match “{query.trim()}”.
        </Text>
      ) : (
        <View testID="city-list">
          {groups.map((group) => (
            <View key={group.key} testID={`city-group-${group.key}`}>
              {group.label ? (
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold, FONT_FAMILY.brand[700]), styles.secondary, styles.groupLabel]}>
                  {group.label}
                </Text>
              ) : null}
              {group.cities.map((item, i) => {
                const active = isCityRow(item, selected)
                const key = item.slug ?? item.city
                const pick = () => choose({ city: item.city, slug: item.slug ?? null }, false)
                // A namesake in another country is not where the phone is.
                const here = sameCity(item.city, deviceCity) && (!deviceCountry || !item.country || item.country === deviceCountry)
                // A city we have drawn gets its skyline; the rest stay plain rows. A coming-soon city is always a row: it has nothing on to count.
                const art = item.access === 'comingSoon' ? null : drawableCityArt(item.city)
                if (art) {
                  return <CityArtCard key={key} city={item.city} art={art} countLabel={cityCountLabel(item)} active={active} here={here} onPress={pick} />
                }
                return <CityRow key={key} option={item} active={active} here={here} first={i === 0} onPress={pick} />
              })}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  )
}

function CityRow({ option, active, here, first, onPress }: { option: CityOption; active: boolean; here: boolean; first: boolean; onPress: () => void }) {
  const bold = useBoldText()
  // One unit cue on every row ("53 events", "1,362 places"): a bare "53 on" beside "1362 places" read as a mistake (A6).
  const { n: count, unit } = cityCount(option)
  const soon = option.access === 'comingSoon' || !count
  return (
    <Pressable
      testID={`city-row-${option.slug ?? option.city}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${option.city}${here ? ', your current location' : ''}, ${soon ? 'coming soon' : cityCountLabel(option)}`}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={({ pressed }) => [styles.row, !first && styles.separator, pressed && Platform.OS === 'ios' && styles.pressed]}
    >
      <View style={styles.name}>
        {active ? <Icon name="check" size={ICON.inline + 2} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={1} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>
          {option.city}
        </Text>
        {here ? <Icon name="navigation" size={ICON.inline} color={COLOR.textSecondary} /> : null}
      </View>
      {!soon ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{count.toLocaleString('en-US')}</Text>
          {` ${unit}`}
        </Text>
      ) : (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
          Coming soon
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  locate: {
    minHeight: LOCATE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.rowInCard,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLOR.inputBorder,
  },
  row: { minHeight: SIZE.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  pressed: { backgroundColor: PRESSED_WASH.ios },
  groupLabel: { paddingTop: SPACE.lg, paddingBottom: SPACE.xs },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm + SPACE.xxs, minWidth: 0 },
  fill: { flexShrink: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
})
