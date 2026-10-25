import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, FlatList, Linking, Platform, RefreshControl, StyleSheet, View } from 'react-native'

import { Button } from '../components/ds/Button'
import { EventCard } from '../components/ds/EventCard'
import { Spinner } from '../components/ds/Loader'
import { Orbs } from '../components/ds/Orbs'
import { StateScreen } from '../components/ds/StateScreen'
import { TopBar } from '../components/ds/TopBar'
import FadeInUp from '../components/motion/FadeInUp'
import { OfflineBanner } from '../components/OfflineBanner'
import { preloadImages } from '../components/OptimizedImage'
import { SkeletonBlock } from '../components/Skeleton'
import { getEvents as fetchEventsApi, type BlendnEvent } from '../lib/api'
import { apiClient } from '../lib/apiClient'
import { readStoredCity } from '../lib/cityStorage'
import { COLOR, RADIUS, SPACE, STAGGER } from '../lib/design/tokens'
import { getDistanceKm } from '../lib/geo'
import { isAbortedFix, roughFix, type FixAsk } from '../lib/locationFix'
import { mergeEventPage, pageHasMore } from '../lib/pulseFeed'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { homeCardProps } from '../lib/pulse'
import { useMinimumVisible } from '../lib/useMinimumVisible'
import { useNow } from '../lib/useNow'
import { putSceneSeed } from '../lib/sceneSeed'
import { useTopBarState } from '../lib/useTopBarState'

/*
 * The rows that fade up when the list first appears — about a screenful. Rows
 * below arrive by scrolling, where an entrance would only read as lag.
 */
const STAGGER_ROWS = 6
/** The frame's 72 pt row rhythm. */
const ROW_HEIGHT = 72
const SKELETON_ROWS = 6
/** A page of the list: the server's nearest first, asked for again as the reader reaches the end (a city can hold hundreds). */
const PAGE_SIZE = 50
const MINUTE_MS = 60_000
/** A location ask that was abandoned for a newer one: its answer is nobody's. */
const SUPERSEDED = Symbol('superseded')

type Row = BlendnEvent & { _distance: number }

/**
 * A row that fades up on the list's first reveal, and is a plain view after.
 *
 * Whether it animates is fixed at mount: a pull-to-refresh that brings new
 * events into the top rows must not replay the entrance, and a row must not
 * swap wrappers (remounting its card and its photo fade) once the reveal ends.
 */
function RevealRow({ animate, delay, children }: { animate: boolean; delay: number; children: React.ReactNode }) {
  const [animateOnMount] = useState(animate)
  if (!animateOnMount) return <View style={styles.row}>{children}</View>
  return (
    <FadeInUp delay={delay} style={styles.row}>
      {children}
    </FadeInUp>
  )
}

/**
 * Nearby (the "See all" behind the Pulse's Nearby section; Flow 3 `nearby`): nearest first, the distance in a Geist
 * Mono column and then the design system's `EventCard` row. One sort, so there is no sort control: a pill that
 * could only say "Nearest" would be a dead control.
 */
export default function NearbyEventsScreen() {
  const bar = useTopBarState()
  const now = useNow(MINUTE_MS)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<Row[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  // Permission granted, but no fix: GPS off, indoors, timed out. Not "no events".
  const [locationFailed, setLocationFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  /** The last page held (0-based, `fetchEventsApi`'s own), whether the server may have more, and what the next read is doing. */
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [more, setMore] = useState<'idle' | 'busy' | 'failed'>('idle')
  /** The city the first page was read in: later pages are the same question. */
  const cityRef = useRef<string | undefined>(undefined)
  /** The fix, kept where `loadEvents` can read it without depending on it: a fix arriving is not a reason to read the list again. */
  const moreInFlight = useRef(false)
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const mountedRef = useRef(true)
  // The same floor as the home screen, so a fast load doesn't flash the placeholders.
  const showSkeleton = useMinimumVisible(loading, 720)
  const showList = !showSkeleton && !locationDenied && !locationFailed && events.length > 0
  // False until the list has committed once: the rows in its first render stagger in.
  const listRevealedRef = useRef(false)

  useEffect(() => {
    listRevealedRef.current = showList
  }, [showList])

  /** The fix being looked for: abandoned when the screen goes or a second Try again starts another (review LOW-4). */
  const fixAsk = useRef<FixAsk | null>(null)
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (fixAsk.current) fixAsk.current.aborted = true
    }
  }, [])

  // This and `loadEvents` set state only in their callbacks, once a request has
  // settled, so the effect below can start them.
  const getLocation = useCallback(
    (): Promise<{ latitude: number; longitude: number } | null | typeof SUPERSEDED> =>
      Location.requestForegroundPermissionsAsync()
        .then(async ({ status }) => {
          if (status !== 'granted') {
            setLocationDenied(true)
            return null
          }
          setLocationDenied(false)
          try {
            // The skeleton while it looks; "Location unavailable" only when services are off or nothing came in 15 s (D-10).
            if (fixAsk.current) fixAsk.current.aborted = true
            const ask: FixAsk = { aborted: false }
            fixAsk.current = ask
            const position = await roughFix(undefined, ask)
            const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
            setUserLocation(coords)
            locationRef.current = coords
            setLocationFailed(false)
            return coords
          } catch (error) {
            // Abandoned: another ask (or nobody) is waiting now; this one says nothing.
            if (isAbortedFix(error)) return SUPERSEDED
            setLocationFailed(true)
            return null
          }
        })
        .catch(() => {
          setLocationFailed(true)
          return null
        }),
    []
  )

  const loadEvents = useCallback(
    (force = false) => {
      let superseded = false
      return Promise.resolve(locationRef.current || getLocation())
        .then(async (coords) => {
          if (coords === SUPERSEDED) {
            superseded = true
            return
          }
          if (!coords) {
            setEvents([])
            return
          }

          /*
           * The same city as the home screen, nearest first.
           *
           * This is the "View all" behind the Nearby section, so it has to expand
           * that section rather than answer a different question. It used to send
           * `radius: 50` — the same hard cut that blanked the home screen, just at
           * a bigger number, so someone 60km from everything got an empty list with
           * no way to tell whether that meant "nothing here" or "you are too far".
           *
           * The city comes from the same stored selection the home screen uses, so
           * "View all" cannot silently show a different city than the one you were
           * just looking at.
           */
          cityRef.current = (await readStoredCity())?.city
          const result = await fetchEventsApi(nearbyQuery(cityRef.current, coords, 0), { force })

          if (!mountedRef.current) return

          if (result.data) {
            // Filter to events that have coordinates, then sort by distance
            setEvents(nearbyRows(result.data, coords))
            setPage(0)
            setHasMore(pageHasMore(result.data.length, PAGE_SIZE))
            setMore('idle')
            setLoadFailed(false)
          } else {
            setLoadFailed(true)
          }
        })
        .catch(() => {
          // Keep what is on screen: a network error is not "no events near you".
          if (mountedRef.current) setLoadFailed(true)
        })
        .finally(() => {
          if (mountedRef.current && !superseded) setLoading(false)
        })
    },
    [getLocation]
  )

  useEffect(() => {
    loadEvents(true)
  }, [loadEvents])

  /*
   * Back from Settings with location turned on: try again without making
   * somebody find a button. Only while denied — a foreground is otherwise not
   * a reason to refetch a list they are reading — and only once the setting
   * really changed: checked without asking, because on Android a request can
   * put the permission dialog back up, and closing it is another 'active'.
   */
  useEffect(() => {
    if (!locationDenied) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status === 'granted' && mountedRef.current) {
            setLoading(true)
            void loadEvents(true)
          }
        })
        .catch(() => {})
    })
    return () => sub.remove()
  }, [locationDenied, loadEvents])

  /*
   * The next page, when the reader reaches the end: the same city and fix as the first, one read at a time, appended after what is
   * held (never re-sorted above the reader) and never twice. A refused page leaves its row saying so, and it is asked again by
   * that row alone, so a refusal cannot become a loop.
   */
  const loadMore = useCallback(async (retry = false) => {
    // One read at a time, held by a ref: the end of the list and the retry can both fire before any state has changed.
    if (moreInFlight.current || !hasMore || !userLocation || (more !== 'idle' && !(retry && more === 'failed'))) return
    moreInFlight.current = true
    const asked = page + 1
    setMore('busy')
    try {
      const result = await fetchEventsApi(nearbyQuery(cityRef.current, userLocation, asked))
      if (!mountedRef.current) return
      if (!result.data) return setMore('failed')
      const rows = nearbyRows(result.data, userLocation)
      setEvents((prev) => mergeEventPage(prev, rows))
      // The page actually asked for, never one more than whatever is held when the answer lands.
      setPage((p) => Math.max(p, asked))
      setHasMore(pageHasMore(result.data.length, PAGE_SIZE))
      setMore('idle')
    } catch {
      if (mountedRef.current) setMore('failed')
    } finally {
      moreInFlight.current = false
    }
  }, [hasMore, more, page, userLocation])

  const retryLocation = useCallback(() => {
    setLoading(true)
    setLocationFailed(false)
    void loadEvents(true)
  }, [loadEvents])

  const retryLoad = useCallback(() => {
    setLoading(true)
    void loadEvents(true)
  }, [loadEvents])

  // A refresh is silent everywhere (audit U-L9): RefreshControl reports only its start, and H.threshold is "armed".
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadEvents(true)
    setRefreshing(false)
  }, [loadEvents])

  const handleEventPress = useCallback(
    (event: BlendnEvent) => {
      apiClient
        .getEvent(event.id, {
          lat: userLocation?.latitude,
          lon: userLocation?.longitude,
        })
        .catch(() => {})

      if (event.cover_image_url) {
        const hero = getOptimizedImageUrl(event.cover_image_url, {
          width: 1080,
          height: 520,
          resize: 'cover',
          quality: 70,
          format: 'webp',
        })
        if (hero) preloadImages([hero], 'high').catch(() => {})
      }

      // The card's words travel in memory, not in the route: a link's query is never a seed (lib/sceneSeed.ts).
      const seed = putSceneSeed({
        eventId: event.id,
        title: event.title,
        cover: event.cover_image_url || '',
        venue: event.venue_name,
        city: event.display_city || event.city || '',
        start: event.start_time,
        end: event.end_time,
        category: event.category || '',
        description: event.description || '',
        interestCount: 0,
      })
      router.push({ pathname: '/event/[id]', params: { id: event.id, seed } as never })
    },
    [userLocation]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      // The distance leads the row (`lead`), so nearest-first can be scanned; the card says when and where.
      const card = homeCardProps({ ...item, distance: item._distance }, now, true)
      return (
        <RevealRow animate={!listRevealedRef.current && index < STAGGER_ROWS} delay={index * STAGGER.base}>
          <View style={styles.card}>
            <EventCard
              kind="row"
              lead="distance"
              title={card.title}
              time={card.time}
              venue={card.venue}
              distance={card.distance}
              cover={card.cover}
              onPress={() => handleEventPress(item)}
              testID={`nearby-${item.id}`}
            />
          </View>
        </RevealRow>
      )
    },
    [handleEventPress, now]
  )

  const keyExtractor = useCallback((item: Row) => item.id, [])

  const state = locationDenied ? (
    <StateScreen
      icon="map-pin-off"
      title="Location access needed"
      body="Turn on location to see events near you."
      actions={[{ label: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => {}) }]}
      testID="nearby-denied"
    />
  ) : locationFailed ? (
    <StateScreen
      icon="navigation"
      title="Location unavailable"
      body="Couldn’t find where you are. Try again in a moment."
      actions={[{ label: 'Try again', onPress: retryLocation }]}
      testID="nearby-unavailable"
    />
  ) : events.length === 0 && loadFailed ? (
    <StateScreen
      icon="cloud-off"
      title="Couldn’t load events"
      body="Check your connection and try again."
      actions={[{ label: 'Try again', onPress: retryLoad }]}
      testID="nearby-failed"
    />
  ) : events.length === 0 ? (
    <StateScreen
      icon="calendar"
      title="No nearby events"
      body="There are no events near your current location."
      // A way on from a dead end: everything in the city, not just nearby.
      actions={[{ label: 'Browse events', onPress: () => router.navigate('/(tabs)/events' as never) }]}
      testID="nearby-empty"
    />
  ) : null

  return (
    <View style={styles.screen}>
      <Orbs set="feed" />
      <TopBar title="Nearby" state={Platform.OS === 'ios' ? 'condensed' : bar.state} onBack={() => router.back()} testID="nearby-top" />
      <View style={styles.banner}>
        <OfflineBanner text="Offline. Showing what you had." testID="nearby-offline" />
      </View>

      {showSkeleton ? (
        // The rows the list fades up into: the frame's 72 pt rows, static (DS #17).
        <View style={styles.list} accessibilityLabel="Loading nearby events" accessibilityState={{ busy: true }} accessible testID="nearby-skeleton">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <SkeletonBlock key={i} width="100%" height={ROW_HEIGHT} borderRadius={RADIUS.rowInCard} style={styles.skeletonRow} />
          ))}
        </View>
      ) : state ? (
        <FadeInUp style={styles.state}>{state}</FadeInUp>
      ) : (
        <FlatList
          testID="nearby-list"
          data={events}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          // Hundreds of events are rows drawn a screen at a time, and the next page is asked for at the end.
          initialNumToRender={10}
          windowSize={9}
          onEndReachedThreshold={1.5}
          onEndReached={() => void loadMore()}
          ListFooterComponent={
            more === 'busy' ? (
              <View style={styles.foot}><Spinner /></View>
            ) : more === 'failed' ? (
              <View style={styles.foot}>
                <Button kind="tertiary" size="md" label="Couldn’t load more. Try again" onPress={() => void loadMore(true)} testID="nearby-more-failed" />
              </View>
            ) : null
          }
          {...bar.scrollProps}
        />
      )}
    </View>
  )
}

/** The query for one page of Nearby: the city's events, nearest first, from this fix. */
const nearbyQuery = (city: string | undefined, coords: { latitude: number; longitude: number }, page: number) => ({
  page,
  city,
  lat: coords.latitude,
  lon: coords.longitude,
  limit: PAGE_SIZE,
  sortBy: 'distance' as const,
  sortOrder: 'asc' as const,
  status: 'published' as const,
})

/** A page's events that have a place, each with its distance from the fix, nearest first within the page. */
const nearbyRows = (events: BlendnEvent[], coords: { latitude: number; longitude: number }): Row[] =>
  events
    .filter((e): e is BlendnEvent & { latitude: number; longitude: number } => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
    .map((e) => ({ ...e, _distance: getDistanceKm(coords.latitude, coords.longitude, e.latitude, e.longitude) }))
    .sort((a, b) => a._distance - b._distance)

const styles = StyleSheet.create({
  foot: { alignItems: 'center', paddingVertical: SPACE.lg },
  screen: { flex: 1, backgroundColor: COLOR.ink },
  banner: { paddingHorizontal: SPACE.gutter },
  state: { flex: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xxxl * 2 },
  // The first row stands clear of the bar's hairline (r7 L12: it sat 8 pt under it).
  list: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.md, paddingBottom: SPACE.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: ROW_HEIGHT },
  card: { flex: 1, minWidth: 0 },
  skeletonRow: { marginBottom: SPACE.xs },
})
