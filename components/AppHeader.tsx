import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type HeaderVariant = 'light' | 'darkTransparent'

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
  variant?: HeaderVariant
  showBottomBorder?: boolean
  centerTitle?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export function AppHeader(props: AppHeaderProps) {
  const {
    title,
    subtitle,
    onBack,
    rightIconButton,
    rightTextButton,
    variant = 'light',
    showBottomBorder = true,
    centerTitle = true,
    containerStyle,
  } = props

  const insets = useSafeAreaInsets()
  const isDark = variant === 'darkTransparent'
  const iconColor = isDark ? '#FFFFFF' : '#333333'
  const titleColor = isDark ? '#FFFFFF' : '#333333'
  const subtitleColor = isDark ? '#E6E6E6' : '#666666'

  return (
    <View style={[
      {
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: isDark ? 'transparent' : '#FFFFFF',
        borderBottomWidth: showBottomBorder && !isDark ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: '#f0f0f0',
      },
      containerStyle,
    ]}>
      <View style={styles.row}>
        {/* Left */}
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, isDark && styles.iconBtnDark, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={24} color={iconColor} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}

        {/* Title */}
        <View style={[styles.titleWrap, centerTitle && styles.centerTitle]}>
          <Text
            style={[styles.title, { color: titleColor }, isDark && styles.titleShadow]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.subtitle, { color: subtitleColor }, isDark && styles.titleShadow]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right */}
        {rightTextButton ? (
          <Pressable
            disabled={!!rightTextButton.disabled || !!rightTextButton.loading}
            onPress={rightTextButton.onPress}
            style={({ pressed }) => [styles.ctaBtn, (rightTextButton.disabled || rightTextButton.loading) && styles.ctaDisabled, pressed && styles.pressed]}
          >
            {rightTextButton.loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{rightTextButton.label}</Text>
            )}
          </Pressable>
        ) : rightIconButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightIconButton.accessibilityLabel || 'Action'}
            onPress={rightIconButton.onPress}
            style={({ pressed }) => [styles.iconBtn, isDark && styles.iconBtnDark, pressed && styles.pressed]}
          >
            <Ionicons name={rightIconButton.name} size={22} color={iconColor} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDark: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
  },
  titleWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  centerTitle: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  titleShadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  ctaBtn: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
})

export default AppHeader


