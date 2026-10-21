import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Material } from '../ui/Material'
import { IC_HAIRLINE, useIncreaseContrast } from '../ds/shared'
import { useToastDock } from '../toastDock'
import { RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The docked primary of the entry and onboarding screens (Flow 1 landing, sign-in; Flow 2 `frame`): an L2 glass bar with a
 * 32 pt top corner, the primary at 56 and what goes with it under it, 8 pt apart. Above the keyboard it drops the home
 * indicator's room; `glass={false}` is the sign-in form at rest, where the dock is only the primary on the page.
 *
 * The Android snackbar stands above it (its height, less the inset the toast adds itself when the dock holds that inset).
 */
export function Dock({
  glass = true,
  keyboardUp = false,
  gap = SPACE.sm,
  children,
  testID,
}: {
  glass?: boolean
  keyboardUp?: boolean
  /** 8 under a step's primary, 12 between the landing's buttons. */
  gap?: number
  children: ReactNode
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  const [height, setHeight] = useState(0)
  // The toast adds the bottom inset itself, and this dock holds it only at rest: over the keyboard its padding has none to subtract.
  useToastDock(Math.max(0, height - (keyboardUp ? 0 : insets.bottom)))
  const style = [styles.dock, { gap, paddingBottom: keyboardUp ? SPACE.md : insets.bottom + SPACE.lg }]
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => setHeight(e.nativeEvent.layout.height)

  if (!glass) {
    return (
      <View testID={testID} onLayout={onLayout} style={style}>
        {children}
      </View>
    )
  }
  return (
    <Material role="bar" testID={testID} onLayout={onLayout} style={[...style, contrast && IC_HAIRLINE]}>
      {children}
    </Material>
  )
}

const styles = StyleSheet.create({
  dock: {
    paddingTop: SPACE.lg,
    paddingHorizontal: SPACE.gutter,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
  },
})
