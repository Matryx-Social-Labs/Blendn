import { router, Stack, usePathname } from "expo-router";
import { useEffect } from 'react';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationListener,
    setupNotificationResponseListener
} from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

export default function RootLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

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
    // Handle push notifications based on auth state
    if (!loading) {
      if (user) {
        // Initialize push notifications when user signs in
        console.log('📱 [ROOT_LAYOUT] User signed in, initializing push notifications');
        initializePushNotifications().catch(error => {
          console.error('❌ [ROOT_LAYOUT] Failed to initialize push notifications:', error);
        });
        // Global onboarding gate: redirect non-onboarded users to onboarding
        (async () => {
          try {
            // Skip when already on onboarding route
            if (pathname?.startsWith('/onboarding')) return;
            const { data: profile } = await supabase
              .from('profiles')
              .select('onboarded')
              .eq('id', user.id)
              .single();
            if (!profile || profile.onboarded === false) {
              router.replace('/onboarding/welcome');
            }
          } catch (e) {
            // Fail open to main tabs if check fails
          }
        })();
      } else {
        // Remove push token when user signs out
        console.log('📱 [ROOT_LAYOUT] User signed out, removing push token');
        removePushTokenFromProfile().catch(error => {
          console.error('❌ [ROOT_LAYOUT] Failed to remove push token:', error);
        });
      }
    }
  }, [user, loading, pathname]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false,
          gestureEnabled: false // Prevent swipe back to login
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
          title: "Group Chat",
          headerBackTitle: "Back"
        }} 
      />
      <Stack.Screen 
        name="event/[id]" 
        options={{ 
          title: "Event Details",
          headerBackTitle: "Back"
        }} 
      />
      <Stack.Screen 
        name="private-chat/[conversationId]" 
        options={{ 
          title: "Chat",
          headerBackTitle: "Back"
        }} 
      />
      <Stack.Screen 
        name="edit-profile" 
        options={{ 
          title: "Edit Profile",
          headerBackTitle: "Back"
        }} 
      />
      <Stack.Screen 
        name="blocked-users" 
        options={{ 
          title: "Blocked Users",
          headerBackTitle: "Back"
        }} 
      />
      <Stack.Screen 
        name="test-features" 
        options={{ 
          title: "Test Features",
          headerBackTitle: "Back"
        }} 
      />
    </Stack>
  );
}
