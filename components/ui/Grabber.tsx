import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { COLOR, RADIUS } from '../../lib/design/tokens'

/**
 * The handle at the top of a bottom sheet.
 *
 * One drawing for every sheet, so the notification, filter and connect sheets
 * cannot drift apart again (they were three widths and three colours). `style`
 * is for the sheet's own spacing around it, not for its look.
 */
export function Grabber({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.grabber, style]} accessibilityElementsHidden importantForAccessibility="no" />
}

const styles = StyleSheet.create({
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textTertiary,
  },
})
