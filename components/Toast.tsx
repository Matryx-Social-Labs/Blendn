import { Ionicons } from '@expo/vector-icons'
import React, { createContext, useCallback, useContext, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MOTION_DURATION, MOTION_EASING } from '../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE, tint } from '../lib/theme'

type ToastVariant = 'success' | 'error' | 'info'

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

// Longer with an action: the toast is then a control, and 3s is too short to
// read the message and reach the button.
const DURATION_MS = 3000
const DURATION_WITH_ACTION_MS = 5000

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: string; bg: string; border: string }> = {
  success: {
    icon: 'checkmark-circle',
    bg: tint(EMBER.success, 0.15),
    border: tint(EMBER.success, 0.4),
  },
  error: {
    icon: 'alert-circle',
    bg: tint(EMBER.destructive, 0.15),
    border: tint(EMBER.destructive, 0.4),
  },
  info: {
    icon: 'information-circle',
    bg: EMBER.surface,
    border: EMBER.separator,
  },
}

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  success: EMBER.success,
  error: EMBER.destructive,
  info: EMBER.textSecondary,
}

let nextId = 0

/*
 * Enter and exit are timed, not sprung: nothing a finger did put the toast
 * there, so a spring's overshoot has nothing to carry (and on opacity it
 * clamps visibly). The exit runs on unmount, so an Undo tap animates out too.
 *
 * Reduce Motion drops the 12pt drop-in and keeps the fade — the fade is what
 * says "something just changed up here".
 */
const TOAST_EASE_OUT = Easing.bezier(...MOTION_EASING.entrance)

const toastEntering = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -12 }] },
    animations: {
      opacity: withTiming(1, { duration: MOTION_DURATION.normal, easing: TOAST_EASE_OUT }),
      transform: [{ translateY: withTiming(0, { duration: MOTION_DURATION.normal, easing: TOAST_EASE_OUT }) }],
    },
  }
}

const toastExiting = () => {
  'worklet'
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: MOTION_DURATION.fast, easing: TOAST_EASE_OUT }),
      transform: [{ translateY: withTiming(-12, { duration: MOTION_DURATION.fast, easing: TOAST_EASE_OUT }) }],
    },
  }
}

const toastFadeIn = FadeIn.duration(MOTION_DURATION.fast).reduceMotion(ReduceMotion.Never)
const toastFadeOut = FadeOut.duration(MOTION_DURATION.fast).reduceMotion(ReduceMotion.Never)
const toastReflow = LinearTransition.duration(MOTION_DURATION.normal).easing(TOAST_EASE_OUT)

function ToastItem({ toast, onHide }: { toast: ToastMessage; onHide: () => void }) {
  const reduceMotion = useReducedMotion()
  const config = VARIANT_CONFIG[toast.variant]

  React.useEffect(() => {
    const timer = setTimeout(onHide, toast.action ? DURATION_WITH_ACTION_MS : DURATION_MS)
    return () => clearTimeout(timer)
    // onHide is a fresh closure from the parent on every render; including it
    // would restart the 3s dismiss timer whenever the parent re-renders. This
    // effect is intentionally mount-once per toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Animated.View
      // Only a toast with an action takes touches; the rest stay see-through.
      pointerEvents={toast.action ? 'auto' : 'none'}
      entering={reduceMotion ? toastFadeIn : toastEntering}
      exiting={reduceMotion ? toastFadeOut : toastExiting}
      layout={reduceMotion ? undefined : toastReflow}
      style={[styles.toast, { borderColor: config.border }]}
      // Android reads a live region when it appears; iOS is told in showToast.
      accessibilityLiveRegion={toast.variant === 'error' ? 'assertive' : 'polite'}
    >
      {/* The status tint over an opaque surface: a 15% fill alone lets the screen show through the text. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: config.bg }]} pointerEvents="none" />
      <Ionicons
        name={config.icon as any}
        size={ICON.md}
        color={VARIANT_ICON_COLOR[toast.variant]}
        style={styles.icon}
      />
      <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
      {toast.action ? (
        <Pressable
          onPress={() => {
            toast.action?.onPress()
            onHide()
          }}
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
          hitSlop={8}
          style={styles.action}
        >
          <Text style={styles.actionText}>{toast.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const insets = useSafeAreaInsets()

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', options?: { action?: ToastAction }) => {
      const id = ++nextId
      /*
       * Said aloud, not only drawn. A toast appears at the top while focus is
       * wherever the finger was, so a screen reader user heard nothing when a
       * save failed or a report went through. iOS has no live regions; it is
       * told here. Android reads the toast's live region instead, so it is
       * not announced twice.
       */
      if (Platform.OS === 'ios') {
        const spoken = options?.action ? `${message} ${options.action.label} is available.` : message
        AccessibilityInfo.announceForAccessibility(spoken)
      }
      setToasts(prev => [...prev.slice(-2), { id, message, variant, action: options?.action }])
    },
    []
  )

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.container, { top: insets.top + SPACE.sm }]} pointerEvents="box-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onHide={() => hideToast(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: GUTTER,
    right: GUTTER,
    zIndex: 9999,
    gap: SPACE.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
  },
  icon: {
    marginRight: SPACE.sm,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    ...TYPE.body,
  },
  action: {
    marginLeft: SPACE.md,
    minHeight: CONTROL.sm,
    justifyContent: 'center',
  },
  actionText: {
    ...TYPE.button,
    textDecorationLine: 'underline',
  },
})
