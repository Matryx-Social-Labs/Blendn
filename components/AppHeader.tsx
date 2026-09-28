import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Text } from './ui/Text'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE } from '../lib/theme'

interface RightIconButton {
  name: keyof typeof Ionicons.glyphMap
  onPress: () => void
  accessibilityLabel?: string
}

interface RightTextButton {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}

interface AppHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  rightIconButton?: RightIconButton
  rightTextButton?: RightTextButton
  centerTitle?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

/**
 * Only ever rendered one way — transparent, over the root's flat `EMBER.bg`,
 * light text. There used to be a `variant` prop with a light-mode
 * branch (`#FFFFFF` background, dark text); nothing in the app renders it and
 * there's no dark-mode toggle to reach it, so it was dead code pretending to
 * be a feature. `ChatHeader` and `SegmentedControl` went the same way: both
 * chat screens draw their own header, and nothing imported either.
 */
export function AppHeader(props: AppHeaderProps) {
  const {
    title,
    subtitle,
    onBack,
    rightIconButton,
    rightTextButton,
    centerTitle = false,
    containerStyle,
  } = props

  const textButtonInactive = !!rightTextButton?.disabled || !!rightTextButton?.loading

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.row}>
        {/* Back button or left spacer */}
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        ) : null}

        {/* Title */}
        <View style={[styles.titleWrap, centerTitle && styles.centerTitle]}>
          {/*
            The screen's name, announced as a header so a screen reader can
            jump to it. One line: a long name ("Contact support" at a large
            text size) shrinks to fit rather than being cut off with "…", and
            the display role's 1.2 cap keeps it from wrapping the bar.
          */}
          <Text
            variant="display"
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text variant="meta" style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right */}
        {rightTextButton ? (
          <Pressable
            disabled={textButtonInactive}
            onPress={rightTextButton.onPress}
            accessibilityRole="button"
            accessibilityLabel={rightTextButton.label}
            accessibilityState={{ disabled: textButtonInactive, busy: !!rightTextButton.loading }}
            style={({ pressed }) => [
              styles.ctaBtn,
              rightTextButton.disabled && !rightTextButton.loading && styles.ctaDisabled,
              pressed && styles.pressed,
            ]}
          >
            {rightTextButton.loading ? (
              <ActivityIndicator size="small" color={EMBER.onGradient} />
            ) : (
              <Text variant="button" color={EMBER.onGradient}>{rightTextButton.label}</Text>
            )}
          </Pressable>
        ) : rightIconButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightIconButton.accessibilityLabel || 'Action'}
            onPress={rightIconButton.onPress}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name={rightIconButton.name} size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // 12 plus the icon button's own 12 inset puts the chevron on the 24 gutter.
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: CONTROL.md,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  centerTitle: {
    alignItems: 'center',
  },
  subtitle: {
    marginTop: SPACE.xxs,
  },
  ctaBtn: {
    backgroundColor: EMBER.accent,
    paddingHorizontal: SPACE.lg,
    height: CONTROL.md,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    minWidth: CONTROL.md + SPACE.md,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: OPACITY.disabled,
  },
  pressed: {
    opacity: OPACITY.pressed,
  },
})

export { AppHeader as default }
