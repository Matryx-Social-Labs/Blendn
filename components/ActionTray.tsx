import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { KEYBOARD_BEHAVIOR } from '../lib/keyboard'
import { MOTION_DURATION, MOTION_EASING } from '../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, OPACITY, SPACE } from '../lib/theme'
import { TRAY_SPECS, type TraySize } from '../lib/uxStandards'
import { Grabber } from './ui/Grabber'
import { Text } from './ui/Text'

export type ActionTrayButton = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'destructive'
  loading?: boolean
  disabled?: boolean
}

/*
 * iOS cannot present a native modal (a router modal: the paywall) while an RN
 * Modal is still leaving — the push silently does nothing. Whoever closes a
 * tray and then opens such a screen waits for this first. Android has no such
 * rule, so there it resolves at once; on iOS it resolves on the Modal's
 * onDismiss, or after `fallbackMs` if no tray was showing.
 */
const dismissWaiters = new Set<() => void>()
export function afterTrayDismissed(fallbackMs = 600): Promise<void> {
  if (Platform.OS !== 'ios') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      dismissWaiters.delete(done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, fallbackMs)
    dismissWaiters.add(done)
  })
}
const notifyDismissed = () => {
  for (const done of [...dismissWaiters]) done()
}

type ActionTrayProps = {
  visible: boolean
  title: string
  message?: string
  buttons: ActionTrayButton[]
  onClose: () => void
  size?: TraySize
  dismissible?: boolean
  /**
   * `row` (the default) sets the first two buttons side by side and the rest
   * in a second row — right for a confirm/cancel pair. `stack` gives every
   * button its own full-width row, for a list of actions: four buttons in the
   * default layout put three in one row, too narrow to read "Block and report".
   */
  layout?: 'row' | 'stack'
  /** Drawn between the message and the buttons: a reason list, an emoji row. */
  children?: ReactNode
}

/** Past this, a slow drag down closes the tray. */
const DISMISS_DISTANCE = 80
/** A flick this fast closes it from any distance — `SwipeToDismiss`'s figure. */
const DISMISS_VELOCITY = 800

const getButtonStyle = (variant: ActionTrayButton['variant']) => {
  const resolved = variant || 'secondary'
  if (resolved === 'primary') {
    return { backgroundColor: EMBER.accent, textColor: EMBER.onGradient }
  }
  if (resolved === 'destructive') {
    return { backgroundColor: EMBER.destructive, textColor: EMBER.textPrimary }
  }
  // `surface` on the tray's `surfaceSunken`: one step up from what it sits on.
  return { backgroundColor: EMBER.surface, textColor: EMBER.textPrimary }
}

export default function ActionTray({
  visible,
  title,
  message,
  buttons,
  onClose,
  size = 'default',
  dismissible = true,
  layout = 'row',
  children,
}: ActionTrayProps) {
  const config = TRAY_SPECS[size]
  const insets = useSafeAreaInsets()
  const [opacity] = useState(() => new Animated.Value(0))
  const [translateY] = useState(() => new Animated.Value(40))
  const reduceMotion = useReducedMotion()
  const dragY = useSharedValue(0)

  /*
   * Arrives on an ease-out: fast at the start, where the eye is, settling at
   * the end. Core Animated's default is ease-in-out, which spends the first
   * frames barely moving. Reduce Motion keeps the fade and drops the 40pt rise.
   * The exit is the Modal's own fade.
   */
  useEffect(() => {
    if (!visible) return
    const easing = Easing.bezier(...MOTION_EASING.entrance)
    dragY.set(0)
    opacity.setValue(0)
    translateY.setValue(reduceMotion ? 0 : 40)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: MOTION_DURATION.fast, easing, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: MOTION_DURATION.normal, easing, useNativeDriver: true }),
    ]).start()
  }, [visible, opacity, translateY, reduceMotion, dragY])

  const canDismiss = dismissible && !buttons.some((button) => button.loading)

  /*
   * The grabber is a promise that the tray can be dragged away, so it can.
   *
   * The drag lives on the head (grabber, title, message) rather than the whole
   * tray, so a reason list or a note field inside keeps its own scroll. It
   * follows the finger down 1:1 — direct manipulation, so Reduce Motion keeps
   * it — and a tray that cannot close right now (a step in flight) does not
   * move at all. Short of the threshold it springs home.
   */
  const drag = Gesture.Pan()
    .enabled(canDismiss)
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      dragY.set(Math.max(0, e.translationY))
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose)
        return
      }
      dragY.set(withSpring(0, { duration: 300, dampingRatio: 1, velocity: e.velocityY }))
    })
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }))

  const buttonRows = useMemo(() => {
    if (layout === 'stack') return buttons.map((button) => [button])
    if (buttons.length <= 2) return [buttons]
    return [buttons.slice(0, 2), buttons.slice(2)]
  }, [buttons, layout])

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onDismiss={notifyDismissed}
      onRequestClose={() => {
        if (canDismiss) onClose()
      }}
    >
      {/* A Modal is its own native root: gestures inside it need their own root view. */}
      <GestureHandlerRootView style={styles.fill}>
        {/*
          A reason sheet has a note field, and without this the keyboard rises
          over the very field being typed into. `padding` on both platforms, for
          the reason `lib/keyboard.ts` gives.
        */}
        <KeyboardAvoidingView style={styles.fullscreen} behavior={KEYBOARD_BEHAVIOR}>
          <Pressable
            style={styles.backdrop}
            accessible={false}
            onPress={() => {
              if (canDismiss) onClose()
            }}
          />
          {/*
            Two layers, split the way `RisingSheet` splits them: placement and
            the arrival on the outer one, everything you see on the inner one,
            which the drag moves. With the fill on the outer layer, a drag would
            slide the content down through a background that stayed put.
          */}
          <Animated.View
            style={[
              styles.placement,
              {
                marginTop: config.topInset,
                maxHeight: `${Math.round(config.maxHeightPercent * 100)}%`,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <Reanimated.View
              accessibilityViewIsModal
              style={[
                styles.tray,
                {
                  paddingHorizontal: config.horizontalPadding,
                  // Clear of the home indicator: the last button used to sit
                  // under it, where a tap on its centre is the system's.
                  paddingBottom: insets.bottom + SPACE.lg,
                  borderTopLeftRadius: config.cornerRadius,
                  borderTopRightRadius: config.cornerRadius,
                },
                dragStyle,
              ]}
            >
              <GestureDetector gesture={drag}>
                <View style={styles.head}>
                  <Grabber style={styles.grabber} />
                  <Text variant="title" accessibilityRole="header">
                    {title}
                  </Text>
                  {!!message && (
                    <Text variant="body" color={EMBER.textSecondary}>
                      {message}
                    </Text>
                  )}
                </View>
              </GestureDetector>
              {children}
              {/*
                The buttons scroll once they outgrow the tray's max height.
                Before, they ran past it: a muted room's six-button sheet put
                Cancel below the bottom of an iPhone 17 Pro, out of reach
                (simulator, 2026-09-29). Fits → no scroll, no bounce.
              */}
              <ScrollView
                style={styles.buttonsScroll}
                contentContainerStyle={styles.buttonsWrap}
                alwaysBounceVertical={false}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {buttonRows.map((row, rowIndex) => (
                  <View style={styles.buttonRow} key={`row-${rowIndex}`}>
                    {row.map((button, buttonIndex) => {
                      const style = getButtonStyle(button.variant)
                      const isDisabled = !!button.disabled || !!button.loading
                      return (
                        <Pressable
                          key={`${button.label}-${buttonIndex}`}
                          onPress={button.onPress}
                          disabled={isDisabled}
                          accessibilityRole="button"
                          accessibilityLabel={button.label}
                          accessibilityState={{ disabled: isDisabled, busy: !!button.loading }}
                          style={({ pressed }) => [
                            styles.button,
                            { backgroundColor: style.backgroundColor },
                            // A spinning button keeps its fill; only "not yet" dims.
                            button.disabled && !button.loading && styles.buttonDisabled,
                            pressed && styles.buttonPressed,
                          ]}
                        >
                          {button.loading ? (
                            <ActivityIndicator size="small" color={style.textColor} />
                          ) : (
                            <Text variant="button" color={style.textColor} numberOfLines={1}>
                              {button.label}
                            </Text>
                          )}
                        </Pressable>
                      )
                    })}
                  </View>
                ))}
              </ScrollView>
            </Reanimated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fullscreen: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: EMBER.backdrop,
  },
  placement: { width: '100%' },
  tray: {
    flexShrink: 1,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
    paddingTop: SPACE.sm,
    gap: SPACE.md,
  },
  head: { gap: SPACE.md },
  grabber: { marginBottom: SPACE.sm },
  buttonsScroll: { flexShrink: 1, flexGrow: 0 },
  buttonsWrap: {
    gap: SPACE.md,
    marginTop: SPACE.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  button: {
    minHeight: CONTROL.lg,
    flex: 1,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: OPACITY.disabled },
  buttonPressed: { opacity: OPACITY.pressed },
})
