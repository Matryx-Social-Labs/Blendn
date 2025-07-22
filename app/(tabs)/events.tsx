import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

interface Event {
  id: string
  title: string
  description: string
  short_description: string | null
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
  const [proximityData, setProximityData] = useState<any>(null)

  useEffect(() => {
    fetchEvents()
    getCurrentLocationQuietly()
  }, [])

  useEffect(() => {
    if (userLocation && events.length > 0) {
      checkEventProximity()
    }
  }, [userLocation, events])

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
    if (!userLocation) return
    
    try {
      const { data, error } = await supabase
        .rpc('check_user_proximity_status', {
          p_user_id: '339f7a74-3272-4b36-80e2-941ebea5bc4d',
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (!error && data) {
        setProximityData(data)
      }
    } catch (error) {
      console.log('Proximity check failed:', error)
    }
  }

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('start_time', { ascending: true })

      if (error) {
        console.error('Error fetching events:', error)
      } else {
        setEvents(data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const onRefresh = () => {
    setRefreshing(true)
    fetchEvents()
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
    const proximityInfo = proximityData?.nearby_events?.find(
      (e: any) => e.event_id === item.id
    )
    
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
}) 