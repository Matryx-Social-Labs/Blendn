import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import Typography from './Typography'
import GlassSurface from './ui/GlassSurface'
import { APP_COLORS, APP_RADIUS } from '../lib/theme'

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

type HeaderVariant = 'light' | 'darkTransparent' | 'glass'

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

  const isDark = variant === 'darkTransparent' || variant === 'glass'
  const isGlass = variant === 'glass'
  const iconColor = isDark ? APP_COLORS.textPrimary : '#333333'
  const titleColor = isDark ? APP_COLORS.textPrimary : '#333333'
  const subtitleColor = isDark ? APP_COLORS.textSecondary : '#666666'

  const headerContent = (
    <View style={[
      {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 12,
        // Let background gradient from root show through on darkTransparent; glass supplies its own tint via GlassSurface.
        backgroundColor: isGlass ? 'transparent' : isDark ? 'transparent' : '#FFFFFF',
        shadowOpacity: 0,
        elevation: 0,
        borderBottomWidth: showBottomBorder && !isDark ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: isDark ? APP_COLORS.separator : '#f0f0f0',
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
          <Typography
            variant="h4"
            style={[styles.title, { color: titleColor }]}
            numberOfLines={1}
          >
            {title}
          </Typography>
          {!!subtitle && (
            <Typography
              variant="caption"
              style={[styles.subtitle, { color: subtitleColor }]}
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
              <ActivityIndicator size="small" color="#FFFFFF" />
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
            <Ionicons name={rightIconButton.name} size={24} color={iconColor} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )

  if (isGlass) {
    return (
      <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false}>
        {headerContent}
      </GlassSurface>
    )
  }

  return headerContent
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
    backgroundColor: APP_COLORS.backgroundCard,
    borderRadius: APP_RADIUS.pill,
    padding: 6,
    alignSelf: 'flex-start',
  },
  segmentedItem: {
    paddingHorizontal: 32,
    paddingVertical: 8,
    borderRadius: APP_RADIUS.pill,
    alignItems: 'center',
  },
  segmentedItemActive: {
    backgroundColor: APP_COLORS.backgroundInput,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  segmentedText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: APP_COLORS.textSecondary,
  },
  segmentedTextActive: {
    color: APP_COLORS.accent,
  },

  // ChatHeader styles
  chatHeaderContainer: {
    backgroundColor: APP_COLORS.backgroundBase,
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
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
  },
  chatHeaderSubtitle: {
    color: APP_COLORS.textSecondary,
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
  title: {},
  titleShadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    marginTop: 2,
  },
  ctaBtn: {
    backgroundColor: APP_COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: APP_RADIUS.pill,
    minWidth: 60,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: APP_COLORS.onAccent,
  },
  pressed: {
    opacity: 0.6,
  },
})

export { ChatHeader, AppHeader as default, SegmentedControl }


