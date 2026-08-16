import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { badgeLabel, notificationAge, type NotificationItem } from '../../lib/notificationFormat'
import { navigateFromNotificationData } from '../../lib/notifications'
import { EMBER, EMBER_FONTS, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'

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
  const insets = useSafeAreaInsets()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiClient.getNotifications({ limit: 30 })
      if (result.success && result.data) {
        setItems(result.data.notifications)
        setUnread(result.data.unreadCount)
      }
    } catch (error) {
      Logger.warn('notifications', 'load:failed', { error: error as never })
    } finally {
      setLoading(false)
    }
  }, [])

  /*
   * The count on mount, so the badge is right before anybody taps.
   *
   * One request, not a poll. A bell that polls is a bell that costs a request
   * every few seconds on the app's busiest screen for a number that changes a
   * handful of times a day; the socket already tells this app when something
   * happens, and wiring the count to it is the upgrade if the badge ever feels
   * stale. Deliberately not doing that yet — it is a second source of truth,
   * and the cheap version has to be shown to be insufficient first.
   */
  useEffect(() => {
    void load()
  }, [load])

  const openSheet = useCallback(() => {
    setOpen(true)
    void load()
    if (unread > 0) {
      // Optimistic: the badge clears on tap rather than after a round trip,
      // because the round trip is the slowest part of an action whose whole
      // job is to feel like "seen".
      setUnread(0)
      apiClient.markNotificationsRead().catch((error) => {
        Logger.warn('notifications', 'markRead:failed', { error: error as never })
      })
    }
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
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
        }
        // 36pt glyph box inside a 44pt hit area — the frame's control is small
        // and the minimum tappable target is not.
        hitSlop={8}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
      >
        <Ionicons name="notifications-outline" size={22} color={EMBER.textPrimary} />
        {badge ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
              {badge}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        {/*
          Tapping the dim closes it. A sheet with no way out but a small × is
          the most common way a modal traps somebody.
        */}
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.sheetTint} pointerEvents="none" />
          <View style={styles.grabber} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Notifications</Text>
            {items.length > 0 ? (
              <Pressable
                onPress={() => {
                  setItems([])
                  setUnread(0)
                  apiClient.clearNotifications().catch((error) => {
                    Logger.warn('notifications', 'clear:failed', { error: error as never })
                  })
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear all notifications"
                hitSlop={8}
              >
                <Text style={styles.clear}>CLEAR</Text>
              </Pressable>
            ) : null}
          </View>

          {loading && items.length === 0 ? (
            <ActivityIndicator style={styles.loading} color={EMBER.accent} />
          ) : items.length === 0 ? (
            /*
              An empty bell is a normal state, not a failure. It says what it
              means rather than showing a blank panel that reads as broken.
            */
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={28} color={EMBER.textTertiary} />
              <Text style={styles.emptyText}>Nothing yet</Text>
              <Text style={styles.emptyHint}>
                Check-ins, messages and organiser updates land here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(n) => n.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              refreshing={loading}
              onRefresh={load}
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
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  bell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // The page colour, so the badge reads as sitting *on* the bar rather than
    // floating behind the glyph.
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  badgeText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 10,
    lineHeight: 13,
    color: EMBER.onGradient,
  },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,19,19,0.86)',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginTop: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 28,
    color: EMBER.textPrimary,
  },
  clear: {
    ...EMBER_TYPE.meta,
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: EMBER.accent,
  },

  loading: { paddingVertical: 48 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 32 },
  emptyText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
  },
  emptyHint: { ...EMBER_TYPE.meta, textAlign: 'center', color: EMBER.textTertiary },

  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowPressed: { opacity: 0.6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: EMBER.accent,
    marginTop: 7,
  },
  dotRead: { backgroundColor: 'transparent' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: EMBER.textPrimary,
  },
  rowText: { ...EMBER_TYPE.meta, color: EMBER.textSecondary },
  age: { ...EMBER_TYPE.meta, color: EMBER.textTertiary, fontSize: 12 },
})
