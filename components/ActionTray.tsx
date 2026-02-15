import React, { useEffect, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { APP_COLORS, APP_CTA, APP_RADIUS, APP_SIZE, APP_SPACING } from '../lib/theme'
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

const getButtonStyle = (variant: ActionTrayButton['variant'], disabled?: boolean) => {
  const resolved = variant || 'secondary'
  if (resolved === 'primary') {
    return {
      backgroundColor: disabled ? APP_CTA.primary.disabled : APP_CTA.primary.background,
      borderColor: 'transparent',
      textColor: APP_CTA.primary.text,
    }
  }
  if (resolved === 'destructive') {
    return {
      backgroundColor: disabled ? APP_CTA.destructive.disabled : APP_CTA.destructive.background,
      borderColor: 'transparent',
      textColor: APP_CTA.destructive.text,
    }
  }
  return {
    backgroundColor: disabled ? APP_CTA.secondary.disabled : APP_CTA.secondary.background,
    borderColor: APP_CTA.secondary.border,
    textColor: APP_CTA.secondary.text,
  }
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
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(40)).current

  useEffect(() => {
    if (!visible) return
    opacity.setValue(0)
    translateY.setValue(40)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [visible, opacity, translateY])

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
                  const style = getButtonStyle(button.variant, button.disabled || button.loading)
                  const isDisabled = !!button.disabled || !!button.loading
                  return (
                    <TouchableOpacity
                      key={`${button.label}-${buttonIndex}`}
                      onPress={button.onPress}
                      disabled={isDisabled}
                      activeOpacity={0.86}
                      style={[
                        styles.button,
                        {
                          backgroundColor: style.backgroundColor,
                          borderColor: style.borderColor,
                        },
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  tray: {
    width: '100%',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    paddingTop: APP_SPACING.xs,
    paddingBottom: APP_SPACING.xl,
    gap: APP_SPACING.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: APP_RADIUS.pill,
    alignSelf: 'center',
    backgroundColor: APP_COLORS.separator,
    marginBottom: APP_SPACING.xs,
  },
  title: {
    color: APP_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: APP_COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  buttonsWrap: {
    gap: APP_SPACING.xs,
    marginTop: APP_SPACING.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: APP_SPACING.xs,
  },
  button: {
    minHeight: APP_SIZE.touchTarget,
    flex: 1,
    borderRadius: APP_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: APP_SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
})
