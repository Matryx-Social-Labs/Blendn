import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import NearbyEventCard from '../components/NearbyEventCard'
import { getEvents as fetchEventsApi } from '../lib/api'
import { apiClient } from '../lib/apiClient'
import { readStoredCity } from '../lib/cityStorage'
import { formatDistance, getDistanceKm } from '../lib/geo'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { preloadImages } from '../components/OptimizedImage'
import { formatTimeRange } from '../lib/time'
import { useAuth } from '../lib/useAuth'
import { APP_COLORS } from '../lib/theme'

interface Event {
  id: string
  title: string
  description: string
  short_description: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  cover_image_url: string | null
  latitude: number
  longitude: number
  check_in_radius: number
  city?: string
  display_city?: string
  category?: string
}

/*
 * `getDistanceKm` now comes from `lib/geo.ts`.
 *
 * This file had its own copy — the same haversine, written out again and
 * untested. Two implementations of one formula do not stay identical: the
 * shared one already carries the correction that this one never got, where the
 * metres/kilometres confusion made check-in distances wrong by 1000x.
 */

const screenW = Dimensions.get('window').width

export default function NearbyEventsScreen() {
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<Event[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationDenied, setLocationDenied] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const getLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationDenied(true)
        return null
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setUserLocation(coords)
      setLocationDenied(false)
      return coords
    } catch {
      return null
    }
  }, [])

  const loadEvents = useCallback(async (force = false) => {
    try {
      const coords = userLocation || await getLocation()
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
      } else {
        setEvents([])
      }
    } catch {
      if (mountedRef.current) setEvents([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [userLocation, getLocation])

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

  const containerPadding = 14 * 2
  const innerW = Math.max(0, screenW - containerPadding)
  const cardWidth = Math.min(420, Math.round(innerW * 0.96))

  const renderItem = useCallback(({ item }: { item: Event }) => {
    const dist = (item as any)._distance
    // Shared with the home screen's Nearby cards, so the same event does not
    // read "1.2km away" on one screen and "1km away" on the other.
    const distLabel = formatDistance(dist)

    return (
      <View style={styles.cardWrapper}>
        <NearbyEventCard
          event={item as any}
          width={cardWidth}
          onPress={handleEventPress as any}
          timeLabel={formatTimeRange(item.start_time, item.end_time)}
          locationLabel={distLabel || item.venue_name || item.address || ''}
        />
      </View>
    )
  }, [cardWidth, handleEventPress])

  const keyExtractor = useCallback((item: Event) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Events</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : locationDenied ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={APP_COLORS.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>Location access needed</Text>
          <Text style={styles.emptySub}>Enable location to see events near you.</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => { try { (Linking as any)?.openSettings?.() } catch {} }}
          >
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={APP_COLORS.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>No nearby events</Text>
          <Text style={styles.emptySub}>There are no events near your current location.</Text>
        </View>
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
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub: { color: '#CCCCCC', fontSize: 14, textAlign: 'center' },
  settingsBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: APP_COLORS.accent,
    borderRadius: 12,
  },
  settingsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  cardWrapper: {
    marginBottom: 12,
  },
})
