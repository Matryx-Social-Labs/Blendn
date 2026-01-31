import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../../lib/useAuth';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const iconColor = '#FFFFFF';
            const iconSize = 26;
            let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
            if (route.name === 'events') iconName = isFocused ? 'home' : 'home-outline';
            if (route.name === 'match') iconName = isFocused ? 'heart' : 'heart-outline';
            if (route.name === 'chat') iconName = isFocused ? 'chatbubbles' : 'chatbubbles-outline';
            if (route.name === 'profile') iconName = isFocused ? 'person' : 'person-outline';

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
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
}

export default function TabLayout() {
  const guardRef = useRef<boolean>(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (guardRef.current || loading) return;
      guardRef.current = true;
      try {
        if (!user) return; // Root layout will handle auth redirect
        const result = await apiClient.getProfile(user.id);
        const profile = result.data;
        const onboarded = result.success && profile?.onboarded === true;
        if (!onboarded && !cancelled) {
          router.replace('/onboarding/welcome');
        }
      } finally {
        setTimeout(() => { guardRef.current = false; }, 200);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user, loading]);

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