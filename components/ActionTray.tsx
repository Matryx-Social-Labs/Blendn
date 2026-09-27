import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { MOTION_DURATION, MOTION_EASING } from '../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, SPACE, TYPE } from '../lib/theme'
import { TRAY_SPECS, type TraySize } from '../lib/uxStandards'

export type ActionTrayButton = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'destructive'
  loading?: boolean
  disabled?: boolean
}

type ActionTrayProps = {
  visible: boolean
  title: string
  message?: string
  buttons: ActionTrayButton[]
  onClose: () => void
  size?: TraySize
  dismissible?: boolean
}

const getButtonStyle = (variant: ActionTrayButton['variant']) => {
  const resolved = variant || 'secondary'
  if (resolved === 'primary') {
    return { backgroundColor: EMBER.accent, textColor: EMBER.onGradient }
  }
  if (resolved === 'destructive') {
    return { backgroundColor: EMBER.destructive, textColor: EMBER.textPrimary }
  }
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
}: ActionTrayProps) {
  const config = TRAY_SPECS[size]
  const [opacity] = useState(() => new Animated.Value(0))
  const [translateY] = useState(() => new Animated.Value(40))
  const reduceMotion = useReducedMotion()

  /*
   * Arrives on an ease-out: fast at the start, where the eye is, settling at
   * the end. Core Animated's default is ease-in-out, which spends the first
   * frames barely moving. Reduce Motion keeps the fade and drops the 40pt rise.
   * The exit is the Modal's own fade.
   */
  useEffect(() => {
    if (!visible) return
    const easing = Easing.bezier(...MOTION_EASING.entrance)
    opacity.setValue(0)
    translateY.setValue(reduceMotion ? 0 : 40)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: MOTION_DURATION.fast, easing, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: MOTION_DURATION.normal, easing, useNativeDriver: true }),
    ]).start()
  }, [visible, opacity, translateY, reduceMotion])

  const canDismiss = dismissible && !buttons.some((button) => button.loading)

  const buttonRows = useMemo(() => {
    if (buttons.length <= 2) return [buttons]
    return [buttons.slice(0, 2), buttons.slice(2)]
  }, [buttons])

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (canDismiss) onClose()
      }}
    >
      <View style={styles.fullscreen}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (canDismiss) onClose()
          }}
        />
        <Animated.View
          style={[
            styles.tray,
            {
              marginTop: config.topInset,
              maxHeight: `${Math.round(config.maxHeightPercent * 100)}%`,
              paddingHorizontal: config.horizontalPadding,
              borderTopLeftRadius: config.cornerRadius,
              borderTopRightRadius: config.cornerRadius,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.buttonsWrap}>
            {buttonRows.map((row, rowIndex) => (
              <View style={styles.buttonRow} key={`row-${rowIndex}`}>
                {row.map((button, buttonIndex) => {
                  const style = getButtonStyle(button.variant)
                  const isDisabled = !!button.disabled || !!button.loading
                  return (
                    <TouchableOpacity
                      key={`${button.label}-${buttonIndex}`}
                      onPress={button.onPress}
                      disabled={isDisabled}
                      activeOpacity={0.86}
                      style={[
                        styles.button,
                        { backgroundColor: style.backgroundColor },
                        isDisabled && styles.buttonDisabled,
                      ]}
                    >
                      {button.loading ? (
                        <ActivityIndicator size="small" color={style.textColor} />
                      ) : (
                        <Text style={[styles.buttonText, { color: style.textColor }]}>{button.label}</Text>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: EMBER.backdrop,
  },
  tray: {
    width: '100%',
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xl,
    gap: SPACE.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: EMBER_RADIUS.pill,
    alignSelf: 'center',
    backgroundColor: EMBER.textTertiary,
    marginBottom: SPACE.sm,
  },
  title: {
    ...TYPE.title,
  },
  message: {
    ...TYPE.body,
    color: EMBER.textSecondary,
  },
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...TYPE.button,
  },
})
