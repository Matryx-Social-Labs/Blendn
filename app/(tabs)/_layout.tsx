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
  roomButtonLabel,
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
    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
  >
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
 * Raised above the bar, as all three frames draw it. Gradient only when there is
 * something live to go to — a permanently glowing button is one people stop
 * seeing, and the two states that glow are the two that are time-critical.
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
  const live = target.state === 'live' || target.state === 'checkin'

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
        {live ? (
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Ionicons
          name={target.state === 'checkin' ? 'location' : 'sparkles'}
          size={24}
          color={live ? EMBER.onGradient : EMBER.textSecondary}
        />
        {target.badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {target.badge > 9 ? '9+' : String(target.badge)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={styles.centreLabel} numberOfLines={1}>
        {roomButtonLabel(target.state)}
      </Text>
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
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
    >
      {/*
        The frame's 20pt backdrop blur. `expo-blur` blurs what is *behind* a
        view, which is exactly right for a bar the feed scrolls under — the same
        reason it was the wrong tool for the onboarding background, where there
        was nothing behind to blur.
      */}
      <BlurView
        intensity={20}
        tint="dark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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

const CENTRE_SIZE = 56

/**
 * How much bottom padding a screen needs so its last item clears the bar.
 *
 * The bar is `position: absolute`, so the scene no longer reserves room for it
 * and content scrolls underneath. Screens add this to their own bottom inset;
 * exported because a hardcoded guess in each one drifts the moment the bar
 * changes height.
 */
export const TAB_BAR_CLEARANCE = 88

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 8,
    // Frame `1141:4643`: `rgba(27,25,25,0.9)` under a 20pt backdrop blur, with
    // 48pt top corners. It was 0.96 and 32 — nearly opaque and half the radius.
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
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
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

  centreSlot: { flex: 1, alignItems: 'center', gap: 4 },
  centreButton: {
    width: CENTRE_SIZE,
    height: CENTRE_SIZE,
    borderRadius: CENTRE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
    // Lifted so it breaks the bar's top edge, as every frame draws it. Negative
    // margin rather than absolute positioning, so the slot still reserves its
    // width and the four tabs space evenly around it.
    marginTop: -22,
  },
  halo: {
    position: 'absolute',
    top: -22,
    width: CENTRE_SIZE,
    height: CENTRE_SIZE,
    borderRadius: CENTRE_SIZE / 2,
    backgroundColor: EMBER.gradientFrom,
  },
  centreLabel: {
    ...EMBER_TYPE.meta,
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    marginTop: -16,
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
