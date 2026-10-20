import { ScreenProfiler } from '../../lib/perf'
import { router, useFocusEffect, useScrollToTop } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState, FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EventCover } from '../../components/EventCover'
import { SkeletonBlock } from '../../components/Skeleton'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import { EventCard } from '../../components/ds/EventCard'
import { PresenceDot, TimeBadge } from '../../components/ds/MonoFamily'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { StateScreen } from '../../components/ds/StateScreen'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText } from '../../components/ds/shared'
import { Icon, type IconName } from '../../components/ui/Icon'
import { Toast, type ToastKind } from '../../components/ds/Toast'
import { apiClient } from '../../lib/apiClient'
import { openBlendn } from '../../lib/blendnOverlay'
import { Logger } from '../../lib/logger'
import { failedSections, goingSections, newFailure, type GoingSection } from '../../lib/goingSections'
import {
  lockedNightsLabel,
  rsvpEventRows,
  savedEventRows,
  withLockedNights,
  withPendingSaves,
  type AttendancePayload,
  type GoingItem,
  type PendingSave,
  type RsvpEventRow,
  type SavedEventRow as EventRow,
} from '../../lib/savedEvents'
import { HAPPENING_NOW, featuredDateLabel, nextUpLabel, placeLabel, timeLabel } from '../../lib/pulse'
import { liveWindow, sessionOver } from '../../lib/eventSession'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { DURATION, EASING, SPRING } from '../../lib/motion'
import { openInMaps } from '../../lib/openInMaps'
import { addToCalendar } from '../../lib/calendar'
import { openPaywall } from '../../lib/paywall'
import { isNightRated, markNightRated, useRatedNights } from '../../lib/ratedNights'
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
  /** Older nights the server keeps behind Blendn+ (step 11). */
  const [lockedCount, setLockedCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  /*
   * The design's Toast (components/ds/Toast): iOS a capsule at the top, Android
   * a snackbar at the bottom above the tab bar (drive 2: it covered "Going").
   */
  const [toast, setToast] = useState<{ key: number; kind: ToastKind; text: string; action?: { label: string; onPress: () => void } } | null>(null)
  const say = useCallback((text: string, kind: ToastKind = 'info', action?: { label: string; onPress: () => void }) => {
    setToast({ key: Date.now(), kind, text, action })
  }, [])
  const bold = useBoldText()
  // A night rated anywhere (the rate screen, the Recap) stops offering "Rate who you met" at once.
  const ratedVersion = useRatedNights()
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
  // The newest read wins: focus, AppState, a pull and Try again can overlap.
  const loadId = useRef(0)
  // Removes and Undos a read may not have seen yet (lib/savedEvents.ts `withPendingSaves`).
  const pendingSaves = useRef(new Map<string, PendingSave>())
  const markSave = useCallback((row: EventRow, saved: boolean) => {
    pendingSaves.current.set(row.id, { saved, row, settledAt: Infinity })
  }, [])
  const settleSave = useCallback((id: string, ok: boolean) => {
    const op = pendingSaves.current.get(id)
    if (!op) return
    if (ok) pendingSaves.current.set(id, { ...op, settledAt: loadId.current })
    else pendingSaves.current.delete(id)
  }, [])

  const loadInterestedEvents = useCallback(async (): Promise<void> => {
    // No `setLoading(true)` here: `loading` starts true for the first load, and
    // later focus refreshes update the list in place instead of blanking it.
    try {
      if (!authUser) {
        setEvents([])
        setGoing([])
        setAttended([])
        setLockedCount(0)
        setLoading(false)
        return
      }

      /*
       * Three lists, loaded together and kept apart. Each section updates only
       * when its own request succeeds, so one slow or refused route does not
       * blank the other two — and a server that predates `/me/rsvps` (404)
       * simply has no Going section. Only all three failing is "couldn't load".
       */
      const id = ++loadId.current
      const [saved, rsvps, past] = await Promise.all([
        apiClient.getUserFavorites(authUser.id),
        apiClient.getMyRsvps(),
        apiClient.getMyAttendance(),
      ])
      if (id !== loadId.current) return

      // `{ events, pagination }` — see lib/savedEvents.ts for why this is not
      // mapped inline any more.
      const rowCount =
        (saved.data?.events?.length ?? 0) + (rsvps.data?.events?.length ?? 0) + (past.data?.events?.length ?? 0)
      if (rowCount > 0) hadRowsRef.current = true
      if (saved.success && saved.data) setEvents(withPendingSaves(savedEventRows(saved.data), pendingSaves.current, id))
      else Logger.debug('interested', 'Failed to load favorites', { error: saved.error })
      if (rsvps.success && rsvps.data) setGoing(rsvpEventRows(rsvps.data))
      else Logger.debug('interested', 'Failed to load RSVPs', { error: rsvps.error })
      if (past.success && past.data) {
        setAttended(past.data.events ?? [])
        // Nights rated on another launch: the server's own answer, for the few Past rows on screen.
        for (const e of (past.data.events ?? []).slice(0, PAST_RATING_READS)) {
          if (isNightRated(e.id)) continue
          void apiClient
            .getMyEventRating(e.id)
            .then((r) => {
              if (r.success && r.data?.ratedAt) markNightRated(e.id)
            })
            .catch(() => {})
        }
      }
      else Logger.debug('interested', 'Failed to load attendance', { error: past.error })
      // Older nights behind Blendn+ (step 11); kept as last known when the read fails, like the rows.
      if (past.success && past.data) setLockedCount(past.data.lockedCount ?? 0)

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
        say("Couldn't load all of your events.", 'error', { label: 'Try again', onPress: () => reloadRef.current() })
      }
      failedRef.current = failed
    } catch {
      // Keep whatever is already on screen; a failed refresh is not an empty list.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [authUser, say])
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
  // And on returning to the app: a pending Blendn+ payment confirmed while away unlocks the older nights.
  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active' && authUser) void loadInterestedEvents()
    })
    return () => app.remove()
  }, [authUser, loadInterestedEvents])

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
  const removeSave = useCallback((event: EventRow) => {
    const index = events.findIndex(e => e.id === event.id)
    setRestoredId(null)
    setEvents(prev => prev.filter(e => e.id !== event.id))
    markSave(event, false)
    // DELETE, not the POST upsert this used to send — that one never
    // removed anything, and the card came back on the next refresh.
    const removed = apiClient.removeFavorite(event.id).then((result) => {
      if (!result.success) throw new Error(result.error || 'remove refused')
    })
    /*
     * Said at once, with its Undo, as the row goes (drive 2: it came ~1 s
     * later, after the server). A refused DELETE replaces it with the error and
     * puts the row back; Undo waits for the DELETE before it saves again, so
     * the two can never land in the wrong order.
     */
    say(`Removed ${event.title}`, 'info', {
      label: 'Undo',
      onPress: () => {
        restoreRow(event, index)
        markSave(event, true)
        removed
          .catch(() => undefined)
          .then(() => apiClient.addFavorite(event.id))
          .then((res) => {
            if (!res.success) throw new Error(res.error || 'save refused')
            settleSave(event.id, true)
          })
          .catch(() => {
            settleSave(event.id, false)
            setEvents(prev => prev.filter(e => e.id !== event.id))
            say(`Couldn't save ${event.title} again.`, 'error')
          })
      },
    })
    removed
      .then(() => settleSave(event.id, true))
      .catch((e) => {
        settleSave(event.id, false)
        Logger.warn('interested', 'Failed to remove favorite', { error: e })
        restoreRow(event, index)
        say(`Couldn't remove ${event.title}. Try again.`, 'error')
      })
  }, [events, restoreRow, say, markSave, settleSave])

  const shareEvent = useCallback(async (event: EventRow) => {
    try {
      await Share.share({ title: event.title, message: `${event.title}\n${event.venue_name}\n${event.address}` })
    } catch {}
  }, [])

  const openEvent = useCallback((id: string) => {
    router.push({ pathname: '/event/[id]', params: { id } as any })
  }, [])

  /*
   * Next up (flow4.js `going`): a ticket-like solid card, the photo on top and
   * the details under it, the date and time in Geist Mono, and a solid button
   * group. Photo, time, title and place are one button that opens the event;
   * the actions are its siblings, so VoiceOver reaches them. Live now swaps
   * Directions for Open Blend'n, the bridge to the core loop (Going #06): a
   * secondary, since the disc is the screen's primary then. No haptics: you
   * pass this card while scrolling.
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
      <View style={[styles.inset, styles.next]}>
        <SectionLabel text="Next up" />
        <View style={styles.hero}>
          <ScalePress
            onPress={() => openEvent(row.id)}
            pressedScale={0.97}
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
              <EventCover uri={row.cover_image_url} height={HERO_PHOTO} radius={RADIUS.mediaInCard} retry={refreshCount} />
              {live ? (
                <View style={styles.heroBadge}>
                  <TimeBadge when="Live" />
                </View>
              ) : null}
            </View>
            <View style={styles.heroBody}>
              {when ? <NextUpWhen when={when} live={live} /> : null}
              <Text style={[font('title', bold), styles.ink]} numberOfLines={2}>{row.title}</Text>
              {place ? (
                <View style={styles.heroPlace}>
                  <Icon name="map-pin" size={ICON.inline} color={COLOR.textSecondary} />
                  <Text style={[font('meta', bold), styles.secondary, styles.shrink]} numberOfLines={1}>{place}</Text>
                </View>
              ) : null}
              {cancelled ? (
                <StatusTag icon="calendar-x" text="Cancelled" tint={COLOR.destructiveTint} />
              ) : waitlisted ? (
                <StatusTag icon="clock" text="On the waitlist" tint={COLOR.warningTint} />
              ) : null}
            </View>
          </ScalePress>

          {/* Directions (or Open Blend'n) keeps its word; Calendar and Share are icons. */}
          <View style={styles.heroActions}>
            {live ? (
              <HeroAction icon="radio" label="Open Blend’n" accessibilityLabel="Open Blend’n" onPress={() => openBlendn()} />
            ) : (
              <HeroAction icon="navigation" label="Directions" accessibilityLabel={`Directions to ${row.venue_name || row.title}`} onPress={() => void openInMaps(row)} />
            )}
            {live ? (
              <HeroAction icon="navigation" accessibilityLabel={`Directions to ${row.venue_name || row.title}`} onPress={() => void openInMaps(row)} />
            ) : (
              <HeroAction icon="calendar" accessibilityLabel={`Add ${row.title} to calendar`} onPress={() => addToCalendar(row)} />
            )}
            <HeroAction icon="share" accessibilityLabel={`Share ${row.title}`} onPress={() => shareEvent(row)} />
          </View>
        </View>
      </View>
    )
  }, [bold, openEvent, refreshCount, shareEvent])

  /*
   * Every item carries its own space above it, because a FlatList has no `gap`:
   * `SPACE.xl` above a day or a section, `SPACE.xs` between rows (the 64 pt
   * rows already hold their own air). The first item sits on the header.
   */
  const renderItem = useCallback(({ item, index }: { item: GoingItem; index: number }) => {
    const first = index === 0

    if (item.kind === 'next') return renderNext(item.row)

    if (item.kind === 'day') {
      return (
        <View style={[styles.inset, styles.heading, first && styles.flush]}>
          {/* flow4.js going `dayH`: the date alone, at the heading's 20, like every group on the tab. */}
          <SectionHeader title={item.title} />
        </View>
      )
    }

    if (item.kind === 'header') {
      return (
        <View style={[styles.inset, styles.heading, first && styles.flush]}>
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
        <GoingRow
          title={row.title}
          cover={row.cover_image_url}
          retry={refreshCount}
          // Today's day of a multi-day run, as the heading above it is.
          time={timeLabel(liveWindow(row).start_time)}
          venue={placeLabel(row)}
          onPress={() => openEvent(row.id)}
          trailing={cancelled ? <RowNote text="Cancelled" bad /> : row.rsvpStatus === 'waitlisted' ? <RowNote text="Waitlist" /> : null}
        />
      )
    }

    if (item.kind === 'locked') {
      // A tap on something that says Blendn+: the paywall always opens (trigger `recap`).
      const label = lockedNightsLabel(item.count)
      return (
        <ScalePress
          style={[styles.inset, styles.locked]}
          pressedScale={0.97}
          haptic={false}
          onPress={() => void openPaywall('recap', { userInitiated: true })}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens Blendn+"
        >
          <Icon name="lock" size={ICON.control} color={COLOR.textSecondary} />
          <Text style={[font('bodyStrong', bold), styles.ink, styles.shrink]}>{label}</Text>
          <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
        </ScalePress>
      )
    }

    if (item.kind === 'past') {
      const row = item.row
      return (
        <GoingRow
          title={row.title}
          cover={row.cover_image_url}
          retry={refreshCount}
          time={featuredDateLabel(row.start_time)}
          venue={placeLabel(row)}
          onPress={() => openEvent(row.id)}
          trailing={
            isNightRated(row.id) ? (
              <RowNote text="Rated" />
            ) : (
            <TextAction
              label="Rate who you met"
              accessibilityLabel={`Rate who you met at ${row.title}`}
              onPress={() => router.push({ pathname: '/rate/[eventId]', params: { eventId: row.id } as any })}
            />
            )
          }
        />
      )
    }

    // Saved. The heart is the remove. `exiting` on every row; `entering` only
    // on the one Undo just put back — an entrance on every row would replay as
    // the list virtualises.
    const row = item.row
    const cancelled = row.status === 'cancelled'
    return (
      <Animated.View
        exiting={reduceMotion ? undefined : ROW_OUT}
        entering={!reduceMotion && row.id === restoredId ? ROW_BACK : undefined}
      >
        <GoingRow
          title={row.title}
          cover={row.cover_image_url}
          retry={refreshCount}
          time={`${featuredDateLabel(row.start_time)} · ${timeLabel(row.start_time)}`}
          venue={placeLabel(row)}
          onPress={() => openEvent(row.id)}
          trailing={
            <>
              {cancelled ? <RowNote text="Cancelled" bad /> : null}
              <SavedHeart title={row.title} onPress={() => void removeSave(row)} />
            </>
          }
        />
      </Animated.View>
    )
    // ratedVersion: a night rated elsewhere redraws its Past row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bold, openEvent, refreshCount, removeSave, reduceMotion, renderNext, restoredId, ratedVersion])

  // Live events lead, under "Happening now" — never under the day they started (lib/goingSections.ts).
  const items = useMemo(
    () => withLockedNights(goingSections(going, events, attended), lockedCount),
    [going, events, attended, lockedCount]
  )

  const keyExtractor = useCallback((item: GoingItem) => item.key, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/*
        No back button. This is a tab, and a tab has nowhere to go back to —
        the chevron it used to carry came from being a pushed route and would
        now dead-end on whatever happened to be underneath.
      */}
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={[font('display', bold), styles.ink]}>Going</Text>
      </View>
      {loading ? (
        // The shapes the list fades into: the next-up card, then two rows.
        <View accessibilityLabel="Loading your events" accessible style={styles.inset}>
          <SkeletonBlock width="100%" height={SKELETON_HERO} borderRadius={RADIUS.card} />
          {[0, 1].map((i) => (
            <SkeletonBlock key={i} width="100%" height={SKELETON_ROW} borderRadius={RADIUS.rowInCard} style={i ? styles.skeletonRow : styles.skeletonFirstRow} />
          ))}
        </View>
      ) : items.length === 0 && loadFailed ? (
        <StateScreen
          icon="cloud-off"
          title="Couldn’t load your events"
          body="Check your connection and try again."
          actions={[
            {
              label: 'Try again',
              onPress: () => {
                setLoading(true)
                void loadInterestedEvents()
              },
            },
          ]}
          testID="going-failed"
        />
      ) : items.length === 0 ? (
        <StateScreen
          icon="calendar"
          title="Nothing here yet"
          body="Tap “I’m going” or the heart on an event and it shows up here."
          actions={[{ label: 'Browse events', onPress: () => router.navigate('/(tabs)/events' as any) }]}
          testID="going-empty"
        />
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
      {toast ? (
        <Toast key={toast.key} kind={toast.kind} text={toast.text} action={toast.action} aboveTabBar onDismiss={() => setToast(null)} testID="going-toast" />
      ) : null}
    </SafeAreaView>
  )
}

/** "Next up": the label role, over the card. */
function SectionLabel({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text style={[font('label', bold), styles.secondary, styles.label]}>{text}</Text>
}

/** "Tonight · 9 PM" with the time in Geist Mono, or the still live dot and "Happening now". */
function NextUpWhen({ when, live }: { when: string; live: boolean }) {
  const bold = useBoldText()
  if (live) {
    return (
      <View style={styles.heroWhen}>
        <PresenceDot kind="live" />
        <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>{when}</Text>
      </View>
    )
  }
  const cut = when.lastIndexOf(' · ')
  return (
    <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.secondary]} numberOfLines={1}>
      {cut === -1 ? when : `${when.slice(0, cut)} · `}
      {cut === -1 ? null : <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink, styles.tabular]}>{when.slice(cut + 3)}</Text>}
    </Text>
  )
}

/** Cancelled (destructive tint) or On the waitlist (warning tint): a 28 pt tag, an icon and the word. */
function StatusTag({ icon, text, tint }: { icon: IconName; text: string; tint: string }) {
  const bold = useBoldText()
  return (
    <View style={[styles.tag, { backgroundColor: tint }]}>
      <Icon name={icon} size={ICON.inline - SPACE.xxs} color={COLOR.textPrimary} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.brand[500]), styles.ink]}>{text}</Text>
    </View>
  )
}

/** The hero's solid button group: 48 pt, surfaceSunken; the first keeps its word and grows. */
function HeroAction({ icon, label, accessibilityLabel, onPress }: { icon: IconName; label?: string; accessibilityLabel: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <ScalePress
      style={[styles.heroAction, label ? styles.heroActionWide : styles.heroActionIcon]}
      pressedScale={0.97}
      haptic={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={icon} size={ICON.control} color={COLOR.textPrimary} />
      {label ? (
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('button', bold), styles.ink]}>
          {label}
        </Text>
      ) : null}
    </ScalePress>
  )
}

/**
 * A row (the ds EventCard row: a 56 pt thumb, the title, venue · the time in
 * Geist Mono) with its one control beside it, a sibling so it never opens the
 * event. Keyed on the pull count: a remount retries a cover that failed.
 */
function GoingRow({
  title,
  cover,
  retry,
  time,
  venue,
  onPress,
  trailing,
}: {
  title: string
  cover: string | null | undefined
  retry: number
  time: string
  venue: string | null | undefined
  onPress: () => void
  trailing?: ReactNode
}) {
  return (
    <View style={[styles.inset, styles.row]}>
      <EventCard key={retry} kind="row" title={title} cover={cover} time={time} venue={venue ?? ''} onPress={onPress} style={styles.shrink} />
      {trailing}
    </View>
  )
}

/** A row's text action ("Rate who you met"): 700 14 white, reached at 44. */
function TextAction({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={(minTarget() - SPACE.xl) / 2}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A status the row's time can't carry: "Cancelled" in destructive, "Waitlist" in textSecondary. */
function RowNote({ text, bad = false }: { text: string; bad?: boolean }) {
  const bold = useBoldText()
  return <Text style={[font('meta', bold), bad ? styles.bad : styles.secondary]}>{text}</Text>
}

/** Saved: a 32 pt white disc with the ink heart; the tap removes the save (with Undo). */
function SavedHeart({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <ScalePress
      onPress={onPress}
      pressedScale={0.97}
      haptic={false}
      hitSlop={(minTarget() - HEART) / 2}
      accessibilityRole="button"
      accessibilityLabel={`Saved, ${title}`}
      accessibilityHint="Removes it from saved"
      style={styles.heart}
    >
      <Icon name="heart" size={ICON.inline} color={COLOR.selectionInk} active />
    </ScalePress>
  )
}

/** Past rows whose rating is read from the server on load (the ones a person sees first). */
const PAST_RATING_READS = 10

/** The next-up card's photo. */
const HERO_PHOTO = 180
/** Loading: the hero card and two rows (flow4.js going `loading`). */
const SKELETON_HERO = 330
const SKELETON_ROW = 72
/** The saved heart's white disc. */
const HEART = SIZE.tag

/*
 * Removing a save (DS #16): the row fades out on quick while the ones below close the gap,
 * instead of vanishing and letting the list snap up — the snap hid where the
 * row went. Undo fades it back in at its old place and the list opens for it.
 * The rows carry no blur or shadow, which is what makes a layout transition
 * safe here (see tasks/lessons.md). Reduce Motion: the list simply updates.
 */
const ROW_OUT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))
const ROW_BACK = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))
// The reflow is M.settle (DS #16), the system's own spring, not a timed ease.
const ROW_REFLOW = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerRow: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  bad: { color: COLOR.destructive },
  tabular: { fontVariant: ['tabular-nums'] },
  shrink: { flexShrink: 1, flexGrow: 1 },
  pressed: { opacity: OPACITY.pressed },
  list: { flex: 1 },
  inset: { marginHorizontal: SPACE.gutter },
  // flow4.js going `dayH`: 8 above a heading after a row's own 4, 12 under it before the next row's 4.
  heading: { marginTop: SPACE.md, marginBottom: SPACE.sm },
  // The card's 20 below it, then the heading's 8.
  next: { marginBottom: SPACE.lg },
  flush: { marginTop: 0 },
  label: { marginBottom: SPACE.sm },
  // 72 pt rows, 4 apart (the frame steps 76).
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: SKELETON_ROW, marginTop: SPACE.xs },
  // Next up: a solid ticket, the photo inset 8 inside the card's 32 corner.
  hero: { padding: SPACE.sm, backgroundColor: COLOR.surface, borderRadius: RADIUS.card },
  heroPhoto: { borderRadius: RADIUS.mediaInCard, overflow: 'hidden' },
  heroBadge: { position: 'absolute', left: SPACE.md, top: SPACE.md },
  // 12 under the photo, then the details' 4 / 12 / 6 (flow4.js going `det`).
  heroBody: { marginTop: SPACE.md, paddingTop: SPACE.xs, paddingHorizontal: SPACE.md, gap: SPACE.xs + SPACE.xxs },
  heroWhen: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  heroPlace: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
    height: SIZE.tag - SPACE.xs,
    paddingHorizontal: SPACE.sm + SPACE.xxs,
    borderRadius: RADIUS.capsule,
  },
  // The details' 6 gap plus the group's 4 above it; the details' 8 below.
  heroActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm + SPACE.xxs, paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm },
  heroAction: {
    height: SIZE.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceSunken,
  },
  heroActionWide: { flex: 1, paddingHorizontal: SPACE.lg },
  heroActionIcon: { width: SIZE.control },
  // 24 under the hero, 12 between rows (flow4.js going `loading`).
  skeletonFirstRow: { marginTop: SPACE.xl },
  skeletonRow: { marginTop: SPACE.md },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginTop: SPACE.md,
    padding: SPACE.lg,
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.rowInCard,
  },
  heart: {
    width: HEART,
    height: HEART,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.selectionFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
