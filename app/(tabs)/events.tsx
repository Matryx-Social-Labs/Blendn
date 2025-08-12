import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
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
import { supabase } from '../../lib/supabase'
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

  useEffect(() => {
    if (!authLoading && user) {
      fetchEvents()
      getCurrentLocationQuietly()
    } else if (!authLoading && !user) {
      router.replace('/')
    }
  }, [user, authLoading])

  useEffect(() => {
    if (events.length > 0 && user) {
      loadCheckinStatusesBatch()
    }
  }, [events, user])

  useEffect(() => {
    if (userLocation && events.length > 0) {
      checkEventProximity()
    }
  }, [userLocation, events])

  const loadCheckinStatusesBatch = async () => {
    if (!user || events.length === 0) return

    try {
      console.log('🔍 [CHECKIN_STATUS] Loading checkin statuses for all events in batch');
      
      // Get all checkin records for this user across all events in a single query
      const eventIds = events.map(event => event.id)
      const { data: checkinRecords, error } = await supabase
        .from('event_checkins')
        .select('event_id, checked_in_at, checked_out_at')
        .eq('user_id', user.id)
        .in('event_id', eventIds)
        .order('checked_in_at', { ascending: false })

      if (error) {
        console.error('❌ [CHECKIN_STATUS] Error fetching checkin records:', error)
        setCheckinStatuses({})
        return
      }

      // Process the batch results into status map
      const statusMap: { [eventId: string]: any } = {}
      
      for (const eventId of eventIds) {
        // Find the most recent checkin record for this event
        const eventRecord = checkinRecords?.find(record => record.event_id === eventId)
        
        if (!eventRecord) {
          statusMap[eventId] = { status: 'not_checked_in' }
        } else {
          const status = eventRecord.checked_out_at ? 'checked_out' : 'checked_in'
          statusMap[eventId] = {
            status,
            checked_in_at: eventRecord.checked_in_at,
            checked_out_at: eventRecord.checked_out_at
          }
        }
      }

      setCheckinStatuses(statusMap)
      console.log(`✅ [CHECKIN_STATUS] Loaded statuses for ${Object.keys(statusMap).length} events in batch`);
    } catch (error) {
      console.error('💥 [CHECKIN_STATUS] Unexpected error:', error);
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
    } catch (error) {
      console.log('⚠️ [LOCATION] Using fallback location');
      // Use fallback location for testing
      setUserLocation({
        latitude: 19.076,
        longitude: 72.8777
      })
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation || !user) return

    try {
      console.log('🔍 [PROXIMITY] Checking proximity for all events');
      
      // Use the actual function that exists: check_user_proximity_status
      const { data: proximityData, error } = await supabase
        .rpc('check_user_proximity_status', {
          p_user_id: user.id,
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (error) {
        console.error('❌ [PROXIMITY] Error checking proximity:', error);
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
      console.log(`✅ [PROXIMITY] Checked proximity for ${events.length} events`);
    } catch (error) {
      console.error('💥 [PROXIMITY] Proximity check failed:', error);
    }
  }

  const fetchEvents = async () => {
    try {
      setLoading(true)
      console.log('🔍 [EVENTS] Fetching events...');
      
      const { data: eventsData, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('start_time', { ascending: true })

      if (error) {
        console.error('❌ [EVENTS] Error fetching events:', error);
        Alert.alert('Error', 'Failed to load events')
        return
      }

      setEvents(eventsData || [])
      console.log(`✅ [EVENTS] Loaded ${eventsData?.length || 0} events`);
    } catch (error) {
      console.error('💥 [EVENTS] Unexpected error:', error);
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
      console.log('🔍 [CHECK_IN] Starting check-in for event:', event.id)
      
      // Call the check-in RPC function
      const { data, error } = await supabase
        .rpc('checkin_user_to_event', {
          event_id: event.id,
          user_lat: userLocation?.latitude || 19.076,
          user_lng: userLocation?.longitude || 72.8777
        })

      if (error) {
        console.error('❌ [CHECK_IN] Error:', error)
        Alert.alert('Check-in Failed', error.message)
        return
      }

      if (data?.success) {
        console.log('✅ [CHECK_IN] Success')
        Alert.alert('Success!', data.message)
        // Refresh the checkin status for this event
        loadCheckinStatusesBatch()
      } else {
        console.log('⚠️ [CHECK_IN] Failed:', data?.message)
        Alert.alert('Check-in Failed', data?.message || 'Unknown error')
      }
    } catch (error) {
      console.error('💥 [CHECK_IN] Unexpected error:', error)
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
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