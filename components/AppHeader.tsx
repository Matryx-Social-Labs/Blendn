import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'

interface ChatHeaderProps {
  groupName: string
  participantCount?: number
  onBack?: () => void
  onSettings?: () => void
}

interface SegmentedControlProps {
  options: string[]
  selectedIndex: number
  onSelectionChange: (index: number) => void
}

function SegmentedControl({ options, selectedIndex, onSelectionChange }: SegmentedControlProps) {
  return (
    <View style={styles.segmentedContainer}>
      <View style={styles.segmentedPill}>
        {options.map((option, index) => (
          <Pressable
            key={index}
            onPress={() => onSelectionChange(index)}
            style={[
              styles.segmentedItem,
              index === selectedIndex && styles.segmentedItemActive
            ]}
          >
            <Text style={[
              styles.segmentedText,
              index === selectedIndex && styles.segmentedTextActive
            ]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function ChatHeader({ groupName, participantCount, onBack, onSettings }: ChatHeaderProps) {
  return (
    <View style={[styles.chatHeaderContainer, { paddingTop: 0 }]}>
      <View style={styles.chatHeaderRow}>
        {/* Back button */}
        {onBack && (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
        )}

        {/* Center content */}
        <View style={styles.chatHeaderCenter}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            {groupName}
          </Text>
          {participantCount && (
            <Text style={styles.chatHeaderSubtitle}>
              {participantCount} members
            </Text>
          )}
        </View>

        {/* Settings button */}
        {onSettings && (
          <Pressable
            onPress={onSettings}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </View>
  )
}

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
    variant = 'darkTransparent',
    showBottomBorder = false,
    centerTitle = false,
    containerStyle,
  } = props

  const isDark = variant === 'darkTransparent'
  const iconColor = isDark ? '#FFFFFF' : '#333333'
  const titleColor = isDark ? '#FFFFFF' : '#333333'
  const subtitleColor = isDark ? '#E6E6E6' : '#666666'

  return (
    <View style={[
      {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 12,
      
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderBottomWidth: showBottomBorder && !isDark ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: '#f0f0f0',
      },
      containerStyle,
    ]}>
      <View style={styles.row}>
        {/* Back button or left spacer */}
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={iconColor} />
          </Pressable>
        ) : null}

        {/* Title */}
        <View style={[styles.titleWrap, centerTitle && styles.centerTitle]}>
          <Text
            style={[styles.title, { color: titleColor }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.subtitle, { color: subtitleColor }]}
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
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name={rightIconButton.name} size={24} color={iconColor} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // SegmentedControl styles
  segmentedContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  segmentedPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentedItemActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segmentedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CFCFCF',
  },
  segmentedTextActive: {
    color: '#FFFFFF',
  },

  // ChatHeader styles
  chatHeaderContainer: {
    backgroundColor: '#000000',
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  chatHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // AppHeader styles
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
  },
  centerTitle: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
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

export { ChatHeader, AppHeader as default, SegmentedControl }


