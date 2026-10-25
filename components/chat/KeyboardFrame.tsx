import { useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'

/**
 * Where a chat's floating dock (the composer, the newest chip) sits above the
 * keyboard — the room and the DM, one way.
 *
 * Why the inner View: `padding` pads the KeyboardAvoidingView, and an
 * absolutely positioned child is placed against its parent's padding box
 * (Yoga 3, RN ≥ 0.74), so a dock at `bottom: 0` directly inside it ignored the
 * padding and stayed under the keyboard on both platforms. Inside the inner
 * View — which the padding shrinks — `bottom: 0` is the top of the keyboard.
 * The feed shrinks with it, so its last message stays above the dock.
 *
 * The offset is measured, not guessed: KeyboardAvoidingView compares the
 * keyboard's window y with its own frame, which is relative to its parent, so
 * it needs that parent's y in the window. The chat headers are overlays inside
 * the screen (no navigator header), so on a full-screen push it measures 0; a
 * sheet or a modal presentation measures its own. No safe-area inset is added:
 * the frame reaches the window's bottom edge, and the dock drops its own
 * home-indicator padding while the keyboard is up.
 *
 * Android: SDK 57 is edge-to-edge, where `adjustResize` no longer resizes the
 * window; `padding` is applied there too (lib/keyboard.ts), so this is the
 * only thing moving the dock.
 *
 * The avoiding view is react-native-keyboard-controller's (its provider wraps
 * the app in app/_layout.tsx), not React Native's: it follows the keyboard's
 * real frame, so on iOS the dock rides an interactive dismiss (the list's
 * `keyboardDismissMode="interactive"`) instead of waiting for the keyboard to
 * finish, where React Native's only reacts to the start and end events.
 */
export function KeyboardFrame({ children }: { children: ReactNode }) {
  const outer = useRef<View>(null)
  const [offset, setOffset] = useState(0)
  return (
    <View
      ref={outer}
      style={styles.fill}
      onLayout={() => outer.current?.measureInWindow((_x, y) => setOffset((prev) => (Number.isFinite(y) && y !== prev ? y : prev)))}
      testID="chat-keyboard-frame"
    >
      <KeyboardAvoidingView style={styles.fill} behavior={KEYBOARD_BEHAVIOR} keyboardVerticalOffset={offset}>
        <View style={styles.fill} testID="chat-keyboard-dock-frame">
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
