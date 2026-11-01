import * as Router from 'expo-router'
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

/** What `useToast()` hands out: only `showToast`, which never changes, so a screen that raises toasts is not re-rendered by a dock or an inset. */
export interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: { action?: ToastAction; haptic?: ToastHaptic }) => void
}

export const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

/** A screen's bottom dock or composer stands where the Android snackbar would; it registers its height while it is the screen in front. */
export const ToastDockContext = createContext<(id: string, height: number) => () => void>(() => () => {})

/** Room a screen leaves under its content for the showing snackbar (Android, off the tab roots, over a dock or not); else 0. Its own context: only a screen that pads for it re-renders. */
export const ToastInsetContext = createContext(0)

/** Whether this screen is the one in front (a stack keeps the screens under it mounted). Without a navigator (a test, a preview) it is. */
export function useFocused(): boolean {
  // ponytail: useNavigation throws outside a navigator (the design gallery, a bare test); whether there is one never changes
  // for a mounted tree, so the hook order is stable. Upgrade to a NavigationContext read if expo-router exports it.
  try {
    return (Router.useIsFocused ?? (() => true))()
  } catch {
    return true
  }
}

/**
 * A screen with a bottom dock or composer calls this: the Android snackbar then stands above it. It registers only while the
 * screen is in front (Room → Room info keeps the composer mounted underneath, and must not keep its height). The last to
 * register wins.
 */
export function useToastDock(height: number) {
  const registerDock = useContext(ToastDockContext)
  const focused = useFocused()
  const id = useId()
  useEffect(() => (height > 0 && focused ? registerDock(id, height) : undefined), [registerDock, id, height, focused])
}

/** The bottom padding a scrolling screen adds so the snackbar never covers its last row (0 when it stands elsewhere). */
export function useToastInset() {
  return useContext(ToastInsetContext)
}
