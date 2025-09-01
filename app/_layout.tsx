import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, usePathname } from "expo-router";
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GradientOverlayProvider } from '../lib/gradientOverlay';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationListener,
    setupNotificationResponseListener
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

function BackgroundGradient() {
  return (
    <View style={styles.bg} pointerEvents="none">
      <LinearGradient
        colors={["#000000", "#000000"]}
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

  const replaceIfNeeded = (target: string) => {
    if (isNavigatingRef.current) return;
    if (!target) return;
    if (pathname === target) return;
    if (lastRedirectRef.current === target) return;
    isNavigatingRef.current = true;
    lastRedirectRef.current = target;
    router.replace(target);
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

      // Authenticated → init push once
      if (!pushInitRef.current) {
        initializePushNotifications().finally(() => {
          pushInitRef.current = true;
        });
      }

      // Check onboarding status, fail-closed (treat errors/missing as not onboarded)
      let onboarded = false;
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarded')
          .eq('id', user.id)
          .maybeSingle();
        onboarded = !!profile && profile.onboarded === true && !error;
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
        name="chat/[id]" 
        options={{ 
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="event/[id]" 
        options={{ 
          headerShown: false
        }} 
      />
      <Stack.Screen 
        name="private-chat/[conversationId]" 
        options={{ 
          headerShown: false
        }} 
      />
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
        name="test-features" 
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
