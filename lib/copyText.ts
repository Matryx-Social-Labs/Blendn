import * as Clipboard from 'expo-clipboard'

import type { ToastVariant } from './toast'

/**
 * Copies `text` and says so in a toast: "Copied 1.0.0 (118)" (Flow 7 About and Support). No haptic of its own: a copy is
 * not an outcome the vocabulary plays one for (C20). A clipboard that refuses is an error toast, never silence.
 */
export function copyText(text: string, showToast: (message: string, variant?: ToastVariant) => void): void {
  Clipboard.setStringAsync(text).then(
    () => showToast(`Copied ${text}`, 'success'),
    () => showToast("Couldn’t copy that. Try again.", 'error')
  )
}
