import { Asset } from 'expo-asset';
import { router, Stack, usePathname, type Href } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Appearance, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import {
    initializePushNotifications,
    removePushTokenFromProfile,
    setupNotificationResponseListener
} from '../lib/notifications';
import { initSocketWithAppState, cleanup as cleanupSocket, disconnect as disconnectSocket } from '../lib/socketClient';
import { ONBOARDING_ROUTES, mayParticipate, resumeStep } from '../lib/onboarding';
import { useReducedMotion } from '../lib/motion';
import { openWhenReady, setRouteReady, takePendingRoute } from '../lib/pendingRoute';
import { readOnboarding } from '../lib/onboardingStorage';
import { hasDeclinedPush } from '../lib/pushDecline';
import { PresenceMonitor } from '../components/PresenceMonitor';
import { LiveAtVenue } from '../components/LiveAtVenue';
import { notePathname } from '../lib/paywall';
import { SheetHost } from '../components/SheetHost';
import { useAuth } from '../lib/useAuth';
import { useUpdateRequired } from '../lib/updateRequired';
import { UpdateRequiredScreen } from '../components/system/UpdateRequiredScreen';
import { EMBER } from '../lib/theme';
import { handleAndroidBack } from '../lib/androidBack';
import { CoachMarkHost } from '../components/ds/CoachMarkHost';
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

function RootLayout() {
  const { user, loading, isNewAccount, unreachable } = useAuth();
  // The server no longer serves this build: one screen over everything, with the store button (Flow 15 15.14).
  const updateRequired = useUpdateRequired();
  const pathname = usePathname();
  // The paywall never arrives by itself over onboarding, a check-in or a chat (lib/paywall.ts).
  useEffect(() => notePathname(pathname), [pathname]);
  const lastRedirectRef = useRef<string | null>(null);
  const pushInitRef = useRef<boolean>(false);
  const isNavigatingRef = useRef<boolean>(false);
  // Reduce Motion: every push is the system cross-fade (DS #3 rm), not a slide across the screen.
  const reduceMotion = useReducedMotion();
  const routeTransition = reduceMotion ? 'fade' : Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right';
  const [imagesReady, setImagesReady] = useState(false);

  /*
   * Fonts, loaded here and nowhere else.
   *
   * Weight comes from the family name, not from `fontWeight` — a custom font
   * on Android ignores `fontWeight` and silently renders regular, so
   * `Manrope_400Regular` at `fontWeight: '700'` is bold on iOS and not bold on
   * Android from identical code. Every weight `TYPE` names is loaded.
   *
   * `useFonts` returns `[loaded, error]`, and a font that fails to load is not
   * a reason to hold the app behind the splash forever — the system font is a
   * bad but working fallback, so a failure counts as done below.
   */
  const [fontsLoaded, fontError] = useFonts(EMBER_FONT_MODULES);
  const fontsReady = fontsLoaded || !!fontError;
  const assetsReady = imagesReady && fontsReady;

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
    Asset.loadAsync([LOGO_ASSET, PLACEHOLDER_ASSET, ...ONBOARDING_IMAGES])
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
   * Hiding the paint is not enough on its own, which is why no route renders
   * before the fonts either (`fontsReady`, at the return below).
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

  /*
   * `lastRedirectRef` only stops a redirect being sent twice while it is in
   * flight: the guard below re-runs on auth changes before the pathname has
   * moved. Once the pathname moves, that redirect is over and must not block
   * the next one, so the ref is cleared here, for every caller at once.
   *
   * Nothing cleared it on the signed-out side (SCRUM-616). Signing out
   * redirected to `/` and left `/` in the ref, so the next link opened with the
   * app still running (an event's QR code, a friend invite, any screen) was
   * never sent to sign-in and showed "Couldn't load this event". A cold start
   * was fine only because the ref starts empty.
   *
   * Declared before the guard so it runs first on the same pathname change.
   * `__tests__/rootGuardSignedOut.test.tsx` drives it.
   */
  useEffect(() => {
    lastRedirectRef.current = null;
  }, [pathname]);

  useEffect(() => {
    // Set up the notification tap listener once
    const responseListener = setupNotificationResponseListener();

    return () => {
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
    if (loading) {
      setRouteReady(false);
      return;
    }
    /*
     * Set when this effect is superseded. `run` awaits `readOnboarding`, and a
     * notification tapped on a cold start pushes its screen during that await;
     * the stale run then went on to `replace('/(tabs)/events')` over it, with
     * `pathname` still the '/' it closed over. A newer run owns routing now.
     */
    let superseded = false;
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
      const isPreview = __DEV__ && pathname.startsWith('/preview');
      const isAuthRoute =
        isIndex ||
        pathname === '/sign-in' ||
        pathname === '/forgot-password' ||
        isPreview;

      if (!user) {
        setRouteReady(false);
        // Not authenticated → send to login index, unless already somewhere
        // a signed-out user is meant to be
        if (!isAuthRoute) {
          /*
           * An invite link or an event's public link (the organiser's QR code)
           * tapped while signed out: hold it, and it opens the moment they are
           * in — after sign-in, or after onboarding for a new account. Without
           * this the link was lost at the sign-in screen.
           */
          if (pathname.startsWith('/f/') || pathname.startsWith('/event/')) openWhenReady(pathname as Href);
          replaceIfNeeded('/');
        }
        // Also remove push token best-effort. Not while the server is merely
        // unreachable: that session is still live, and the DELETE landing
        // when the connection returns would silence its notifications.
        if (!unreachable) removePushTokenFromProfile().catch(() => {});
        // Reset push init flag for next sign-in
        pushInitRef.current = false;
        return;
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
      // The design harness is open to both states: bouncing a signed-in
      // session off `/preview` to the events tab made the fixtures reachable
      // only after signing out.
      if (isAuthRoute && !isPreview) {
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
        setRouteReady(false);
        const stored = user?.id ? await readOnboarding(user.id) : null;
        if (superseded) return;
        const resume = resumeStep({
          // Both server facts come on the user object the session call already
          // returned, so reading them costs no request. `mayParticipate` is
          // what catches an account that quit onboarding on another install.
          finishedOnServer: user.profile?.onboarded === true,
          stored: stored?.progress ?? null,
          isNewAccount,
          mayParticipate: mayParticipate(user.profile),
        });
        replaceIfNeeded(resume ? ONBOARDING_ROUTES[resume] : '/(tabs)/events');
      } else {
        /*
         * An invite link opened by a signed-in account that has not finished
         * onboarding: hold it and finish onboarding first, exactly as a
         * signed-out tap is held until sign-in. The link opens once they are
         * through. Other deep links keep the behaviour below.
         */
        if (pathname.startsWith('/f/')) {
          const stored = user?.id ? await readOnboarding(user.id) : null;
          if (superseded) return;
          const resume = resumeStep({
            finishedOnServer: user.profile?.onboarded === true,
            stored: stored?.progress ?? null,
            isNewAccount,
            mayParticipate: mayParticipate(user.profile),
          });
          if (resume) {
            setRouteReady(false);
            openWhenReady(pathname as Href);
            replaceIfNeeded(ONBOARDING_ROUTES[resume]);
            return;
          }
        }
        /*
         * Signed in and on an ordinary screen: the one moment a waiting
         * notification target can open. Reached after the redirect to the
         * events tab and after onboarding's last step alike, so neither has
         * to know about it. Not during onboarding, which is not finished.
         */
        const inOnboarding = pathname.startsWith('/onboarding');
        setRouteReady(!inOnboarding);
        /*
         * Push starts here, in the app proper, and not the moment auth resolves.
         *
         * `initializePushNotifications` asks the OS for permission. Run on
         * sign-in, it put the system dialog over onboarding's first screen,
         * two seconds in, before the notifications step that exists to explain
         * it had been reached, and iOS asks only once. Onboarding's step asks;
         * this registers the token once somebody is through. For an account
         * already onboarded it is the same moment as before: the first screen
         * after sign-in, deferred so the UI renders first.
         *
         * "Maybe later" on that step is respected: a declined account never
         * sees the OS dialog from here (lib/pushDecline.ts). Settings asks.
         */
        if (!inOnboarding && !pushInitRef.current) {
          pushInitRef.current = true;
          const userId = user.id;
          setTimeout(() => {
            hasDeclinedPush(userId)
              .then((declined) => initializePushNotifications({ prompt: !declined }))
              .catch(() => {});
          }, 2000);
        }
        if (!inOnboarding) {
          const waiting = takePendingRoute();
          if (waiting) router.push(waiting);
        }
      }
    };

    run();
    return () => {
      superseded = true;
    };
    // replaceIfNeeded is redefined every render; adding it here would rerun
    // this effect (and its routing decisions) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, pathname, isNewAccount, unreachable]);

  /*
   * Android hardware back, registered ONCE.
   *
   * It used to re-register on every pathname change. BackHandler runs the
   * most recently added listener first, so each navigation put this one back
   * on top — ahead of the Blend'n overlay's own handler (which closes the
   * overlay) and ahead of React Navigation's. A ref carries the pathname
   * instead. The rules are in `lib/androidBack.ts`, with tests.
   */
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      handleAndroidBack(pathnameRef.current, router)
    );
    return () => sub.remove();
  }, []);

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
   * It is also redundant. Every cached endpoint is stale-while-revalidate with a TTL, so a
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

  /*
   * Nothing renders until the fonts are in (SCRUM-619).
   *
   * Text is measured when it mounts, and React Native caches the measurement
   * by the family *name*, not by the font that name resolved to. A screen
   * mounted under the splash before Plus Jakarta Sans registered was measured
   * in the system font, which is narrower, and every later text with the same
   * string and style was handed that cached box for the life of the process:
   * the wordmark drew as "Blend'r" and "I'm going" as "I'm goi…", on every
   * screen, until the app was killed.
   *
   * Only a cold start by a link hit it. A plain launch opens on `/`, which
   * shows a logo and no text until auth resolves, and the fonts (local files)
   * are in long before a network round trip. A link opens straight on its
   * screen, with all its text, on the first render.
   *
   * The splash is still not gated on auth, and this costs no visible time:
   * the native splash already waits on the fonts (`assetsReady`).
   */
  if (!fontsReady) return null;

  return (
    <ErrorBoundary
      onError={(error, errorInfo, errorId) => {
        Sentry.captureException(error, {
          // The id the crash screen shows and puts in the support email.
          tags: { context: 'root-error-boundary', error_id: errorId },
          extra: { componentStack: errorInfo.componentStack },
        })
      }}
    >
      {/*
        Outermost, so every screen and the toast layer sit inside it. Without
        it, a `GestureDetector` anywhere in the app silently does nothing.
      */}
      <GestureHandlerRootView style={styles.gestureRoot}>
      {/* The keyboard's real frame, frame by frame, including an interactive dismiss (KeyboardFrame reads it). */}
      <KeyboardProvider>
      <ToastProvider>
        <View style={styles.root}>
          {/*
            One status bar for the app, light, because there is no light theme
            (`Appearance.setColorScheme('dark')` above).
          */}
          <StatusBar style="light" />
          {/* No launch animation (owner, 2026-10-21): the static native splash hands straight to the first screen. */}
          <Stack
            screenOptions={{
              // Every pushed screen sits on the same flat surface as the root.
              // This was `#000000`, so a push revealed a different black than
              // the tab underneath it.
              contentStyle: { backgroundColor: EMBER.bg },
              animation: routeTransition,
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
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen
        name="(tabs)"
        options={{ 
          headerShown: false,
          /*
           * Fade, not a cut. The tabs arrive by `replace` — from sign-in, from
           * the end of onboarding — and a hard cut from a full-screen form to
           * the feed reads as a crash. A slide would say "deeper"; this is a
           * different place, so it crossfades. Tab-to-tab switching is inside
           * the navigator and unaffected.
           */
          animation: 'fade',
          gestureEnabled: false // Prevent swipe back to login
        }} 
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
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
        }}
      />
      <Stack.Screen
        name="private-chat"
        options={{
          headerShown: false,
          presentation: 'card',
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
        }}
      />
      <Stack.Screen
        name="event-preferences/[eventId]"
        options={{
          headerShown: false,
          /*
           * A modal, because the screen draws an ×: it is a choice you make
           * and close, not a page in a stack. As a pushed card it slid in from
           * the right with an × where every pushed screen has a back chevron,
           * and the edge-swipe dismissed a screen that looked like it had to
           * be closed.
           *
           * Full screen, because the frame is (Flow 3 `prefs`: the ✕ under a status bar): a page sheet drew the top inset a
           * second time inside itself, so the ✕ landed 62 pt into the sheet, and on Android the dock lost the bottom inset.
           */
          presentation: 'fullScreenModal',
          animation: reduceMotion ? 'fade' : Platform.OS === 'ios' ? 'default' : 'slide_from_bottom',
        }}
      />
      <Stack.Screen 
        name="edit-profile" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="blocked-users" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      {/*
        `/room` only opens the Blend'n overlay (hosted by the tab layout) and
        steps back. No animation, so the hop is invisible.
      */}
      <Stack.Screen name="room" options={{ headerShown: false, animation: 'none' }} />
      {/*
        The fixture harnesses. Declared so the root stack does not draw a native
        header over them — an undeclared route inherits one, which is how
        `preview/profile` opened with a "< (tabs)" bar across its hero.
      */}
      <Stack.Screen name="preview" options={{ headerShown: false }} />
      <Stack.Screen name="nearby-events" options={{ headerShown: false }} />
      {/* Settings' About and Contact support. */}
      <Stack.Screen name="about" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      {/* Friends. Declared so none of them inherits the native header. */}
      <Stack.Screen name="friends/index" options={{ headerShown: false }} />
      <Stack.Screen name="friends/add" options={{ headerShown: false }} />
      <Stack.Screen name="friends/requests" options={{ headerShown: false }} />
      <Stack.Screen name="friends/[userId]" options={{ headerShown: false }} />
      {/* A room's info, from the options button in its header. */}
      <Stack.Screen name="chat-info/[id]" options={{ headerShown: false }} />
      {/* Placeholder screen: logic complete, design provisional (docs/PLACEHOLDER_SCREENS.md §6). */}
      <Stack.Screen name="board/[eventId]" options={{ headerShown: false }} />
      {/* Matching v2's about-you fields, reached from Edit profile (step 10, docs/PLACEHOLDER_SCREENS.md §15). */}
      <Stack.Screen name="edit-about-you" options={{ headerShown: false }} />
      {/* Crews and Blends (Flow 10). */}
      <Stack.Screen name="crews/index" options={{ headerShown: false }} />
      {/* Make a crew is a sheet over Crews (Flow 10 · 10.2): the route is transparent and draws the sheet itself. */}
      <Stack.Screen name="crews/new" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
      <Stack.Screen name="crews/invite/[crewId]" options={{ headerShown: false }} />
      <Stack.Screen name="crews/[crewId]" options={{ headerShown: false }} />
      {/* A place from the Places list. Placeholder until step 5 (docs/PLACEHOLDER_SCREENS.md §10). */}
      <Stack.Screen name="venue/[id]" options={{ headerShown: false }} />
      {/* An offer from a place and its door pass (step 12). Placeholder design (docs/PLACEHOLDER_SCREENS.md §16). */}
      <Stack.Screen name="offer/[id]" options={{ headerShown: false }} />
      {/* The Blendn+ paywall, a modal with "Not now" (step 11). Placeholder design (docs/PLACEHOLDER_SCREENS.md §13). */}
      <Stack.Screen
        name="plus"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: reduceMotion ? 'fade' : Platform.OS === 'ios' ? 'default' : 'slide_from_bottom' }}
      />
      <Stack.Screen name="f/[token]" options={{ headerShown: false, presentation: 'modal', animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
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
          {updateRequired ? (
            <View style={StyleSheet.absoluteFill}>
              <UpdateRequiredScreen />
            </View>
          ) : null}
          {user ? <PresenceMonitor /> : null}
          {/* Your Go Live at a place: its pings, the expiry prompt, and `live:ended` (step 5). */}
          {user ? <LiveAtVenue /> : null}
          {/*
            The one sheet the safety flows and message menus open from
            anywhere (`lib/sheet.ts`). Inside the toast provider, so a
            finished step can say what it did.
          */}
          <SheetHost />
          {/*
            Last, so nothing in the app draws over it (Android elevation
            included): every coach mark and its dim (components/ds/CoachMarkHost).
          */}
          <CoachMarkHost />
        </View>
      </ToastProvider>
      </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
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
})
