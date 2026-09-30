import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useScrollToTop } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    FlatList,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EventCover } from '../../components/EventCover'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { UPCOMING_THUMB, UpcomingCard } from '../../components/pulse/UpcomingCard'
import { DayHeading } from '../../components/ui/DayHeading'
import { useToast } from '../../components/Toast'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { failedSections, goingSections, newFailure, type GoingSection } from '../../lib/goingSections'
import {
  rsvpEventRows,
  savedEventRows,
  type AttendancePayload,
  type GoingItem,
  type RsvpEventRow,
  type SavedEventRow as EventRow,
} from '../../lib/savedEvents'
import { HAPPENING_NOW, featuredDateLabel, nextUpLabel, placeLabel, timeLabel } from '../../lib/pulse'
import { liveWindow, sessionOver } from '../../lib/eventSession'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE, tint } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { MOTION_DURATION } from '../../lib/motion'
import { openInMaps as openPlaceInMaps } from '../../lib/openInMaps'
import { addToCalendar as addEventToCalendar } from '../../lib/calendar'
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
 * From `goingItems` (lib/savedEvents.ts), top to bottom: your soonest RSVP
 * (from `/me/rsvps`) as the one large **next up** card, with directions,
 * calendar and share; the rest of your RSVPs as rows under day headings;
 * **Saved** — hearts not already above, the heart on each row removing it;
 * **Past** — events you attended, each with the way in to rating the people
 * you met there, which had no entry point but reopening an old event.
 */
function GoingScreenInner() {
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(true)
  // `events` is the Saved section — the only one this screen edits in place.
  const [events, setEvents] = useState<EventRow[]>([])
  const [going, setGoing] = useState<RsvpEventRow[]>([])
  const [attended, setAttended] = useState<AttendancePayload['events']>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  // The row Undo just restored — the only one that gets an entrance.
  const [restoredId, setRestoredId] = useState<string | null>(null)
  // Pull-to-refresh also retries a cover that failed to load (EventCover).
  const [refreshCount, setRefreshCount] = useState(0)
  // Which requests failed last time, so a lasting failure is said once, not on every focus.
  const failedRef = useRef<GoingSection[]>([])
  // Whether a load has ever brought rows: with everything failing, those rows are still on screen.
  const hadRowsRef = useRef(false)
  // The toast's Try again: the loader, reached through a ref because it is the loader that shows it.
  const reloadRef = useRef<() => void>(() => {})
  // Tapping Going while already on it goes back to the top (the bar emits `tabPress`).
  const listRef = useRef<FlatList<GoingItem>>(null)
  useScrollToTop(listRef)

  const loadInterestedEvents = useCallback(async (): Promise<void> => {
    // No `setLoading(true)` here: `loading` starts true for the first load, and
    // later focus refreshes update the list in place instead of blanking it.
    try {
      if (!authUser) {
        setEvents([])
        setGoing([])
        setAttended([])
        setLoading(false)
        return
      }

      /*
       * Three lists, loaded together and kept apart. Each section updates only
       * when its own request succeeds, so one slow or refused route does not
       * blank the other two — and a server that predates `/me/rsvps` (404)
       * simply has no Going section. Only all three failing is "couldn't load".
       */
      const [saved, rsvps, past] = await Promise.all([
        apiClient.getUserFavorites(authUser.id),
        apiClient.getMyRsvps(),
        apiClient.getMyAttendance(),
      ])

      // `{ events, pagination }` — see lib/savedEvents.ts for why this is not
      // mapped inline any more.
      const rowCount =
        (saved.data?.events?.length ?? 0) + (rsvps.data?.events?.length ?? 0) + (past.data?.events?.length ?? 0)
      if (rowCount > 0) hadRowsRef.current = true
      if (saved.success && saved.data) setEvents(savedEventRows(saved.data))
      else Logger.debug('interested', 'Failed to load favorites', { error: saved.error })
      if (rsvps.success && rsvps.data) setGoing(rsvpEventRows(rsvps.data))
      else Logger.debug('interested', 'Failed to load RSVPs', { error: rsvps.error })
      if (past.success && past.data) setAttended(past.data.events ?? [])
      else Logger.debug('interested', 'Failed to load attendance', { error: past.error })

      const allFailed = !saved.success && !rsvps.success && !past.success
      setLoadFailed(allFailed)

      /*
       * A section whose request failed keeps its last good rows, which also
       * makes the failure invisible: the list just stops being true. So a
       * failure that is new says so, with the retry in the toast — unless the
       * screen is about to show the full error state, which already does.
       */
      const failed = failedSections({ saved, going: rsvps, past })
      const shown = hadRowsRef.current || !allFailed
      if (shown && newFailure(failedRef.current, failed)) {
        showToast("Couldn't load all of your events.", 'error', {
          action: { label: 'Try again', onPress: () => reloadRef.current() },
        })
      }
      failedRef.current = failed
    } catch {
      // Keep whatever is already on screen; a failed refresh is not an empty list.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [authUser, showToast])
  useEffect(() => {
    reloadRef.current = () => void loadInterestedEvents()
  }, [loadInterestedEvents])

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

  const addToCalendar = useCallback((event: EventRow) => addEventToCalendar(event), [])

  const openEvent = useCallback((id: string) => {
    router.push({ pathname: '/event/[id]', params: { id } as any })
  }, [])

  /*
   * Next up: the soonest RSVP, large. The photo carries nothing — its words sit
   * under it — and photo, time, title and place are one button that opens the
   * event. The actions are siblings of that button, not children: a card that
   * was itself a touchable made VoiceOver read it as one element, so the
   * actions inside it could not be reached.
   */
  const renderNext = useCallback((row: RsvpEventRow) => {
    /*
     * Today's day of a multi-day run, not the run (`lib/eventSession.ts`). A
     * run whose last day that goes ahead is over — the rest cancelled — is
     * listed until the run's end, and says so rather than naming a start.
     */
    const today = liveWindow(row)
    const when = sessionOver(row) ? 'Ended' : nextUpLabel(today.start_time, today.end_time)
    const live = when === HAPPENING_NOW
    const place = placeLabel(row)
    const cancelled = row.status === 'cancelled'
    const waitlisted = !cancelled && row.rsvpStatus === 'waitlisted'
    return (
      <View style={styles.hero}>
        {/* Shrinks under the finger, no haptic: it sits at the top of a scroll. */}
        <ScalePress
          onPress={() => openEvent(row.id)}
          pressedScale={0.98}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel={[
            row.title,
            when,
            place,
            cancelled ? 'Cancelled by the organiser' : waitlisted ? 'On the waitlist' : null,
          ].filter(Boolean).join(', ')}
          accessibilityHint="Opens the event"
        >
          <View style={styles.heroPhoto}>
            <EventCover uri={row.cover_image_url} height={HERO_PHOTO} radius={EMBER_RADIUS.sm} retry={refreshCount} />
          </View>
          <View style={styles.heroBody}>
            {when ? (
              <View style={styles.heroWhen}>
                {live ? <View style={styles.liveDot} /> : null}
                <Text style={styles.heroEyebrow} numberOfLines={1}>{when}</Text>
              </View>
            ) : null}
            <Text style={styles.heroTitle} numberOfLines={2}>{row.title}</Text>
            {place ? (
              <View style={styles.heroPlace}>
                <Ionicons name="location-outline" size={ICON.sm} color={EMBER.textSecondary} />
                <Text style={styles.heroPlaceText} numberOfLines={1}>{place}</Text>
              </View>
            ) : null}
            {cancelled ? (
              <View style={[styles.statusTag, styles.statusTagBad]}>
                <Text style={[styles.statusText, styles.statusTextBad]}>CANCELLED</Text>
              </View>
            ) : waitlisted ? (
              <View style={styles.statusTag}>
                <Text style={styles.statusText}>ON THE WAITLIST</Text>
              </View>
            ) : null}
          </View>
        </ScalePress>

        {/*
          Directions carries its word; Calendar and Share are icons. Three
          labelled pills do not fit the 310pt inside the card at the body size —
          "Directions" alone needs ~120 of a third's ~98 — and the type scale has
          no smaller button label. No check-in here: that lives on the event.
          They shrink under the finger but stay silent, as the buttons they
          replaced were: no haptic on a card you pass while scrolling.
        */}
        <View style={styles.heroActions}>
          <ScalePress
            style={[styles.heroAction, styles.heroActionWide]}
            pressedScale={0.95}
            haptic={false}
            onPress={() => openInMaps(row)}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${row.venue_name || row.title}`}
          >
            <Ionicons name="navigate-outline" size={ICON.sm} color={EMBER.textPrimary} />
            <Text style={styles.heroActionText} numberOfLines={1}>Directions</Text>
          </ScalePress>
          <ScalePress
            style={[styles.heroAction, styles.heroActionIcon]}
            pressedScale={0.95}
            haptic={false}
            onPress={() => addToCalendar(row)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${row.title} to calendar`}
          >
            <Ionicons name="calendar-outline" size={ICON.sm} color={EMBER.textPrimary} />
          </ScalePress>
          <ScalePress
            style={[styles.heroAction, styles.heroActionIcon]}
            pressedScale={0.95}
            haptic={false}
            onPress={() => shareEvent(row)}
            accessibilityRole="button"
            accessibilityLabel={`Share ${row.title}`}
          >
            <Ionicons name="share-outline" size={ICON.sm} color={EMBER.textPrimary} />
          </ScalePress>
        </View>
      </View>
    )
  }, [addToCalendar, openEvent, openInMaps, refreshCount, shareEvent])

  /*
   * Every item carries its own space above it, because a FlatList has no `gap`:
   * `SPACE.xl` above a day, `SPACE.xxl` above a section, `SPACE.md` between a
   * heading and its rows and between rows. The first item sits on the header.
   */
  const renderItem = useCallback(({ item, index }: { item: GoingItem; index: number }) => {
    const first = index === 0

    if (item.kind === 'next') return renderNext(item.row)

    if (item.kind === 'day') {
      return (
        <View style={[styles.inset, !first && { marginTop: SPACE.xl }]}>
          <DayHeading title={item.title} detail={item.weekday} />
        </View>
      )
    }

    if (item.kind === 'header') {
      return (
        <View style={[styles.inset, !first && { marginTop: SPACE.xxl }]}>
          <SectionHeader title={item.title} />
        </View>
      )
    }

    if (item.kind === 'going') {
      // No Remove here: leaving an RSVP is a decision about the event, and the
      // event screen is where its consequences (the waitlist) are explained.
      const row = item.row
      const cancelled = row.status === 'cancelled'
      return (
        <View style={styles.row}>
          <UpcomingCard
            title={row.title}
            imageUrl={row.cover_image_url}
            retry={refreshCount}
            // Today's day of a multi-day run, as the heading above it is.
            timeLabel={timeLabel(liveWindow(row).start_time)}
            placeLabel={placeLabel(row)}
            note={cancelled ? 'Cancelled' : row.rsvpStatus === 'waitlisted' ? 'On the waitlist' : null}
            noteTone={cancelled ? 'destructive' : 'default'}
            onPress={() => openEvent(row.id)}
          />
        </View>
      )
    }

    if (item.kind === 'past') {
      const row = item.row
      return (
        <View style={styles.row}>
          <UpcomingCard
            title={row.title}
            imageUrl={row.cover_image_url}
            retry={refreshCount}
            timeLabel={featuredDateLabel(row.start_time)}
            placeLabel={placeLabel(row)}
            onPress={() => openEvent(row.id)}
            action={{
              label: 'RATE WHO YOU MET',
              accessibilityLabel: `Rate who you met at ${row.title}`,
              onPress: () => router.push({ pathname: '/rate/[eventId]', params: { eventId: row.id } as any }),
            }}
          />
        </View>
      )
    }

    // Saved. The heart is the remove. `exiting` on every row; `entering` only
    // on the one Undo just put back — an entrance on every row would replay as
    // the list virtualises.
    const row = item.row
    const cancelled = row.status === 'cancelled'
    return (
      <Animated.View
        style={styles.row}
        exiting={reduceMotion ? undefined : ROW_OUT}
        entering={!reduceMotion && row.id === restoredId ? ROW_BACK : undefined}
      >
        <UpcomingCard
          title={row.title}
          imageUrl={row.cover_image_url}
          retry={refreshCount}
          timeLabel={`${featuredDateLabel(row.start_time)} · ${timeLabel(row.start_time)}`}
          placeLabel={placeLabel(row)}
          note={cancelled ? 'Cancelled' : null}
          noteTone={cancelled ? 'destructive' : 'default'}
          onPress={() => openEvent(row.id)}
          isFavorited
          onToggleFavorite={() => void removeSave(row)}
        />
      </Animated.View>
    )
  }, [openEvent, refreshCount, removeSave, reduceMotion, renderNext, restoredId])

  // Live events lead, under "Happening now" — never under the day they started (lib/goingSections.ts).
  const items = useMemo(() => goingSections(going, events, attended), [going, events, attended])

  const keyExtractor = useCallback((item: GoingItem) => item.key, [])

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
        // The shapes the list fades into: the next-up card, then two rows.
        <View accessibilityLabel="Loading your events" accessible>
          <View style={styles.hero}>
            <SkeletonBlock width={'100%'} height={HERO_PHOTO} borderRadius={EMBER_RADIUS.sm} />
            <View style={styles.skeletonLines}>
              <SkeletonLine width={'35%'} />
              <SkeletonLine width={'80%'} />
              <SkeletonLine width={'50%'} />
            </View>
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.row, styles.skeletonRow]}>
              <View style={styles.skeletonRowText}>
                <SkeletonLine width={'40%'} />
                <SkeletonLine width={'85%'} />
                <SkeletonLine width={'55%'} />
              </View>
              <SkeletonBlock width={UPCOMING_THUMB} height={UPCOMING_THUMB} borderRadius={EMBER_RADIUS.sm} />
            </View>
          ))}
        </View>
      ) : items.length === 0 && loadFailed ? (
        <FadeInUp style={styles.empty}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your events</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <ScalePress
            style={styles.retryButton}
            onPress={() => {
              setLoading(true)
              void loadInterestedEvents()
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </ScalePress>
        </FadeInUp>
      ) : items.length === 0 ? (
        <FadeInUp style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySub}>Tap &quot;I&apos;m going&quot; or the heart on an event and it shows up here.</Text>
          <ScalePress
            style={styles.retryButton}
            onPress={() => router.navigate('/(tabs)/events' as any)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Browse events</Text>
          </ScalePress>
        </FadeInUp>
      ) : (
        /*
         * The list fades up over the skeleton's place as one piece, instead of
         * cutting in. One wrapper, not a stagger per row: the saved rows already
         * own their `entering`/`exiting` and the reflow, and a wrapper mounted
         * with the list can't replay on a focus refresh or a pull.
         */
        <FadeInUp style={styles.list}>
          <Animated.FlatList
            ref={listRef}
            data={items}
            itemLayoutAnimation={reduceMotion ? undefined : ROW_REFLOW}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            refreshing={refreshing}
            onRefresh={onRefresh}
            // The container already insets the home indicator; this clears the
            // absolutely positioned tab bar on top of that.
            contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + SPACE.xl }}
          />
        </FadeInUp>
      )}
    </SafeAreaView>
  )
}

/** The next-up card's photo. */
const HERO_PHOTO = 180

/*
 * Removing a save: the row fades out while the ones below close the gap,
 * instead of vanishing and letting the list snap up — the snap hid where the
 * row went. Undo fades it back in at its old place and the list opens for it.
 * The rows carry no blur or shadow, which is what makes a layout transition
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
  headerTitle: { ...TYPE.display },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  emptyTitle: { ...TYPE.title, marginBottom: SPACE.sm, textAlign: 'center' },
  emptySub: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  // The empty or error state's one action is that state's primary action — the
  // only accent the screen ever shows. A populated list has none.
  retryButton: {
    marginTop: SPACE.xl,
    height: CONTROL.lg,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  retryText: { ...TYPE.button, color: EMBER.onGradient },
  list: { flex: 1 },

  inset: { marginHorizontal: GUTTER },
  row: { marginHorizontal: GUTTER, marginTop: SPACE.md },

  // Next up. A row's fill and radius, larger: the photo sits inside the card's
  // padding on `surface` (EventCover's own fill), one step off the card.
  hero: {
    marginHorizontal: GUTTER,
    padding: SPACE.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
  },
  heroPhoto: { borderRadius: EMBER_RADIUS.sm, overflow: 'hidden' },
  heroBody: { marginTop: SPACE.lg, gap: SPACE.xs },
  heroWhen: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  // Still, not pulsing: status is a mark, not motion (tasks/lessons.md).
  liveDot: { width: SPACE.sm, height: SPACE.sm, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.success },
  heroEyebrow: { ...TYPE.meta, flexShrink: 1 },
  heroTitle: TYPE.title,
  heroPlace: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  heroPlaceText: { ...TYPE.meta, flexShrink: 1 },
  statusTag: {
    alignSelf: 'flex-start',
    height: CONTROL.sm,
    marginTop: SPACE.xs,
    paddingHorizontal: SPACE.md,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: tint(EMBER.textPrimary, 0.12),
  },
  statusTagBad: { backgroundColor: tint(EMBER.destructive, 0.16) },
  statusText: { ...TYPE.label, color: EMBER.textPrimary },
  statusTextBad: { color: EMBER.destructive },
  // One row, one height, one fill: `surface` on the `surfaceSunken` card.
  heroActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  heroAction: {
    height: CONTROL.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  heroActionWide: { flex: 1, paddingHorizontal: SPACE.lg },
  heroActionIcon: { width: CONTROL.md },
  heroActionText: TYPE.bodyStrong,

  // Loading: `UpcomingCard`'s own card box, so the placeholder is the shape the
  // row fades into (as on the Pulse).
  skeletonLines: { marginTop: SPACE.lg, gap: SPACE.sm },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.lg,
    padding: SPACE.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
  },
  skeletonRowText: { flex: 1, gap: SPACE.sm },
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
