import React from 'react'
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { APP_CTA, APP_RADIUS, APP_SIZE, APP_SPACING } from '../../lib/theme'

export type GradientButtonVariant = 'primary' | 'secondary' | 'destructive'

interface GradientButtonProps {
  label: string
  onPress: () => void
  variant?: GradientButtonVariant
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  fullWidth?: boolean
}

const getStyle = (variant: GradientButtonVariant, disabled: boolean) => {
  if (variant === 'primary') {
    return {
      gradient: disabled ? APP_CTA.primary.disabledGradient : APP_CTA.primary.gradient,
      backgroundColor: undefined as string | undefined,
      borderColor: 'transparent',
      textColor: APP_CTA.primary.text,
    }
  }
  if (variant === 'destructive') {
    return {
      gradient: undefined,
      backgroundColor: disabled ? APP_CTA.destructive.disabled : APP_CTA.destructive.background,
      borderColor: 'transparent',
      textColor: APP_CTA.destructive.text,
    }
  }
  return {
    gradient: undefined,
    backgroundColor: disabled ? APP_CTA.secondary.disabled : APP_CTA.secondary.background,
    borderColor: APP_CTA.secondary.border,
    textColor: APP_CTA.secondary.text,
  }
}

// Reusable CTA button: gradient pill for `primary`, flat fill for `secondary`/`destructive`.
// Extracted from the inline gradient-button markup that used to live in ActionTray.tsx.
export default function GradientButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
}: GradientButtonProps) {
  const isDisabled = disabled || loading
  const resolved = getStyle(variant, isDisabled)
  const content = loading ? (
    <ActivityIndicator size="small" color={resolved.textColor} />
  ) : (
    <Text style={[styles.text, { color: resolved.textColor }]}>{label}</Text>
  )

  if (resolved.gradient) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.86}
        style={[styles.button, styles.gradientWrap, fullWidth && styles.fullWidth, isDisabled && styles.disabled, style]}
      >
        <LinearGradient colors={resolved.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientFill}>
          {content}
        </LinearGradient>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.86}
      style={[
        styles.button,
        { backgroundColor: resolved.backgroundColor, borderColor: resolved.borderColor },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: APP_SIZE.touchTarget,
    borderRadius: APP_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: APP_SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  gradientWrap: {
    borderWidth: 0,
    padding: 0,
    overflow: 'hidden',
  },
  gradientFill: {
    flex: 1,
    width: '100%',
    minHeight: APP_SIZE.touchTarget,
    borderRadius: APP_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: APP_SPACING.md,
  },
  disabled: {
    opacity: 0.7,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
  },
})
