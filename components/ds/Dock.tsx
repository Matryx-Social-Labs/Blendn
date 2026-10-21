import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Material } from '../ui/Material'
import { useToastDock } from '../toastDock'
import { SPACE } from '../../lib/design/tokens'
import { useKeyboardShown } from '../../lib/keyboard'
import { IC_HAIRLINE, useIncreaseContrast } from './shared'

/**
 * The bottom dock (guidelines/components/Material.html, `bar`): a glass bar pinned under a screen's content that
 * holds its one primary action (and a tertiary beneath it). It clears the home indicator, tells the Android
 * snackbar where it stands, and reports its height so the page scrolls clear of it. Inside a `KeyboardFrame` it rides
 * the keyboard.
 */
export function Dock({ children, onHeight, testID }: { children: ReactNode; onHeight?: (height: number) => void; testID?: string }) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  // Over the keyboard the dock rides its top edge (KeyboardFrame), so the home indicator is not under it: no inset.
  const keyboard = useKeyboardShown()
  const [height, setHeight] = useState(0)
  // The toast adds the bottom inset itself, and this dock's height already holds it.
  useToastDock(Math.max(0, height - insets.bottom))
  return (
    <Material
      role="bar"
      testID={testID}
      onLayout={(e) => {
        setHeight(e.nativeEvent.layout.height)
        onHeight?.(e.nativeEvent.layout.height)
      }}
      style={[styles.dock, { paddingBottom: keyboard ? SPACE.lg : Math.max(insets.bottom, SPACE.lg) }, contrast && IC_HAIRLINE]}
    >
      <View style={styles.stack}>{children}</View>
    </Material>
  )
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: SPACE.lg, paddingHorizontal: SPACE.gutter },
  stack: { gap: SPACE.sm },
})
