import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Linking,
    Platform,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EventInterest, supabase } from '../lib/supabase'
import { formatEventDateTime } from '../lib/time'

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

export default function InterestedScreen() {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<EventRow[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const loadInterestedEvents = useCallback(async () => {
    try {
      setLoading(true)
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id
      if (!userId) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: interestRows, error: interestsError } = await supabase
        .from('event_interests')
        .select('event_id')
        .eq('user_id', userId)

      if (interestsError) {
        setEvents([])
        setLoading(false)
        return
      }

      const eventIds = Array.from(new Set((interestRows || []).map((r: any) => String(r.event_id)))).filter(Boolean)
      if (eventIds.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from('events_now_or_upcoming')
        .select('*')
        .in('id', eventIds)
        .order('start_time', { ascending: true })

      if (eventsError) {
        setEvents([])
        setLoading(false)
        return
      }

      const rows = (eventRows || []) as EventRow[]
      setEvents(rows)
    } catch (e) {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInterestedEvents()
  }, [loadInterestedEvents])

  // Realtime interests updates
  useEffect(() => {
    let channel: any
    const subscribe = async () => {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes?.user?.id
      if (!userId) return
      channel = supabase
        .channel(`interests_${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_interests', filter: `user_id=eq.${userId}` },
          () => loadInterestedEvents()
        )
        .subscribe()
    }
    subscribe()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [loadInterestedEvents])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadInterestedEvents()
    setRefreshing(false)
  }, [loadInterestedEvents])

  const toggleInterest = useCallback(async (event: EventRow) => {
    const res = await EventInterest.toggleInterest(event.id)
    if (!res) {
      Alert.alert('Error', 'Failed to update interest')
      return
    }
    if (!res.interested) {
      setEvents(prev => prev.filter(e => e.id !== event.id))
    }
  }, [])

  const openInMaps = useCallback(async (event: EventRow) => {
    const lat = event.latitude
    const lon = event.longitude
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)
    const label = encodeURIComponent(event.venue_name || 'Event Location')
    const addressQuery = encodeURIComponent(event.address || event.venue_name || event.title || 'Event Location')
    if (Platform.OS === 'ios') {
      const googleScheme = 'comgooglemaps://'
      const googleUrl = hasCoords ? `${googleScheme}?q=${lat},${lon}` : `${googleScheme}?q=${addressQuery}`
      const appleUrl = hasCoords ? `maps:0,0?q=${label}@${lat},${lon}` : `maps:0,0?q=${addressQuery}`
      const webUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
      try { if (await Linking.canOpenURL(googleScheme)) return Linking.openURL(googleUrl) } catch {}
      try { if (await Linking.canOpenURL('maps:')) return Linking.openURL(appleUrl) } catch {}
      return Linking.openURL(webUrl)
    } else {
      const googleScheme = 'comgooglemaps://'
      const googleUrl = hasCoords ? `${googleScheme}?q=${lat},${lon}` : `${googleScheme}?q=${addressQuery}`
      const geoUrl = hasCoords ? `geo:0,0?q=${lat},${lon}(${label})` : `geo:0,0?q=${addressQuery}`
      const webUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
      try { if (await Linking.canOpenURL(googleScheme)) return Linking.openURL(googleUrl) } catch {}
      try { if (await Linking.canOpenURL('geo:')) return Linking.openURL(geoUrl) } catch {}
      return Linking.openURL(webUrl)
    }
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
          <Ionicons name="heart-dislike" size={16} color="#D81B60" />
          <Text style={styles.actionText}>Remove</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => openInMaps(item)}>
          <Ionicons name="navigate" size={16} color="#007AFF" />
          <Text style={styles.actionText}>Open in Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => addToCalendar(item)}>
          <Ionicons name="calendar" size={16} color="#4C7CFB" />
          <Text style={styles.actionText}>Add to calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => shareEvent(item)}>
          <Ionicons name="share-social" size={16} color="#4C7CFB" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), [toggleInterest, openInMaps, addToCalendar, shareEvent])

  const keyExtractor = useCallback((item: EventRow) => item.id, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Interested</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
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
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
  image: { height: 180, width: '100%' },
  imageRadius: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  imageOverlay: { backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayContent: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  venue: { color: '#EEEEEE', marginTop: 2 },
  time: { color: '#CCCCCC', marginTop: 2, fontSize: 12 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#1a1a1a' },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#242424', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16 },
  actionText: { color: '#FFFFFF', fontSize: 12 },
})


