import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { IntroAnimation } from '../components/IntroAnimation';
import '../lib/globalText';
import { GradientOverlayProvider } from '../lib/gradientOverlay';
import { ToastProvider } from '../components/Toast';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationListener,
    setupNotificationResponseListener
} from '../lib/notifications';
import { apiClient } from '../lib/apiClient';
import { initSocketWithAppState, cleanup as cleanupSocket, disconnect as disconnectSocket } from '../lib/socketClient';
import { ONBOARDING_ROUTES, resumeStep } from '../lib/onboarding';
import { readOnboarding } from '../lib/onboardingStorage';
import { useAuth } from '../lib/useAuth';
import { APP_COLORS } from '../lib/theme';
import queryCache from '../lib/queryCache';
import { initSentry, Sentry } from '../lib/sentry';
import { useFonts } from 'expo-font';
import { EMBER_FONT_MODULES } from '../lib/fonts';
import { ONBOARDING_IMAGES, prefetchOnboardingImages } from '../lib/onboardingAssets';

initSentry();

/*
 * Hold the native splash until the first screen has something to show.
 *
 * `expo-splash-screen` was installed and never called, so the native splash
 * auto-hid on first render and the user saw the app's own stand-in splash
 * behind it — a white system splash, then a maroon gradient, then a pastel
 * sign-in, then a black app. Four backgrounds before the first tap.
 *
 * Called at module scope because auto-hide races the first render; by the time
 * a component effect runs it has already happened.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

const LOGO_ASSET = require('../assets/logo/monogram-gradient.png');
const PLACEHOLDER_ASSET = require('../assets/images/icon.png');
// Preloaded with the rest, so the splash hands over to a decoded animation
// rather than to an empty frame that pops in a moment later.
const INTRO_ASSET = require('../assets/logo/intro.webp');

function BackgroundGradient() {
  return (
    <View style={styles.bg} pointerEvents="none">
      <LinearGradient
        colors={['#111214', APP_COLORS.backgroundBase]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Overlay for future animated darkening if needed */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0 }]} />
    </View>
  );
}

function RootLayout() {
  const { user, loading, isNewAccount } = useAuth();
  const pathname = usePathname();
  const lastRedirectRef = useRef<string | null>(null);
  const pushInitRef = useRef<boolean>(false);
  const isNavigatingRef = useRef<boolean>(false);
  const routeTransition = Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right';
  const [imagesReady, setImagesReady] = useState(false);

  /*
   * Fonts, loaded here and nowhere else.
   *
   * Weight comes from the family name, not from `fontWeight` — a custom font
   * on Android ignores `fontWeight` and silently renders regular, so
   * `Manrope_400Regular` at `fontWeight: '700'` is bold on iOS and not bold on
   * Android from identical code. Every weight `EMBER_TYPE` names is loaded.
   *
   * `useFonts` returns `[loaded, error]`, and a font that fails to load is not
   * a reason to hold the app behind the splash forever — the system font is a
   * bad but working fallback, so a failure counts as done below.
   */
  const [fontsLoaded, fontError] = useFonts(EMBER_FONT_MODULES);
  const assetsReady = imagesReady && (fontsLoaded || !!fontError);
  const [showIntro, setShowIntro] = useState(true);

  /*
   * This used to fire and gate nothing — `Asset.loadAsync(...).catch(() => {})`,
   * result discarded. It is now the readiness signal the splash waits on, so
   * the handoff happens when the logo is actually decoded rather than one frame
   * before it.
   */
  useEffect(() => {
    /*
     * The onboarding artwork joins the splash preload rather than loading when
     * its screen mounts.
     *
     * A new account reaches those screens seconds after this runs, so warming
     * them here costs nothing anybody waits for and removes the pop-in that a
     * first-time user would otherwise see on three separate screens.
     *
     * They are appended rather than gating separately: the splash already waits
     * on this promise, and 388 KB of local images resolves long before auth
     * does.
     */
    Asset.loadAsync([LOGO_ASSET, PLACEHOLDER_ASSET, INTRO_ASSET, ...ONBOARDING_IMAGES])
      // ...then warm `expo-image`'s cache with the same files, because that is
      // the one the onboarding screens actually read from. Downloading is not
      // decoding, and the two libraries do not share a cache.
      .then(prefetchOnboardingImages)
      .catch(() => {})
      .finally(() => setImagesReady(true));
  }, []);

  /*
   * Hide on assets — images *and* fonts — deliberately NOT on `loading`.
   *
   * Fonts join the gate rather than loading in the background because the
   * alternative is visible: the first screen paints in the system font and
   * reflows to Plus Jakarta Sans a beat later, and at 56pt with -2.8 tracking
   * that reflow moves the headline by most of a line.
   *
   * Auth resolution is a network round trip. Gating the splash on it means a
   * user on bad wifi stares at a frozen splash for as long as the request
   * takes, and a user with no connection stares at it until the timeout. The
   * sign-in screen renders its own state while auth settles, which is the
   * honest place for that wait to live.
   */
  useEffect(() => {
    if (assetsReady) SplashScreen.hideAsync().catch(() => {});
  }, [assetsReady]);

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
      const isIndex = pathname === '/' || pathname === '/index';
      /*
       * Routes a signed-out user is allowed to be on.
       *
       * This was `isIndex` alone, which quietly made any other signed-out screen
       * impossible: mount `/sign-in`, and this effect replaces it with `/` on
       * the very next tick. The screen would appear to flash and vanish, with
       * nothing in the logs to explain it. An allow-list is the smallest change
       * that lets a second signed-out screen exist at all.
       */
      const isAuthRoute =
        isIndex || pathname === '/sign-in' || pathname === '/forgot-password';

      if (!user) {
        // Not authenticated → send to login index, unless already somewhere
        // a signed-out user is meant to be
        if (!isAuthRoute) {
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

      /*
       * The onboarding gate is back, and it is the resume rule this time.
       *
       * This used to read `profiles.onboarded` — from an AsyncStorage cache,
       * then from the API — and send anyone false to `/onboarding/welcome`.
       * Those eight screens are gone, so a gate pointing at them would send
       * every such account to expo-router's Unmatched Route with no way out,
       * which is why the deletion and this removal are one commit.
       *
       * It also cost a `getProfile` round trip on every cold start with an
       * empty cache, to make a routing decision nothing makes any more. What
       * replaces it is an explicit push from the signup success path (PR 12)
       * and the interest gate on the Match tab, which asks at the moment
       * somebody reaches for the feature rather than before they have seen it.
       *
       * `profiles.onboarded` is NOT dead: the dashboard still counts it
       * (`dashboard/actions.ts`, `users/actions.ts`). It stops meaning "has
       * finished onboarding" and starts meaning "existed before 2026-08-10",
       * which is noted in the API roadmap rather than backfilled.
       *
       * ---
       *
       * That was true until the flow came back. The reason the old gate was a
       * problem is preserved above and still applies: it pointed at screens
       * that did not exist, and it paid for a `getProfile` on every cold start.
       *
       * What is different now:
       *
       *  - The screens exist, all eight of them, and `resumeStep` cannot name
       *    a route that does not — `ONBOARDING_ROUTES` is exhaustive over the
       *    step union, and a stored step this build does not recognise parses
       *    back to the first one rather than to a dead route.
       *  - There is **no network call on the launch path**. The gate reads
       *    AsyncStorage, which is where each step already writes its progress.
       *    A record exists only while a flow is unfinished; finishing deletes
       *    it, so the steady state for every established account is one miss on
       *    a local read.
       *  - `isNewAccount` alone was never enough. It is session-scoped — false
       *    on the next launch — so someone who quit on step five came back to
       *    the events tab with a half-filled profile and no way back in. That
       *    is the bug the stored record exists to close.
       */

      /*
       * Onboarded users should not stay on any signed-out screen.
       *
       * This read `isOnboarding || isIndex`, which is the mirror image of the
       * allow-list above and was half a fix. Adding `/sign-in` to the
       * signed-out branch stopped it being bounced away — but nothing here
       * moved a user *off* it once they signed in, so `/sign-in` fell into the
       * `else` and was treated as an ordinary app screen. Signing in with email
       * therefore succeeded completely, stored its tokens, logged "sign in
       * successful", and left the user looking at the form. Relaunching picked
       * up the stored session and landed on the events tab, which made it look
       * like the sign-in had failed and the reload had fixed it.
       *
       * `isAuthRoute` is a superset of `isIndex`, so this covers what it did
       * plus the two screens that were missing.
       */
      if (isAuthRoute) {
        /*
         * A brand-new account is asked about itself once, here.
         *
         * This used to be a `router.replace('/about-you')` inside the sign-in
         * screens, and it never fired: this effect runs on the auth-state
         * change with `pathname` still `/` or `/sign-in` — both signed-out
         * routes — so it replaced with the events tab and clobbered the push.
         * about-you was unreachable from either entry point, which is why a
         * fresh Google signup landed on events with an empty profile.
         *
         * Routing has one owner. The screens now record *what happened*
         * (`isNewAccount`) and this decides where that leads.
         */
        const stored = user?.id ? await readOnboarding(user.id) : null;
        const resume = resumeStep({
          // Only what this device knows. Reading `profiles.onboarded` would be
          // the network call the note above says this path no longer makes —
          // and a finished flow deletes its local record, so its absence
          // already means "nothing to resume".
          finishedOnServer: false,
          stored: stored?.progress ?? null,
          isNewAccount,
        });
        replaceIfNeeded(resume ? ONBOARDING_ROUTES[resume] : '/(tabs)/events');
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
      const isIndex = pathname === '/' || pathname === '/index';
      const isTabsRoot = pathname?.startsWith('/(tabs)');

      // Block back on login and the tabs root. Onboarding used to be here too,
      // and was the only screen set that swallowed back with nowhere to go.
      if (isIndex || isTabsRoot) {
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

  // Keep data fresh when app returns from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      queryCache.clear();
      apiClient.clearResponseCache();
    });
    return () => {
      sub.remove();
    };
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        Sentry.captureException(error, {
          tags: { context: 'root-error-boundary' },
          extra: { componentStack: errorInfo.componentStack },
        })
      }}
    >
      <GradientOverlayProvider>
        <ToastProvider>
        <View style={styles.root}>
          <BackgroundGradient />
          {/*
            * Rendered last in the tree but drawn on top, so it covers whatever
            * the router settles on. Deliberately not a gate — auth, assets and
            * routing all resolve underneath while it plays, and it is simply
            * removed when done. It never delays a signed-in user.
            */}
          {showIntro && <IntroAnimation onDone={() => setShowIntro(false)} />}
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: APP_COLORS.backgroundBase },
              animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
            }}
          >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          animation: 'none',
        }}
      />
      {/*
        * The two signed-out screens. Both are also listed in `isAuthRoute`
        * above — without that they mount and are replaced on the next tick.
        */}
      <Stack.Screen
        name="sign-in"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{ 
          headerShown: false,
          animation: 'none',
          gestureEnabled: false // Prevent swipe back to login
        }} 
      />
      <Stack.Screen
        name="about-you"
        options={{
          headerShown: false,
          animation: routeTransition,
          /*
           * Back is disabled, and "Skip for now" is the way out.
           *
           * Not the hard gate onboarding was: skipping writes nothing and lands
           * on the events tab. What this prevents is swiping back to the signup
           * form of an account that now exists, which would offer to create it
           * again and fail with "that email is already registered".
           */
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          animation: routeTransition,
          /*
           * No swipe back out of the flow. Its own stack handles moving between
           * steps; a gesture at this level would drop someone out of onboarding
           * entirely onto the signup form of an account that now exists, which
           * offers to create it again and fails with "already registered".
           */
          gestureEnabled: false,
        }}
      />
      <Stack.Screen 
        name="settings" 
        options={{ 
          headerShown: false,
          animation: routeTransition,
        }} 
      />
      <Stack.Screen 
        name="event/[id]" 
        options={{ 
          headerShown: false,
          animation: 'slide_from_bottom',
          presentation: 'modal',
          animationDuration: 280,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }} 
      />
      {/* Nested segment layouts handle their own screens */}
      <Stack.Screen
        name="chat"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="private-chat"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: routeTransition,
        }}
      />
      {/*
        * Placeholder screens: logic complete, design provisional.
        * See docs/PLACEHOLDER_SCREENS.md before restyling either.
        */}
      <Stack.Screen
        // The route is `rate/[eventId]`, not `rate` — there is no bare
        // `rate.tsx`. The mismatch warned on every render and the options were
        // silently applied to nothing.
        name="rate/[eventId]"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="event-preferences/[eventId]"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: routeTransition,
        }}
      />
      <Stack.Screen 
        name="edit-profile" 
        options={{ 
          headerShown: false,
          animation: routeTransition,
        }} 
      />
      <Stack.Screen 
        name="blocked-users" 
        options={{ 
          headerShown: false,
          animation: routeTransition,
        }} 
      />
      <Stack.Screen
        name="user/[id]"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="interested"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
      <Stack.Screen
        name="nearby-events"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
          </Stack>
        </View>
        </ToastProvider>
      </GradientOverlayProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
})
