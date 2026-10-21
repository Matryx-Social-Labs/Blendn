import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { font, useBoldText } from '../ds/shared'
import { COLOR, SPACE, TYPE } from '../../lib/design/tokens'

/** The headline row's height: the display line and the gap under it. */
export const PULSE_TITLE_HEIGHT = TYPE.display.lineHeight + SPACE.lg

/**
 * The Pulse's headline, all white (F3 / C18), with the city control beside it as the DS `Chip`.
 *
 * ponytail: temporary. The home shell's title tabs carry the title and the city chip (foundations C); this goes with the
 * rebase onto them, together with `PULSE_TITLE_HEIGHT` in `FeaturedCard`'s chrome sum.
 *
 * The city control is the way out of an empty state: a city we have not launched in returns nothing, refreshing will
 * never help. No haptic on the chip: it opens a sheet, and the sheet is the answer.
 */
export const PulseTitle = memo(function PulseTitle({ city, onPressCity }: { city: string | null; onPressCity: () => void }) {
  const bold = useBoldText()
  return (
    <View style={styles.row} testID="pulse-header">
      <Text accessibilityRole="header" numberOfLines={1} style={[font('display', bold), styles.title]}>
        The Pulse
      </Text>
      <View style={styles.city}>
        <Chip
          label={city ?? 'Choose city'}
          icon="map-pin"
          onPress={onPressCity}
          accessibilityLabel={city ? `Browsing ${city}. Change city` : 'Choose a city'}
          testID="pulse-city"
        />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md, paddingHorizontal: SPACE.gutter },
  title: { flexShrink: 1, color: COLOR.textPrimary },
  city: { flexShrink: 1, maxWidth: '50%' },
})
