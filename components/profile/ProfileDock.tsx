import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { useToastDock } from '../toastDock'
import { PhotoScrim } from '../ui/GradientFill'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'

/** The ink fade behind the dock: the frame's 120 pt (U-H3), and always taller than the dock so the line above the tray sits on ink. */
const FADE = 120

/**
 * How far the page's last section must clear: the tray (a 56 pt primary in 12 pt of padding), the line above it, the
 * 16 pt it floats above the inset, and the home indicator. A first guess for the first frame, until the dock has measured.
 */
export const dockClearance = (insetBottom: number) => SIZE.primary + SPACE.md * 2 + SPACE.lg + insetBottom

/**
 * The profile's action tray (Flow 6 `user` tray, docked: audit U-H3): Like and Connect, or Message, in the thumb's reach at
 * every phone height instead of after a 700 pt hero and four sections. Flow 6's tray, `RADIUS.card 32` on `surfaceSunken`,
 * 12 pt of padding and 8 pt between its buttons, floating `SPACE.lg` over the bottom inset (which on Android is the
 * navigation bar) on an ink fade, and staying put while the page scrolls beneath it.
 *
 * `note` is the frame's line under the tray ("Connect sends a request and reveals your name and photo."): it is read before
 * the tray, so the reason for a button comes before the button. Last in the screen's tree and last in the focus order.
 */
export function ProfileDock({
  children,
  note,
  onHeight,
  testID,
}: {
  children: ReactNode
  note?: string | null
  /** The dock's measured height, for the scroll view's foot. */
  onHeight?: (height: number) => void
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [height, setHeight] = useState(0)
  const onLayout = (e: LayoutChangeEvent) => {
    setHeight(e.nativeEvent.layout.height)
    onHeight?.(e.nativeEvent.layout.height)
  }
  // The Android snackbar stands above the tray (the toast host already clears the navigation bar, so only what is above it counts).
  useToastDock(Math.max(0, height - insets.bottom))

  return (
    <View testID={testID} pointerEvents="box-none" onLayout={onLayout} style={styles.dock}>
      <PhotoScrim testID={testID && `${testID}-fade`} contrast={contrast} pointerEvents="none" style={[styles.fade, { height: Math.max(FADE, height + SPACE.xl) }]} />
      <View style={[styles.stack, { paddingBottom: insets.bottom + SPACE.lg }]}>
        {note ? <Text style={[font('meta', bold), styles.note]}>{note}</Text> : null}
        <View testID={testID && `${testID}-tray`} style={styles.tray}>
          {children}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  stack: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
  note: { color: COLOR.textSecondary, textAlign: 'center' },
  tray: { flexDirection: 'row', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.card, backgroundColor: COLOR.surfaceSunken },
})
