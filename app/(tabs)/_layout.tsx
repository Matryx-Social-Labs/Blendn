import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Tabs } from 'expo-router'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
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
import { EMBER, EMBER_GRADIENT, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

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
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  isFocused: boolean
  onPress: () => void
  onLongPress: () => void
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${label} tab`}
    accessibilityState={isFocused ? { selected: true } : {}}
    onPress={onPress}
    onLongPress={onLongPress}
    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
  >
    <Ionicons
      name={icon}
      size={22}
      color={isFocused ? EMBER.accent : EMBER.textSecondary}
    />
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
      />
    )
  }

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
      pointerEvents="box-none"
    >
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(27,25,25,0.96)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
  itemLabel: { ...EMBER_TYPE.meta, fontSize: 11, lineHeight: 14 },
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
  centreLabel: { ...EMBER_TYPE.meta, fontSize: 11, lineHeight: 14, marginTop: -18 },

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
