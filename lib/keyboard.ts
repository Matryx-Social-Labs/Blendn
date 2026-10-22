import { useEffect, useState } from 'react'
import { KeyboardEvents } from 'react-native-keyboard-controller'

/**
 * How every screen avoids the keyboard — on BOTH platforms.
 *
 * Eight screens used `Platform.OS === 'ios' ? 'padding' : undefined` (two used
 * `'height'`), on the reasoning that Android's `adjustResize` shrinks the
 * window itself. That was true until `edgeToEdgeEnabled: true` (app.json):
 * an edge-to-edge window on Android 15+ IGNORES `adjustResize`, and the app
 * has to move its own content out from under the IME. Driven on Android 16:
 * the onboarding date-of-birth row (SCRUM-78) and edit-profile's Location
 * field both sat under the keyboard while being typed into.
 *
 * `padding` works on Android too — KeyboardAvoidingView listens to the
 * keyboard events and pads by its height — so one value for both, in one
 * place, rather than a per-screen guess that is right on one platform.
 */
export const KEYBOARD_BEHAVIOR = 'padding' as const

/**
 * Whether the keyboard is up, from the moment it starts to rise or fall, on both platforms: the chat's dock drops its
 * safe-area padding over it and the orbs pause (#34).
 *
 * react-native-keyboard-controller's `keyboardWillShow` / `keyboardWillHide`, as the Sheet reads them. React Native's own
 * Android events come at the END of the animation (`keyboardDidShow`), so a dock that swapped its padding on them
 * snapped after the keyboard had landed.
 */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const show = KeyboardEvents.addListener('keyboardWillShow', () => setShown(true))
    const hide = KeyboardEvents.addListener('keyboardWillHide', () => setShown(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return shown
}
