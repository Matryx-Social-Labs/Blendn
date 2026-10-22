import { useState, type ComponentProps, type ReactNode } from 'react'
import { Platform, StyleSheet, View, type ScrollViewProps } from 'react-native'
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller'

import { Dock } from '../ds/Dock'

/** Room kept under the focused field for its hint (two or three lines of small print), over the dock. */
export const HINT_ROOM = 72

type DockProps = Omit<ComponentProps<typeof Dock>, 'children' | 'onHeight'>

/**
 * The scroll and the dock of a form page, following the keyboard the way the chat and the sheets do (motion #34):
 * react-native-keyboard-controller moves them frame by frame on the keyboard's own curve, interactive dismiss included.
 *
 * - The scroll scrolls the focused field clear of the keyboard AND the dock (`bottomOffset` = the dock's height and the
 *   hint's room), as it opens, as the field changes, and as a line is typed. It replaced a hand-written reveal that
 *   listened for the keyboard's start and end only.
 * - The dock rides the keyboard's top edge (`KeyboardStickyView`); at rest it is the foot of the page in the flow.
 *
 * Used by the onboarding steps and the sign-in form, which differ only in their content and their dock.
 */
export function KeyboardPage({
  children,
  dock,
  dockProps,
  scrollProps,
}: {
  children: ReactNode
  /** The dock's content: the primary and what goes with it. */
  dock: ReactNode
  dockProps?: DockProps
  scrollProps: Omit<ScrollViewProps, 'children'>
}) {
  const [dockHeight, setDockHeight] = useState(0)
  return (
    <View style={styles.fill}>
      <KeyboardAwareScrollView
        style={styles.fill}
        keyboardShouldPersistTaps="handled"
        // Drag the form down to put the keyboard away, as in Messages.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        bottomOffset={dockHeight + HINT_ROOM}
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
      <KeyboardStickyView testID="keyboard-page-dock-frame">
        <Dock {...dockProps} onHeight={setDockHeight}>
          {dock}
        </Dock>
      </KeyboardStickyView>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
