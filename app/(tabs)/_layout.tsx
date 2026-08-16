import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Tabs } from 'expo-router'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import {
  roomButtonAccessibilityLabel,
  roomButtonPulses,
  roomButtonTarget,
  type RoomButtonTarget,
} from '../../lib/roomButton'
import { getRoomSignal, subscribeRoomSignal } from '../../lib/roomSignal'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

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
 * `EMBER.onGradient` (`#5B1600`), which is the token for *text* on a gradient
 * and reads as a muddy maroon under a coral disc: 6.07:1, and desaturated in a
 * way that makes a thin outline mark look smudged. The brand ink is 7.69:1 on
 * `gradientFrom` and is what the mark is actually drawn in.
 *
 * Not promoted to `lib/theme.ts` — it is the logo's colour, not a UI role, and
 * this is the only place the logo sits on a warm field.
 */
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
    accessibilityRole="button"
    accessibilityLabel={`${label} tab`}
    accessibilityState={isFocused ? { selected: true } : {}}
    onPress={onPress}
    onLongPress={onLongPress}
    style={({ pressed }) => [styles.item, isFocused && styles.itemOn, pressed && styles.pressed]}
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
          size={22}
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
const RoomButton = memo(({ target }: { target: RoomButtonTarget }) => {
  const pulses = roomButtonPulses(target.state)
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!pulses) {
      pulse.setValue(0)
      return
    }
    /*
     * A slow breath, not a blink.
     *
     * `useNativeDriver` because this runs for the whole time somebody is in a
     * room — on the JS thread it would compete with the chat's socket traffic
     * and the roster's re-renders, which is exactly when it must not stutter.
     */
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulses, pulse])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] })

  return (
    <View style={styles.centreSlot}>
      {pulses ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { opacity: haloOpacity, transform: [{ scale }] }]}
        />
      ) : null}
      <Pressable
        onPress={() => {
          /*
           * Each state goes somewhere real, which is the whole reason this is a
           * mode switch rather than a link. A centre button that did nothing in
           * three of its four states would be a dead control in the most
           * prominent position on the screen.
           */
          if (target.state === 'live') router.push('/room')
          else if (target.eventId) {
            router.push({ pathname: '/event/[id]', params: { id: target.eventId } as never })
          } else router.push('/nearby-events')
        }}
        accessibilityRole="button"
        accessibilityLabel={roomButtonAccessibilityLabel(target)}
        style={({ pressed }) => [styles.centreButton, pressed && styles.pressed]}
      >
        {/*
          Gradient in every state, as the frame draws it.

          It used to be gradient only when something was live, on the reasoning
          that a permanently glowing button is one people stop seeing. That was
          right while this was a *status light*. It is the Blend'n mark now — the
          brand's one fixed point in the app — and a logo that changes colour
          depending on whether you are near an event is not a logo.

          The status it used to carry has not been dropped: it is in the badge,
          in the slow breath below, and in where the button goes.
        */}
        <LinearGradient
          colors={[...EMBER_GRADIENT.colors]}
          start={EMBER_GRADIENT.start}
          end={EMBER_GRADIENT.end}
          style={StyleSheet.absoluteFill}
        />
        {/*
          `monogram-white.png` tinted, not `monogram-gradient.png`.

          The gradient monogram is the mark for a dark background — on the warm
          button it would be orange on orange. This is the white silhouette
          tinted to `onGradient`, the same dark-on-warm pairing every gradient
          control in the app uses, and it is the asset the splash already ships
          so no second copy of the logo enters the bundle.
        */}
        <Image
          source={MONOGRAM}
          style={styles.centreMark}
          contentFit="contain"
          tintColor={BRAND_INK}
          accessibilityIgnoresInvertColors
        />
        {target.badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {target.badge > 9 ? '9+' : String(target.badge)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {/*
        No label. The frame's centre slot is a 56pt circle and nothing else —
        the four words either side are the navigation, and a fifth under the
        brand mark made the row read as five tabs with one shouting.
      */}
    </View>
  )
})

RoomButton.displayName = 'RoomButton'

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
    return () => {
      cancelled = true
      clearInterval(id)
      unsubscribe()
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
     * The rounded, blurred surface needs `overflow: 'hidden'` to clip the blur
     * to its 48pt corners, so the outer view lays out and does not clip while
     * `barSurface` is an absolute child holding the fill, the radius and the
     * blur.
     *
     * The centre button used to *need* that split — it hung 16pt above the top
     * edge and anything clipping the surface decapitated it. It no longer does;
     * the split stays because the corner radius still needs somewhere to live.
     */
    <View
      style={[styles.bar, { paddingBottom: tabBarBottomPadding(insets.bottom) }]}
      pointerEvents="box-none"
    >
      <View style={styles.barSurface} pointerEvents="none">
        {/*
          The frame's 20pt backdrop blur. `expo-blur` blurs what is *behind* a
          view, which is exactly right for a bar the feed scrolls under — the
          same reason it was the wrong tool for the onboarding background, where
          there was nothing behind to blur.
        */}
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      </View>
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
  return (
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
           * wedges either side of the 48pt radius. The custom bar is the only
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
  )
}

/*
 * 52, down from 56.
 *
 * The disc is the tallest child in the row, so it — not the 48pt icon-plus-
 * label column — sets the bar's height, and the bar's height is what the
 * Pulse's hero card has left over. Four points here are four points of card.
 *
 * The mark scales with it (34 -> 32), so it still fills ~61% of the disc, the
 * same proportion it had at 56.
 */
const CENTRE_SIZE = 52

/**
 * How much bottom padding a screen needs so its last item clears the bar.
 *
 * The bar is `position: absolute`, so the scene no longer reserves room for it
 * and content scrolls underneath. Screens add this to their own bottom inset;
 * exported because a hardcoded guess in each one drifts the moment the bar
 * changes height.
 */
export const TAB_BAR_CLEARANCE = 88

/**
 * The bar's own chrome, so callers can work out where its top edge actually is.
 *
 * `TAB_BAR_CLEARANCE` is a *padding* number — how much a scroll must reserve so
 * its last item is reachable — and it has been 88 through two changes of the
 * bar's real height. That is fine for padding and wrong for anything that needs
 * the edge: at 88 it under-reported the bar by 20pt, and the Pulse's hero card
 * was sized against it.
 *
 * Height is `paddingTop + line + max(bottom inset, 20)`, where the line is the
 * 56pt centre button — the tallest child now that it is seated in the row
 * rather than raised above it.
 */
export const TAB_BAR_PADDING_TOP = 8
export const TAB_BAR_LINE = CENTRE_SIZE

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
 * `8 + 52 + 28 = 88` on the phone this was measured on — which is finally the
 * same number as `TAB_BAR_CLEARANCE`. Those two had drifted 20pt apart, and
 * anything placing an edge against the bar was reading the padding constant and
 * getting it wrong.
 */
export function tabBarTop(screenHeight: number, bottomInset: number) {
  return screenHeight - (TAB_BAR_PADDING_TOP + TAB_BAR_LINE + tabBarBottomPadding(bottomInset))
}

const styles = StyleSheet.create({
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
     * 10, down from the frame's 18.
     *
     * The frame's 18 put the icon boxes at y=18 and every label at y=42, which
     * is where all four of its labels sit. That still holds — the whole row
     * simply starts 8pt lower.
     *
     * Seating the centre button grew this bar from 100 to 108: the row's line
     * height is now the 56pt disc rather than the 48pt icon-plus-label column.
     * Those 8pt came out of the screen above, and the Pulse's hero card is
     * sized against exactly that space. Taking them back off the top padding
     * returns the bar to its previous height and gives the card the room.
     */
    paddingTop: TAB_BAR_PADDING_TOP,
    // Frame: first item's left edge is 27.51, last item's right edge is 359.64
    // in a 390pt frame.
    paddingHorizontal: 27.5,
  },
  // The surface, separate from the layout — see the note at the render site.
  barSurface: {
    ...StyleSheet.absoluteFillObject,
    // Frame `1141:4643`: `rgba(27,25,25,0.9)` under a 20pt backdrop blur, with
    // 48pt top corners.
    backgroundColor: 'rgba(27,25,25,0.9)',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: EMBER.gradientFrom,
        shadowOpacity: 0.06,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: -10 },
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  item: { alignItems: 'center' },
  /*
   * The frame's active item is not a different component, it is the same one at
   * 110%: its icon is 24.2 against everyone else's 22, and its label box is
   * 26.4 against 24. Both are exactly ×1.1, so one transform reproduces it and
   * there is no second set of sizes to keep in step.
   */
  itemOn: { transform: [{ scale: 1.1 }] },
  // A fixed box, so glyphs of different natural heights (the frame's are 24.2,
  // 18, 22×16 and 16) all put their label on the same line.
  iconBox: { height: 24, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    // Same footprint as the 22pt glyph it replaces, so the row does not shift
    // when the photo arrives.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarFocused: { borderColor: EMBER.accent },
  itemLabel: {
    ...EMBER_TYPE.meta,
    // 16/24 medium, as drawn. 11 was a guess that made every label a caption.
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
  },
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
    borderRadius: CENTRE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        // The frame's `Button:shadow` — the warm bloom under the button.
        shadowColor: EMBER.gradientFrom,
        shadowOpacity: 0.45,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  /*
   * The mark, at 24 rather than the frame's 17.5.
   *
   * The frame draws a `+` in a 17.5pt box, and a plus is a single stroke that
   * reads at any size. The Blend'n monogram is a two-counter line mark — at
   * 17.5 inside a 56pt circle it fills 31% and reads as a smudge. 24 puts it at
   * 43%, which is where a logo-in-a-circle normally sits.
   *
   * Deliberate deviation, recorded in `docs/PULSE.md` for the designer.
   */
  /*
   * 34, and the number comes from a stroke measurement rather than a ratio.
   *
   * The frame draws a `+`: one stroke, legible at any size. The Blend'n
   * monogram is an *outline* mark with two interior counters — `monogram-
   * white.png` is 453×534, ink box 441×522, and its strokes measure 22px and
   * 30px across the middle row, so **5.0% of the mark's width**. At the old 28
   * it drew 23.6 × 28 and the stroke landed at 1.18pt, against roughly 2pt for
   * every other glyph in the bar. It was the lightest thing in the row while
   * being the most important control in it.
   *
   * The mark's aspect is 0.845, so at 32 it draws 27 × 32 — inside the 36.8pt
   * square inscribed in the 52pt disc, with the stroke at 1.35pt. Not parity
   * with its neighbours, but 14% closer than the old 28, and it stops looking
   * like a badge floating in a field of coral.
   *
   * **A filled variant of the mark would close the rest of the gap.** An
   * outline logo under 40pt is a drawing problem, not a layout one — raised for
   * the designer in `docs/PULSE.md`.
   */
  centreMark: { width: 32, height: 32 },
  halo: {
    position: 'absolute',
    // Level with the button now that the button is level with the bar.
    top: 0,
    width: CENTRE_SIZE,
    height: CENTRE_SIZE,
    borderRadius: CENTRE_SIZE / 2,
    backgroundColor: EMBER.gradientFrom,
  },

  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...EMBER_TYPE.meta, color: EMBER.accent, fontSize: 11, lineHeight: 14 },

  pressed: { opacity: 0.7 },
})
