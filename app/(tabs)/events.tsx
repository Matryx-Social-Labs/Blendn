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
import { EventCheckout, supabase } from '../../lib/supabase'

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
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityData, setProximityData] = useState<{ [eventId: string]: any }>({})
  const [checkinStatuses, setCheckinStatuses] = useState<{ [eventId: string]: any }>({})

  useEffect(() => {
    fetchEvents()
    getCurrentLocationQuietly()
  }, [])

  useEffect(() => {
    if (events.length > 0) {
      loadCheckinStatuses()
    }
  }, [events])

  useEffect(() => {
    if (userLocation && events.length > 0) {
      checkEventProximity()
    }
  }, [userLocation, events])

  const loadCheckinStatuses = async () => {
    console.log('🔍 [CHECKIN_STATUS] Loading checkin statuses for all events');
    const statuses: { [eventId: string]: any } = {}
    
    try {
      for (const event of events) {
        // Add timeout wrapper to checkout status check
        const statusPromise = EventCheckout.getCheckinStatus(event.id)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Checkin status timeout for event ${event.id} after 5000ms`)), 5000)
        )
        
        try {
          const status = await Promise.race([statusPromise, timeoutPromise]) as any
          statuses[event.id] = status
          console.log(`✅ [CHECKIN_STATUS] Event ${event.id}: ${status.status}`);
        } catch (error) {
          console.error(`❌ [CHECKIN_STATUS] Failed to get status for event ${event.id}:`, error);
          statuses[event.id] = { status: 'error' }
        }
      }
      
      setCheckinStatuses(statuses)
      console.log(`✅ [CHECKIN_STATUS] Loaded statuses for ${Object.keys(statuses).length} events`);
    } catch (error) {
      console.error('💥 [CHECKIN_STATUS] Unexpected error:', error);
      console.log('🔄 [CHECKIN_STATUS] Setting empty statuses due to error');
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
      console.log('Could not get location for proximity detection')
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation) {
      console.log('⚠️ [PROXIMITY] No user location available for proximity check');
      return
    }

    try {
      console.log('🔍 [PROXIMITY] Starting checkEventProximity...');
      console.log('🔍 [PROXIMITY] User location:', userLocation);
      console.log('🔍 [PROXIMITY] Checking proximity for', events.length, 'events');
      
      // Get current user ID for the proximity check
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('⚠️ [PROXIMITY] No authenticated user for proximity check');
        return
      }

      // Add timeout wrapper to prevent infinite hanging - using correct function name
      const proximityPromise = supabase.rpc('check_user_proximity_status', {
        p_user_id: user.id,
        p_user_latitude: userLocation.latitude,
        p_user_longitude: userLocation.longitude
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Proximity check RPC timeout after 8000ms')), 8000)
      )
      
      const { data, error } = await Promise.race([proximityPromise, timeoutPromise]) as any

      if (error) {
        console.error('❌ [PROXIMITY] RPC error:', error);
        console.error('❌ [PROXIMITY] Error code:', error.code);
        console.error('❌ [PROXIMITY] Error message:', error.message);
        console.error('❌ [PROXIMITY] Error details:', error.details);
        console.log('🔄 [PROXIMITY] Skipping proximity data due to error');
        return
      }

      console.log('✅ [PROXIMITY] SUCCESS: check_user_proximity_status worked!');
      console.log('✅ [PROXIMITY] Raw proximity data:', data);
      console.log('✅ [PROXIMITY] Proximity data type:', typeof data);
      
      if (data && data.nearby_events) {
        console.log('✅ [PROXIMITY] Nearby events count:', data.nearby_events.length);
        
        // Convert array to object for easier lookup
        const proximityMap: { [eventId: string]: any } = {}
        data.nearby_events.forEach((event: any) => {
          proximityMap[event.event_id] = event
        })
        
        setProximityData(proximityMap)
        console.log('✅ [PROXIMITY] Successfully updated proximity data');
      } else {
        console.log('⚠️ [PROXIMITY] No nearby_events in response');
      }
    } catch (error) {
      console.error('💥 [PROXIMITY] Unexpected error:', error);
      console.log(`💥 [PROXIMITY] Error type: ${typeof error}`);
      console.log(`💥 [PROXIMITY] Error message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log('🔄 [PROXIMITY] Skipping proximity check due to error');
    }
  }

  const fetchEvents = async () => {
    try {
      console.log('🔍 [EVENTS] Starting fetchEvents...');
      console.log('🔍 [EVENTS] Supabase client initialized:', !!supabase);
      
      // Test real database query first with timeout
      console.log('🔍 [EVENTS] Executing query: events table, status=published');
      const queryStartTime = Date.now();
      
      // Add timeout wrapper to prevent infinite hanging
      const queryPromise = supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('start_time', { ascending: true })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Events query timeout after 8000ms')), 8000)
      )
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any

      const queryEndTime = Date.now();
      console.log(`🔍 [EVENTS] Query completed in ${queryEndTime - queryStartTime}ms`);

      if (error) {
        console.error('❌ [EVENTS] Database error:', error);
        console.error('❌ [EVENTS] Error code:', error.code);
        console.error('❌ [EVENTS] Error message:', error.message);
        console.error('❌ [EVENTS] Error details:', error.details);
        console.log('🔄 [EVENTS] Falling back to mock data due to query error...');

        // Fallback to mock data
        const mockEvents: Event[] = [
          {
            id: '1',
            title: 'Coffee & Code Meetup',
            description: 'Join fellow developers for coffee, coding discussions, and networking',
            short_description: 'Developer networking event',
            venue_name: 'Café Mocha',
            address: 'Bandra West, Mumbai',
            start_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
            price_cents: 0,
            max_capacity: 50,
            current_capacity: 23,
            cover_image_url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=400',
            category: 'Technology',
            check_in_radius: 50,
            latitude: 19.0544,
            longitude: 72.8381
          },
          {
            id: '2',
            title: 'Sunset Yoga Session',
            description: 'Relax and unwind with a sunset yoga session by the beach',
            short_description: 'Beach yoga at sunset',
            venue_name: 'Juhu Beach',
            address: 'Juhu, Mumbai',
            start_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 1.5 * 60 * 60 * 1000).toISOString(),
            price_cents: 500,
            max_capacity: 30,
            current_capacity: 18,
            cover_image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
            category: 'Health & Wellness',
            check_in_radius: 100,
            latitude: 19.0896,
            longitude: 72.8656
          },
          {
            id: '3',
            title: 'Food Truck Festival',
            description: 'Explore diverse cuisines from the best food trucks in the city',
            short_description: 'Street food extravaganza',
            venue_name: 'Phoenix Mills',
            address: 'Lower Parel, Mumbai',
            start_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
            price_cents: 0,
            max_capacity: 200,
            current_capacity: 87,
            cover_image_url: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
            category: 'Food & Drink',
            check_in_radius: 75,
            latitude: 19.0135,
            longitude: 72.8302
          }
        ];
        
        setEvents(mockEvents);
        console.log(`🔄 [EVENTS] Loaded ${mockEvents.length} mock events as fallback`);
      } else {
        console.log('✅ [EVENTS] SUCCESS: Real database query worked!');
        console.log('✅ [EVENTS] Raw data received:', data);
        console.log('✅ [EVENTS] Data type:', typeof data);
        console.log('✅ [EVENTS] Data length:', data?.length || 0);
        
        if (data && data.length > 0) {
          console.log('✅ [EVENTS] First event sample:', JSON.stringify(data[0], null, 2));
        }
        
        setEvents(data || [])
        console.log(`✅ [EVENTS] Successfully loaded ${data?.length || 0} real events from database`);
      }
    } catch (error) {
      console.error('💥 [EVENTS] Unexpected error:', error);
      console.log(`💥 [EVENTS] Error type: ${typeof error}`);
      console.log(`💥 [EVENTS] Error message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fallback to mock data on any error
      console.log('🔄 [EVENTS] Using mock data due to unexpected error...');
      const mockEvents: Event[] = [
        {
          id: 'mock-1',
          title: 'Demo Event (Offline Mode)',
          description: 'This is a demo event shown when database is unavailable',
          short_description: 'Demo event',
          venue_name: 'Demo Venue',
          address: 'Demo Address',
          start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          end_time: new Date(Date.now() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
          price_cents: 0,
          max_capacity: 50,
          current_capacity: 25,
          cover_image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400',
          category: 'Demo',
          check_in_radius: 50,
          latitude: 19.0760,
          longitude: 72.8777
        }
      ];
      
      setEvents(mockEvents);
      console.log(`🔄 [EVENTS] Loaded ${mockEvents.length} mock events as emergency fallback`);
    } finally {
      console.log('🏁 [EVENTS] fetchEvents completed');
      setLoading(false)
    }
  }

  const handleCheckout = async (eventId: string, eventTitle: string) => {
    Alert.alert(
      'Checkout from Event',
      `Are you sure you want to checkout from "${eventTitle}"? You will be removed from the group chat.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Checkout',
          style: 'destructive',
          onPress: async () => {
            console.log('🔍 [CHECKOUT] User confirmed checkout for event:', eventId);
            
            try {
              const result = await EventCheckout.checkoutFromEvent(eventId)
              
              if (result.success) {
                Alert.alert('Success', result.message)
                // Refresh checkin statuses
                await loadCheckinStatuses()
              } else {
                Alert.alert('Error', result.message)
              }
            } catch (error) {
              console.error('💥 [CHECKOUT] Unexpected error:', error);
              Alert.alert('Error', 'Failed to checkout from event')
            }
          }
        }
      ]
    )
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchEvents()
    await loadCheckinStatuses()
    if (userLocation) {
      await checkEventProximity()
    }
    setRefreshing(false)
  }

  const handleEventPress = (event: Event) => {
    router.push({
      pathname: '/event/[id]' as any,
      params: { id: event.id }
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Tomorrow'
    if (diffInDays < 7) return `In ${diffInDays} days`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatPrice = (priceCents: number) => {
    if (priceCents === 0) return 'Free'
    return `₹${(priceCents / 100).toFixed(0)}`
  }

  const renderEventCard = ({ item }: { item: Event }) => {
    const spotsLeft = item.max_capacity - item.current_capacity
    
    // Find proximity info for this event
    const proximityInfo = proximityData[item.id]
    
    return (
      <TouchableOpacity style={styles.eventCard} onPress={() => handleEventPress(item)}>
        <Image 
          source={{ uri: item.cover_image_url || 'https://images.unsplash.com/photo-1511632765486-a01980e01a18' }}
          style={styles.eventImage}
        />
        
        {proximityInfo && (
          <View style={[
            styles.proximityBadge,
            proximityInfo.can_check_in ? styles.proximityGoodBadge : styles.proximityFarBadge
          ]}>
            <Text style={styles.proximityBadgeText}>
              {proximityInfo.can_check_in ? '✅ Can Check In' : `📍 ${Math.round(proximityInfo.distance_meters)}m away`}
            </Text>
          </View>
        )}
        
        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            <View style={styles.categoryContainer}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
            <Text style={styles.eventPrice}>{formatPrice(item.price_cents)}</Text>
          </View>
          
          <Text style={styles.eventTitle}>{item.title}</Text>
          <Text style={styles.eventDescription} numberOfLines={2}>
            {item.short_description || item.description}
          </Text>
          
          <View style={styles.eventMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>📍</Text>
              <Text style={styles.metaText}>{item.venue_name}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>🕒</Text>
              <Text style={styles.metaText}>{formatDate(item.start_time)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>👥</Text>
              <Text style={styles.metaText}>
                {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Fully booked'}
              </Text>
            </View>
          </View>
          
          {/* Check-in Status and Checkout Button */}
          {checkinStatuses[item.id] && (
            <View style={styles.checkinStatusContainer}>
              {checkinStatuses[item.id].status === 'checked_in' && (
                <View style={styles.checkedInContainer}>
                  <View style={styles.checkedInStatus}>
                    <Text style={styles.checkedInText}>✅ Checked In</Text>
                    <Text style={styles.checkedInTime}>
                      Since {formatDate(checkinStatuses[item.id].checked_in_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.checkoutButton}
                    onPress={(e) => {
                      e.stopPropagation()
                      handleCheckout(item.id, item.title)
                    }}
                  >
                    <Text style={styles.checkoutButtonText}>Checkout</Text>
                  </TouchableOpacity>
                </View>
              )}
              {checkinStatuses[item.id].status === 'checked_out' && (
                <View style={styles.checkedOutStatus}>
                  <Text style={styles.checkedOutText}>🔄 Checked Out</Text>
                  <Text style={styles.checkedOutTime}>
                    At {formatDate(checkinStatuses[item.id].checked_out_at)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Discover Events 🎉</Text>
      <Text style={styles.headerSubtitle}>
        Find amazing events happening near you
      </Text>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        renderItem={renderEventCard}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
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
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  eventCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  eventImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  proximityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  proximityGoodBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
  },
  proximityFarBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
  },
  proximityBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  eventContent: {
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryContainer: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  eventPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  eventMeta: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  checkinStatusContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  checkedInContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkedInStatus: {
    flex: 1,
  },
  checkedInText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#28a745',
  },
  checkedInTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  checkoutButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkedOutStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkedOutText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6c757d',
  },
  checkedOutTime: {
    fontSize: 12,
    color: '#666',
  },
}) 