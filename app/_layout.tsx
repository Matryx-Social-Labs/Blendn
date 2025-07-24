import type { Session } from '@supabase/supabase-js';
import { Stack, router } from "expo-router";
import { useEffect, useState } from 'react';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationListener,
    setupNotificationResponseListener
} from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📱 [ROOT_LAYOUT] Initial session loaded:', session?.user?.id || 'none');
      setSession(session);
      // No caching needed - using direct auth calls as per official docs
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('📱 [ROOT_LAYOUT] Auth state changed:', event, session?.user?.id || 'none');
      setSession(session);
      // No caching needed - using direct auth calls as per official docs
      
      // Handle push notifications based on auth state
      if (event === 'SIGNED_IN' && session) {
        // Initialize push notifications when user signs in
        await initializePushNotifications();
      } else if (event === 'SIGNED_OUT') {
        // Remove push token when user signs out
        await removePushTokenFromProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Set up notification listeners
    const notificationListener = setupNotificationListener((notification) => {
      console.log('Notification received in foreground:', notification);
      // Handle in-app notification display here if needed
    });

    const responseListener = setupNotificationResponseListener((response) => {
      console.log('Notification tapped:', response);
      
      // Handle navigation based on notification data
      const data = response.notification.request.content.data;
      if (data?.screen) {
        switch (data.screen) {
          case 'chat':
            if (data.conversationId) {
              router.push(`/private-chat/${data.conversationId}` as any);
            } else {
              router.push('/(tabs)/chat' as any);
            }
            break;
          case 'match':
            router.push('/(tabs)/match' as any);
            break;
          case 'event':
            if (data.eventId) {
              router.push(`/event/${data.eventId}` as any);
            } else {
              router.push('/(tabs)/events' as any);
            }
            break;
          default:
            break;
        }
      }
    });

    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
