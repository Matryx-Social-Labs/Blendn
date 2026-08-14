import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { APP_COLORS, APP_RADIUS, APP_SPACING } from '../lib/theme'
import { TRAY_SPECS, type TraySize } from '../lib/uxStandards'
import GradientButton from './ui/GradientButton'

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
                {row.map((button, buttonIndex) => (
                  <GradientButton
                    key={`${button.label}-${buttonIndex}`}
                    label={button.label}
                    onPress={button.onPress}
                    variant={button.variant || 'secondary'}
                    loading={button.loading}
                    disabled={button.disabled}
                    style={styles.button}
                  />
                ))}
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
    flex: 1,
  },
})
