import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Dimensions,
    FlatList,
    Linking,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import NearbyEventCard, { NEARBY_CARD_ASPECT } from '../components/NearbyEventCard'
import FadeInUp from '../components/motion/FadeInUp'
import ScalePress from '../components/motion/ScalePress'
import { SkeletonBlock } from '../components/Skeleton'
import { getEvents as fetchEventsApi, type BlendnEvent } from '../lib/api'
import { apiClient } from '../lib/apiClient'
import { readStoredCity } from '../lib/cityStorage'
import { formatDistance, getDistanceKm } from '../lib/geo'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { preloadImages } from '../components/OptimizedImage'
import { MOTION_STAGGER } from '../lib/motion'
import { formatTimeRange } from '../lib/time'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'
import { useMinimumVisible } from '../lib/useMinimumVisible'

/*
 * One shared definition, in `lib/api.ts`, derived from the API mapping itself.
 *
 * This was a hand-written interface duplicated across three files that pass
 * events to each other. TypeScript compared them structurally, so they drifted
 * silently until a correction in one broke a call site in another.
 */
type Event = BlendnEvent

/*
 * `getDistanceKm` now comes from `lib/geo.ts`.
 *
 * This file had its own copy — the same haversine, written out again and
 * untested. Two implementations of one formula do not stay identical: the
 * shared one already carries the correction that this one never got, where the
 * metres/kilometres confusion made check-in distances wrong by 1000x.
 */

const screenW = Dimensions.get('window').width

/*
 * The rows that fade up when the list first appears — about a screenful. Rows
 * below arrive by scrolling, where an entrance would only read as lag.
 */
const STAGGER_ROWS = 6

/**
 * A row that fades up on the list's first reveal, and is a plain view after.
 *
 * Whether it animates is fixed at mount: a pull-to-refresh that brings new
 * events into the top rows must not replay the entrance, and a row must not
 * swap wrappers (remounting its card and its photo fade) once the reveal ends.
 */
function RevealRow({ animate, delay, children }: { animate: boolean; delay: number; children: React.ReactNode }) {
  const [animateOnMount] = useState(animate)
  if (!animateOnMount) return <View style={styles.cardWrapper}>{children}</View>
  return <FadeInUp delay={delay} style={styles.cardWrapper}>{children}</FadeInUp>
}

export default function NearbyEventsScreen() {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<Event[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const mountedRef = useRef(true)
  // The same floor as the home screen, so a fast load doesn't flash the placeholders.
  const showSkeleton = useMinimumVisible(loading, 720)
  const showList = !showSkeleton && !locationDenied && events.length > 0
  // False until the list has committed once: the rows in its first render stagger in.
  const listRevealedRef = useRef(false)

  useEffect(() => {
    listRevealedRef.current = showList
  }, [showList])

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // This and `loadEvents` set state only in their callbacks, once a request has
  // settled, so the effect below can start them.
  const getLocation = useCallback(() =>
    Location.requestForegroundPermissionsAsync()
      .then(async ({ status }) => {
        if (status !== 'granted') {
          setLocationDenied(true)
          return null
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        setUserLocation(coords)
        setLocationDenied(false)
        return coords
      })
      .catch(() => null), [])

  const loadEvents = useCallback((force = false) =>
    Promise.resolve(userLocation || getLocation())
      .then(async (coords) => {
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
        const result = await fetchEventsApi({
          city: (await readStoredCity())?.city,
          lat: coords.latitude,
          lon: coords.longitude,
          limit: 50,
          sortBy: 'distance',
          sortOrder: 'asc',
          status: 'published',
        }, { force })

        if (!mountedRef.current) return

        if (result.data) {
          // Filter to events that have coordinates, then sort by distance
          const withDistance = result.data
            .filter((e: any) => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
            .map((e: any) => ({
              ...e,
              _distance: getDistanceKm(coords.latitude, coords.longitude, e.latitude, e.longitude),
            }))
            .sort((a: any, b: any) => a._distance - b._distance)

          setEvents(withDistance)
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
        if (mountedRef.current) setLoading(false)
      }), [userLocation, getLocation])

  useEffect(() => {
    loadEvents(true)
  }, [loadEvents])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadEvents(true)
    setRefreshing(false)
  }, [loadEvents])

  const handleEventPress = useCallback((event: Event) => {
    apiClient.getEvent(event.id, {
      lat: userLocation?.latitude,
      lon: userLocation?.longitude,
    }).catch(() => {})

    if (event.cover_image_url) {
      const hero = getOptimizedImageUrl(event.cover_image_url, {
        width: 1080, height: 520, resize: 'cover', quality: 70, format: 'webp',
      })
      if (hero) preloadImages([hero], 'high').catch(() => {})
    }

    router.push({
      pathname: '/event/[id]',
      params: {
        id: event.id,
        title: event.title,
        cover: event.cover_image_url || '',
        venue: event.venue_name,
        city: (event as any).display_city || event.city || '',
        start: event.start_time,
        end: event.end_time,
        category: event.category || '',
        description: event.description || '',
      } as any,
    })
  }, [userLocation])

  const containerPadding = GUTTER * 2
  const innerW = Math.max(0, screenW - containerPadding)
  const cardWidth = Math.min(420, innerW)

  const renderItem = useCallback(({ item, index }: { item: Event; index: number }) => {
    const dist = (item as any)._distance
    // Shared with the home screen's Nearby cards, so the same event does not
    // read "1.2km away" on one screen and "1km away" on the other.
    const distLabel = formatDistance(dist)

    return (
      <RevealRow
        animate={!listRevealedRef.current && index < STAGGER_ROWS}
        delay={index * MOTION_STAGGER.normal}
      >
        <NearbyEventCard
          event={item as any}
          width={cardWidth}
          onPress={handleEventPress as any}
          timeLabel={formatTimeRange(item.start_time, item.end_time)}
          locationLabel={distLabel || item.venue_name || item.address || ''}
        />
      </RevealRow>
    )
  }, [cardWidth, handleEventPress])

  const keyExtractor = useCallback((item: Event) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <ScalePress
          onPress={() => router.back()}
          style={styles.backBtn}
          pressedScale={0.9}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
        </ScalePress>
        <Text style={styles.headerTitle} accessibilityRole="header">Nearby Events</Text>
        {/* The back button's width less its negative margin, so the title stays centred. */}
        <View style={{ width: CONTROL.md - SPACE.md }} />
      </View>

      {showSkeleton ? (
        // The cards the list fades up into: same width, ratio and radius.
        <View style={styles.listContent} accessibilityLabel="Loading nearby events" accessible>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.cardWrapper, styles.skeletonCard]}>
              <SkeletonBlock width={cardWidth} height={cardWidth / NEARBY_CARD_ASPECT} borderRadius={EMBER_RADIUS.lg} />
            </View>
          ))}
        </View>
      ) : locationDenied ? (
        <FadeInUp style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={EMBER.textSecondary} style={{ marginBottom: SPACE.md }} />
          <Text style={styles.emptyTitle}>Location access needed</Text>
          <Text style={styles.emptySub}>Enable location to see events near you.</Text>
          <ScalePress
            style={styles.settingsBtn}
            onPress={() => { try { (Linking as any)?.openSettings?.() } catch {} }}
            accessibilityRole="button"
          >
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </ScalePress>
        </FadeInUp>
      ) : events.length === 0 && loadFailed ? (
        <FadeInUp style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color={EMBER.textSecondary} style={{ marginBottom: SPACE.md }} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load events</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <ScalePress
            style={styles.settingsBtn}
            onPress={() => {
              setLoading(true)
              void loadEvents(true)
            }}
            accessibilityRole="button"
          >
            <Text style={styles.settingsBtnText}>Retry</Text>
          </ScalePress>
        </FadeInUp>
      ) : events.length === 0 ? (
        <FadeInUp style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={EMBER.textSecondary} style={{ marginBottom: SPACE.md }} />
          <Text style={styles.emptyTitle}>No nearby events</Text>
          <Text style={styles.emptySub}>There are no events near your current location.</Text>
        </FadeInUp>
      ) : (
        <FlatList
          data={events}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  // 48pt target; the negative margin puts the chevron on the gutter.
  backBtn: { width: CONTROL.md, height: CONTROL.md, marginLeft: -SPACE.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...TYPE.heading },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  emptyTitle: { ...TYPE.title, marginBottom: SPACE.sm, textAlign: 'center' },
  emptySub: { ...TYPE.body, color: EMBER.textSecondary, textAlign: 'center' },
  settingsBtn: {
    marginTop: SPACE.xl,
    height: CONTROL.lg,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    borderRadius: EMBER_RADIUS.pill,
  },
  settingsBtnText: { ...TYPE.button, color: EMBER.onGradient },
  listContent: {
    paddingHorizontal: GUTTER,
    paddingBottom: SPACE.xl,
  },
  // The card carries SPACE.lg below it; this makes the gap between cards GUTTER.
  cardWrapper: {
    marginBottom: SPACE.sm,
  },
  // The card's own bottom margin, which `NearbyEventCard` sets on itself.
  skeletonCard: { paddingBottom: SPACE.lg, alignSelf: 'center' },
})
