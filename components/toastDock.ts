import { createContext, useContext, useEffect, useId } from 'react'

import type { ToastVariant } from '../lib/toast'

/**
 * The toast's context and what a screen says to it. Apart from `components/Toast.tsx` (which draws the toast) so a screen
 * or a DS component that only registers a dock does not import the provider.
 */

/** The outcome haptic a toast plays as it appears (not when queued). Without it a toast is silent: the caller plays its own. */
export type ToastHaptic = 'success' | 'error'

export interface ToastAction {
  label: string
  onPress: () => void
}

export interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: { action?: ToastAction; haptic?: ToastHaptic }) => void
  /** A screen's bottom dock or composer stands where the Android snackbar would; it registers its height while mounted. */
  registerDock: (id: string, height: number) => () => void
  /** Room a screen leaves under its content for the showing snackbar (Android, off the tab roots, no dock); else 0. */
  inset: number
}

export const ToastContext = createContext<ToastContextValue>({ showToast: () => {}, registerDock: () => () => {}, inset: 0 })

/** A screen with a bottom dock or composer calls this while it is mounted: the Android snackbar then stands above it. The last to register wins. */
export function useToastDock(height: number) {
  const { registerDock } = useContext(ToastContext)
  const id = useId()
  useEffect(() => (height > 0 ? registerDock(id, height) : undefined), [registerDock, id, height])
}

/** The bottom padding a scrolling screen adds so the snackbar never covers its last row (0 when it stands elsewhere). */
export function useToastInset() {
  return useContext(ToastContext).inset
}
