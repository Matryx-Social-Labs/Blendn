import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { badgeLabel, notificationAge, type NotificationItem } from '../../lib/notificationFormat'
import { navigateFromNotificationData } from '../../lib/notifications'
import { subscribeToBell } from '../../lib/socketClient'
import ActionTray from '../ActionTray'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme'
import { popIn, popOut } from '../motion/presence'
import ScalePress from '../motion/ScalePress'
import { RisingSheet, SheetFlatList, SheetModal } from '../motion/RisingSheet'
import { Grabber } from '../ui/Grabber'

/**
 * The bell in The Pulse's top bar — frame `1141:4819`'s right glyph.
 *
 * ## It was left out on purpose, and the reason has expired
 *
 * `PulseTopBar` drew only the wordmark, because "a notifications centre is
 * designed and not built; no endpoint returns a notification, and a bell that
 * opens nothing is a dead control in the most-tapped corner of the screen."
 * `GET /notifications` exists now (blendn-admin #242), so it does.
 *
 * ## Opening it marks everything read
 *
 * Not each row as you scroll past it, and not a per-row control. The badge
 * answers one question — "is there something I have not seen" — and looking at
 * the list is the act that answers it. Marking per row means a badge that
 * stays lit after you have read everything in it, which teaches people to
 * ignore the badge.
 *
 * The rows still *render* their unread state for the length of the session, so
 * the sheet does not blank out the moment it opens; only the server-side count
 * is cleared.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  /*
   * The last load failed. Only drawn when there is nothing to show: a list
   * that loaded once stays on screen through a failed refresh, and "Nothing
   * yet" over a failed request would be the app telling you something false.
   */
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const insets = useSafeAreaInsets()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiClient.getNotifications({ limit: 30 })
      if (result.success && result.data) {
        setItems(result.data.notifications)
        setUnread(result.data.unreadCount)
        setLoadFailed(false)
      } else {
        setLoadFailed(true)
      }
    } catch (error) {
      Logger.warn('notifications', 'load:failed', { error: error as never })
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  /*
   * The count whenever the tab comes into view, so the badge is right before
   * anybody taps.
   *
   * One request per focus, not a poll. This was once-on-mount, deliberately,
   * with a note that the cheap version had to be shown insufficient first. It
   * was: driven across two phones, the other person revealed and a rating
   * opened, three new rows landed, and the badge kept saying 5 for the whole
   * session. A bell that polls is still the wrong answer; a bell that looks
   * when you look at it is the cheapest right one.
   */
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  /*
   * And the moment a row lands while the app is open — a friend request on
   * the Pulse no longer waits for you to leave and come back. The server says
   * so on your own socket room, and the bell asks the server for the count
   * rather than adding one: it read 3 for one row on the owner's iPhone when
   * the app held three sockets, and a re-read cannot drift that way.
   */
  useEffect(() => subscribeToBell(() => void load()), [load])

  const openSheet = useCallback(() => {
    setOpen(true)
    if (unread > 0) {
      // Optimistic: the badge clears on tap rather than after a round trip,
      // because the round trip is the slowest part of an action whose whole
      // job is to feel like "seen".
      setUnread(0)
      // Load *after* the mark-read settles. Firing both at once let the load
      // come back with the pre-read count and put the badge straight back —
      // the "5" that survived opening the sheet on the simulator.
      apiClient
        .markNotificationsRead()
        .catch((error) => {
          Logger.warn('notifications', 'markRead:failed', { error: error as never })
        })
        .finally(() => void load())
      return
    }
    void load()
  }, [load, unread])

  /*
   * The **same** switch a tapped push goes through.
   *
   * `navigateFromNotificationData` already existed for
   * `setupNotificationResponseListener`, and a bell row and a push describe
   * the same event carrying the same payload — the server stores exactly what
   * it sent. A second copy here would be a second place to add a case, and the
   * one nobody remembered would quietly open the wrong screen.
   *
   * Wiring the bell through it is also what turned up that five of the eleven
   * kinds — message requests, waitlist promotions and both reveal kinds — fell
   * straight through and navigated nowhere. That was a push bug too.
   */
  const openItem = useCallback((item: NotificationItem) => {
    setOpen(false)
    navigateFromNotificationData(item.data ?? undefined)
  }, [])

  const badge = badgeLabel(unread)

  return (
    <>
      {/* Scales like the Scene's top-bar icons; no haptic, the sheet is the answer. */}
      <ScalePress
        haptic={false}
        pressedScale={0.9}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
        }
        // The box is the glyph, so its right edge lands on the page margin like
        // the city chip below it; `hitSlop` makes the target 48pt.
        hitSlop={12}
        style={styles.bell}
      >
        <Ionicons name="notifications-outline" size={ICON.lg} color={EMBER.textPrimary} />
        {/*
          The badge pops in when there is something new (0 → any) and out when
          it is cleared. It stays mounted while the count moves between
          non-zero numbers, so "3 → 4" just changes the digit — a count that
          ticks up is not a new arrival.
        */}
        {badge ? (
          <Animated.View style={styles.badge} pointerEvents="none" entering={popIn} exiting={popOut}>
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
              {badge}
            </Text>
          </Animated.View>
        ) : null}
      </ScalePress>

      <SheetModal
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        {/*
          Tapping the dim closes it. A sheet with no way out but a small × is
          the most common way a modal traps somebody.
        */}
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
        <RisingSheet style={[styles.sheet, { paddingBottom: insets.bottom + SPACE.lg }]}>
          <Grabber style={styles.grabber} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Notifications</Text>
            {items.length > 0 ? (
              /*
                Asks first. Clearing deletes every row on the server and there
                is no way back, and the text action sits a thumb's width from
                the first row.
              */
              <Pressable
                onPress={() => setConfirmClear(true)}
                accessibilityRole="button"
                accessibilityLabel="Clear all notifications"
                hitSlop={SPACE.md}
              >
                <Text style={styles.clear}>CLEAR</Text>
              </Pressable>
            ) : null}
          </View>

          {loading && items.length === 0 ? (
            <ActivityIndicator style={styles.loading} color={EMBER.textSecondary} />
          ) : loadFailed && items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={ICON.lg} color={EMBER.textTertiary} />
              <Text style={styles.emptyText}>Couldn&apos;t load notifications</Text>
              <Text style={styles.emptyHint}>Check your connection and try again.</Text>
              <ScalePress
                onPress={() => void load()}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </ScalePress>
            </View>
          ) : items.length === 0 ? (
            /*
              An empty bell is a normal state, not a failure. It says what it
              means rather than showing a blank panel that reads as broken.
            */
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={28} color={EMBER.textTertiary} />
              <Text style={styles.emptyText}>Nothing yet</Text>
              <Text style={styles.emptyHint}>
                Friend requests, matches and event updates land here.
              </Text>
            </View>
          ) : (
            /*
              No pull-to-refresh: at the top of the list a downward pull closes
              the sheet, and opening it again reloads (`openSheet`).
            */
            <SheetFlatList
              data={items}
              keyExtractor={(n) => n.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                return (
                  <Pressable
                    onPress={() => openItem(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}. ${item.body}. ${notificationAge(item.createdAt)}`}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    {/* Unread marker. A dot, not a background wash: a coloured
                        row behind white text is the thing that makes a list of
                        notifications look like a list of errors. */}
                    <View style={[styles.dot, item.readAt && styles.dotRead]} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1} maxFontSizeMultiplier={1.6}>
                        {item.title}
                      </Text>
                      <Text style={styles.rowText} numberOfLines={2} maxFontSizeMultiplier={1.6}>
                        {item.body}
                      </Text>
                    </View>
                    <Text style={styles.age} maxFontSizeMultiplier={1.3}>
                      {notificationAge(item.createdAt)}
                    </Text>
                  </Pressable>
                )
              }}
            />
          )}
        </RisingSheet>

        {/* Inside the sheet's modal, so it presents over the sheet rather than behind it. */}
        <ActionTray
          visible={confirmClear}
          title="Clear all notifications?"
          message="This removes them for good."
          size="compact"
          onClose={() => setConfirmClear(false)}
          buttons={[
            { label: 'Keep', onPress: () => setConfirmClear(false) },
            {
              label: 'Clear all',
              variant: 'destructive',
              onPress: () => {
                setConfirmClear(false)
                setItems([])
                setUnread(0)
                apiClient.clearNotifications().catch((error) => {
                  Logger.warn('notifications', 'clear:failed', { error: error as never })
                })
              },
            },
          ]}
        />
      </SheetModal>
    </>
  )
}

const styles = StyleSheet.create({
  bell: {
    width: ICON.lg,
    height: ICON.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -SPACE.sm,
    right: -SPACE.sm,
    minWidth: CONTROL.badge,
    height: CONTROL.badge,
    paddingHorizontal: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    // The page colour, so the badge reads as sitting *on* the bar rather than
    // floating behind the glyph.
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  badgeText: { ...TYPE.caption, color: EMBER.bg },

  // Transparent: `SheetModal` draws the dim and fades it on its own.
  scrim: { ...StyleSheet.absoluteFill },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    overflow: 'hidden',
    // Flat and opaque, like the filter sheet: no glass (tasks/lessons.md).
    backgroundColor: EMBER.surfaceSunken,
    borderTopWidth: 1,
    borderColor: EMBER.separator,
  },
  grabber: { marginTop: SPACE.sm },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  sheetTitle: TYPE.heading,
  clear: { ...TYPE.label, color: EMBER.textPrimary },

  loading: { paddingVertical: SPACE.xxxl },
  empty: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xxxl, paddingHorizontal: SPACE.xxl },
  emptyText: { ...TYPE.bodyStrong, color: EMBER.textSecondary },
  emptyHint: { ...TYPE.meta, textAlign: 'center', color: EMBER.textTertiary },
  // The error state's one action is its primary one (docs/DESIGN_SYSTEM.md).
  retry: {
    marginTop: SPACE.md,
    height: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  retryText: { ...TYPE.button, color: EMBER.onGradient },

  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: GUTTER, paddingBottom: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
  },
  rowPressed: { opacity: OPACITY.pressed },
  dot: {
    width: 8,
    height: 8,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
    marginTop: SPACE.sm,
  },
  dotRead: { backgroundColor: 'transparent' },
  rowBody: { flex: 1, gap: SPACE.xxs },
  rowTitle: TYPE.bodyStrong,
  rowText: TYPE.meta,
  age: { ...TYPE.caption, color: EMBER.textTertiary },
})
