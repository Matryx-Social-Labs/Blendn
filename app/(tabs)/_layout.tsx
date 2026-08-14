import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { Tabs } from 'expo-router'
import React, { memo, useCallback, useMemo } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import GlassSurface from '../../components/ui/GlassSurface'
import { useToast } from '../../components/Toast'
import { APP_COLORS } from '../../lib/theme'

// Tab labels/icons follow Figma's "The Pulse" bottom nav (Feed/Explore/Circles/Me) — the
// underlying routes/features are unchanged, only the label+icon mapping was relabeled.
const TabButton = memo(({
  routeKey,
  routeName,
  isFocused,
  onPress,
  onLongPress
}: {
  routeKey: string
  routeName: string
  isFocused: boolean
  onPress: () => void
  onLongPress: () => void
}) => {
  const iconSize = TAB_ICON_SIZE

  const iconName = useMemo((): keyof typeof Ionicons.glyphMap => {
    if (routeName === 'events') return isFocused ? 'home' : 'home-outline'
    if (routeName === 'match') return isFocused ? 'compass' : 'compass-outline'
    if (routeName === 'chat') return isFocused ? 'people' : 'people-outline'
    if (routeName === 'profile') return isFocused ? 'person' : 'person-outline'
    return 'ellipse'
  }, [routeName, isFocused])

  const accessibilityLabel = useMemo(() => {
    if (routeName === 'events') return 'Feed tab'
    if (routeName === 'match') return 'Explore tab'
    if (routeName === 'chat') return 'Circles tab'
    if (routeName === 'profile') return 'Me tab'
    return 'Tab'
  }, [routeName])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Double tap to open tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.item,
        isFocused && styles.itemFocused,
        pressed && styles.itemPressed,
      ]}
    >
      <Ionicons
        name={iconName}
        size={iconSize}
        color={isFocused ? APP_COLORS.accent : APP_COLORS.textSecondary}
      />
    </Pressable>
  )
})

TabButton.displayName = 'TabButton'

// The center "+" rendered as a normal 5th item in the row — same size/slot as the other
// 4, just filled with the gradient — no raised/floating treatment.
const PlusButton = memo(({ onPress }: { onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Quick action"
    onPress={onPress}
    style={({ pressed }) => [styles.plusItem, pressed && styles.itemPressed]}
  >
    <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plusItemGradient}>
      <Ionicons name="add" size={TAB_ICON_SIZE} color={APP_COLORS.onAccent} />
    </LinearGradient>
  </Pressable>
))
PlusButton.displayName = 'PlusButton'

const CustomTabBar = memo(({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()

  // Icon row is absolutely centered within the bar (mirroring Figma's own
  // `top: calc(50% - 8px)` technique) so it stays vertically centered regardless of how
  // much of the bar's total height the safe-area inset ends up consuming.
  const barStyle = useMemo(
    () => [styles.bar, { height: COMPACT_BAR_HEIGHT + Math.max(insets.bottom, 6) }],
    [insets.bottom]
  )

  const createPressHandler = useCallback(
    (routeKey: string, routeName: string, isFocused: boolean) => () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      })
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName)
      }
    },
    [navigation]
  )

  const createLongPressHandler = useCallback(
    (routeKey: string) => () => {
      navigation.emit({
        type: 'tabLongPress',
        target: routeKey,
      })
    },
    [navigation]
  )

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <GlassSurface intensity={20} tint="rgba(27,25,25,0.9)" borderRadius={0} bordered={false} style={styles.glassBar}>
        <View style={barStyle}>
          <View style={styles.itemsRow}>
            {state.routes.slice(0, 2).map((route, index) => {
              const isFocused = state.index === index
              return (
                <TabButton
                  key={route.key}
                  routeKey={route.key}
                  routeName={route.name}
                  isFocused={isFocused}
                  onPress={createPressHandler(route.key, route.name, isFocused)}
                  onLongPress={createLongPressHandler(route.key)}
                />
              )
            })}
            <PlusButton onPress={() => showToast('Coming soon', 'info')} />
            {state.routes.slice(2).map((route) => {
              const index = state.routes.indexOf(route)
              const isFocused = state.index === index
              return (
                <TabButton
                  key={route.key}
                  routeKey={route.key}
                  routeName={route.name}
                  isFocused={isFocused}
                  onPress={createPressHandler(route.key, route.name, isFocused)}
                  onLongPress={createLongPressHandler(route.key)}
                />
              )
            })}
          </View>
        </View>
      </GlassSurface>
    </View>
  )
})

CustomTabBar.displayName = 'CustomTabBar'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: APP_COLORS.backgroundBase },
        sceneStyle: { backgroundColor: APP_COLORS.backgroundBase },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="events" options={{ title: 'Feed' }} />
      <Tabs.Screen name="match" options={{ title: 'Explore' }} />
      <Tabs.Screen name="chat" options={{ title: 'Circles' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
  )
}

const ITEM_SIZE = 44
const COMPACT_BAR_HEIGHT = 44
const ITEM_ROW_HEIGHT = ITEM_SIZE
const TAB_ICON_SIZE = 24

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  glassBar: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    ...Platform.select({
      ios: {
        shadowColor: APP_COLORS.accent,
        shadowOpacity: 0.06,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: -10 },
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  bar: {
    width: '100%',
    position: 'relative',
  },
  // Flat row of exactly 5 same-size items (4 tabs + the "+"), evenly spaced end to end —
  // no groups, no raised/floating element, no reserved gaps.
  itemsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: ITEM_ROW_HEIGHT,
    marginTop: -ITEM_ROW_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
  },
  item: {
    height: ITEM_SIZE,
    width: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFocused: {
    backgroundColor: 'rgba(255,144,109,0.18)',
  },
  itemPressed: {
    opacity: 0.75,
  },
  plusItem: {
    height: ITEM_SIZE,
    width: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    overflow: 'hidden',
  },
  plusItemGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
