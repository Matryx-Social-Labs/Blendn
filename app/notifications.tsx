import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Banner } from '../components/ds/Banner'
import { Spinner } from '../components/ds/Loader'
import { NotificationRow, type NotificationAction } from '../components/ds/NotificationRow'
import { SectionHeader } from '../components/ds/SectionHeader'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import { useSkeletonCrossfade } from '../components/motion/useSkeletonCrossfade'
import { CollapsingRow } from '../components/notifications/CollapsingRow'
import { LandingHighlight } from '../components/notifications/LandingHighlight'
import { NewPill } from '../components/notifications/NewPill'
import { NotificationsSkeleton } from '../components/notifications/NotificationsSkeleton'
import type { IconName } from '../components/ui/Icon'
import { OfflineBanner, useOffline } from '../components/OfflineBanner'
import { OverflowMenu } from '../components/crews/OverflowMenu'
import { PullIndicator } from '../components/pulse/PullIndicator'
import { COLOR, DURATION, EASING, RADIUS, RISE, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { Logger } from '../lib/logger'
import { claimBannerHost } from '../lib/inAppBanners'
import { useReducedMotion } from '../lib/motion'
import { buildEntries, entryIndexOf, type NotificationEntry } from '../lib/notificationEntries'
import { findLandingRow, type FeedRow } from '../lib/notificationRows'
import { navigateFromNotificationData } from '../lib/notifications'
import { showSheet } from '../lib/sheet'
import { useNotificationFeed } from '../lib/useNotificationFeed'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { usePushPreference } from '../lib/usePushPreference'
import { useTopBarOverlay } from '../lib/useTopBarState'

/** What the screen says when it has nothing to show, and when it could not read (Flow 9 · 9.2 frames 02, 03). */
const EMPTY_BODY = 'Friend requests, matches, crew news and event changes land here. Messages are in Banter.'
/** The server clears every row, requests too, but answers none of them: they stay open where they live. */
const CLEAR_OVER_REQUESTS = 'This clears every notification here. Requests waiting on you stay open in Friends and Crews until you answer them. Nothing is sent to anyone.'
const EMPTY_AFTER_CLEAR = 'Requests you haven’t answered are still open in Friends and Crews.'
const FOOTNOTE = 'That’s everything we keep: read notifications for 30 days, unread for 90.'
const PUSH_OFF_TEXT = 'Push is off. These still land here, but your phone won’t tell you.'
const DONE_TEXT: Record<string, string> = { friend_request: 'You’re friends now' }
/** A glyph tile turns over with the answer: the request's `user-plus` becomes `user-check` (the tile pops, `Glyph`). */
const DONE_GLYPH: Record<string, IconName> = { friend_request: 'user-check' }

/** The sections sit 20 apart in the frame. design-exception: 20 is not on the space scale; 16 + 4 is the nearest sum of two. */
const SECTION_GAP = SPACE.lg + SPACE.xs
/** Scrolled past this, a row that lands above is announced by the pill rather than pushed under the finger. */
const SCROLLED_PAST = 120
/** Motion #50: the target is scrolled to a third of the screen. */
const LANDING_POSITION = 1 / 3
/** The list waits for its rows to be measured before it scrolls to a landing. */
const LANDING_SETTLE_MS = 120

/** Motion #47: the empty state fades over `quick` and drops 8 pt as the first item comes in. */
const emptyOut = () => {
  'worklet'
  const t = { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, t), transform: [{ translateY: withTiming(RISE.list, t) }] },
  }
}
const EMPTY_OUT_REDUCED = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))
/** A row that lands while the screen is open fades in on `base` (the first page never does). */
const ARRIVE = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))

type LandingParams = { type?: string; requestId?: string; crewId?: string; eventId?: string; conversationId?: string; at?: string }

function NotificationsScreenContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  const reduceMotion = useReducedMotion()
  const params = useLocalSearchParams<LandingParams>()
  const list = useRef<FlatList<NotificationEntry>>(null)
  const [menu, setMenu] = useState(false)
  const [allWaiting, setAllWaiting] = useState(false)
  const [pill, setPill] = useState(false)
  const scrolledPast = useRef(false)
  const [landing, setLanding] = useState<{ id: string; run: string } | null>(null)
  // Which landing has been done: a push tapped while this screen is open sets new params (`at` makes a repeat tap new).
  const landed = useRef<string | null>(null)

  const feed = useNotificationFeed({
    onArrive: () => {
      if (scrolledPast.current) setPill(true)
    },
  })
  const push = usePushPreference()
  const offline = useOffline()
  const bannerShown = offline || (push.off && feed.load !== 'loading')
  const onRefresh = () => void feed.refresh()
  // iOS pulls with the monogram (motion #18) and plays H.threshold as it arms; Android keeps the platform's control.
  const pull = usePullToRefresh({ refreshing: feed.refreshing, onRefresh })
  const arrive = useSkeletonCrossfade(feed.load === 'loading')

  // The banner host: nothing pops over this screen, the row is inserted instead (Flow 9 · 9.4). Leaving it settles the New rows.
  const settle = useRef(feed.settle)
  useEffect(() => {
    settle.current = feed.settle
  })
  useFocusEffect(
    useCallback(() => {
      const release = claimBannerHost('notifications')
      return () => {
        release()
        settle.current()
      }
    }, [])
  )

  const volatile = useMemo(
    () => ({ fresh: feed.fresh, requests: feed.requestState, landing: landing?.run, live: feed.liveIds, bannerShown }),
    [feed.fresh, feed.requestState, landing?.run, feed.liveIds, bannerShown]
  )
  const entries = useMemo(() => buildEntries(feed.groups, { allWaiting, hasMore: feed.hasMore }), [feed.groups, allWaiting, feed.hasMore])

  // Landing from a push or a link: scroll to a third of the screen, then the highlight (motion #50). Once, and only for a row it can find.
  const landingId = useMemo(() => {
    const { type, requestId, crewId, eventId, conversationId } = params
    return findLandingRow(feed.items, { type, requestId, crewId, eventId, conversationId })?.id ?? null
  }, [params, feed.items])
  useEffect(() => {
    const run = `${landingId}:${params.at ?? ''}`
    if (feed.load !== 'ready' || !landingId || landed.current === run) return
    const index = entryIndexOf(entries, landingId)
    if (index < 0) return
    const timer = setTimeout(() => {
      // Once: a re-render before this fires cancels and reschedules it, so it is marked as it runs.
      landed.current = run
      setLanding({ id: landingId, run })
      try {
        list.current?.scrollToIndex({ index, viewPosition: LANDING_POSITION, animated: !reduceMotion })
      } catch (error) {
        // The row is highlighted wherever it is; a list that cannot scroll there is not worth more than a log line.
        Logger.warn('notifications', 'landing:scroll failed', { error: error as never })
      }
    }, LANDING_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [feed.load, landingId, params.at, entries, reduceMotion])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    bar.scrollProps.onScroll(e)
    pull.scrollProps.onScroll(e)
    const past = e.nativeEvent.contentOffset.y > SCROLLED_PAST
    scrolledPast.current = past
    if (!past) setPill(false)
  }
  const toTop = () => {
    list.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })
    setPill(false)
  }

  const open = (row: FeedRow) => {
    feed.touch(row.id)
    navigateFromNotificationData(row.item.data ?? undefined)
  }
  const actionsOf = (row: FeedRow): NotificationAction[] =>
    row.actions.map((a) => ({ label: a.label, kind: a.kind, icon: a.icon, onPress: () => void feed.answer(row, a.key) }))

  const confirmClear = () => {
    const waiting = feed.groups.waiting.length > 0
    showSheet({
      kind: 'actions',
      hue: 'rose',
      icon: 'trash',
      title: 'Clear all notifications?',
      message: feed.clearKeepsRequests
        ? 'Requests waiting on you stay. Everything else leaves this list; nothing is sent to anyone.'
        : waiting
          ? CLEAR_OVER_REQUESTS
          : 'This clears the list. Nothing is sent to anyone.',
      actions: [
        { label: 'Clear all', variant: 'primary', then: () => void feed.clear() },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const menuItems = [
    { icon: 'settings' as const, label: 'Notification settings', onPress: () => router.push('/notification-settings') },
    ...(feed.items.length ? [{ icon: 'trash' as const, label: 'Clear all', onPress: confirmClear }] : []),
  ]

  const visualOf = (row: FeedRow, requestState: string | undefined) => {
    const answered = requestState === 'done' ? DONE_GLYPH[row.item.kind] : undefined
    return answered && row.visual.type === 'glyph' ? { ...row.visual, icon: answered } : row.visual
  }
  const rowOf = (row: FeedRow, ground: string) => (
    <View>
      <NotificationRow
        testID={`notification-${row.id}`}
        visual={visualOf(row, feed.requestState[row.id])}
        title={row.title}
        context={row.context}
        fresh={feed.fresh.has(row.id)}
        actions={row.actions.length ? actionsOf(row) : undefined}
        state={feed.requestState[row.id]}
        doneText={DONE_TEXT[row.item.kind]}
        onPress={() => open(row)}
        ground={ground}
      />
      <LandingHighlight key={landing?.id === row.id ? landing.run : 'rest'} active={landing?.id === row.id} onDone={() => setLanding(null)} testID={`landing-${row.id}`} />
    </View>
  )

  const renderEntry = ({ item: entry, index }: { item: NotificationEntry; index: number }) => {
    // The frame's list gap is 20 between sections; the first has none above it unless a banner does.
    const gap = index === 0 && !bannerShown ? null : styles.section
    if (entry.type === 'waiting') {
      return (
        <CollapsingRow>
          <View style={gap}>
            <View style={styles.inset}>
              <SectionHeader
                title="Waiting on you"
                count={entry.total}
                countStyle="lit"
                action={entry.total > entry.rows.length ? { label: `See all ${entry.total}`, onPress: () => setAllWaiting(true) } : undefined}
                testID="notifications-waiting"
              />
            </View>
            <View style={styles.card} testID="notifications-waiting-card">
              {entry.rows.map((row, i) => (
                <CollapsingRow key={row.id}>
                  <View style={i ? styles.separator : null}>{rowOf(row, COLOR.surface)}</View>
                </CollapsingRow>
              ))}
            </View>
          </View>
        </CollapsingRow>
      )
    }
    if (entry.type === 'header') {
      return (
        <View style={[styles.inset, gap]}>
          <SectionHeader title={entry.title} testID={`notifications-${entry.title.toLowerCase()}`} />
        </View>
      )
    }
    if (entry.type === 'row') {
      return (
        <Animated.View entering={feed.liveIds.has(entry.row.id) ? ARRIVE : undefined}>
          {rowOf(entry.row, COLOR.ink)}
        </Animated.View>
      )
    }
    return entry.more ? (
      <View style={styles.more}>
        <Spinner size={20} />
      </View>
    ) : (
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.footnote]}>{FOOTNOTE}</Text>
    )
  }

  const banners = (
    <View style={styles.banners}>
      <OfflineBanner text="Offline. Showing what you had." testID="notifications-offline" />
      {push.off && feed.load !== 'loading' ? (
        <Banner kind="info" icon="bell-off" text={PUSH_OFF_TEXT} action={{ label: 'Turn on', icon: 'bell', onPress: () => void push.turnOn() }} busy={push.saving} testID="notifications-push-off" />
      ) : null}
    </View>
  )

  let state: ReactNode = null
  if (feed.load === 'failed') {
    state = (
      <StateScreen
        icon="cloud-off"
        title="Couldn’t load notifications"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void feed.retry(), pressHaptic: H.primary }]}
        gutter
        testID="notifications-failed"
      />
    )
  } else if (!entries.length) {
    state = (
      <Animated.View exiting={reduceMotion ? EMPTY_OUT_REDUCED : emptyOut}>
        <StateScreen icon="bell" title="Quiet for now" body={feed.clearedOpenRequests ? EMPTY_AFTER_CLEAR : EMPTY_BODY} gutter testID="notifications-empty" />
      </Animated.View>
    )
  }
  const top = bar.contentTop + SPACE.xs

  const chrome = (
    <>
      {pull.native ? null : (
        <View pointerEvents="none" style={{ position: 'absolute', top: bar.indicatorTop, left: 0, right: 0 }}>
          <PullIndicator progress={pull.progress} />
        </View>
      )}
      {pill ? <NewPill top={bar.indicatorTop + SPACE.md} onPress={toTop} testID="notifications-new-pill" /> : null}
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar
          title="Notifications"
          state={bar.state}
          onBack={() => router.back()}
          actions={[{ label: 'More', icon: 'ellipsis', onPress: () => setMenu(true) }]}
          testID="notifications-top"
        />
      </View>
      <OverflowMenu visible={menu} items={menuItems} onClose={() => setMenu(false)} testID="notifications-menu" />
    </>
  )

  if (feed.load === 'loading') {
    return (
      <View style={styles.container}>
        <View style={{ paddingTop: top }}>
          {banners}
          <NotificationsSkeleton />
        </View>
        {chrome}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* The list crossfades in over its skeleton only if one was drawn (a wait under 300 ms shows none). */}
      <Animated.View entering={arrive} style={styles.container}>
        <FlatList
          ref={list}
          testID="notifications-list"
          data={entries}
          // The cells read state the entries do not carry: what is new, what is being answered, where it landed.
          extraData={volatile}
          keyExtractor={(e) => e.key}
          renderItem={renderEntry}
          ListHeaderComponent={
            <>
              {banners}
              {state ? <View style={styles.state}>{state}</View> : null}
            </>
          }
          ListHeaderComponentStyle={state ? styles.headerFill : undefined}
          contentContainerStyle={[styles.content, { paddingTop: top, paddingBottom: insets.bottom + SPACE.xl }]}
          scrollIndicatorInsets={{ top: bar.indicatorTop }}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={bar.scrollProps.scrollEventThrottle}
          onScrollEndDrag={pull.scrollProps.onScrollEndDrag}
          contentInset={{ top: pull.holdInset }}
          // A row that lands above while scrolled down does not move what is under the finger; at the top the list shows it.
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: SPACE.sm }}
          onEndReached={() => void feed.loadMore()}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
            setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: LANDING_POSITION, animated: !reduceMotion }), LANDING_SETTLE_MS)
          }}
          refreshControl={
            pull.native ? (
              <RefreshControl refreshing={feed.refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} progressViewOffset={bar.indicatorTop} />
            ) : undefined
          }
        />
      </Animated.View>
      {chrome}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { flexGrow: 1 },
  // Rows, headings, the card and the banners sit on the app's one gutter, like every other list (r7 M3: 16 here made it the widest screen).
  inset: { paddingHorizontal: SPACE.gutter },
  section: { marginTop: SECTION_GAP },
  banners: { paddingHorizontal: SPACE.gutter, gap: SPACE.sm },
  card: { marginHorizontal: SPACE.gutter, marginTop: SPACE.xs, borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
  state: { flexGrow: 1, justifyContent: 'center', paddingBottom: SPACE.xxxl },
  headerFill: { flexGrow: 1 },
  more: { alignItems: 'center', paddingTop: SPACE.sm, paddingBottom: SPACE.lg },
  footnote: { color: COLOR.textTertiary, textAlign: 'center', paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl },
})

/** Rose world: mostly people (friend requests, matches, crew invites, reveals), so one hue on this screen (`HueProvider`): the Waiting count, the Accept and Join pills, the glyph tiles, the unread dots and Turn on all light in it. */
export default function NotificationsScreen() {
  return (
    <HueProvider value="rose">
      <NotificationsScreenContent />
    </HueProvider>
  )
}
