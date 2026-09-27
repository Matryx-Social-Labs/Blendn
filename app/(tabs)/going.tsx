import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
    ActivityIndicator,
    Linking,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EventCover } from '../../components/EventCover'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { savedEventRows, type SavedEventRow as EventRow } from '../../lib/savedEvents'
import { formatEventDateTime } from '../../lib/time'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { MOTION_DURATION } from '../../lib/motion'
import { openInMaps as openPlaceInMaps } from '../../lib/openInMaps'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * Going — the events that are yours.
 *
 * This screen was `app/interested.tsx`, reachable only from two "view all" rows
 * on The Pulse. It is a tab now because an events app's most-returned-to
 * question is *what am I going to*, and because the alternative for that slot
 * was Explore — a browse-by-category surface that returns three results per
 * category on a one-city catalogue and reads as broken. See
 * `docs/NAVIGATION.md`.
 *
 * Saved events today. Attending and past-with-rating are the next two sections;
 * `rate/[eventId]` is built and currently linked from nowhere, and this is where
 * it belongs.
 */
function GoingScreenInner() {
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<EventRow[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  // The row Undo just restored — the only one that gets an entrance.
  const [restoredId, setRestoredId] = useState<string | null>(null)
  // Pull-to-refresh also retries a cover that failed to load (EventCover).
  const [refreshCount, setRefreshCount] = useState(0)

  const loadInterestedEvents = useCallback(async () => {
    // No `setLoading(true)` here: `loading` starts true for the first load, and
    // later focus refreshes update the list in place instead of blanking it.
    try {
      if (!authUser) {
        setEvents([])
        setLoading(false)
        return
      }

      // Get user's favorites/interested events via API
      const result = await apiClient.getUserFavorites(authUser.id)

      if (!result.success || !result.data) {
        Logger.debug('interested', 'Failed to load favorites', { error: result.error })
        setLoadFailed(true)
        return
      }

      // `{ events, pagination }` — see lib/savedEvents.ts for why this is not
      // mapped inline any more.
      setEvents(savedEventRows(result.data))
      setLoadFailed(false)
    } catch {
      // Keep whatever is already on screen; a failed refresh is not an empty list.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [authUser])

  /*
   * Reload every time the tab is focused, not once per mount.
   *
   * The comment below promised a focus refresh; there was none — one
   * `useEffect` on mount. Driven on iOS the day the list first rendered
   * (SCRUM-175): open Going (empty), save an event from the Pulse, come back
   * — still "No saved events yet", and the empty state has no list to pull
   * on, so the only way out was a cold launch. A tab is a place you return
   * to; what it shows must be what is true when you arrive.
   */
  useFocusEffect(
    useCallback(() => {
      if (authUser) void loadInterestedEvents()
    }, [authUser, loadInterestedEvents])
  )

  // Note: Real-time interest updates work per-event (when viewing event details).
  // For the favorites list, we rely on pull-to-refresh and the focus refresh
  // above. Subscribing to all favorited events would be expensive and
  // unnecessary. To implement: would need server to emit to user's personal
  // room on favorite changes.

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshCount((n) => n + 1)
    await loadInterestedEvents()
    setRefreshing(false)
  }, [loadInterestedEvents])

  /** Back into the list where it was, rather than at the end. */
  const restoreRow = useCallback((event: EventRow, index: number) => {
    setRestoredId(event.id)
    setEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev
      const next = [...prev]
      next.splice(Math.min(index, next.length), 0, event)
      return next
    })
  }, [])

  /*
   * Optimistic, with an Undo. The card goes at once; a refused DELETE puts it
   * back and says so, and Undo saves it again.
   */
  const removeSave = useCallback(async (event: EventRow) => {
    const index = events.findIndex(e => e.id === event.id)
    setRestoredId(null)
    setEvents(prev => prev.filter(e => e.id !== event.id))
    try {
      // DELETE, not the POST upsert this used to send — that one never
      // removed anything, and the card came back on the next refresh.
      const result = await apiClient.removeFavorite(event.id)
      if (!result.success) throw new Error(result.error || 'remove refused')
    } catch (e) {
      Logger.warn('interested', 'Failed to remove favorite', { error: e })
      restoreRow(event, index)
      showToast(`Couldn't remove ${event.title}. Try again.`, 'error')
      return
    }

    showToast(`Removed ${event.title}`, 'info', {
      action: {
        label: 'Undo',
        onPress: () => {
          restoreRow(event, index)
          apiClient
            .addFavorite(event.id)
            .then((res) => {
              if (!res.success) throw new Error(res.error || 'save refused')
            })
            .catch(() => {
              setEvents(prev => prev.filter(e => e.id !== event.id))
              showToast(`Couldn't save ${event.title} again.`, 'error')
            })
        },
      },
    })
  }, [events, restoreRow, showToast])

  const openInMaps = useCallback((event: EventRow) => {
    void openPlaceInMaps(event)
  }, [])

  const shareEvent = useCallback(async (event: EventRow) => {
    try {
      await Share.share({ title: event.title, message: `${event.title}\n${event.venue_name}\n${event.address}` })
    } catch {}
  }, [])

  const addToCalendar = useCallback((event: EventRow) => {
    try {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      const toCal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, '0')
        const yyyy = d.getUTCFullYear()
        const mm = pad(d.getUTCMonth() + 1)
        const dd = pad(d.getUTCDate())
        const hh = pad(d.getUTCHours())
        const min = pad(d.getUTCMinutes())
        const ss = pad(d.getUTCSeconds())
        return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`
      }
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${toCal(start)}/${toCal(end)}&details=${encodeURIComponent(event.venue_name + '\n' + event.address)}`
      Linking.openURL(url)
    } catch {}
  }, [])

  const renderItem = useCallback(({ item }: { item: EventRow }) => (
    // The cover is the "open" target and the chips are its siblings: a card that
    // was itself a touchable made VoiceOver read it as one element, so the four
    // actions inside it could not be reached.
    //
    // `exiting` on every row; `entering` only on the one Undo just put back —
    // an entrance on every row would replay as the list virtualises.
    <Animated.View
      style={styles.card}
      exiting={reduceMotion ? undefined : ROW_OUT}
      entering={!reduceMotion && item.id === restoredId ? ROW_BACK : undefined}
    >
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } as any })}
        accessibilityRole="button"
        accessibilityLabel={[
          item.title,
          item.venue_name,
          formatEventDateTime(item.start_time),
          item.status === 'cancelled' ? 'Cancelled by the organiser' : null,
        ].filter(Boolean).join(', ')}
        accessibilityHint="Opens the event"
      >
      <EventCover uri={item.cover_image_url} height={180} retry={refreshCount}>
        <View style={styles.overlayContent}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.venue} numberOfLines={1}>{item.venue_name}</Text>
          <Text style={styles.time}>{formatEventDateTime(item.start_time)}</Text>
          {item.status === 'cancelled' ? (
            <Text style={styles.cancelled} accessibilityLabel="Cancelled by the organiser">CANCELLED</Text>
          ) : null}
        </View>
      </EventCover>
      </TouchableOpacity>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionChip} onPress={() => removeSave(item)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from saved`}>
          <Ionicons name="heart-dislike" size={ICON.sm} color={EMBER.destructive} />
          <Text style={styles.actionText}>Remove</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => openInMaps(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.venue_name || item.title} in Maps`}>
          <Ionicons name="navigate" size={ICON.sm} color={EMBER.textSecondary} />
          <Text style={styles.actionText}>Open in Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => addToCalendar(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.title} to calendar`}>
          <Ionicons name="calendar" size={ICON.sm} color={EMBER.textSecondary} />
          <Text style={styles.actionText}>Add to calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => shareEvent(item)} accessibilityRole="button" accessibilityLabel={`Share ${item.title}`}>
          <Ionicons name="share-social" size={ICON.sm} color={EMBER.textSecondary} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  ), [removeSave, openInMaps, addToCalendar, shareEvent, refreshCount, reduceMotion, restoredId])

  const keyExtractor = useCallback((item: EventRow) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/*
        No back button. This is a tab, and a tab has nowhere to go back to —
        the chevron it used to carry came from being a pushed route and would
        now dead-end on whatever happened to be underneath.
      */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Going</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={EMBER.textPrimary} />
        </View>
      ) : events.length === 0 && loadFailed ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your events</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true)
              void loadInterestedEvents()
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No saved events yet</Text>
          <Text style={styles.emptySub}>Tap the heart on events to save them here.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.navigate('/(tabs)/events' as any)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Browse events</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.FlatList
          data={events}
          itemLayoutAnimation={reduceMotion ? undefined : ROW_REFLOW}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          refreshing={refreshing}
          onRefresh={onRefresh}
          // The container already insets the home indicator; this clears the
          // absolutely positioned tab bar on top of that.
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + SPACE.xl }}
        />
      )}
    </SafeAreaView>
  )
}

/*
 * Removing a save: the card fades out while the ones below close the gap,
 * instead of vanishing and letting the list snap up — the snap hid where the
 * card went. Undo fades it back in at its old place and the list opens for it.
 * The cards carry no blur or shadow, which is what makes a layout transition
 * safe here (see tasks/lessons.md). Reduce Motion: the list simply updates.
 */
const ROW_OUT = FadeOut.duration(MOTION_DURATION.fast)
const ROW_BACK = FadeIn.duration(MOTION_DURATION.normal)
const ROW_REFLOW = LinearTransition.duration(MOTION_DURATION.normal).easing(Easing.bezier(0.77, 0, 0.175, 1))

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.lg,
  },
  backBtn: { padding: SPACE.xs },
  headerTitle: { ...TYPE.display },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  emptyTitle: { ...TYPE.title, marginBottom: SPACE.sm, textAlign: 'center' },
  emptySub: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  retryButton: {
    marginTop: SPACE.xl,
    height: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  retryText: { ...TYPE.button },
  card: { marginHorizontal: GUTTER, marginBottom: SPACE.lg, backgroundColor: EMBER.surfaceSunken, borderRadius: EMBER_RADIUS.md, overflow: 'hidden' },
  overlayContent: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, bottom: SPACE.lg },
  title: { ...TYPE.title },
  venue: { ...TYPE.meta, color: EMBER.textPrimary, marginTop: SPACE.xxs },
  time: { ...TYPE.meta, marginTop: SPACE.xxs },
  cancelled: { ...TYPE.label, color: EMBER.destructive, marginTop: SPACE.xs },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, padding: SPACE.md, backgroundColor: EMBER.surfaceSunken },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: EMBER.surface, paddingHorizontal: SPACE.md, height: CONTROL.md, borderRadius: EMBER_RADIUS.pill },
  actionText: { ...TYPE.bodyStrong },
})




/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function GoingScreen() {
  return (
    <ScreenProfiler id="going">
      <GoingScreenInner />
    </ScreenProfiler>
  )
}
