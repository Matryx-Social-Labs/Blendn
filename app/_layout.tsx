import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, usePathname } from "expo-router";
import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../lib/globalText';
import { GradientOverlayProvider } from '../lib/gradientOverlay';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationListener,
    setupNotificationResponseListener
} from '../lib/notifications';
import { apiClient } from '../lib/apiClient';
import { initSocketWithAppState, cleanup as cleanupSocket, disconnect as disconnectSocket } from '../lib/socketClient';
import { useAuth } from '../lib/useAuth';

const ONBOARDED_CACHE_KEY = 'user_onboarded_status';
const LOGO_ASSET = require('../assets/logo/logo2.webp');
const PLACEHOLDER_ASSET = require('../assets/images/icon.png');

function BackgroundGradient() {
  return (
    <View style={styles.bg} pointerEvents="none">
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Overlay for future animated darkening if needed */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0 }]} />
    </View>
  );
}

export default function RootLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const lastRedirectRef = useRef<string | null>(null);
  const pushInitRef = useRef<boolean>(false);
  const isNavigatingRef = useRef<boolean>(false);

  useEffect(() => {
    Asset.loadAsync([LOGO_ASSET, PLACEHOLDER_ASSET]).catch(() => {});
  }, []);

  const replaceIfNeeded = (target: string) => {
    if (isNavigatingRef.current) return;
    if (!target) return;
    if (pathname === target) return;
    if (lastRedirectRef.current === target) return;
    isNavigatingRef.current = true;
    lastRedirectRef.current = target;
    router.replace(target as any);
    // Release the guard shortly after navigation; also resets on path change via effect deps
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 200);
  };

  useEffect(() => {
    // Set up notification listeners once
    const notificationListener = setupNotificationListener();
    const responseListener = setupNotificationResponseListener();

    return () => {
      notificationListener?.remove?.();
      responseListener?.remove?.();
    };
  }, []);

  // Socket connection management
  useEffect(() => {
    if (loading) return;

    if (user) {
      // User authenticated - initialize socket with app state management
      initSocketWithAppState();
    } else {
      // User logged out - disconnect socket
      disconnectSocket();
    }

    return () => {
      // Cleanup on unmount
      cleanupSocket();
    };
  }, [user, loading]);

  useEffect(() => {
    if (loading) return;
    const run = async () => {
      const isOnboarding = !!pathname && pathname.startsWith('/onboarding');
      const isIndex = pathname === '/' || pathname === '/index';

      if (!user) {
        // Not authenticated → send to login index, unless already there
        if (!isIndex) {
          replaceIfNeeded('/');
        }
        // Also remove push token best-effort
        removePushTokenFromProfile().catch(() => {});
        // Reset push init flag for next sign-in
        pushInitRef.current = false;
        return;
      }

      // Authenticated → defer push notification init to avoid blocking startup
      if (!pushInitRef.current) {
        pushInitRef.current = true;
        // Delay push init by 2 seconds to let UI render first
        setTimeout(() => {
          initializePushNotifications().catch(() => {});
        }, 2000);
      }

      // Check onboarding status with caching for faster startup
      let onboarded = false;
      try {
        // First check cached value for instant navigation
        const cachedStatus = await AsyncStorage.getItem(`${ONBOARDED_CACHE_KEY}_${user.id}`);
        if (cachedStatus === 'true') {
          onboarded = true;
          // Background refresh (non-blocking) - only refresh if cache exists
          apiClient.getProfile(user.id).then((result) => {
            if (result.success && result.data) {
              const freshOnboarded = result.data.profile?.onboarded === true;
              AsyncStorage.setItem(`${ONBOARDED_CACHE_KEY}_${user.id}`, String(freshOnboarded));
              // If status changed to not-onboarded, redirect
              if (!freshOnboarded) {
                router.replace('/onboarding/welcome');
              }
            }
          }).catch(() => {});
        } else {
          // No cache - single API call (first-time users only)
          const result = await apiClient.getProfile(user.id);
          if (result.success && result.data) {
            onboarded = result.data.profile?.onboarded === true;
            AsyncStorage.setItem(`${ONBOARDED_CACHE_KEY}_${user.id}`, String(onboarded));
          }
        }
      } catch {
        onboarded = false;
      }

      if (!onboarded) {
        const target = '/onboarding/welcome';
        if (!isOnboarding) {
          replaceIfNeeded(target);
        }
        return;
      }

      // Onboarded users should not stay on onboarding or index
      if (isOnboarding || isIndex) {
        const target = '/(tabs)/events';
        replaceIfNeeded(target);
      } else {
        // Clear last target if user navigated to a normal screen
        lastRedirectRef.current = null;
      }
    };

    run();
  }, [user, loading, pathname]);

  // Normalize Android hardware back behavior
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      const isOnboarding = !!pathname && pathname.startsWith('/onboarding');
      const isIndex = pathname === '/' || pathname === '/index';
      const isTabsRoot = pathname?.startsWith('/(tabs)');

      // Block back on login, onboarding, and tabs root
      if (isIndex || isOnboarding || isTabsRoot) {
        return true; // prevent default
      }
      // Otherwise perform a normal back
      try { router.back(); } catch {}
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      try { sub.remove(); } catch {}
    };
  }, [pathname, loading]);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Could send error to crash reporting service here
        console.error('Root layout error:', error, errorInfo)
      }}
    >
      <GradientOverlayProvider>
        <View style={{ flex: 1 }}>
          <BackgroundGradient />
          <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false,
          gestureEnabled: false // Prevent swipe back to login
        }} 
      />
      <Stack.Screen 
        name="settings" 
        options={{ 
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="onboarding" 
        options={{ 
          headerShown: false,
          gestureEnabled: false 
        }} 
      />
      <Stack.Screen 
        name="event/[id]" 
        options={{ 
          headerShown: false
        }} 
      />
      {/* Nested segment layouts handle their own screens */}
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="private-chat" options={{ headerShown: false }} />
      <Stack.Screen 
        name="edit-profile" 
        options={{ 
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="blocked-users" 
        options={{ 
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="user/[id]" 
        options={{ 
          headerShown: false
        }} 
      />
          </Stack>
        </View>
      </GradientOverlayProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
})
