import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Linking,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { formatEventDateTime } from '../../lib/time'
import { APP_COLORS } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'

interface EventRow {
  id: string
  title: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  cover_image_url: string | null
  latitude: number
  longitude: number
}

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

  const loadInterestedEvents = useCallback(async () => {
    try {
      setLoading(true)
      if (!authUser) {
        setEvents([])
        setLoading(false)
        return
      }

      // Get user's favorites/interested events via API
      const result = await apiClient.getUserFavorites(authUser.id)

      if (!result.success || !result.data) {
        Logger.debug('interested', 'Failed to load favorites', { error: result.error })
        setEvents([])
        setLoading(false)
        return
      }

      // Map API response to EventRow format
      const rows: EventRow[] = (result.data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        venue_name: e.venueName || e.venue_name || '',
        address: e.address || '',
        start_time: e.startTime || e.start_time,
        end_time: e.endTime || e.end_time,
        cover_image_url: e.coverImageUrl || e.cover_image_url,
        latitude: e.latitude,
        longitude: e.longitude,
      }))

      setEvents(rows)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [authUser])

  useEffect(() => {
    if (authUser) {
      loadInterestedEvents()
    }
  }, [authUser, loadInterestedEvents])

  // Note: Real-time interest updates work per-event (when viewing event details).
  // For the favorites list, we rely on pull-to-refresh and focus refresh.
  // Subscribing to all favorited events would be expensive and unnecessary
  // since the list is already refreshed on screen focus via useFocusEffect.
  // To implement: would need server to emit to user's personal room on favorite changes.

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadInterestedEvents()
    setRefreshing(false)
  }, [loadInterestedEvents])

  const toggleInterest = useCallback(async (event: EventRow) => {
    try {
      const result = await apiClient.toggleFavorite(event.id)
      if (!result.success) {
        Alert.alert('Error', 'Failed to update interest')
        return
      }
      if (!result.data?.favorited) {
        setEvents(prev => prev.filter(e => e.id !== event.id))
      }
    } catch {
      Alert.alert('Error', 'Failed to update interest')
    }
  }, [])

  const openInMaps = useCallback(async (event: EventRow) => {
    const lat = event.latitude
    const lon = event.longitude
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)
    const addressQuery = encodeURIComponent(event.address || event.venue_name || event.title || 'Event Location')
    const googleScheme = 'comgooglemaps://'
    const googleAppUrl = hasCoords ? `${googleScheme}?q=${lat},${lon}` : `${googleScheme}?q=${addressQuery}`
    const googleWebUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
    try { if (await Linking.canOpenURL(googleScheme)) return Linking.openURL(googleAppUrl) } catch {}
    return Linking.openURL(googleWebUrl)
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
    <TouchableOpacity style={styles.card} onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } as any })}>
      <ImageBackground source={{ uri: (item.cover_image_url || '') as string }} style={styles.image} imageStyle={styles.imageRadius} resizeMode="cover">
        <View style={[StyleSheet.absoluteFill, styles.imageOverlay]} />
        <View style={styles.overlayContent}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.venue} numberOfLines={1}>{item.venue_name}</Text>
          <Text style={styles.time}>{formatEventDateTime(item.start_time)}</Text>
        </View>
      </ImageBackground>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionChip} onPress={() => toggleInterest(item)}>
          <Ionicons name="heart-dislike" size={16} color={APP_COLORS.destructive} />
          <Text style={styles.actionText}>Remove</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => openInMaps(item)}>
          <Ionicons name="navigate" size={16} color={APP_COLORS.accent} />
          <Text style={styles.actionText}>Open in Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => addToCalendar(item)}>
          <Ionicons name="calendar" size={16} color={APP_COLORS.accent} />
          <Text style={styles.actionText}>Add to calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => shareEvent(item)}>
          <Ionicons name="share-social" size={16} color={APP_COLORS.accent} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), [toggleInterest, openInMaps, addToCalendar, shareEvent])

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
          <ActivityIndicator color={APP_COLORS.textPrimary} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No saved events yet</Text>
          <Text style={styles.emptySub}>Tap the heart on events to save them here.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ paddingBottom: 24 }}
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
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: APP_COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: APP_COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub: { color: APP_COLORS.textSecondary, fontSize: 14, textAlign: 'center' },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: APP_COLORS.backgroundElevated, borderRadius: 12, overflow: 'hidden' },
  image: { height: 180, width: '100%' },
  imageRadius: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  imageOverlay: { backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayContent: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  title: { color: APP_COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  venue: { color: APP_COLORS.textPrimary, marginTop: 2 },
  time: { color: APP_COLORS.textSecondary, marginTop: 2, fontSize: 12 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: APP_COLORS.backgroundElevated },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: APP_COLORS.backgroundCard, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16 },
  actionText: { color: APP_COLORS.textPrimary, fontSize: 12 },
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
