import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Platform, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type ScrollViewProps } from 'react-native'
import { KeyboardAwareScrollView, KeyboardEvents, KeyboardStickyView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller'

import { Dock } from '../ds/Dock'
import { MAX_FONT_SCALE } from '../../lib/design/tokens'
import { useKeyboardGone } from '../../lib/keyboard'

/** Room kept under the focused field for its hint (two or three lines of small print), over the dock, at the default size. */
export const HINT_ROOM = 72

/**
 * The hint's room at this text size: the hint is meta print, so it grows with the font scale up to meta's cap. A fixed 72
 * left sign-up's age hint under the dock at AX ("You need to be 18 or over to join." lost its last line, rc7 D9).
 */
export const hintRoomFor = (fontScale: number) => Math.round(HINT_ROOM * Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE.meta))

/**
 * The least of the scroll a focused field may keep to itself: at the largest type the dock and the hint's room can
 * outgrow the page, and an offset that large would scroll the field off the top instead of clear of the dock.
 */
export const MIN_FIELD = 64

/**
 * How far above the keyboard the focused field is kept: the dock's height and the hint's room, but never so much that
 * less than `MIN_FIELD` of the scroll is left to the field. Unmeasured (0), nothing to clamp against.
 */
export function bottomOffsetFor(dockHeight: number, scrollHeight: number, hintRoom: number = HINT_ROOM): number {
  const wanted = dockHeight + hintRoom
  return scrollHeight > 0 ? Math.max(0, Math.min(wanted, scrollHeight - MIN_FIELD)) : wanted
}

/**
 * Scroll room added under the content while the keyboard is up (RC drive D4).
 *
 * The library pads the scroll by the keyboard's height and nothing else, and the scroll ends at the dock's top AT REST.
 * With the keyboard up the dock rides on it, so the furthest the content's end can rise is the rest dock's top, above the
 * keyboard: the last field can come up only to `dockRest + contentPadding` over the keyboard, while `bottomOffset` asks for
 * `dockUp + HINT_ROOM`. Short by `dockUp - dockRest + HINT_ROOM - contentPadding`: 10 pt on an iPhone 17 (the dock drops
 * 38 pt of home-indicator room over the keyboard), 44 pt where there is none (an SE, Android), so the last field's hint (its
 * error) sat under the dock and the scroll could not move it. `dockUp <= dockRest` always (`Dock` only drops room over the
 * keyboard), so `HINT_ROOM` is enough on every phone.
 */
export const EXTRA_SCROLL_ROOM = HINT_ROOM

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
  // The Strong Password sheet closes without the hide the library listens for (RC drive 2 D-4): the page rests then.
  const keyboardGone = useKeyboardGone()
  /*
   * Belt and braces for the system's Strong Password sheet: it takes first responder as the keyboard grows, and the
   * library's own follow needs the focused input it tracks. Once the keyboard has landed, ask it to look again.
   */
  useEffect(() => {
    const sub = KeyboardEvents.addListener('keyboardDidShow', () => scroll.current?.assureFocusedInputVisible?.())
    return () => sub.remove()
  }, [])
  const onLayout = (e: LayoutChangeEvent) => setScrollHeight(e.nativeEvent.layout.height)
  // The hint's room, and the scroll room that lets the last field's hint reach it (EXTRA_SCROLL_ROOM's reasoning, scaled).
  const hintRoom = hintRoomFor(useWindowDimensions().fontScale)
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
        enabled={!keyboardGone}
        bottomOffset={bottomOffsetFor(dockHeight, scrollHeight, hintRoom)}
        extraKeyboardSpace={EXTRA_SCROLL_ROOM - HINT_ROOM + hintRoom}
        {...scrollProps}
      >
        {children}
      </KeyboardAwareScrollView>
      <KeyboardStickyView testID="keyboard-page-dock-frame" enabled={!keyboardGone}>
        <Dock {...dockProps} onHeight={setDockHeight}>
          {dock}
        </Dock>
      </KeyboardStickyView>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
