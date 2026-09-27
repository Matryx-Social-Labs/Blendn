import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Text } from './ui/Text'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE, TYPE } from '../lib/theme'

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
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        )}

        {/* Center content */}
        <View style={styles.chatHeaderCenter}>
          <Text variant="heading" style={styles.chatHeaderTitle} numberOfLines={1}>
            {groupName}
          </Text>
          {participantCount && (
            <Text variant="meta" style={styles.chatHeaderSubtitle}>
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
            <Ionicons name="settings-outline" size={ICON.lg} color={EMBER.textPrimary} />
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
        // 12 plus the icon button's own 12 inset puts the chevron on the 24 gutter.
        paddingHorizontal: SPACE.md,
        paddingTop: SPACE.sm,
        paddingBottom: SPACE.md,
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
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        ) : null}

        {/* Title */}
        <View style={[styles.titleWrap, centerTitle && styles.centerTitle]}>
          <Text variant="display" numberOfLines={1}>
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
            disabled={!!rightTextButton.disabled || !!rightTextButton.loading}
            onPress={rightTextButton.onPress}
            style={({ pressed }) => [styles.ctaBtn, (rightTextButton.disabled || rightTextButton.loading) && styles.ctaDisabled, pressed && styles.pressed]}
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
  // SegmentedControl styles
  segmentedContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  segmentedPill: {
    flexDirection: 'row',
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
    overflow: 'hidden',
  },
  segmentedItem: {
    flex: 1,
    minHeight: CONTROL.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedItemActive: {
    backgroundColor: EMBER.surface,
  },
  segmentedText: {
    ...TYPE.bodyStrong,
    color: EMBER.textSecondary,
  },
  segmentedTextActive: {
    color: EMBER.textPrimary,
  },

  // ChatHeader styles
  chatHeaderContainer: {
    backgroundColor: EMBER.bg,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chatHeaderTitle: {
    textAlign: 'center',
  },
  chatHeaderSubtitle: {
    textAlign: 'center',
  },
  settingsButton: {
    width: CONTROL.md,
    height: CONTROL.md,
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
    minWidth: 60,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.6,
  },
})

export { ChatHeader, AppHeader as default, SegmentedControl }


