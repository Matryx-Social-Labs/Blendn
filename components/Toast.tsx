import { Ionicons } from '@expo/vector-icons'
import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { APP_COLORS, APP_RADIUS, APP_SPACING } from '../lib/theme'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastMessage {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: string; bg: string; border: string }> = {
  success: {
    icon: 'checkmark-circle',
    bg: 'rgba(52,199,89,0.15)',
    border: 'rgba(52,199,89,0.4)',
  },
  error: {
    icon: 'alert-circle',
    bg: 'rgba(255,59,48,0.15)',
    border: 'rgba(255,59,48,0.4)',
  },
  info: {
    icon: 'information-circle',
    bg: 'rgba(10,132,255,0.15)',
    border: 'rgba(10,132,255,0.4)',
  },
}

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  success: APP_COLORS.success,
  error: APP_COLORS.destructive,
  info: APP_COLORS.accent,
}

let nextId = 0

function ToastItem({ toast, onHide }: { toast: ToastMessage; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current
  const config = VARIANT_CONFIG[toast.variant]

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, speed: 20 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20 }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 250, useNativeDriver: true }),
      ]).start(onHide)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: config.bg, borderColor: config.border },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons
        name={config.icon as any}
        size={18}
        color={VARIANT_ICON_COLOR[toast.variant]}
        style={styles.icon}
      />
      <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
    </Animated.View>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const insets = useSafeAreaInsets()

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++nextId
    setToasts(prev => [...prev.slice(-2), { id, message, variant }])
  }, [])

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="none">
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
    left: APP_SPACING.md,
    right: APP_SPACING.md,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: APP_SPACING.sm,
    paddingHorizontal: APP_SPACING.md,
    borderRadius: APP_RADIUS.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  icon: {
    marginRight: 8,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
})
