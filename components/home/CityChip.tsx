import { StyleSheet, View } from 'react-native'

import { Chip } from '../ds/Chip'

/** Board `.cc`: the city chip is at most 148 pt; a longer name ends in an ellipsis on its one line. */
export const CITY_CHIP_MAX = 148

/**
 * The Pulse's city (Flow 3 · Pulse, board `.cc`): the city's name alone, a plane when you are abroad, a chevron that says
 * it opens a choice. Never a launch state glued to the name (owner 2026-11-05: "Toronto · Preview" overflowed the row).
 */
export function CityChip({ city, travelling, onPress }: { city: string | null; travelling: boolean; onPress: () => void }) {
  return (
    // Wrapped: a chip aligns itself to the top of its row; the board centres the city in the 48 pt tabs. The wrapper is
    // also the 148 pt cap, so the label shrinks inside it and never pushes the search button.
    <View testID="home-city-box" style={styles.box}>
      <Chip size="header" chevron label={city ?? 'Choose city'} icon={travelling ? 'plane' : 'map-pin'} onPress={onPress} testID="home-city" />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { maxWidth: CITY_CHIP_MAX, flexShrink: 1, minWidth: 0 },
})
