import { Children, Fragment, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { COLOR, MATERIAL, RADIUS } from '../../lib/design/tokens'
import { IC_HAIRLINE, useIncreaseContrast } from '../ds/shared'

/** flow10.js `make`: a block inside the sheet is 8% white on iOS glass, sunken on Android's solid sheet. */
export const SHEET_FILL = Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass

/**
 * Rows in a 24 pt surface card with a hairline between them (flow10.js: the
 * Invites, Your crews, Members and Your settings cards). Increase Contrast
 * outlines the card and lifts the hairlines to 50%.
 */
export function RowsCard({ children, onSheet = false, testID }: { children: ReactNode; /** Inside a sheet: the plate that shows on it. */ onSheet?: boolean; testID?: string }) {
  const contrast = useIncreaseContrast()
  return (
    <View testID={testID} style={[styles.card, onSheet && styles.onSheet, contrast && IC_HAIRLINE]}>
      {Children.toArray(children).map((row, i) => (
        <Fragment key={i}>
          {i ? <View accessibilityElementsHidden style={[styles.hairline, contrast && styles.hairlineContrast]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  onSheet: { backgroundColor: SHEET_FILL },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  hairlineContrast: { height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
})
