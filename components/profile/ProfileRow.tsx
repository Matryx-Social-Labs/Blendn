import { useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from '../ds/shared'

/**
 * A destination row on the Me tab and Friends (Flow 6 `me`: Friend requests, Crews, the "Finish your profile" gaps): 56 pt on
 * `surfaceSunken` at radius 16, a 20 pt glyph or your own mark, the title in `body`, whatever the row reports at the right (a count,
 * a dot), and a chevron. It goes somewhere; it changes nothing in place, so it is silent. `SettingsRow` has no slot for a count or an
 * emblem, and these rows stand alone rather than in a grouped card, so they are this row.
 *
 * One element for a screen reader: `label` is the whole sentence ("3 friend requests"), and `trailing` is decorative.
 */
export function ProfileRow({
  icon,
  leading,
  title,
  trailing,
  label,
  hint,
  onPress,
  testID,
}: {
  icon?: IconName
  /** In place of the glyph: a crew's emblems. Decorative. */
  leading?: ReactNode
  title: string
  trailing?: ReactNode
  /** What a screen reader says; the title when absent. */
  label?: string
  hint?: string
  onPress: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  const android = Platform.OS === 'android'

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android }}
        accessibilityRole="button"
        accessibilityLabel={label ?? title}
        accessibilityHint={hint}
        style={({ pressed }) => [styles.row, contrast && IC_HAIRLINE, pressed && !android && { backgroundColor: PRESSED_WASH.ios }]}
      >
        {leading ?? (icon ? <Icon name={icon} size={ICON.control} color={COLOR.textPrimary} /> : null)}
        <Text numberOfLines={2} style={[font('body', bold), styles.title]}>
          {title}
        </Text>
        {trailing ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.trailing}>
            {trailing}
          </View>
        ) : null}
        <Icon name="chevron-right" size={ICON.control} color={contrast ? COLOR.textPrimary : COLOR.textTertiary} />
      </Pressable>
      {focused ? focusRing(RADIUS.rowInCard).map((ring, i) => <View key={i} pointerEvents="none" style={ring} />) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    minHeight: SIZE.primary,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surfaceSunken,
    overflow: 'hidden',
  },
  title: { flex: 1, color: COLOR.textPrimary },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
})
