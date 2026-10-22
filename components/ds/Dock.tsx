import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SolidBarFade } from '../ui/GradientFill'
import { Material, SOLID, useMaterialTier } from '../ui/Material'
import { useToastDock } from '../toastDock'
import { RADIUS, SPACE } from '../../lib/design/tokens'
import { useKeyboardShown } from '../../lib/keyboard'
import { IC_HAIRLINE, useIncreaseContrast } from './shared'

/**
 * The bottom dock (guidelines/components/Material.html, `bar`): a glass bar holding a screen's one primary at 56 and what
 * goes with it under it, 8 pt apart. It clears the home indicator, drops that room above the keyboard (inside a
 * `KeyboardFrame` it rides the keyboard's top edge), tells the Android snackbar where it stands, and reports its height
 * so a page that scrolls under it can pad for it.
 *
 * The entry and onboarding screens (Flow 1 landing, sign-in; Flow 2 `frame`) draw it in the flow, with a 32 pt top corner
 * (`glass={false}` is the sign-in form at rest, where the dock is only the primary on the page). The Scene, event
 * preferences and Rate pin it over their scroll (`floating`) as a straight bar, as Flow 3 draws it.
 */
export function Dock({
  glass = true,
  keyboardUp,
  gap = SPACE.sm,
  floating = false,
  round = !floating,
  onHeight,
  children,
  testID,
}: {
  /** The bar's glass; off, the dock is only the layout. */
  glass?: boolean
  /** The keyboard is up: from the screen when it tracks it itself, else read from the keyboard. */
  keyboardUp?: boolean
  /** 8 under a step's primary, 12 between the landing's buttons. */
  gap?: number
  /** Pinned to the screen's foot over a scroll, instead of in the flow. */
  floating?: boolean
  /** The 32 pt top corner (the entry screens'); a floating dock is straight. */
  round?: boolean
  /** The dock's height as laid out: the page scrolls clear of it. */
  onHeight?: (height: number) => void
  children: ReactNode
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  const typing = useKeyboardShown()
  const keyboard = keyboardUp ?? typing
  const [height, setHeight] = useState(0)
  const solid = useMaterialTier() === 'solid'
  // The toast adds the bottom inset itself, and this dock holds it only at rest: over the keyboard its padding has none to subtract.
  useToastDock(Math.max(0, height - (keyboard ? 0 : insets.bottom)))
  const style = [
    styles.dock,
    floating && styles.floating,
    round && styles.round,
    { gap, paddingBottom: keyboard ? SPACE.md : insets.bottom + SPACE.lg },
  ]
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    setHeight(e.nativeEvent.layout.height)
    onHeight?.(e.nativeEvent.layout.height)
  }

  if (!glass) {
    return (
      <View testID={testID} onLayout={onLayout} style={style}>
        {children}
      </View>
    )
  }
  return (
    <Material role="bar" testID={testID} onLayout={onLayout} style={[...style, contrast && IC_HAIRLINE, solid && floating && styles.unclipped]}>
      {/* Pinned over a scroll on the solid tier (Android): the page fades into the bar rather than being cut by it (r7 L7). */}
      {solid && floating ? <SolidBarFade testID={testID && `${testID}-fade`} color={SOLID.bar} pointerEvents="none" style={styles.fade} /> : null}
      {children}
    </Material>
  )
}

const styles = StyleSheet.create({
  dock: { paddingTop: SPACE.lg, paddingHorizontal: SPACE.gutter },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  /** The fade sits above the bar's top edge, outside its box. */
  unclipped: { overflow: 'visible' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: '100%', height: SPACE.xxxl },
  round: { borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card },
})
