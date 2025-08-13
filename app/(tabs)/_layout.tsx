import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.pillShadow} />
      <View style={styles.pillShadowSmall} />
      <BlurView intensity={50} tint="default" style={[styles.pillContainer, isDark ? styles.pillDark : styles.pillLight]}>
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

            const iconColor = isDark ? '#F1F1F1' : '#333333';
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
                  (isFocused || pressed) && (isDark ? styles.itemActiveDark : styles.itemActiveLight),
                ]}
              >
                <Ionicons name={iconName} size={iconSize} color={iconColor} />
              </Pressable>
            );
          })}
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topGloss}
          />
          <LinearGradient
            colors={isDark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.10)'] : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.06)']}
            start={{ x: 0.5, y: 0.3 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomShade}
          />
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGlintLeft}
          />
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 1, y: 0.5 }}
            end={{ x: 0, y: 0.5 }}
            style={styles.sideGlintRight}
          />
          <View style={[styles.stroke, { borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.45)' }]} />
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
    backgroundColor: 'transparent',
  },
  pillLight: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  pillDark: {
    backgroundColor: 'rgba(16,16,16,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
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
  itemActiveLight: {
    backgroundColor: 'rgba(255,255,255,0.60)',
  },
  itemActiveDark: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  stroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topGloss: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
  },
  bottomShade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
  },
  sideGlintLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    borderTopLeftRadius: 1000,
    borderBottomLeftRadius: 1000,
  },
  sideGlintRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
    borderTopRightRadius: 1000,
    borderBottomRightRadius: 1000,
  },
});