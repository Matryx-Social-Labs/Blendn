import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TAB_BAR_CLEARANCE } from '../../app/(tabs)/_layout'
import ScalePress from '../motion/ScalePress'
import { PlaceholderBanner } from '../ui/PlaceholderBanner'
import { Text } from '../ui/Text'
import { apiClient, type VenueListItem } from '../../lib/apiClient'
import { formatDistance } from '../../lib/geo'
import { liveNowLabel, tonightLine } from '../../lib/home'
import { Logger } from '../../lib/logger'
import { initialPlaces, mayLoadMore, placesKey, placesReducer } from '../../lib/places'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import type { HomeBrowse } from './HomeShell'

const PAGE = 30

/**
 * Places — the venues in the Pulse's city, nearest first when the phone has a
 * fix (plan v2 step 2). PLACEHOLDER DESIGN — docs/PLACEHOLDER_SCREENS.md §9.
 *
 * The server decides what is listed. A venue a real event has taken over (an
 * hour before it starts until it ends) is not in the response, and its event's
 * card in Events says "at <Venue>" instead; nothing here filters by time, so
 * the list and the map can never disagree with the server (HM-CU04).
 *
 * The loading rules are `lib/places.ts` (a reducer, tested): a new city or a
 * new spot starts the list again, a page for an old one is dropped, a failed
 * refresh keeps the list and says so, and a later page never repeats a venue.
 */
export function PlacesList({ browse, active }: { browse: HomeBrowse; active: boolean }) {
  const insets = useSafeAreaInsets()
  const { city, location, ready } = browse
  const key = placesKey(city, location)
  // To ~100 m, as the key is: a GPS jitter is not a new request.
  const lat = location ? Number(location.latitude.toFixed(3)) : undefined
  const lon = location ? Number(location.longitude.toFixed(3)) : undefined
  const [state, dispatch] = useReducer(placesReducer, key, initialPlaces)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(false)

  // A new city or a new spot is a new list.
  useEffect(() => {
    dispatch({ type: 'reset', key })
  }, [key])

  const request = useCallback(
    async (page: number, fresh: boolean) => {
      dispatch({ type: 'request', key, page })
      try {
        const res = await apiClient.getVenues(
          { page, limit: PAGE, city: city ?? undefined, lat, lon, sortBy: lat !== undefined ? 'distance' : 'name' },
          // Opening the pane, pull-to-refresh and Try again are the person asking: never a cached page.
          fresh ? { force: true } : undefined
        )
        if (res.success && res.data) {
          dispatch({ type: 'loaded', key, page, venues: res.data.venues, hasMore: res.data.pagination.hasMore })
        } else {
          Logger.warn('events', 'Could not load places', { page, error: res.error })
          dispatch({ type: 'failed', key, page })
        }
      } catch (error) {
        Logger.warn('events', 'Places request threw', { page, error: String(error) })
        dispatch({ type: 'failed', key, page })
      }
    },
    [key, city, lat, lon]
  )

  /*
   * Each time the pane is opened (or the tab comes back to it), a fresh read:
   * that is the person asking, and a venue an event has taken over since must
   * not linger from a cached page. Not before the city is decided — a list for
   * no city would be the wrong list, briefly.
   */
  useEffect(() => {
    if (!active || !ready) return
    void request(1, true)
  }, [active, ready, request])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await request(1, true)
    } finally {
      setRefreshing(false)
    }
  }

  const loadMore = async () => {
    if (inFlight.current || !mayLoadMore(state)) return
    inFlight.current = true
    try {
      await request(state.page + 1, false)
    } finally {
      inFlight.current = false
    }
  }

  const header = (
    <View style={styles.header}>
      <PlaceholderBanner />
      {state.refreshFailed ? (
        <View style={styles.inlineError} accessibilityLiveRegion="polite">
          <Text variant="meta" style={styles.inlineErrorText}>
            Couldn&apos;t refresh places.
          </Text>
          <ScalePress onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Try again" style={styles.inlineRetry}>
            <Text variant="bodyStrong">Try again</Text>
          </ScalePress>
        </View>
      ) : null}
      {state.status === 'idle' || state.status === 'loading' ? (
        <View style={styles.empty}>
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading places" />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.empty} accessibilityLiveRegion="polite">
          <Text variant="heading">Couldn&apos;t load places</Text>
          <Text variant="meta">Check your connection and try again.</Text>
          <ScalePress style={styles.retry} onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Try again">
            <Text variant="bodyStrong">Try again</Text>
          </ScalePress>
        </View>
      ) : state.venues.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="heading">No places here yet</Text>
          <Text variant="meta">{city ? `Nothing listed in ${city} right now.` : 'Nothing listed near you right now.'}</Text>
        </View>
      ) : null}
    </View>
  )

  return (
    <FlatList
      data={state.venues}
      keyExtractor={(v) => v.id}
      renderItem={({ item }) => <PlaceRow venue={item} />}
      ListHeaderComponent={header}
      ListFooterComponent={state.loadingMore ? <ActivityIndicator style={styles.more} color={EMBER.textSecondary} /> : null}
      onEndReachedThreshold={0.5}
      onEndReached={() => void loadMore()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={EMBER.textSecondary} />}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
      ItemSeparatorComponent={Separator}
      showsVerticalScrollIndicator={false}
    />
  )
}

function Separator() {
  return <View style={styles.separator} />
}

function PlaceRow({ venue }: { venue: VenueListItem }) {
  const area = venue.address ?? venue.city
  const distance = formatDistance(venue.distance)
  // No chip when the server tells this person nothing (it is null for anyone it would refuse).
  const live = venue.liveNow ? liveNowLabel(venue.liveNow) : null
  const tonight = tonightLine(venue.nextEvent)
  const details = [venue.venueTypeLabel, area, distance].filter(Boolean).join(' · ')
  return (
    <ScalePress
      haptic={false}
      pressedScale={0.98}
      onPress={() => router.push(`/venue/${venue.id}` as never)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={[venue.name, details, live, tonight].filter(Boolean).join('. ')}
    >
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {venue.name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {details}
        </Text>
        {live ? (
          <Text variant="meta" color={venue.liveNow === 'quiet' ? EMBER.textTertiary : EMBER.textPrimary}>
            {live}
          </Text>
        ) : null}
        {tonight ? (
          <Text variant="meta" color={EMBER.textPrimary} numberOfLines={1}>
            {tonight}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textTertiary} />
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: GUTTER, paddingTop: SPACE.sm },
  header: { gap: SPACE.lg, paddingBottom: SPACE.lg },
  empty: { gap: SPACE.sm, paddingVertical: SPACE.xxl, alignItems: 'center' },
  retry: {
    marginTop: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 1,
    borderColor: EMBER.separator,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  inlineErrorText: { flex: 1 },
  inlineRetry: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  more: { paddingVertical: SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.lg },
  rowText: { flex: 1, gap: SPACE.xxs },
  separator: { height: 1, backgroundColor: EMBER.separator },
})
