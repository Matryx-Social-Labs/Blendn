import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { TAB_BAR_CLEARANCE } from '../../app/(tabs)/_layout'
import ScalePress from '../motion/ScalePress'
import { PlaceholderBanner } from '../ui/PlaceholderBanner'
import { Text } from '../ui/Text'
import { apiClient, type VenueListItem } from '../../lib/apiClient'
import { formatDistance } from '../../lib/geo'
import { liveNowLabel, tonightLine } from '../../lib/home'
import { Logger } from '../../lib/logger'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import type { HomeBrowse } from './HomeShell'

const PAGE = 30

type Load = { status: 'loading' | 'ready' | 'error'; venues: VenueListItem[]; page: number; hasMore: boolean }

/**
 * Places — the venues in the Pulse's city, nearest first when the phone has a
 * fix (plan v2 step 2). PLACEHOLDER DESIGN — docs/PLACEHOLDER_SCREENS.md §9.
 *
 * The server decides what is listed. A venue a real event has taken over (an
 * hour before it starts until it ends) is not in the response, and its event's
 * card in Events says "at <Venue>" instead; nothing here filters by time, so
 * the list and the map can never disagree with the server (HM-CU04).
 */
export function PlacesList({ browse, active }: { browse: HomeBrowse; active: boolean }) {
  const insets = useSafeAreaInsets()
  const [load, setLoad] = useState<Load>({ status: 'loading', venues: [], page: 0, hasMore: false })
  const [refreshing, setRefreshing] = useState(false)
  const { city, location } = browse
  const lat = location?.latitude
  const lon = location?.longitude
  const latest = useRef(0)

  /** One page from the server, tagged so only the newest ask is applied. */
  const request = useCallback(
    (page: number, force: boolean) => {
      const call = ++latest.current
      const sortBy = lat !== undefined && lon !== undefined ? 'distance' : 'name'
      return apiClient
        .getVenues({ page, limit: PAGE, city: city ?? undefined, lat, lon, sortBy }, { force })
        .then((res) => ({ call, page, res }))
    },
    [city, lat, lon]
  )

  const apply = useCallback(({ call, page, res }: Awaited<ReturnType<typeof request>>) => {
    // A newer ask (another city, a refresh) has the screen now.
    if (call !== latest.current) return
    if (!res.success || !res.data) {
      Logger.warn('events', 'Could not load places', { error: res.error })
      setLoad((prev) => (page === 1 ? { ...prev, status: 'error' } : prev))
      return
    }
    const data = res.data
    setLoad((prev) => ({
      status: 'ready',
      venues: page === 1 ? data.venues : [...prev.venues, ...data.venues.filter((v) => !prev.venues.some((p) => p.id === v.id))],
      page,
      hasMore: data.pagination.hasMore,
    }))
  }, [])

  // On opening, and again each time the tab comes back: a place can be taken over meanwhile.
  useEffect(() => {
    if (active) void request(1, false).then(apply)
  }, [active, request, apply])

  // Pull-to-refresh and Try again are the person asking, so they skip the cache.
  const refresh = async () => {
    setRefreshing(true)
    await request(1, true).then(apply)
    setRefreshing(false)
  }

  const header = (
    <View style={styles.header}>
      <PlaceholderBanner />
      {load.status === 'error' && load.venues.length === 0 ? (
        <View style={styles.empty} accessibilityLiveRegion="polite">
          <Text variant="heading">Couldn&apos;t load places</Text>
          <Text variant="meta">Check your connection and try again.</Text>
          <ScalePress
            style={styles.retry}
            onPress={() => void request(1, true).then(apply)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text variant="bodyStrong">Try again</Text>
          </ScalePress>
        </View>
      ) : load.status === 'ready' && load.venues.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="heading">No places here yet</Text>
          <Text variant="meta">{city ? `Nothing listed in ${city} right now.` : 'Nothing listed near you right now.'}</Text>
        </View>
      ) : null}
    </View>
  )

  return (
    <FlatList
      data={load.venues}
      keyExtractor={(v) => v.id}
      renderItem={({ item }) => <PlaceRow venue={item} />}
      ListHeaderComponent={header}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (load.status === 'ready' && load.hasMore) void request(load.page + 1, false).then(apply)
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={EMBER.textSecondary} />}
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
  const live = liveNowLabel(venue.liveNow)
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
        <Text variant="meta" color={venue.liveNow === 'quiet' ? EMBER.textTertiary : EMBER.textPrimary}>
          {live}
        </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.lg },
  rowText: { flex: 1, gap: SPACE.xxs },
  separator: { height: 1, backgroundColor: EMBER.separator },
})
