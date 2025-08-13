import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.pillShadow} />
      <View style={styles.pillShadowSmall} />
      <BlurView intensity={20} tint="light" style={styles.pillContainer}>
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

            const iconColor = '#333333';
            const iconSize = 24;
            let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
            if (route.name === 'events') iconName = isFocused ? 'calendar' : 'calendar-outline';
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
                style={({ pressed }) => [
                  styles.item,
                  (isFocused || pressed) && styles.itemActive,
                ]}
              >
                <Ionicons name={iconName} size={iconSize} color={iconColor} />
              </Pressable>
            );
          })}
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.tint} />
          <View style={styles.glassOverlay} />
        </View>
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: 'transparent' },
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
  pillShadow: {
    position: 'absolute',
    bottom: 16,
    width: 352,
    height: 51,
    borderRadius: 1000,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,0.12)',
        shadowOpacity: 1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 1 },
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  pillShadowSmall: {
    position: 'absolute',
    bottom: 18,
    width: 352,
    height: 51,
    borderRadius: 1000,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,0.10)',
        shadowOpacity: 1,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 2,
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
    backgroundColor: 'rgba(255,255,255,0.5)',
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
  itemActive: {
    backgroundColor: '#EDEDED',
  },
  tint: {
    borderRadius: 1000,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  glassOverlay: {
    borderRadius: 296,
    backgroundColor: 'transparent',
  },
});