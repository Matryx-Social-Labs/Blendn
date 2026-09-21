import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Typography } from './Typography'
import { APP_COLORS } from '../lib/theme'

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
          <Typography variant="h3" style={styles.chatHeaderTitle} numberOfLines={1}>
            {groupName}
          </Typography>
          {participantCount && (
            <Typography variant="caption" style={styles.chatHeaderSubtitle}>
              {participantCount} members
            </Typography>
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
 * Only ever rendered one way — transparent, over the root's gradient
 * background, light text. There used to be a `variant` prop with a light-mode
 * branch (`#FFFFFF` background, dark text); nothing in the app renders it and
 * there's no dark-mode toggle to reach it, so it was dead code pretending to
 * be a feature.
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

  return (
    <View style={[
      {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
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
            <Ionicons name="chevron-back" size={24} color={APP_COLORS.textPrimary} />
          </Pressable>
        ) : null}

        {/* Title */}
        <View style={[styles.titleWrap, centerTitle && styles.centerTitle]}>
          <Typography
            variant="h2"
            style={[styles.title, { color: APP_COLORS.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Typography>
          {!!subtitle && (
            <Typography
              variant="caption"
              style={[styles.subtitle, { color: '#E6E6E6' }]}
              numberOfLines={1}
            >
              {subtitle}
            </Typography>
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
              <ActivityIndicator size="small" color={APP_COLORS.textPrimary} />
            ) : (
              <Typography variant="button" uppercaseButton style={styles.ctaText}>{rightTextButton.label}</Typography>
            )}
          </Pressable>
        ) : rightIconButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightIconButton.accessibilityLabel || 'Action'}
            onPress={rightIconButton.onPress}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name={rightIconButton.name} size={24} color={APP_COLORS.textPrimary} />
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
    backgroundColor: APP_COLORS.accent,
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
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.6,
  },
})

export { ChatHeader, AppHeader as default, SegmentedControl }


