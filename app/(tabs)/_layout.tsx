import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router/js-tabs'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import {
  roomButtonAccessibilityLabel,
  roomButtonGlow,
  roomButtonTarget,
  type RoomButtonTarget,
} from '../../lib/roomButton'
import { getRoomSignal, subscribeRoomSignal } from '../../lib/roomSignal'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { MOTION_DURATION } from '../../lib/motion'
import { popIn, popOut } from '../../components/motion/presence'
import ScalePress from '../../components/motion/ScalePress'
import { BlendnScreen } from '../../components/blendn/BlendnScreen'
import { openBlendn, useBlendnOpen } from '../../lib/blendnOverlay'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE, TYPE } from '../../lib/theme'

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

/**
 * The mark on the centre button. Tinted at the call site — see `centreMark`.
 *
 * The **bold** cut, not the one the splash uses.
 *
 * `monogram-white.png` has strokes at 4.86% of the mark's width, which at 32pt
 * draws a 1.35pt line against roughly 2pt for every other glyph in this bar —
 * the lightest thing in the row while being the most important control in it.
 * `monogram-white-bold.png` is the same artwork with its strokes dilated to
 * 6.40%, so the line lands at 1.78pt: near parity, with every counter still
 * open.
 *
 * It is a thickening of the designer's own file, not a redraw. A genuinely
 * *filled* variant was tried first by flood-filling the enclosed regions and it
 * destroys the mark — the B becomes a blob — so that ask stands, and now has
 * evidence behind it.
 *
 * The splash and the intro keep the original: at 118pt the thin cut is the
 * better drawing, and this exists for small sizes only.
 */
const MONOGRAM = require('../../assets/logo/monogram-white-bold.png')

/**
 * The brand's ink, sampled from the logo artwork rather than invented.
 *
 * Both the mono lockup and the full lockup draw the mark in `#1B1931` — one
 * colour, byte-identical across the two files. The button was tinting it
 * `EMBER.onGradient` (`#5B1600`), which is the token for *text* on an accent
 * fill and reads as a muddy maroon under a coral disc: 6.07:1, and desaturated
 * in a way that makes a thin outline mark look smudged. The brand ink is 7.69:1
 * on `EMBER.accent` and is what the mark is actually drawn in.
 *
 * Not promoted to `lib/theme.ts` — it is the logo's colour, not a UI role, and
 * this is the only place the logo sits on a warm field.
 */
// design-exception: the logo's own ink, sampled from the artwork — not a UI role
const BRAND_INK = '#1B1931'

const TABS = [
  { name: 'events', label: 'Pulse', icon: 'flame', iconOff: 'flame-outline' },
  { name: 'going', label: 'Going', icon: 'bookmark', iconOff: 'bookmark-outline' },
  { name: 'chat', label: 'Banter', icon: 'chatbubbles', iconOff: 'chatbubbles-outline' },
  { name: 'profile', label: 'Me', icon: 'person', iconOff: 'person-outline' },
] as const

const TabButton = memo(({
  label,
  icon,
  isFocused,
  onPress,
  onLongPress,
  avatarUrl,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  isFocused: boolean
  onPress: () => void
  onLongPress: () => void
  /**
   * Your own photograph, on the Me tab.
   *
   * The screens used to carry an avatar in a top bar that also held a wordmark
   * and a settings gear. That bar is gone — it is not in any frame — and this is
   * where a profile picture belongs anyway: the tab that *is* you, rather than a
   * third control in a header.
   *
   * Falls back to the person glyph. A broken image where a face should be is
   * worse than no face, and a Google avatar is deliberately not used as the
   * source (it often 404s) — this is `profile.photos[0]`, the same photo the
   * rest of the app shows.
   */
  avatarUrl?: string | null
}) => (
  <Pressable
    /*
     * A tab, named by its name: VoiceOver adds "tab, 2 of 5" itself, so the
     * old "Pulse tab" label was read as "Pulse tab, tab". `selected` is always
     * stated, so an unselected tab says so too.
     */
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: isFocused }}
    onPress={onPress}
    onLongPress={onLongPress}
    /*
     * The items are content-sized (see `bar`), so "Me" alone was a 23pt-wide
     * target. The slop reaches into the gaps either side and up to the bar's
     * edge without moving anything: equal-width `flex: 1` cells would reach
     * the same area but re-space the measured row.
     */
    hitSlop={TAB_HIT_SLOP}
    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
  >
    <View style={styles.iconBox}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.avatar, isFocused && styles.avatarFocused]}
          contentFit="cover"
        />
      ) : (
        <Ionicons
          name={icon}
          size={ICON.lg}
          color={isFocused ? EMBER.accent : EMBER.textSecondary}
        />
      )}
    </View>
    {/*
      Labelled, not icon-only. The bar this replaced showed four unlabelled
      glyphs, and two of the five slots here are words the product invented —
      nobody guesses that a bookmark means "Going" or a flame means "Pulse".
    */}
    <Text
      style={[styles.itemLabel, isFocused && styles.itemLabelOn]}
      numberOfLines={1}
      /*
       * Capped at 1.2 — tighter than anywhere else, and the bar is why.
       *
       * `tabBarTop` computes the bar's height from `TAB_BAR_LINE`, a constant.
       * A label that grows does not make the bar taller; it overflows a box
       * whose size something else has already decided, and takes the Pulse's
       * hero card sizing with it, since that is measured against the same
       * number.
       *
       * Five words across a 440pt bar is the tightest horizontal budget in the
       * app. Somebody who needs larger type gets it on every screen the bar
       * leads to.
       */
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Text>
  </Pressable>
))

TabButton.displayName = 'TabButton'

/**
 * The Blend'n button.
 *
 * Seated in the bar rather than raised above it — see `centreSlot` for why the
 * frame's `y=-16` does not survive contact with a real screen.
 */
/*
 * The live dot fades in once, when the state starts, and then holds still.
 * It used to be a halo breathing out to 1.42x on a loop plus a ring around the
 * button: effects on effects, a warm glow that read as generated, and a loop
 * running for as long as somebody was in a room. Status is a still mark — the
 * way Open marks a live broadcast, with a dot and nothing else.
 */
const liveDotIn = FadeIn.duration(MOTION_DURATION.normal)

const RoomButton = memo(({ target }: { target: RoomButtonTarget }) => {
  const dot = roomButtonGlow(target.state)
  // The unread badge only appears in `live`, and says it already.
  const showDot = dot !== 'none' && target.badge === 0

  return (
    <View style={styles.centreSlot}>
      <ScalePress
        onPress={() => {
          /*
           * Always the Blend'n screen. It used to go somewhere different in
           * each state — the Room when live, the event page when you had one
           * today, the nearby list otherwise — so the centre of the app had no
           * home until you were checked in. The screen now reads your state
           * itself and shows Tonight or the Room (`components/blendn`); the
           * states still decide the dot and the badge on this button.
           */
          openBlendn()
        }}
        accessibilityRole="button"
        accessibilityLabel={roomButtonAccessibilityLabel(target)}
        style={styles.centreButton}
        /*
         * Squashes under the finger (Airbnb's tactile tab button): 0.9 on
         * press-in, eased back on release. The screen then opens *out of*
         * this disc, so the press and the open read as one gesture.
         */
        pressedScale={0.9}
      >
        {/*
          Flat accent in every state (the fill lives on `centreButton`).

          It used to be lit only when something was live, on the reasoning that
          a permanently lit button is one people stop seeing. That was right
          while this was a *status light*. It is the Blend'n mark now — the
          brand's one fixed point in the app — and a logo that changes colour
          depending on whether you are near an event is not a logo.

          The status it used to carry has not been dropped: it is in the badge,
          the still dot below, and in where the button goes.
        */}
        {/*
          `monogram-white.png` tinted, not `monogram-gradient.png`.

          The gradient monogram is the mark for a dark background — on the warm
          button it would be orange on orange. This is the white silhouette
          tinted to `BRAND_INK`, dark on warm like every accent control in the
          app, and it is the asset the splash already ships
          so no second copy of the logo enters the bundle.
        */}
        <Image
          source={MONOGRAM}
          style={styles.centreMark}
          contentFit="contain"
          tintColor={BRAND_INK}
          accessibilityIgnoresInvertColors
        />
        {/*
          Pops in on 0 → unread and out when read; stays mounted while the
          count changes, so a new message in a busy room only changes the digit.
        */}
        {target.badge > 0 ? (
          <Animated.View style={styles.badge} entering={popIn} exiting={popOut}>
            <Text style={styles.badgeText}>
              {target.badge > 9 ? '9+' : String(target.badge)}
            </Text>
          </Animated.View>
        ) : null}
      </ScalePress>
      {/*
        Outside the Pressable, which clips to its disc: the dot sits on the
        disc's edge, ringed in the page colour so it reads as cut out of it.
        White says "there is a room here"; green says "you are in it".
      */}
      {showDot ? (
        <Animated.View
          key={dot}
          entering={liveDotIn}
          pointerEvents="none"
          style={[styles.liveDot, dot === 'live' ? styles.liveDotLive : styles.liveDotInvite]}
        />
      ) : null}
      {/*
        No label. The frame's centre slot is a 56pt circle and nothing else —
        the four words either side are the navigation, and a fifth under the
        brand mark made the row read as five tabs with one shouting.
      */}
    </View>
  )
})

RoomButton.displayName = 'RoomButton'

// expo-router 56+ vendors React Navigation and does not export the bottom-tabs
// types publicly, so take the tab bar's props from the Tabs component itself.
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

const BlendnTabBar = memo(({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets()
  const [target, setTarget] = useState<RoomButtonTarget>({
    state: 'idle',
    eventId: null,
    badge: 0,
  })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  /*
   * Your photo for the Me tab.
   *
   * Read once through `getProfile`, which is cache-first — every screen that
   * shows your profile has already warmed it, so on the common path this costs
   * nothing and the bar draws with a face on first paint.
   *
   * `photos[0]`, not `user.image`: the OAuth avatar is deliberately not used
   * anywhere in this app because it often 404s.
   */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const me = await apiClient.getCurrentUser()
        if (cancelled || !me?.id) return
        const r = await apiClient.getProfile(me.id)
        if (cancelled || !r.success) return
        const data = r.data as { profile_photos?: string[]; photos?: string[] } | undefined
        // Same precedence the rest of the app uses.
        const primary =
          (Array.isArray(data?.profile_photos) && data.profile_photos[0]) ||
          (Array.isArray(data?.photos) && data.photos[0]) ||
          null
        if (primary) setAvatarUrl(primary)
      } catch (e) {
        Logger.debug('navigation', 'avatar lookup failed', { error: e })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

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

    const recompute = () => {
      const signal = getRoomSignal()
      setTarget(
        roomButtonTarget({
          activeEventId,
          insideEventId: signal.insideEventId,
          todayEventIds: signal.todayEventIds,
        })
      )
    }

    const read = async () => {
      try {
        const r = await apiClient.getActiveCheckins()
        if (cancelled) return
        const active = r.success ? r.data?.checkIns?.[0] : null
        activeEventId = active?.eventId ?? null
        recompute()
      } catch (e) {
        Logger.debug('navigation', 'room button poll failed', { error: e })
      }
    }

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
      if (state === 'active') void read()
    })
    return () => {
      cancelled = true
      clearInterval(id)
      unsubscribe()
      unsubscribeCheckIn()
      appState.remove()
    }
  }, [])

  const press = useCallback(
    (routeKey: string, routeName: string, isFocused: boolean) => () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      })
      if (!isFocused && !event.defaultPrevented) navigation.navigate(routeName)
    },
    [navigation]
  )

  const longPress = useCallback(
    (routeKey: string) => () => {
      navigation.emit({ type: 'tabLongPress', target: routeKey })
    },
    [navigation]
  )

  const byName = useMemo(() => {
    const map: Record<string, { key: string; index: number }> = {}
    state.routes.forEach((r, i) => {
      map[r.name] = { key: r.key, index: i }
    })
    return map
  }, [state.routes])

  const renderTab = (tab: (typeof TABS)[number]) => {
    const route = byName[tab.name]
    if (!route) return null
    const isFocused = state.index === route.index
    return (
      <TabButton
        key={tab.name}
        label={tab.label}
        icon={isFocused ? tab.icon : tab.iconOff}
        isFocused={isFocused}
        onPress={press(route.key, tab.name, isFocused)}
        onLongPress={longPress(route.key)}
        avatarUrl={tab.name === 'profile' ? avatarUrl : null}
      />
    )
  }

  return (
    /*
     * Two views, and the split is the whole reason the corners were filled.
     *
     * The rounded surface clips to its `EMBER_RADIUS.card` corners, so the
     * outer view lays out and does not clip while `barSurface` is an absolute
     * child holding the fill and the radius.
     *
     * The centre button used to *need* that split — it hung 16pt above the top
     * edge and anything clipping the surface decapitated it. It no longer does;
     * the split stays because the corner radius still needs somewhere to live.
     */
    <View
      style={[styles.bar, { paddingBottom: tabBarBottomPadding(insets.bottom) }]}
      pointerEvents="box-none"
      accessibilityRole="tablist"
    >
      {/* Opaque and flat: no glass (tasks/lessons.md). */}
      <View style={styles.barSurface} pointerEvents="none" />
      {renderTab(TABS[0])}
      {renderTab(TABS[1])}
      <RoomButton target={target} />
      {renderTab(TABS[2])}
      {renderTab(TABS[3])}
    </View>
  )
})

BlendnTabBar.displayName = 'BlendnTabBar'

export default function TabLayout() {
  const blendnOpen = useBlendnOpen()
  return (
    <View style={styles.host}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: EMBER.bg },
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
      tabBar={(props) => <BlendnTabBar {...props} />}
    >
      <Tabs.Screen name="events" options={{ title: 'Pulse' }} />
      <Tabs.Screen name="going" options={{ title: 'Going' }} />
      <Tabs.Screen name="chat" options={{ title: 'Banter' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
      {/*
        The Blend'n screen, over the tabs *and* the bar, under the root stack.
        An overlay rather than a route so a profile, a DM or the room chat
        pushed from it lands on top of it — see `lib/blendnOverlay.ts`.
      */}
      {blendnOpen ? <BlendnScreen /> : null}
    </View>
  )
}

/*
 * `CONTROL.lg`, 56 — the primary-action height, which is what this is.
 *
 * The disc is the tallest child in the row, so it — not the icon-plus-label
 * column — sets the bar's height, and the bar's height is what the Pulse's
 * hero card has left over (`tabBarTop`).
 *
 * The mark stays at 32, ~57% of the disc.
 */
const CENTRE_SIZE = CONTROL.lg

/**
 * How much bottom padding a screen needs so its last item clears the bar.
 *
 * The bar is `position: absolute`, so the scene no longer reserves room for it
 * and content scrolls underneath. Screens add this to their own bottom inset;
 * exported because a hardcoded guess in each one drifts the moment the bar
 * changes height.
 */
export const TAB_BAR_CLEARANCE = 92

/**
 * The bar's own chrome, so callers can work out where its top edge actually is.
 *
 * `TAB_BAR_CLEARANCE` is a *padding* number — how much a scroll must reserve so
 * its last item is reachable — and it once drifted 20pt from the bar's real
 * height. That is fine for padding and wrong for anything that needs the edge:
 * the Pulse's hero card was sized against it. Keep the two equal.
 *
 * Height is `paddingTop + line + max(bottom inset, 20)`, where the line is the
 * 56pt centre button — the tallest child now that it is seated in the row
 * rather than raised above it.
 */
export const TAB_BAR_PADDING_TOP = 8
export const TAB_BAR_LINE = CENTRE_SIZE

/**
 * Each tab's touch area past its drawn box: up to the bar's top edge, and 12
 * into the ~27pt gap either side, so neighbours do not overlap. Takes "Me"
 * from 23pt wide to 47.
 */
const TAB_HIT_SLOP = { top: TAB_BAR_PADDING_TOP, bottom: SPACE.md, left: SPACE.md, right: SPACE.md }

/**
 * The bar's bottom padding.
 *
 * `insets.bottom` is 34 on a home-indicator phone, and the indicator itself is
 * a 5pt pill sitting about 8pt off the bottom edge — so the full inset is more
 * room than it needs. Six points come back to the page, and 20 is the floor for
 * a device that reports no inset at all.
 */
export function tabBarBottomPadding(bottomInset: number) {
  return Math.max(bottomInset - 6, 20)
}

/**
 * Where the bar's top edge sits, measured from the top of the screen.
 *
 * `8 + 56 + 28 = 92` on a home-indicator phone — the same number as
 * `TAB_BAR_CLEARANCE`. Those two had once drifted 20pt apart, and anything
 * placing an edge against the bar was reading the padding constant and getting
 * it wrong.
 */
export function tabBarTop(screenHeight: number, bottomInset: number) {
  return screenHeight - (TAB_BAR_PADDING_TOP + TAB_BAR_LINE + tabBarBottomPadding(bottomInset))
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: EMBER.bg },
  /*
   * Frame `1141:4827`, measured rather than guessed.
   *
   * `space-between` with **content-sized** items, not `flex: 1` and
   * `space-around`. The frame's five slots are 40.08 / 56.23 / 56 / 52.03 /
   * 22.98 wide with a uniform 26.66 gap between every pair — which is what
   * space-between over content-sized children produces, and is why the item
   * positions look irregular. Equal-width slots made every label share the
   * widest one's box, so "Me" sat in a 78pt cell and the row read as cramped.
   *
   * `paddingTop: 18` puts the icon boxes at y=18 and therefore every label at
   * y=42, which is where all four of the frame's labels sit despite their
   * containers starting at four different heights.
   */
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    /*
     * 8 (`TAB_BAR_PADDING_TOP`), down from the frame's 18.
     *
     * The frame's 18 put the icon boxes at y=18 and every label at y=42, which
     * is where all four of its labels sit. They still share that one line —
     * the whole row simply starts 10pt higher.
     *
     * Seating the centre button made the row's line height the 56pt disc
     * rather than the icon-plus-label column. Those points come out of the
     * screen above, and the Pulse's hero card is sized against exactly that
     * space, so the top padding stays small.
     */
    paddingTop: TAB_BAR_PADDING_TOP,
    // Frame: first item's left edge is 27.51, last item's right edge is 359.64
    // in a 390pt frame.
    paddingHorizontal: SPACE.xl,
  },
  // The surface, separate from the layout — see the note at the render site.
  barSurface: {
    ...StyleSheet.absoluteFill,
    // Flat and opaque, no glow: the frame's translucent fill under a 20pt
    // blur with a warm upward shadow is glass (tasks/lessons.md). The sunken
    // surface is what that fill rendered as over the page.
    backgroundColor: EMBER.surfaceSunken,
    borderTopLeftRadius: EMBER_RADIUS.card,
    borderTopRightRadius: EMBER_RADIUS.card,
    overflow: 'hidden',
  },
  item: { alignItems: 'center' },
  /*
   * The frame's active item is not a different component, it is the same one at
   * 110%: its icon is 24.2 against everyone else's 22, and its label box is
   * 26.4 against 24. Both are exactly ×1.1, so one transform reproduces it and
   * there is no second set of sizes to keep in step.
   */
  // A fixed box, so glyphs of different natural heights (the frame's are 24.2,
  // 18, 22×16 and 16) all put their label on the same line.
  iconBox: { height: ICON.lg, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: ICON.lg,
    height: ICON.lg,
    borderRadius: EMBER_RADIUS.pill,
    // Same footprint as the 22pt glyph it replaces, so the row does not shift
    // when the photo arrives.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarFocused: { borderColor: EMBER.accent },
  // The caption role: tab labels name the icon above them and should not
  // compete with the content (the frame's 16/24 did).
  itemLabel: { ...TYPE.caption, marginTop: SPACE.xs },
  itemLabelOn: { color: EMBER.accent },

  /*
   * Centred in the bar's content band, not hanging above it.
   *
   * The frame draws the container at `y=-16`, so it cleared the bar's top edge
   * by 16 and the button read as a sticker stuck onto the nav. On a real screen
   * it also *collides*: the Scene's docked CTA and the Pulse's filter control
   * both end just above the bar, and a button that leaves the bar overlaps
   * them, with its warm halo bleeding onto whatever is behind.
   *
   * `alignSelf: 'center'` against the row's `alignItems: 'flex-start'` puts the
   * 56pt disc in the middle of the 66pt band the four tabs occupy — visually
   * centred, entirely inside the surface, nothing to collide with.
   */
  centreSlot: { alignItems: 'center', alignSelf: 'center' },
  centreButton: {
    width: CENTRE_SIZE,
    height: CENTRE_SIZE,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // No bloom. The frame's warm `Button:shadow` was the other half of the
    // glow; the flat accent disc on the dark bar needs nothing to stand out.
  },
  /*
   * The mark, at 32 rather than the frame's 17.5, and the number comes from a
   * stroke measurement rather than a ratio.
   *
   * The frame draws a `+`: one stroke, legible at any size. The Blend'n
   * monogram is an *outline* mark with two interior counters — `monogram-
   * white.png` is 453×534, ink box 441×522, and its strokes measure 22px and
   * 30px across the middle row, so **5.0% of the mark's width**. At the old 28
   * it drew 23.6 × 28 and the stroke landed at 1.18pt, against roughly 2pt for
   * every other glyph in the bar. It was the lightest thing in the row while
   * being the most important control in it.
   *
   * The mark's aspect is 0.845, so at 32 it draws 27 × 32 — inside the 39.6pt
   * square inscribed in the 56pt disc, with the stroke at 1.35pt. Not parity
   * with its neighbours, but 14% closer than the old 28, and it stops looking
   * like a badge floating in a field of coral.
   *
   * **A filled variant of the mark would close the rest of the gap.** An
   * outline logo under 40pt is a drawing problem, not a layout one — raised for
   * the designer in `docs/PULSE.md`.
   */
  centreMark: {
    width: 32,
    height: 32,
    /*
     * Optically centred, which is not the same as centred.
     *
     * The asset's **bounding box** is exact — 8pt of padding on all four sides
     * — so `contentFit: 'contain'` places it perfectly by the box, and it
     * still reads as sitting left in the disc. The mark's ink is not evenly
     * distributed inside its own box: the left is stacked solid bars and the
     * right tapers to a point, so its centre of **mass** is 9.2% left of the
     * canvas centre and the eye follows the mass.
     *
     * Measured both ways, at 320pt in a 520pt disc:
     *
     * | shift | ink gap L / R | mass offset |
     * |---|---|---|
     * | 0%    | 124 / 125 — box centred | −23.9 |
     * | 9%    | 148 / 101 | +0.1 — mass centred |
     *
     * The two definitions disagree by 9%, which is the whole problem. 5% is
     * the midpoint: neither gap nor mass is exactly zero, and nothing looks
     * wrong — which is what optical centring is. 1.6pt at this size.
     *
     * A transform rather than a margin, so it moves the glyph without moving
     * the box the badge is positioned against.
     */
    transform: [{ translateX: 1.6 }],
  },
  /*
   * 8pt of colour in a 2pt ring of the page background, on the disc's top-right
   * edge. The ring is the cut-out that keeps a white or green dot legible on the
   * warm disc; RN grows borders inward, so the footprint is 12 and the core 8.
   */
  liveDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  liveDotInvite: { backgroundColor: EMBER.textPrimary },
  liveDotLive: { backgroundColor: EMBER.success },

  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: CONTROL.badge,
    height: CONTROL.badge,
    paddingHorizontal: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...TYPE.caption, color: EMBER.bg },

  pressed: { opacity: 0.7 },
})
