import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React, { memo, useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Memoized tab button to prevent re-renders
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
  const iconColor = '#FFFFFF';
  const iconSize = 26;

  const iconName = useMemo((): keyof typeof Ionicons.glyphMap => {
    if (routeName === 'events') return isFocused ? 'home' : 'home-outline';
    if (routeName === 'match') return isFocused ? 'heart' : 'heart-outline';
    if (routeName === 'chat') return isFocused ? 'chatbubbles' : 'chatbubbles-outline';
    if (routeName === 'profile') return isFocused ? 'person' : 'person-outline';
    return 'ellipse';
  }, [routeName, isFocused]);

  const accessibilityLabel = useMemo(() => {
    if (routeName === 'events') return 'Events tab';
    if (routeName === 'match') return 'Match tab';
    if (routeName === 'chat') return 'Chat tab';
    if (routeName === 'profile') return 'Profile tab';
    return 'Tab';
  }, [routeName]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Double tap to open tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      </View>
    </Pressable>
  );
});

TabButton.displayName = 'TabButton';

// Memoized tab bar to prevent re-renders during navigation
const CustomTabBar = memo(({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  // Memoize wrapper style
  const wrapperStyle = useMemo(() => [
    styles.wrapper,
    { paddingBottom: Math.max(insets.bottom, 8) }
  ], [insets.bottom]);

  // Create stable press handlers
  const createPressHandler = useCallback((routeKey: string, routeName: string, isFocused: boolean) => () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }, [navigation]);

  const createLongPressHandler = useCallback((routeKey: string) => () => {
    navigation.emit({
      type: 'tabLongPress',
      target: routeKey,
    });
  }, [navigation]);

  return (
    <View pointerEvents="box-none" style={wrapperStyle}>
      <View style={styles.glowOuter} />
      <View style={styles.glowInner} />
      <LinearGradient
        colors={[ '#6E1FD0', '#7E26CC' ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.pillContainer}
      >
        <View style={styles.itemsRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            return (
              <TabButton
                key={route.key}
                routeKey={route.key}
                routeName={route.name}
                isFocused={isFocused}
                onPress={createPressHandler(route.key, route.name, isFocused)}
                onLongPress={createLongPressHandler(route.key)}
              />
            );
          })}
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[ 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)' ]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topGloss}
          />
          <LinearGradient
            colors={[ 'rgba(0,0,0,0)', 'rgba(0,0,0,0.20)' ]}
            start={{ x: 0.5, y: 0.4 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomShade}
          />
          <View style={[styles.stroke, { borderColor: 'rgba(255,255,255,0.80)' }]} />
        </View>
      </LinearGradient>
    </View>
  );
});

CustomTabBar.displayName = 'CustomTabBar';

export default function TabLayout() {
  // Onboarding check removed - root layout already handles this
  // This prevents duplicate profile fetches on app startup

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: 'transparent' },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="match" options={{ title: 'Match' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  glowOuter: {
    position: 'absolute',
    bottom: 16,
    width: 352,
    height: 51,
    borderRadius: 1000,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'rgb(139, 92, 246)',
        shadowOpacity: 0.55,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  glowInner: {
    position: 'absolute',
    bottom: 16,
    width: 352,
    height: 51,
    borderRadius: 1000,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'rgb(139, 92, 246)',
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  pillContainer: {
    width: 352,
    paddingHorizontal: 20,
    paddingVertical: 6,
    height: 51,
    borderRadius: 1000,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  item: {
    height: 39,
    width: 73,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    height: 39,
    width: 56,
    borderRadius: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)'
  },
  stroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topGloss: {},
  bottomShade: {},
  sideGlintLeft: {},
  sideGlintRight: {},
});
