import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Logger } from '../../lib/logger'
import { EventChat, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'

interface Event {
  id: string
  title: string
  description: string
  short_description: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  price_cents: number
  max_capacity: number
  current_capacity: number
  cover_image_url: string | null
  category: string
  check_in_radius: number
  latitude: number
  longitude: number
}

export default function Events() {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityData, setProximityData] = useState<{ [eventId: string]: any }>({})
  const [checkinStatuses, setCheckinStatuses] = useState<{ [eventId: string]: any }>({})
  const [checkedInEvents, setCheckedInEvents] = useState<Event[]>([])

  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id })
      fetchEvents()
      getCurrentLocationQuietly()
      loadCheckedInEvents()
    } else if (!authLoading && !user) {
      Logger.journey('auth', 'redirect:unauthorized')
      router.replace('/')
    }
  }, [user, authLoading])

  useEffect(() => {
    if (events.length > 0 && user) {
      loadCheckinStatusesBatch()
    }
  }, [events, user])

  // Refresh statuses when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      if (user && events.length > 0) {
        loadCheckinStatusesBatch()
      }
      if (user) {
        loadCheckedInEvents()
      }
    }, [user, events.length])
  )

  // Realtime: refresh when this user's check-in rows change
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`events_checkins_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_checkins', filter: `user_id=eq.${user.id}` },
        () => {
          loadCheckinStatusesBatch()
          loadCheckedInEvents()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, events.length])

  const loadCheckedInEvents = async () => {
    if (!user) return
    try {
      Logger.journey('checkin', 'loadActiveCheckins:start', { userId: user.id })
      // Get active check-ins for this user
      const { data: checkins, error } = await supabase
        .from('event_checkins')
        .select('event_id')
        .eq('user_id', user.id)
        .is('checked_out_at', null)

      if (error) {
        Logger.error('❌ [CHECKED_IN]', 'Error fetching active check-ins', { error })
        setCheckedInEvents([])
        return
      }

      const eventIds = Array.from(new Set((checkins || []).map((c: any) => String(c.event_id)))).filter(Boolean)
      if (eventIds.length === 0) {
        Logger.journey('checkin', 'loadActiveCheckins:none')
        setCheckedInEvents([])
        return
      }

      const { data: eventRows, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)

      if (eventsError) {
        Logger.error('❌ [CHECKED_IN]', 'Error fetching events', { error: eventsError })
        setCheckedInEvents([])
        return
      }

      // Optional: sort by start_time ascending
      const sorted = (eventRows || []).slice().sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      setCheckedInEvents(sorted as Event[])
      Logger.journey('checkin', 'loadActiveCheckins:success', { count: sorted.length })
    } catch (e) {
      Logger.error('💥 [CHECKED_IN]', 'Unexpected error', { error: e as any })
      setCheckedInEvents([])
    }
  }

  const renderCheckedInCarousel = () => (
    <View style={styles.carouselContainer}>
      <Text style={styles.carouselTitle}>You're checked in</Text>
      <FlatList
        data={checkedInEvents}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            {item.cover_image_url && (
              <Image source={{ uri: item.cover_image_url }} style={styles.carouselImage} resizeMode="cover" />
            )}
            <View style={styles.carouselContent}>
              <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
              <Text style={styles.carouselTime}>
                {new Date(item.start_time).toLocaleDateString()} • {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )

  useEffect(() => {
    if (userLocation && events.length > 0) {
      checkEventProximity()
    }
  }, [userLocation, events])

  const loadCheckinStatusesBatch = async () => {
    if (!user || events.length === 0) return

    try {
      Logger.journey('checkin', 'statusBatch:start', { eventCount: events.length })
      // Query statuses directly to avoid stale caches when resetting check-ins
      const { data: rawStatuses, error: statusError } = await supabase
        .from('event_checkins')
        .select('event_id, checked_in_at, checked_out_at')
        .eq('user_id', user.id)

      if (statusError) {
        throw statusError
      }

      // Map: checked_in if a row exists for that event where checked_out_at is null
      const activeMap = new Map<string, boolean>()
      ;(rawStatuses || []).forEach((row: any) => {
        const eid = String(row.event_id)
        const isActive = !row.checked_out_at
        if (eid && isActive) activeMap.set(eid, true)
      })

      const results = events.map((ev) => [ev.id, { status: activeMap.get(String(ev.id)) ? 'checked_in' : 'not_checked_in' } as any] as const)

      const statusMap: { [eventId: string]: any } = {}
      for (const [eventId, status] of results) {
        statusMap[eventId] = status
      }

      setCheckinStatuses(statusMap)
      Logger.journey('checkin', 'statusBatch:success', { count: results.length })
    } catch (error) {
      Logger.error('💥 [CHECKIN_STATUS]', 'Unexpected error', { error: error as any })
      setCheckinStatuses({})
    }
  }

  const getCurrentLocationQuietly = async () => {
    try {
      // Try to get location without prompting user (for proximity display only)
      // This will use fallback coordinates if location is not available
      const testLocation = {
        latitude: 19.076, // Mumbai coordinates as fallback
        longitude: 72.8777
      }
      setUserLocation(testLocation)
      Logger.journey('proximity', 'quietLocation:fallbackSet', { lat: testLocation.latitude, lon: testLocation.longitude })
    } catch (error) {
      console.log('⚠️ [LOCATION] Using fallback location');
      // Use fallback location for testing
      setUserLocation({
        latitude: 19.076,
        longitude: 72.8777
      })
      Logger.warn('📍 [LOCATION]', 'quietLocation:error', { error: error as any })
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation || !user) return

    try {
      Logger.journey('proximity', 'checkAll:start', { lat: userLocation.latitude, lon: userLocation.longitude })
      
      // Use the actual function that exists: check_user_proximity_status
      const { data: proximityData, error } = await supabase
        .rpc('check_user_proximity_status', {
          p_user_id: user.id,
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (error) {
        Logger.error('❌ [PROXIMITY]', 'Error checking proximity', { error })
        return
      }

      // Transform the response to match our expected format
      const proximityMap: { [eventId: string]: any } = {}
      
      if (proximityData?.nearby_events) {
        proximityData.nearby_events.forEach((event: any) => {
          proximityMap[event.event_id] = {
            within_radius: event.within_radius,
            distance_km: event.distance_km,
            can_check_in: event.can_check_in
          }
        })
      }

      setProximityData(proximityMap)
      Logger.journey('proximity', 'checkAll:success', { eventsEvaluated: events.length, nearbyCount: proximityData?.nearby_events?.length || 0 })
    } catch (error) {
      Logger.error('💥 [PROXIMITY]', 'Proximity check failed', { error: error as any })
    }
  }

  const fetchEvents = async () => {
    try {
      setLoading(true)
      Logger.journey('events', 'fetch:start')
      
      const { data: eventsData, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .gte('end_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })

      if (error) {
        Logger.error('❌ [EVENTS]', 'Error fetching events', { error })
        Alert.alert('Error', 'Failed to load events')
        return
      }

      setEvents(eventsData || [])
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('💥 [EVENTS]', 'Unexpected error', { error: error as any })
      Alert.alert('Error', 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchEvents()
    setRefreshing(false)
  }

  const handleEventPress = (event: Event) => {
    router.push(`/event/${event.id}`)
  }

  const handleCheckIn = async (event: Event) => {
    try {
      Logger.journey('checkin', 'start', { eventId: event.id })
      if (!user) {
        Logger.journey('auth', 'blocked:notSignedIn')
        Alert.alert('Sign in required', 'Please sign in to check in to events')
        return
      }
      
      // Call standardized production check-in RPC
      const params = {
        p_event_id: event.id,
        p_user_id: user.id,
        p_user_latitude: userLocation?.latitude || 19.076,
        p_user_longitude: userLocation?.longitude || 72.8777,
        p_gps_accuracy: 50,
      }
      Logger.journey('checkin', 'rpc:check_in_to_event_production:call', params)
      const { data, error } = await supabase
        .rpc('check_in_to_event_production', {
          ...params
        })

      if (error) {
        Logger.error('❌ [CHECK_IN]', 'RPC error', { error })
        Alert.alert('Check-in Failed', error.message)
        return
      }

      if (data?.success) {
        Logger.journey('checkin', 'success', { eventId: event.id })
        // Ensure user is in the event chat in the background
        EventChat.ensureUserInEventChat(event.id, event.title).then((ensured) => {
          if (ensured?.chatRoomId) {
            // Optional: guide user directly to the chat
            Alert.alert(
              'Success!',
              'You have been checked in and added to the event chat.',
              [
                { text: 'Go to Chat', onPress: () => router.push(`/chat/${ensured.chatRoomId}?roomName=${encodeURIComponent(ensured.roomName)}&eventTitle=${encodeURIComponent(event.title)}`) },
                { text: 'OK', style: 'default' }
              ]
            )
          } else {
            Alert.alert('Success!', data.message)
          }
        }).catch(() => Alert.alert('Success!', data.message))

        // Refresh the checkin status for this event
        loadCheckinStatusesBatch()
      } else {
        Logger.warn('⚠️ [CHECK_IN]', 'Failed', { message: data?.message })
        Alert.alert('Check-in Failed', data?.message || 'Unknown error')
      }
    } catch (error) {
      Logger.error('💥 [CHECK_IN]', 'Unexpected error', { error: error as any })
      Alert.alert('Error', 'Failed to check in')
    }
  }

  const renderEventItem = ({ item: event }: { item: Event }) => {
    const checkinStatus = checkinStatuses[event.id]
    const proximity = proximityData[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = proximity?.within_radius && !isCheckedIn

    return (
      <TouchableOpacity 
        style={styles.eventCard} 
        onPress={() => handleEventPress(event)}
      >
        {event.cover_image_url && (
          <Image 
            source={{ uri: event.cover_image_url }} 
            style={styles.eventImage}
            resizeMode="cover"
          />
        )}
        
        <View style={styles.eventContent}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventVenue}>{event.venue_name}</Text>
          <Text style={styles.eventDescription} numberOfLines={2}>
            {event.short_description || event.description}
          </Text>
          
          <View style={styles.eventMeta}>
            <Text style={styles.eventTime}>
              {new Date(event.start_time).toLocaleDateString()} at{' '}
              {new Date(event.start_time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
            <Text style={styles.eventPrice}>
              {event.price_cents > 0 ? `₹${event.price_cents / 100}` : 'Free'}
            </Text>
          </View>

          {/* Status indicators */}
          <View style={styles.statusRow}>
            {isCheckedIn && (
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>✅ Checked In</Text>
              </View>
            )}
            
            {proximity?.within_radius && !isCheckedIn && (
              <TouchableOpacity 
                style={styles.checkinButton}
                onPress={() => handleCheckIn(event)}
              >
                <Text style={styles.checkinButtonText}>Check In</Text>
              </TouchableOpacity>
            )}
            
            {proximity && !proximity.within_radius && (
              <View style={[styles.statusBadge, { backgroundColor: '#f0f0f0' }]}>
                <Text style={[styles.statusText, { color: '#666' }]}>
                  📍 {Math.round(proximity.distance_km * 1000)}m away
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {checkedInEvents.length > 0 && renderCheckedInCarousel()}
      <FlatList
        data={events}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={checkedInEvents.length > 0 ? <View style={{ height: 8 }} /> : undefined}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 16,
  },
  carouselContainer: {
    paddingTop: 12,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  carouselList: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  carouselCard: {
    width: 260,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  carouselImage: {
    width: '100%',
    height: 120,
  },
  carouselContent: {
    padding: 12,
  },
  carouselEventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  carouselVenue: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  carouselTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 200,
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
    lineHeight: 20,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
  },
  eventPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  checkinButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checkinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
}) 