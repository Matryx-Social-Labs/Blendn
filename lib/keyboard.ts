import { useEffect, useState } from 'react'
import { Dimensions, Keyboard, type KeyboardEvent } from 'react-native'
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

/** Whether a keyboard frame event says nothing is on screen: no height, or a frame that starts at or below the screen's foot. */
export function frameIsOffScreen(e: KeyboardEvent): boolean {
  const end = e?.endCoordinates
  if (!end) return false
  return end.height <= 0 || end.screenY >= Dimensions.get('screen').height
}

/**
 * The keyboard is gone though react-native-keyboard-controller may still hold its height (RC drive 2 D-4).
 *
 * iOS's Strong Password sheet is the field's input view: it arrives as a keyboard (`keyboardWillShow`, its height), and
 * when it is closed iOS moves the input frame off screen without the `keyboardWillHide` the library listens for. The
 * library kept the sheet's height, so the sign-up dock stayed lifted mid-screen over dead space and the scroll stayed
 * padded. React Native's own observer still hears the frame land off screen (`keyboardDidChangeFrame`, iOS: Android
 * sends none, and has no such sheet), so that is taken as the word; the next `keyboardWillShow` takes it back.
 */
export function useKeyboardGone(): boolean {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const show = KeyboardEvents.addListener('keyboardWillShow', () => setGone(false))
    const frame = Keyboard.addListener('keyboardDidChangeFrame', (e) => setGone(frameIsOffScreen(e)))
    return () => {
      show.remove()
      frame.remove()
    }
  }, [])
  return gone
}
