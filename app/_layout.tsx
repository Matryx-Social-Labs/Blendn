import { Asset } from 'expo-asset';
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Appearance, BackHandler, Platform, StyleSheet, View } from 'react-native';
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
import { initSocketWithAppState, cleanup as cleanupSocket, disconnect as disconnectSocket } from '../lib/socketClient';
import { ONBOARDING_ROUTES, resumeStep } from '../lib/onboarding';
import { readOnboarding } from '../lib/onboardingStorage';
import { PresenceMonitor } from '../components/PresenceMonitor';
import { useAuth } from '../lib/useAuth';
import { EMBER } from '../lib/theme';
import { initSentry, Sentry } from '../lib/sentry';
import { useFonts } from 'expo-font';
import { EMBER_FONT_MODULES } from '../lib/fonts';
import { ONBOARDING_IMAGES, prefetchOnboardingImages } from '../lib/onboardingAssets';

initSentry();

/*
 * Tell the OS what the app already is.
 *
 * There is no light theme: `EMBER` is a dark palette and all 73 stylesheets
 * hardcode it. But `UIUserInterfaceStyle` is `Automatic` in the committed
 * Info.plist and Android's `AppTheme` derives from a DayNight parent, so every
 * surface iOS and Android draw *for* us followed the phone's setting instead —
 * and on a phone set to light that means a white alert on a black screen.
 *
 * Seen on the profile screens: the "Select Photo" sheet and the "Profile
 * Updated" confirmation both rendered as light system alerts, and so did the
 * photo picker's chrome. Same defect the dashboard had when `<Toaster>` shipped
 * without a pinned theme — a component inheriting a scheme the product does not
 * have.
 *
 * Done here rather than in the native projects because it is one line, it
 * covers both platforms, and it reaches the 44 `Alert.alert` call sites without
 * replacing any of them. The native config still says "automatic"; this
 * overrides it at startup, which is also why it sits above the component tree
 * rather than inside an effect — an alert can be raised before the first render
 * settles.
 */
Appearance.setColorScheme('dark');

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
      /*
       * `preview` is the design screenshot harness — see `app/preview/`.
       *
       * This allow-list read `/__preview` and named `app/__preview.tsx`, and
       * neither has ever existed: the routes are `app/preview/*`, so every one
       * of them resolved to `/preview/...`, missed the prefix, and was replaced
       * with `/` on the next tick. The harness was unreachable in precisely the
       * state it exists for — signed out, in dev — and the failure looked like
       * the screen flashing and vanishing, which reads as a render bug rather
       * than a routing one. `__tests__/previewAllowList.test.ts` now pins the
       * prefix to the directory.
       *
       * Signed out on purpose, and behind `__DEV__` so it cannot be reached in
       * a shipped build. Reaching the real Pulse needs a login, a network, a
       * location grant and unexpired staging data; none of those has anything
       * to do with whether a card is the right height, and each of them can
       * blank the screen on its own.
       */
      const isAuthRoute =
        isIndex ||
        pathname === '/sign-in' ||
        pathname === '/forgot-password' ||
        (__DEV__ && pathname.startsWith('/preview'));

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
    // replaceIfNeeded is redefined every render; adding it here would rerun
    // this effect (and its routing decisions) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, pathname, isNewAccount]);

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

  /*
   * Foreground no longer wipes the caches, and that IS the freshness strategy.
   *
   * This cleared `queryCache` and the whole `apiClient` response cache on every
   * return to the foreground, on the reasoning that backgrounded data is stale.
   * The cost was that **every** minimise-and-restore started cold: the room, the
   * feed, the profile, all of them, and the first screen you looked at paid a
   * full round trip before it could render. That is the second half of "I open
   * the room, wait a few seconds, minimise, open it again, wait again" -- the
   * first half was `force: true` on mount, fixed separately.
   *
   * It is also redundant. Every cached endpoint is `swr: true` with a TTL, so a
   * read returns immediately and revalidates behind the paint, and an entry past
   * its TTL blocks and refetches on its own. Clearing turns every entry into the
   * second case unconditionally, including ones written a second ago.
   *
   * `useLiveSync` still fires on foreground for the screens that want a nudge --
   * see the Pulse and MatchScreen -- and it now reads cache rather than forcing,
   * so it repaints instantly and updates behind.
   *
   * What must still be cleared on **sign-out** is a different question with a
   * different answer, and `clearResponseCache` is still there for it.
   */

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
          {/*
            * Rendered last in the tree but drawn on top, so it covers whatever
            * the router settles on. Deliberately not a gate — auth and routing
            * both resolve underneath while it plays, and it is simply removed
            * when done. It never delays a signed-in user.
            *
            * `assetsReady` gates the *mount*, though, and that is not the same
            * thing as gating startup. The intro used to mount on the first
            * render, which is before the native splash has been dismissed —
            * so its timers ran while the splash was still covering it, and on
            * a slow cold start the animation was already partway through by
            * the time anyone could see it. It survived because the old asset
            * opened on a static monogram identical to the splash, so the
            * frames being eaten were indistinguishable from the splash
            * itself. The asset now opens by drawing that monogram, and eaten
            * frames would mean the logo appearing half-drawn.
            *
            * Same condition `hideAsync` waits on, and it flips in the render
            * before the effect fires, so the overlay is up before the splash
            * begins fading out. Nothing shows between them.
            */}
          {showIntro && assetsReady && (
            <IntroAnimation onDone={() => setShowIntro(false)} />
          )}
          <Stack
            screenOptions={{
              // Every pushed screen sits on the same flat surface as the root.
              // This was `#000000`, so a push revealed a different black than
              // the tab underneath it.
              contentStyle: { backgroundColor: EMBER.bg },
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
      {/*
        Full screen, not a sheet.

        This was `presentation: 'modal'`, and it is why the rebuilt Scene never
        looked like its own harness: a sheet insets itself from the top, rounds
        its corners, and leaves the previous screen visible above it. Frame
        `1141:4853` is a full-bleed artboard whose hero dissolves into the page
        -- and the old bottom-sheet panel was deliberately deleted from that
        design, so presenting the whole screen as a sheet reintroduced exactly
        the shape the rebuild removed, one level up at the window.

        It cost a bug too: `useSafeAreaInsets()` reads the root provider, so
        inside a sheet `PulseTopBar` padded by a notch iOS had already cleared
        and the wordmark sat in a dark band.

        `slide_from_bottom` goes with it -- that is a sheet's motion.
      */}
      <Stack.Screen
        name="event/[id]"
        options={{
          headerShown: false,
          animation: routeTransition,
          presentation: 'card',
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
      {/*
        The Room, which the Blend'n button in the middle of the bar opens.

        Presented as a sheet rather than a push: it is a mode you are in for the
        length of an event, not a page in a stack, and the swipe-down out of it
        matches the chevron the screen draws. `docs/NAVIGATION.md`.
      */}
      <Stack.Screen
        name="room"
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      {/*
        The fixture harnesses. Declared so the root stack does not draw a native
        header over them — an undeclared route inherits one, which is how
        `preview/profile` opened with a "< (tabs)" bar across its hero.
      */}
      <Stack.Screen name="preview" options={{ headerShown: false }} />
      <Stack.Screen
        name="nearby-events"
        options={{
          headerShown: false,
          animation: routeTransition,
        }}
      />
          </Stack>
          {/*
            Watches whether somebody is still at the event they checked into,
            and checks them out when they are plainly not.

            At the root rather than inside The Room, because leaving a venue
            should be noticed whether or not the room is the screen you have
            open. Renders nothing until it has something to ask.

            Gated on a signed-in user: with nobody signed in there is no
            check-in to watch, and the fence lookup would 401 on a timer.
          */}
          {user ? <PresenceMonitor /> : null}
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
    /*
     * One flat surface for the whole app.
     *
     * This was `#000000` with a `#111214 -> #000000` gradient painted over it,
     * behind every screen. Both are the previous design's cool near-blacks, and
     * they showed through as a faintly different panel edge wherever a screen
     * did not paint its own opaque background — which is the "outline" that
     * survived flattening The Pulse itself.
     *
     * The frame is flat `#0F0E0E`. A gradient here is one more surface than the
     * design has.
     */
    backgroundColor: EMBER.bg,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
})
