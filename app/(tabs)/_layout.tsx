import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Tabs } from 'expo-router'
import React, { memo, useCallback, useMemo } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { APP_COLORS } from '../../lib/theme'

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
  const iconSize = 22

  const iconName = useMemo((): keyof typeof Ionicons.glyphMap => {
    if (routeName === 'events') return isFocused ? 'home' : 'home-outline'
    if (routeName === 'match') return isFocused ? 'heart' : 'heart-outline'
    if (routeName === 'chat') return isFocused ? 'chatbubbles' : 'chatbubbles-outline'
    if (routeName === 'profile') return isFocused ? 'person' : 'person-outline'
    return 'ellipse'
  }, [routeName, isFocused])

  const accessibilityLabel = useMemo(() => {
    if (routeName === 'events') return 'Events tab'
    if (routeName === 'match') return 'Match tab'
    if (routeName === 'chat') return 'Chat tab'
    if (routeName === 'profile') return 'Profile tab'
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

const CustomTabBar = memo(({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets()

  const wrapperStyle = useMemo(
    () => [styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }],
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
    <View pointerEvents="box-none" style={wrapperStyle}>
      <View style={styles.pillContainer}>
        <View style={styles.itemsRow}>
          {state.routes.map((route, index) => {
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
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="match" options={{ title: 'Match' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pillContainer: {
    width: 352,
    height: 56,
    borderRadius: 1000,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.3,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  itemsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  item: {
    height: 44,
    width: 80,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFocused: {
    backgroundColor: 'rgba(10,132,255,0.18)',
  },
  itemPressed: {
    opacity: 0.75,
  },
})
