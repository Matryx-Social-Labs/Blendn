import { Children, Fragment, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { COLOR, MATERIAL, RADIUS } from '../../lib/design/tokens'
import { IC_HAIRLINE, useIncreaseContrast } from '../ds/shared'

/**
 * Rows in a 24 pt surface card with a hairline between them (flow10.js: the
 * Invites, Your crews, Members and Your settings cards). Increase Contrast
 * outlines the card and lifts the hairlines to 50%.
 */
export function RowsCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const contrast = useIncreaseContrast()
  return (
    <View testID={testID} style={[styles.card, contrast && IC_HAIRLINE]}>
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
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  hairlineContrast: { height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
})
