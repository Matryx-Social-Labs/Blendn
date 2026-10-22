import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ScrollViewProps } from 'react-native'
import { KeyboardAwareScrollView, KeyboardEvents, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { Dock } from '../ds/Dock'

/** Room kept under the focused field for its hint (two or three lines of small print), over the dock. */
export const HINT_ROOM = 72

/**
 * The least of the scroll a focused field may keep to itself: at the largest type the dock and the hint's room can
 * outgrow the page, and an offset that large would scroll the field off the top instead of clear of the dock.
 */
export const MIN_FIELD = 64

/**
 * How far above the keyboard the focused field is kept: the dock's height and the hint's room, but never so much that
 * less than `MIN_FIELD` of the scroll is left to the field. Unmeasured (0), nothing to clamp against.
 */
export function bottomOffsetFor(dockHeight: number, scrollHeight: number): number {
  const wanted = dockHeight + HINT_ROOM
  return scrollHeight > 0 ? Math.max(0, Math.min(wanted, scrollHeight - MIN_FIELD)) : wanted
}

type DockProps = Omit<ComponentProps<typeof Dock>, 'children' | 'onHeight'>

/**
 * The scroll and the dock of a form page, following the keyboard the way the chat and the sheets do (motion #34):
 * react-native-keyboard-controller moves them frame by frame on the keyboard's own curve, interactive dismiss included.
 *
 * - The scroll scrolls the focused field clear of the keyboard AND the dock (`bottomOffset` = the dock's height and the
 *   hint's room, clamped at the largest type), as it opens, as the field changes, and as a line is typed. It replaced a hand-written reveal that
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
  const [scrollHeight, setScrollHeight] = useState(0)
  const scroll = useRef<KeyboardAwareScrollViewRef>(null)
  /*
   * Belt and braces for the system's Strong Password sheet: it takes first responder as the keyboard grows, and the
   * library's own follow needs the focused input it tracks. Once the keyboard has landed, ask it to look again.
   */
  useEffect(() => {
    const sub = KeyboardEvents.addListener('keyboardDidShow', () => scroll.current?.assureFocusedInputVisible?.())
    return () => sub.remove()
  }, [])
  const onLayout = (e: LayoutChangeEvent) => setScrollHeight(e.nativeEvent.layout.height)
  return (
    <View style={styles.fill}>
      <KeyboardAwareScrollView
        ref={scroll}
        onLayout={onLayout}
        style={styles.fill}
        keyboardShouldPersistTaps="handled"
        // Drag the form down to put the keyboard away, as in Messages.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        bottomOffset={bottomOffsetFor(dockHeight, scrollHeight)}
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
