import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { width: screenWidth } = useWindowDimensions();
  const pillWidth = Math.min(340, Math.max(260, screenWidth - 24));
  const pillHeight = 56;
  const computedIconSize = Math.max(20, Math.min(26, Math.round(pillHeight * 0.42)));

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Full-width dark purple band behind the pill */}
      <LinearGradient
        colors={[ '#1C0A2B', '#180826' ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fullWidthBg, { width: pillWidth + 28, height: pillHeight + 20, borderRadius: 1000 }]}
      />
      <View style={[styles.glowOuter, { width: pillWidth, height: pillHeight }]} />
      <View style={[styles.glowInner, { width: pillWidth, height: pillHeight }]} />
      <LinearGradient
        colors={[ 'rgba(114,23,179,0.55)', 'rgba(114,23,179,0.45)' ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.pillContainer, { width: pillWidth, height: pillHeight }]}
      >
        {/* Background effects UNDER content */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <BlurView tint="dark" intensity={35} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={[ 'rgba(0,0,0,0)', 'rgba(0,0,0,0.20)' ]}
            start={{ x: 0.5, y: 0.4 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.bottomShade}
          />
        </View>

        {/* Content ABOVE blur */}
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
            const iconSize = computedIconSize;
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
                <View style={styles.iconLabelWrap}>
                  <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
                    <Ionicons name={iconName} size={iconSize} color={iconColor} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Foreground effects ABOVE content */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[ 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0)' ]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.topGloss}
          />
          <LinearGradient
            colors={[ 'rgba(114,23,179,0.22)', 'rgba(255,255,255,0)' ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGlintLeft}
          />
          <LinearGradient
            colors={[ 'rgba(255,255,255,0)', 'rgba(114,23,179,0.22)' ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sideGlintRight}
          />
        </View>
      </LinearGradient
      >
    </View>
  );
}

export default function TabLayout() {
  const guardRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (guardRef.current) return;
      guardRef.current = true;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Root layout will handle auth redirect
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarded')
          .eq('id', user.id)
          .maybeSingle();
        const onboarded = !!profile && profile.onboarded === true && !error;
        if (!onboarded && !cancelled) {
          router.replace('/onboarding/welcome');
        }
      } finally {
        setTimeout(() => { guardRef.current = false; }, 200);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

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
    zIndex: 100,
  },
  fullWidthBg: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
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
        shadowColor: 'rgba(114,23,179,1)',
        shadowOpacity: 0.35,
        shadowRadius: 24,
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
        shadowColor: 'rgba(114,23,179,1)',
        shadowOpacity: 0.20,
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
    height: 56,
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
    height: 44,
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    height: 28,
    width: 44,
    borderRadius: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)'
  },
  stroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
  },
  bottomShade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  sideGlintLeft: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 10,
  },
  sideGlintRight: {
    position: 'absolute',
    right: 0,
    top: 6,
    bottom: 6,
    width: 10,
  },
});