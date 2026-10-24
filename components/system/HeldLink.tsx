import { StyleSheet, Text, View } from 'react-native'

import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'

/** The pill is a 48 pt capsule (Flow 15 `signInToOpen`). */
const PILL_HEIGHT = 48
export const HELD_LINK_TITLE = 'Sign in to open this'
export const HELD_LINK_WHAT = 'An event · held for you'

/**
 * A link tapped while signed out, held through sign-in and named on the landing (Flow 15 15.12 02): a solid pill above
 * the lockup. It opens after sign-in, on its own; the pill only says the link was not dropped. Static, no haptic.
 */
export function HeldLink() {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View
      testID="held-link"
      accessible
      accessibilityLabel={`${HELD_LINK_TITLE}. ${HELD_LINK_WHAT}`}
      style={[styles.pill, contrast ? IC_HAIRLINE : styles.edge]}
    >
      <Icon name="link" size={ICON.control} />
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.title]} numberOfLines={1}>
          {HELD_LINK_TITLE}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.what]} numberOfLines={1}>
          {HELD_LINK_WHAT}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: PILL_HEIGHT,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  text: { flex: 1, minWidth: 0 },
  title: { color: COLOR.textPrimary },
  what: { color: COLOR.textSecondary },
})
