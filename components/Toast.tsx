import { Ionicons } from '@expo/vector-icons'
import React, { createContext, useCallback, useContext, useState } from 'react'
import { AccessibilityInfo, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
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
import { SIZE } from '../lib/design/tokens'
import { MOTION_DURATION, MOTION_EASING } from '../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE, tint } from '../lib/theme'
import { setToastHandler, type ToastVariant } from '../lib/toast'


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
// A message is read in full or it is not a message: a longer one stays a second more for every 8 words past the first 8.
const WORDS_FREE = 8
const WORDS_PER_EXTRA_SECOND = 8

/** Never longer than this, whatever the length: past it a toast is a screen, and it can be dismissed. */
/** The top bar's band: its 44 / 48 circle and the 8 pt under it. */
const TOP_BAR_BAND = (Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton) + SPACE.sm

const DWELL_CAP_MS = 10_000

/** How long a toast stays: the base, plus time to read a long one, capped. */
export function toastDwellMs(message: string, withAction: boolean): number {
  const base = withAction ? DURATION_WITH_ACTION_MS : DURATION_MS
  const words = message.trim().split(/\s+/).length
  return Math.min(DWELL_CAP_MS, base + Math.floor(Math.max(0, words - WORDS_FREE) / WORDS_PER_EXTRA_SECOND) * 1000)
}

/** A swipe up this far, or this fast, puts a toast away (the Toast design: #19). */
const SWIPE_UP_PX = 24
const SWIPE_UP_VELOCITY = 0.8

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: string; iconColor: string; bg: string; border: string }> = {
  success: {
    icon: 'checkmark-circle',
    iconColor: EMBER.success,
    bg: tint(EMBER.success, 0.15),
    border: tint(EMBER.success, 0.4),
  },
  error: {
    icon: 'alert-circle',
    iconColor: EMBER.destructive,
    bg: tint(EMBER.destructive, 0.15),
    border: tint(EMBER.destructive, 0.4),
  },
  info: {
    icon: 'information-circle',
    iconColor: EMBER.textSecondary,
    bg: EMBER.surface,
    border: EMBER.separator,
  },
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
    const timer = setTimeout(onHide, toastDwellMs(toast.message, !!toast.action))
    return () => clearTimeout(timer)
    // onHide is a fresh closure from the parent on every render; including it
    // would restart the 3s dismiss timer whenever the parent re-renders. This
    // effect is intentionally mount-once per toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swiped away: a toast that takes touches can be put away by the same finger.
  const swipe = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy < -4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -SWIPE_UP_PX || g.vy < -SWIPE_UP_VELOCITY) onHide()
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <Animated.View
      // Only a toast with an action takes touches; the rest stay see-through.
      pointerEvents={toast.action ? 'auto' : 'none'}
      {...(toast.action ? swipe.panHandlers : {})}
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
        color={config.iconColor}
        style={styles.icon}
      />
      {/* Never clamped: a sentence that says what failed is shown whole, wrapping onto as many lines as it needs. */}
      <Text style={styles.message}>{toast.message}</Text>
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
      {toast.action ? (
        <Pressable onPress={onHide} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={styles.dismiss}>
          <Ionicons name="close" size={ICON.md} color={EMBER.textSecondary} />
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

  // Lets `lib/` helpers with no hook (the photo picker) raise a toast too.
  React.useEffect(() => setToastHandler(showToast), [showToast])

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        A toast that takes touches (it has an action) sits below the top bar, so it never covers the
        back button or the header's own controls; a see-through one keeps the top, where it always was.
      */}
      <View testID="toast-lane" style={[styles.container, { top: insets.top + SPACE.sm + (toasts.some((t) => t.action) ? TOP_BAR_BAND : 0) }]} pointerEvents="box-none">
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
  dismiss: {
    marginLeft: SPACE.xs,
    minWidth: CONTROL.sm,
    minHeight: CONTROL.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...TYPE.button,
    textDecorationLine: 'underline',
  },
})
