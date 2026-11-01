import { usePathname } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Easing, Platform, StyleSheet, View } from 'react-native'

import { BlendnScreen } from '../../components/blendn/BlendnScreen'
import { InAppBanner } from '../../components/ds/InAppBanner'
import { TabBar, type Tab } from '../../components/ds/TabBar'
import { TextSizeBoundary, textSizeLayout } from '../../components/TextSizeBoundary'
import { useCoachMarkSpot } from '../../components/ds/CoachMarkHost'
import { ForegroundBanners } from '../../components/notifications/ForegroundBanners'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { apiClient } from '../../lib/apiClient'
import { banterUnread, useInboxBadge, useInboxBadgeSync } from '../../lib/inboxBadge'
import { blendnClosed, openBlendn, setLiveHint, useBlendnOpen, useLiveTitle } from '../../lib/blendnOverlay'
import { activeRoomName } from '../../lib/leftRooms'
import { onClosingForLink } from '../../lib/linkClosers'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { refreshAuthUserOnForeground, useAuth } from '../../lib/useAuth'
import { COLOR, DURATION, EASING, SIZE, SPACE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { myMainPhoto } from '../../lib/myPhoto'
import { roomButtonTarget, type RoomButtonTarget } from '../../lib/roomButton'
import { getRoomSignal, subscribeRoomSignal } from '../../lib/roomSignal'
import { useRoomSignalSource } from '../../lib/useRoomSignalSource'
import { watchRoomUnread } from '../../lib/roomUnread'
import { listenForWaves, useRoomWaves, waveShown } from '../../lib/roomWaves'

/**
 * The bar. `Pulse · Going · [Blend'n] · Banter · Me`.
 *
 * Settled in `docs/NAVIGATION.md`; the short version is that this app has two
 * mutually exclusive modes — looking for an event, or being in one — and the
 * bar it replaced spent a whole tab on the second. `MatchScreen` sat behind a
 * permanent **Match** tab and rendered "Not Checked In Yet" almost every time
 * anybody looked at it.
 *
 * So the centre is not a fifth tab and not an action button. It is the **mode
 * switch**, and because the mode is bound to time and place it doubles as the
 * status indicator. Its four states live in `lib/roomButton.ts`, tested, because
 * this is the most visible control in the app and it is driven by a geofence, a
 * clock and a network call.
 */

// expo-router 56+ vendors React Navigation and does not export the bottom-tabs
// types publicly, so take the tab bar's props from the Tabs component itself.
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

/** The routes behind the bar's four tabs (`docs/NAVIGATION.md`). */
const ROUTE: Record<Tab, string> = { pulse: 'events', going: 'going', banter: 'chat', me: 'profile' }
const TAB_OF: Record<string, Tab> = { events: 'pulse', going: 'going', chat: 'banter', profile: 'me' }

/**
 * The bar: the redesign's floating glass capsule (`components/ds/TabBar`)
 * around the centre disc (`components/ds/Disc`), Flow 4 T1–T10. The disc's
 * state is `roomButtonTarget`, as the old RoomButton's was; tapping it always
 * opens the Blend'n overlay.
 */
const BlendnTabBar = memo(({ state, navigation }: BottomTabBarProps) => {
  const [target, setTarget] = useState<RoomButtonTarget>({
    state: 'idle',
    eventId: null,
    badge: 0,
  })
  const [venue, setVenue] = useState<string | null>(null)
  const [insideCount, setInsideCount] = useState(0)
  // Your face on Me: the session's `profile.photos`, re-read after every photo save and on foreground (`refreshAuthUser`).
  const authUser = useAuth().user
  const mePhoto = myMainPhoto(authUser)
  // The Banter dot: the same counts as the Pulse's bell, one read for both (`lib/inboxBadge`).
  useInboxBadgeSync(authUser?.id)
  useRoomSignalSource(authUser?.id)
  const banter = banterUnread(useInboxBadge())

  /*
   * The centre button's coach mark (round4/r4.js): the first time it says you
   * can check in, naming the place, above (c)'s label. Not while Blend'n is
   * open over it; being checked in (however you got there) is using it.
   */
  const blendnOpen = useBlendnOpen()
  const checkInVenue = target.state === 'checkin' && venue ? venue : null
  const centreCoach = useCoachMark('centre_button_checkin', { ready: checkInVenue !== null && !blendnOpen })
  /*
   * The unread (T3) is the server's, read on the 30 s tick from the cached list. It is forced only when it has surely
   * moved: the overlay closed (the chat may have been read from it), the app came back, or the room chat was left.
   */
  const rereadUnread = useRef<(force?: boolean) => void>(() => {})
  useEffect(() => {
    if (!blendnOpen) rereadUnread.current(true)
  }, [blendnOpen])
  const pathname = usePathname()
  const lastPath = useRef(pathname)
  useEffect(() => {
    const was = lastPath.current
    lastPath.current = pathname
    if (was !== pathname && was.startsWith('/chat/') && !pathname.startsWith('/chat/')) rereadUnread.current(true)
  }, [pathname])
  // Used: Blend'n opened from (c) (the disc or its label, the first half of "tap, then hold"), or checked in.
  useEffect(() => {
    if (target.state === 'live' || (blendnOpen && target.state === 'checkin')) markCoachUsed('centre_button_checkin')
  }, [target.state, blendnOpen])
  // Drawn by the root's CoachMarkHost: the disc is the hole, the tip above (c)'s "Check in · {venue}" pill, a `SIZE.tag` tall.
  const discRef = useRef<View>(null)
  useCoachMarkSpot(centreCoach.visible && checkInVenue !== null, {
    target: discRef,
    text: `You’re at ${checkInVenue}. Tap the button, then hold to check in.`,
    place: 'above',
    radius: SIZE.disc / 2,
    gap: SIZE.tag + SPACE.sm,
    onDismiss: centreCoach.dismiss,
    onLost: centreCoach.lose,
    testID: 'centre-coach-mark',
  })

  /*
   * Two sources, combined here.
   *
   * The live room is polled: the socket knows about messages, not check-ins,
   * and a check-out can happen on another device or from the presence monitor.
   * 30 seconds is slow enough to be free and fast enough that the button is
   * right by the time somebody looks down at it after walking through a door.
   *
   * Standing-inside-a-fence and going-tonight come from `lib/roomSignal.ts`,
   * published by The Pulse from a fetch it was making anyway. Deriving them
   * here would mean a second location permission dance and a second copy of the
   * events list on a timer.
   */
  useEffect(() => {
    let cancelled = false
    let activeEventId: string | null = null
    let activeTitle: string | null = null
    // The live room's unread, for the disc's badge (T3); one watcher per room you are in.
    let unread = 0
    let watcher: ReturnType<typeof watchRoomUnread> | null = null
    let watchedEvent: string | null = null

    const recompute = () => {
      const signal = getRoomSignal()
      setVenue(signal.insideVenue)
      setInsideCount(signal.insideCount)
      // SCRUM-630: waves are heard while you are checked in, overlay open or not.
      listenForWaves(activeEventId)
      setLiveHint(activeEventId, activeTitle)
      setTarget(
        roomButtonTarget({
          activeEventId,
          insideEventId: signal.insideEventId,
          todayEventIds: signal.todayEventIds,
          roomUnread: unread,
        })
      )
    }

    const read = async () => {
      try {
        const r = await apiClient.getActiveCheckins()
        // A failed poll knows nothing new: keep the last answer (the disc, and the waves being heard) until one comes.
        if (cancelled || !r.success) return
        const active = r.data?.checkIns?.[0] ?? null
        activeEventId = active?.eventId ?? null
        activeTitle = activeRoomName(active)
        if (activeEventId !== watchedEvent) {
          watcher?.stop()
          unread = 0
          watchedEvent = activeEventId
          watcher = activeEventId
            ? watchRoomUnread({
                eventId: activeEventId,
                onChange: (n) => {
                  unread = n
                  recompute()
                },
              })
            : null
        }
        recompute()
        void watcher?.refresh()
      } catch (e) {
        Logger.debug('navigation', 'room button poll failed', { error: e })
      }
    }

    rereadUnread.current = (force) => void watcher?.refresh(force)
    recompute()
    void read()
    const id = setInterval(read, 30_000)
    const unsubscribe = subscribeRoomSignal(recompute)
    /*
     * The poll is the fallback, not the news. Checking in or out anywhere in
     * the app says so (`lib/checkIn.ts`, which also drops the cached list), so
     * the button changes the moment you walk in or leave rather than up to a
     * poll later. And a phone left in a pocket comes back to a button that
     * re-reads rather than one that waits out the interval.
     */
    const unsubscribeCheckIn = subscribeCheckInChanged(() => void read())
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshAuthUserOnForeground()
        void read()
        rereadUnread.current(true)
      }
    })
    return () => {
      cancelled = true
      clearInterval(id)
      unsubscribe()
      unsubscribeCheckIn()
      appState.remove()
      watcher?.stop()
      listenForWaves(null)
    }
  }, [])

  /*
   * `tabPress` is emitted for the focused tab too, and only navigation is
   * skipped: the four tab lists listen for it with `useScrollToTop`, so a
   * second tap on the tab you are on scrolls it back to the top
   * (`__tests__/tabScrollToTop.test.tsx`).
   */
  const select = useCallback(
    (tab: Tab) => {
      const index = state.routes.findIndex((r) => r.name === ROUTE[tab])
      if (index === -1) return
      const route = state.routes[index]
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
      if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name)
    },
    [navigation, state.index, state.routes]
  )

  return (
      <TabBar
        selected={TAB_OF[state.routes[state.index]?.name] ?? 'pulse'}
        onSelect={select}
        disc={{ target, onPress: () => openBlendn(), venue: venue ?? undefined, here: insideCount }}
        mePhoto={mePhoto ?? undefined}
        banterUnread={banter}
        discRef={discRef}
      />
  )
})

BlendnTabBar.displayName = 'BlendnTabBar'

/**
 * A wave while you are checked in and the overlay is closed (SCRUM-630, ROUND3
 * R3 and D · 9.1): the wave banner lands at the top ("Night Cat waved at you ·
 * Vinyl Night · now", their creature) and opens the overlay at their card.
 * Inside the overlay the Room shows its own ✓ capsule. `H.arrive` once, as it
 * lands (the banner's). One banner per wave, keyed by it.
 */
function WaveFromTheTabs({ room }: { room: string | null }) {
  const blendnOpen = useBlendnOpen()
  const { latest } = useRoomWaves()
  if (blendnOpen || !latest) return null
  return (
    <InAppBanner
      key={`${latest.fromUserId}:${latest.at}`}
      kind="wave"
      visual={{ type: 'creature', pseudonym: latest.fromName }}
      title={`${latest.fromName} waved at you`}
      context={room ? `${room} · now` : 'now'}
      onPress={() => {
        // Shown here: the Room must not toast it again as the overlay opens on their card.
        waveShown(latest)
        openBlendn(latest.fromUserId)
      }}
      onDismiss={() => waveShown(latest)}
      testID="wave-banner"
    />
  )
}

export default function TabLayout() {
  const blendnOpen = useBlendnOpen()
  /*
   * A link closes the overlay, at once rather than by its animation (RC drive 6): it is not a route, so a link to a tab
   * switched the tab under it and the Room stayed on top. Told before the link navigates (lib/pendingRoute).
   */
  useEffect(() => (blendnOpen ? onClosingForLink(blendnClosed) : undefined), [blendnOpen])
  const activeRoom = useLiveTitle()
  return (
    <View style={styles.host}>
    {/*
      While Blend'n is open the tabs and the bar under it are hidden from
      VoiceOver and TalkBack: an overlay that only looks modal let a swipe
      walk straight past the room into "Pulse tab".

      Never flattened (SCRUM-991): Fabric flattens a plain view away and keeps
      one that hides its descendants, so each toggle re-parented every tab. The
      home map's SurfaceView came off the window and MapLibre reset its renderer
      on the main thread, waiting for the GL thread: an ANR on Android check-out.
    */}
    <View
      collapsable={false}
      testID="tabs-host"
      style={styles.tabs}
      accessibilityElementsHidden={blendnOpen}
      importantForAccessibility={blendnOpen ? 'no-hide-descendants' : 'auto'}
    >
    <Tabs
      // Each tab, and the bar, laid out afresh when the text size changes (RC drive D2).
      screenLayout={textSizeLayout}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: COLOR.ink },
        /*
         * The content crossfades between tabs over `quick` (DS #2): opacity only, never a slide or a shift, because
         * tabs are peers and nothing here implies depth. Reduce Motion keeps it (opacity is not movement), so no branch.
         */
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: DURATION.quick, easing: Easing.bezier(...EASING.gentle) } },
        /*
         * Absolute, so the scene fills the screen and the bar floats over it.
         *
         * By default react-navigation shortens the scene by the bar's height,
         * which is why content stopped dead at the nav with a visible edge
         * instead of passing under it. The frame draws a translucent bar over
         * the feed; screens clear it with `TAB_BAR_CLEARANCE` in their own
         * bottom padding rather than by losing the space.
         */
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          /*
           * Transparent, or the corners fill.
           *
           * react-navigation paints its own bar behind the custom one and that
           * bar is square, so with an opaque default it showed as two filled
           * wedges either side of the rounded corners. The custom bar is the only
           * surface.
           */
          backgroundColor: 'transparent',
        },
      }}
      tabBar={(props) => (
        <TextSizeBoundary>
          <BlendnTabBar {...props} />
        </TextSizeBoundary>
      )}
    >
      <Tabs.Screen name="events" options={{ title: 'Pulse' }} />
      <Tabs.Screen name="going" options={{ title: 'Going' }} />
      <Tabs.Screen name="chat" options={{ title: 'Banter' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
    </View>
      {/*
        The Blend'n screen, over the tabs *and* the bar, under the root stack.
        An overlay rather than a route so a profile, a DM or the room chat
        pushed from it lands on top of it — see `lib/blendnOverlay.ts`.
      */}
      {blendnOpen ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal pointerEvents="box-none">
          <BlendnScreen />
        </View>
      ) : null}
      <WaveFromTheTabs room={activeRoom} />
      <ForegroundBanners />
    </View>
  )
}

/**
 * How far the bar floats above the screen's bottom edge: the safe area, and
 * on Android 12 dp more over the gesture bar (§13, `components/ds/TabBar`).
 */
export function tabBarBottomGap(bottomInset: number) {
  return bottomInset + (Platform.OS === 'android' ? SPACE.tabBarBottomGapAndroid : 0)
}

/**
 * Where the bar's top edge sits, measured from the top of the screen: the
 * 64 pt capsule (`SIZE.tabBar`) above its bottom gap.
 */
export function tabBarTop(screenHeight: number, bottomInset: number) {
  return screenHeight - tabBarBottomGap(bottomInset) - SIZE.tabBar
}

/**
 * How much bottom padding a screen needs so its last item clears the bar on a
 * home-indicator phone (34 pt): `844 - tabBarTop(844, 34)`. The bar floats
 * (`position: absolute`), so the scene reserves no room for it; screens add
 * this to their own padding. Kept equal to the bar's real height
 * (`__tests__/featuredCardLayout.test.tsx`): it once drifted 20 pt from it.
 */
const HOME_INDICATOR_INSET = 34
export const TAB_BAR_CLEARANCE = SIZE.tabBar + HOME_INDICATOR_INSET

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: COLOR.ink },
  tabs: { flex: 1 },
})
