import { usePathname } from 'expo-router'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { SIZE, SPACE } from '../lib/design/tokens'
import { setToastHandler, type ToastVariant } from '../lib/toast'
import { Toast as DsToast } from './ds/Toast'

/*
 * One toast, the design system's (components/ds/Toast.tsx, DS #19): dwell, held while touched, a swipe that
 * follows the finger, the design's colours and glyphs, a snackbar at the bottom on Android. This file keeps
 * the app's way of raising one — `useToast()` and `toast()` from `lib/toast` — and decides only which toast is
 * on screen: one at a time, the rest queued behind it, so two outcomes are never stacked on each other.
 */

interface ToastAction {
  label: string
  onPress: () => void
}

interface ToastMessage {
  id: number
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, options?: { action?: ToastAction }) => void
}

/** The top bar's band: its 44 / 48 circle and the 8 pt under it. */
const TOP_BAR_BAND = (Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton) + SPACE.sm

/** How many toasts wait: the one showing and two behind it. A fourth outcome in a row drops the oldest waiting. */
const QUEUE_MAX = 3

/** The routes whose floating tab bar an Android snackbar has to clear. */
const TAB_ROOTS = ['/', '/events', '/going', '/chat', '/profile']
export const isTabRoot = (pathname: string | null | undefined): boolean => TAB_ROOTS.includes(pathname ?? '')

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ToastMessage[]>([])
  const pathname = usePathname()

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', options?: { action?: ToastAction }) => {
      const id = ++nextId
      setQueue((prev) => [...prev.slice(-(QUEUE_MAX - 1)), { id, message, variant, action: options?.action }])
    },
    []
  )

  // Lets `lib/` helpers with no hook (the photo picker) raise a toast too.
  useEffect(() => setToastHandler(showToast), [showToast])

  const head = queue[0]
  const next = useCallback(() => setQueue((prev) => prev.slice(1)), [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {head ? (
        <View
          testID="toast-lane"
          pointerEvents="box-none"
          // A toast with an action sits below the top bar's back circle, so it never covers it (the Toast keeps its own place).
          style={[styles.lane, head.action ? { top: TOP_BAR_BAND } : null]}
        >
          <DsToast
            // A new toast is a new mount: its own enter, its own dwell.
            key={head.id}
            kind={head.variant}
            text={head.message}
            action={head.action}
            // Callers already play their outcome haptic (a venue go-live, Plus, About you): one event, one haptic.
            silent
            aboveTabBar={isTabRoot(pathname)}
            onDismiss={next}
            testID="toast"
          />
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  lane: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
})
