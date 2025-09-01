import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { callRpc, EventChat, EventInterest, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
const figmaBg = require('../../assets/figma/400518654fbb40fcec84ab09d6cd2eafa457d336.png')

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
  city?: string
  check_in_radius: number
  latitude: number
  longitude: number
}

export default function Events() {
  const { user, loading: authLoading } = useAuth()
  const insets = useSafeAreaInsets()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityData, setProximityData] = useState<{ [eventId: string]: any }>({})
  const [checkinStatuses, setCheckinStatuses] = useState<{ [eventId: string]: any }>({})
  const [checkedInEvents, setCheckedInEvents] = useState<Event[]>([])
  const [interestStatuses, setInterestStatuses] = useState<{ [eventId: string]: boolean }>({})
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({})
  const [userCity, setUserCity] = useState<string | null>(null)
  const { setScrollProgress } = useGradientOverlay()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id })
      fetchEvents()
      getCurrentLocationQuietly()
      loadCheckedInEvents()
      fetchUserCity()
      // Load user avatar
      ;(async () => {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('profile_photos, photos')
            .eq('user_id', user.id)
            .maybeSingle()
          if (!error && data) {
            const primary = (Array.isArray(data.profile_photos) && data.profile_photos[0]) || (Array.isArray(data.photos) && data.photos[0]) || null
            if (primary) {
              const optimized = getOptimizedImageUrl(primary, { width: 72, height: 72, resize: 'cover', quality: 60 })
              setAvatarUrl(optimized || primary)
            } else {
              setAvatarUrl(null)
            }
          }
        } catch {}
      })()
    }
  }, [user, authLoading])

  useEffect(() => {
    if (events.length > 0 && user) {
      loadCheckinStatusesBatch()
      loadInterestData()
      loadInterestCounts()
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

  // Realtime: update interests when any interest row changes
  useEffect(() => {
    if (!user || events.length === 0) return
    const channel = supabase
      .channel(`events_interests_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_interests' },
        (payload: any) => {
          const affectedEventId = String(payload?.new?.event_id || payload?.old?.event_id || '')
          if (!affectedEventId) return
          const isVisible = events.some(e => String(e.id) === affectedEventId)
          if (!isVisible) return

          const changedUserId = payload?.new?.user_id || payload?.old?.user_id
          if (changedUserId && changedUserId === user.id) {
            setInterestStatuses(prev => {
              if (payload.eventType === 'INSERT') return { ...prev, [affectedEventId]: true }
              if (payload.eventType === 'DELETE') return { ...prev, [affectedEventId]: false }
              return prev
            })
          }
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
        Logger.error('events', 'Error fetching active check-ins', { error })
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
        Logger.error('events', 'Error fetching events', { error: eventsError })
        setCheckedInEvents([])
        return
      }

      // Optional: sort by start_time ascending
      const sorted = (eventRows || []).slice().sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      setCheckedInEvents(sorted as Event[])
      Logger.journey('checkin', 'loadActiveCheckins:success', { count: sorted.length })
    } catch (e) {
      Logger.error('events', 'Unexpected error', { error: e as any })
      setCheckedInEvents([])
    }
  }

  const renderCheckedInCarousel = () => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>You&apos;re checked in</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {checkedInEvents.map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            {item.cover_image_url && (
              <ImageBackground source={{ uri: item.cover_image_url }} style={styles.carouselImage} resizeMode="cover">
                <LinearGradient
                  colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                  style={styles.carouselGradient}
                />
                <View style={styles.carouselContentOverlay}>
                  <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                  <Text style={styles.carouselTime}>
                    {new Date(item.start_time).toLocaleDateString()} • {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </ImageBackground>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  const renderInterestedCarousel = (items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Interested Events</Text>
        <TouchableOpacity style={styles.viewAllRow}>
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={18} color="#E53A17" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            {item.cover_image_url && (
              <>
                <ImageBackground source={{ uri: item.cover_image_url }} style={styles.carouselImage} resizeMode="cover">
                  <LinearGradient
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                    style={styles.carouselGradient}
                  />
                  <View style={styles.carouselContentOverlay}>
                    <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                    <Text style={styles.carouselTime}>
                      {new Date(item.start_time).toLocaleDateString()} • {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </ImageBackground>
                <TouchableOpacity
                  onPress={() => toggleInterest(item)}
                  style={styles.carouselHeartButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.carouselHeartText}>{interestStatuses[item.id] ? '♥︎' : '♡'}</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
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
      Logger.error('events', 'Unexpected error', { error: error as any })
      setCheckinStatuses({})
    }
  }

  const getCurrentLocationQuietly = async () => {
    try {
      // Best-effort permission request with quick timeout; fallback if denied/unavailable
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        const fallback = { latitude: 19.076, longitude: 72.8777 }
        setUserLocation(fallback)
        Logger.warn('events', 'permission:notGrantedUsingFallback', { fallback })
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setUserLocation(coords)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      const fallback = { latitude: 19.076, longitude: 72.8777 }
      setUserLocation(fallback)
      Logger.warn('events', 'quietLocation:errorUsingFallback', { error: error as any, fallback })
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation || !user) return

    try {
      Logger.journey('proximity', 'checkAll:start', { lat: userLocation.latitude, lon: userLocation.longitude })
      
      // Use the actual function that exists: check_user_proximity_status
      const { data: proximityData, error } = await callRpc('check_user_proximity_status', {
          p_user_id: user.id,
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (error) {
        Logger.error('events', 'Error checking proximity', { error })
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
      Logger.error('events', 'Proximity check failed', { error: error as any })
    }
  }

  const fetchUserCity = async () => {
    try {
      if (!user) return
      const { data, error } = await supabase
        .from('profiles')
        .select('location')
        .eq('id', user.id)
        .maybeSingle()
      if (!error && data?.location) {
        const firstPart = String(data.location).split(',')[0]?.trim()
        if (firstPart) setUserCity(firstPart)
      }
    } catch {}
  }

  const fetchEvents = async () => {
    try {
      setLoading(true)
      Logger.journey('events', 'fetch:start')
      
      // Fetch only ongoing or upcoming events from the view
      const { data: eventsData, error } = await supabase
        .from('events_now_or_upcoming')
        .select('*')
        .order('start_time', { ascending: true })

      if (error) {
        Logger.error('events', 'Error fetching events', { error })
        Alert.alert('Error', 'Failed to load events')
        return
      }

      setEvents(eventsData || [])
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      Alert.alert('Error', 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  const loadInterestData = async () => {
    try {
      if (!user || events.length === 0) return
      const eventIds = events.map(e => e.id)
      const userSet = await EventInterest.getUserInterestedEventIds(eventIds)
      const statuses: { [eventId: string]: boolean } = {}
      eventIds.forEach(id => {
        statuses[id] = userSet.has(id)
      })
      setInterestStatuses(statuses)
    } catch (e) {
      Logger.warn('events', 'loadInterestData failed', { error: e })
      setInterestStatuses({})
    }
  }

  const loadInterestCounts = async () => {
    try {
      if (events.length === 0) return
      const eventIds = events.map(e => e.id)
      const counts = await EventInterest.getEventInterestCounts(eventIds)
      setInterestCounts(counts)
    } catch (e) {
      setInterestCounts({})
    }
  }

  const toggleInterest = async (event: Event) => {
    try {
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to save events')
        return
      }
      const prevInterested = !!interestStatuses[event.id]
      // Optimistic update
      setInterestStatuses(prev => ({ ...prev, [event.id]: !prevInterested }))

      const res = await EventInterest.toggleInterest(event.id)
      if (!res) {
        // rollback
        setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
        Alert.alert('Error', 'Failed to update interest')
        return
      }
      setInterestStatuses(prev => ({ ...prev, [event.id]: res.interested }))
      Logger.journey('events', res.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
    } catch (e) {
      Alert.alert('Error', 'Failed to update interest')
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
      const { data, error } = await callRpc('check_in_to_event_production', {
          ...params
        })

      if (error) {
        Logger.error('events', 'RPC error', { error })
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
        Logger.warn('events', 'Failed', { message: data?.message })
        Alert.alert('Check-in Failed', data?.message || 'Unknown error')
      }
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      Alert.alert('Error', 'Failed to check in')
    }
  }

  const renderEventItem = ({ item: event }: { item: Event }) => {
    const checkinStatus = checkinStatuses[event.id]
    const proximity = proximityData[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = proximity?.within_radius && !isCheckedIn
    const interested = !!interestStatuses[event.id]
    const isEnded = new Date(event.end_time).getTime() < Date.now()

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
            
            {proximity && typeof proximity.distance_km === 'number' && !proximity.within_radius && (
              <View style={[styles.statusBadge, { backgroundColor: '#f0f0f0' }]}>
                <Text style={[styles.statusText, { color: '#666' }]}> 
                  📍 {Math.round((proximity.distance_km || 0) * 1000)}m away 
                </Text>
              </View>
            )}

            {!isEnded && (
              <TouchableOpacity 
                style={[styles.interestButton, interested && styles.interestButtonActive]}
                onPress={() => toggleInterest(event)}
              >
                <Text style={[styles.interestButtonText, interested && { color: '#C2185B' }]}>
                  {interested ? '♥︎' : '♡'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderCarouselWithTitle = (title: string, items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity style={styles.viewAllRow}>
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={18} color="#E53A17" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            {item.cover_image_url && (
              <>
                <ImageBackground source={{ uri: item.cover_image_url }} style={styles.carouselImage} resizeMode="cover">
                  <LinearGradient
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                    style={styles.carouselGradient}
                  />
                  <View style={styles.carouselContentOverlay}>
                    <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                    <Text style={styles.carouselTime}>
                      {new Date(item.start_time).toLocaleDateString()} • {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </ImageBackground>
                <TouchableOpacity
                  onPress={() => toggleInterest(item)}
                  style={styles.carouselHeartButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.carouselHeartText}>{interestStatuses[item.id] ? '♥︎' : '♡'}</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  // Animated scroll state for coverflow-like carousel
  const upcomingScrollX = useRef(new Animated.Value(0)).current
  const { width: screenWidth } = Dimensions.get('window')
  const UPCOMING_ITEM_WIDTH = 163
  const UPCOMING_ITEM_HEIGHT = 264
  const UPCOMING_ITEM_SPACING = 14
  const UPCOMING_ITEM_FULL = UPCOMING_ITEM_WIDTH + UPCOMING_ITEM_SPACING
  const UPCOMING_SIDE_PADDING = (screenWidth - UPCOMING_ITEM_WIDTH) / 2
  const UPCOMING_LOOPS = 7
  const upcomingListRef = useRef<FlatList<any> | null>(null)

  const renderUpcomingFigmaCarousel = () => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        <TouchableOpacity style={styles.viewAllRow}>
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={18} color="#E53A17" />
        </TouchableOpacity>
      </View>
      <Animated.FlatList
        ref={upcomingListRef as any}
        horizontal
        data={upcomingLooped}
        keyExtractor={(_, idx) => `up-${idx}`}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        snapToAlignment="center"
        snapToInterval={UPCOMING_ITEM_FULL}
        contentContainerStyle={{ paddingHorizontal: UPCOMING_SIDE_PADDING }}
        style={[styles.upcomingViewport, { marginHorizontal: 0 }]}
        removeClippedSubviews={false}
        disableIntervalMomentum
        initialScrollIndex={Math.max(0, Math.floor(upcomingLooped.length / 2))}
        getItemLayout={(_, index) => ({ length: UPCOMING_ITEM_FULL, offset: UPCOMING_ITEM_FULL * index, index })}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: upcomingScrollX } } }],
          { useNativeDriver: true }
        )}
        onScrollEndDrag={undefined}
        onMomentumScrollEnd={(ev) => {
          const x = ev.nativeEvent.contentOffset.x
          const currentIndex = Math.round(x / UPCOMING_ITEM_FULL)
          const base = Math.max(1, upcomingItems.length)
          const nearStart = currentIndex <= base
          const nearEnd = currentIndex >= (upcomingLooped.length - base - 1)
          if (nearStart || nearEnd) {
            const normalized = ((currentIndex % base) + base) % base
            const middleBase = Math.floor(UPCOMING_LOOPS / 2) * base
            const targetIndex = middleBase + normalized
            upcomingListRef.current?.scrollToOffset({ offset: targetIndex * UPCOMING_ITEM_FULL, animated: false })
            return
          }
          const snapped = currentIndex * UPCOMING_ITEM_FULL
          if (Math.abs(snapped - x) > 0.5) {
            upcomingListRef.current?.scrollToOffset({ offset: snapped, animated: true })
          }
        }}
        renderItem={({ item, index }) => {
          const inputRange = [
            (index - 1) * UPCOMING_ITEM_FULL,
            index * UPCOMING_ITEM_FULL,
            (index + 1) * UPCOMING_ITEM_FULL,
          ]
          const scale = upcomingScrollX.interpolate({
            inputRange,
            outputRange: [0.9, 1.18, 0.9],
            extrapolate: 'clamp',
          })
          const opacity = upcomingScrollX.interpolate({
            inputRange,
            outputRange: [0.7, 1, 0.7],
            extrapolate: 'clamp',
          })
          const translateY = upcomingScrollX.interpolate({
            inputRange,
            outputRange: [8, 0, 8],
            extrapolate: 'clamp',
          })
          return (
            <View style={{ width: UPCOMING_ITEM_FULL, alignItems: 'center' }}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => handleEventPress(item)}>
                <Animated.View
                  style={{
                    width: UPCOMING_ITEM_WIDTH,
                    height: UPCOMING_ITEM_HEIGHT,
                    borderRadius: 20,
                    // Allow scale to extend without clipping
                    overflow: 'visible',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    transform: [{ scale }, { translateY }],
                    opacity,
                  }}
                >
                  {item.cover_image_url ? (
                    <ImageBackground
                      source={{ uri: item.cover_image_url }}
                      style={{ width: '100%', height: '100%' }}
                      imageStyle={styles.upcomingImageRadius}
                      resizeMode="cover"
                    >
                      <LinearGradient colors={["rgba(0,0,0,0)", "#000000"]} style={[styles.gradientFull, styles.upcomingImageRadius]} />
                      <View style={styles.upTextOverlay}>
                        <Text style={styles.upVenueLarge} numberOfLines={1}> - {item.venue_name} - </Text>
                        <Text style={styles.upTitleLarge} numberOfLines={1}>{item.title}</Text>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={[styles.upcomingImageRadius, { flex: 1, backgroundColor: '#222' }]} />
                  )}
                </Animated.View>
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </View>
  )

  const renderCarouselFancy = (titleLines: string[], items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <View>
          {titleLines.map((t, i) => (
            <Text key={`${t}-${i}`} style={styles.sectionTitle}>{t}</Text>
          ))}
        </View>
        <TouchableOpacity style={styles.viewAllRow}>
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={18} color="#E53A17" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            {item.cover_image_url && (
              <>
                <ImageBackground source={{ uri: item.cover_image_url }} style={styles.carouselImage} resizeMode="cover">
                  <LinearGradient
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                    style={styles.carouselGradient}
                  />
                  <View style={styles.carouselContentOverlay}>
                    <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                    <Text style={styles.carouselTime}>
                      {new Date(item.start_time).toLocaleDateString()} • {new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </ImageBackground>
                <TouchableOpacity
                  onPress={() => toggleInterest(item)}
                  style={styles.carouselHeartButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.carouselHeartText}>{interestStatuses[item.id] ? '♥︎' : '♡'}</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  const formatFeaturedDate = (iso: string) => {
    try {
      const d = new Date(iso)
      const month = d.toLocaleString(undefined, { month: 'short' })
      const day = d.getDate()
      const year = d.getFullYear()
      return `${month} ${day}, ${year}`
    } catch {
      return ''
    }
  }

  const renderFeaturedHero = (ev?: Event) => {
    if (!ev || !ev.cover_image_url) return null
    return (
      <View style={styles.featuredContainer}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => handleEventPress(ev)}>
          <ImageBackground
            source={{ uri: ev.cover_image_url }}
            style={styles.featuredImage}
            imageStyle={styles.featuredRadius}
            resizeMode="cover"
          >
            <LinearGradient colors={["rgba(0,0,0,0)", "#000000"]} style={[styles.gradientFull, styles.featuredRadius]} />
          </ImageBackground>
          <View style={styles.featuredOverlayBox}>
            <Text style={styles.featuredTitle} numberOfLines={1}> - {ev.title} - </Text>
            <View style={styles.featuredChip}>
              <Text style={styles.featuredChipText}>{formatFeaturedDate(ev.start_time)}</Text>
            </View>
            <Text style={styles.featuredSubtitle} numberOfLines={1}>{ev.venue_name || 'Venue to be announced'}</Text>
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  const renderNearbyList = (items: Event[]) => {
    const day = new Date().toLocaleDateString(undefined, { weekday: 'long' })
    const place = userCity || 'Your area'
    return (
      <View style={styles.nearbyContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Nearby Events</Text>
          <TouchableOpacity style={styles.viewAllRow}>
            <Text style={styles.viewAllText}>View all</Text>
            <Ionicons name="chevron-forward" size={18} color="#E53A17" />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionSubTitle}><Text style={{ fontWeight: '700' }}>{place}</Text> / {day}</Text>
        {items.map((ev) => (
          <TouchableOpacity key={ev.id} onPress={() => handleEventPress(ev)} activeOpacity={0.9}>
            {ev.cover_image_url ? (
              <View style={{ marginBottom: 18 }}>
                <ImageBackground source={{ uri: ev.cover_image_url }} style={styles.nearbyImage} imageStyle={styles.nearbyImageRadius}>
                  {/* Figma gradient from transparent to black at the bottom */}
                  <LinearGradient colors={["#00000000", "#000000D9"]} style={[styles.gradientFull, styles.nearbyImageRadius]} />

                  {/* Glass effect box overlay */}
                  <View style={styles.nearbyGlass}>
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 0, 0, 0.45)' }]} />
                    <Text style={styles.nearbyGlassTitle} numberOfLines={2}>{ev.title}</Text>
                    <View style={styles.nearbyGlassRow}>
                      <View style={styles.nearbyMetaItem}> 
                        <View ><Ionicons name="time-outline" size={13} color="#FFFFFF" /></View>
                        <Text style={styles.nearbyMetaTextLight}>{formatTimeRange(ev.start_time, ev.end_time)}</Text>
                      </View>
                      <View style={styles.nearbyMetaItem}> 
                        <View ><Ionicons name="map-outline" size={13} color="#FFFFFF" /></View>
                        <Text style={styles.nearbyMetaTextLight} numberOfLines={1}>{ev.venue_name || ev.address}</Text>
                      </View>
                    </View>
                  </View>
                </ImageBackground>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  const distanceKmForEvent = (ev: Event): number => {
    const prox = proximityData[ev.id]
    if (prox && typeof prox.distance_km === 'number') return prox.distance_km
    if (!userLocation || !ev.latitude || !ev.longitude) return Number.POSITIVE_INFINITY
    const toRad = (d: number) => (d * Math.PI) / 180
    const R = 6371
    const dLat = toRad(ev.latitude - userLocation.latitude)
    const dLon = toRad(ev.longitude - userLocation.longitude)
    const lat1 = toRad(userLocation.latitude)
    const lat2 = toRad(ev.latitude)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const interestedItems = useMemo(() => {
    const now = Date.now()
    return events.filter(e => !!interestStatuses[e.id] && new Date(e.end_time).getTime() >= now)
  }, [events, interestStatuses])

  const upcomingItems = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => new Date(e.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events])

  // Build looped data for infinite-like carousel after upcomingItems is defined
  const upcomingLooped = useMemo(() => {
    if (upcomingItems.length === 0) return [] as Event[]
    const loops = 7
    const arr: Event[] = []
    for (let i = 0; i < loops; i += 1) arr.push(...upcomingItems)
    return arr
  }, [upcomingItems])

  const happeningNowItems = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => new Date(e.start_time).getTime() <= now && new Date(e.end_time).getTime() >= now)
      .sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime())
  }, [events])

  const nearbyItems = useMemo(() => {
    if (!userLocation) return [] as Event[]
    const withDistance = events
      .filter(e => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
      .map(e => ({ e, d: distanceKmForEvent(e) }))
      .filter(x => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d)
      .map(x => x.e)
    return withDistance
  }, [events, userLocation, proximityData])

  const cityTopItems = useMemo(() => {
    if (!userCity) return [] as Event[]
    const lc = userCity.toLowerCase()
    const inCity = events.filter(e => {
      const city = ((e as any).city || '') as string
      const address = (e.address || '') as string
      return city.toLowerCase() === lc || address.toLowerCase().includes(lc)
    })
    return inCity
      .slice()
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, userCity, interestCounts])

  const bestPartiesItems = useMemo(() => {
    const isPartyLike = (cat?: string) => {
      if (!cat) return false
      const c = cat.toLowerCase()
      return c.includes('party') || c.includes('night') || c.includes('club') || c.includes('music')
    }
    const partyEvents = events.filter(e => isPartyLike(e.category))
    if (partyEvents.length > 0) {
      return partyEvents
        .slice()
        .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    }
    // Fallback: overall top by interest
    return events
      .slice()
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, interestCounts])

  const formatTimeRange = (startIso: string, endIso: string) => {
    try {
      const s = new Date(startIso)
      const e = new Date(endIso)
      const fmt = (d: Date) => {
        let hours = d.getHours()
        const suffix = hours >= 12 ? 'pm' : 'am'
        hours = hours % 12
        if (hours === 0) hours = 12
        return `${hours}${suffix}`
      }
      const month = e.toLocaleString(undefined, { month: 'long' })
      const dayNum = e.getDate()
      return `${fmt(s)} - ${fmt(e)}, ${month} ${dayNum}`
    } catch {
      return ''
    }
  }

  const mainListData = useMemo(() => {
    // Build a set of IDs we have already shown in carousels (limit to first 10 of each)
    const shown = new Set<string>()
    interestedItems.forEach(e => shown.add(e.id))
    happeningNowItems.slice(0, 10).forEach(e => shown.add(e.id))
    upcomingItems.slice(0, 10).forEach(e => shown.add(e.id))
    nearbyItems.slice(0, 10).forEach(e => shown.add(e.id))
    cityTopItems.slice(0, 10).forEach(e => shown.add(e.id))
    bestPartiesItems.slice(0, 10).forEach(e => shown.add(e.id))
    return events.filter(e => !shown.has(e.id))
  }, [events, interestedItems, happeningNowItems, upcomingItems, nearbyItems, cityTopItems, bestPartiesItems])

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </SafeAreaView>
    )
  }

  const stickyBarHeight = insets.top + 8 + 12 + 36
  const sectionBgTop = stickyBarHeight + 12

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Background image tint to match Figma */}
      {/* Image moved to global background in RootLayout */}
      {/* Sticky top bar */}
      <View style={[styles.topBarSticky, { paddingTop: insets.top + 8 }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.defaultAvatar]}>
            <Ionicons name="person" size={24} color="#666" />
          </View>
        )}
        <Text style={styles.topBarTitle}>Blend’n</Text>
        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}> 
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <FlatList
          data={mainListData}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 320)}
          scrollEventThrottle={16}
          ListHeaderComponent={(
            <View>
              {/* Interested empty or carousel */}
              {interestedItems.length === 0 ? (
                <View style={styles.interestedEmptyRow}>
                  <View style={styles.interestedThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.interestedTitle}>Interested Events</Text>
                    <Text style={styles.interestedSub}>Events you&apos;ve liked or shown interest in will appear here.</Text>
                  </View>
                </View>
              ) : (
                renderInterestedCarousel(interestedItems.slice(0, 10))
              )}

              {/* Upcoming (Figma) */}
              {upcomingItems.length > 0 && renderUpcomingFigmaCarousel()}

              {/* Nearby */}
              {userLocation && nearbyItems.length > 0 && renderNearbyList(nearbyItems.slice(0, 4))}

              {/* City top - fancy header */}
              {userCity && cityTopItems.length > 0 && renderCarouselFancy([`${userCity}’s`, 'Top Events'], cityTopItems.slice(0, 10))}

              {/* Best parties - fancy header */}
              {bestPartiesItems.length > 0 && renderCarouselFancy(['Discover the', 'Best Parties'], bestPartiesItems.slice(0, 10))}

              {/* Featured hero */}
              {renderFeaturedHero(bestPartiesItems[0] || cityTopItems[0] || upcomingItems[0])}
              <View style={{ height: 8 }} />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    
  },
  sectionBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 120,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(190, 190, 190, 0.12)',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.58,
  },
  bgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  listContainer: {
    paddingHorizontal: 1,
    paddingTop: 18,
    paddingBottom: 16,
    
   
   
  },
  carouselContainer: {
    paddingTop: 12,
  },
  sectionHeaderRow: {
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionFancyRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionDividerLine: {
    height: 1,
    width: 73,
    backgroundColor: '#D9D9D9',
    borderRadius: 11,
  },
  sectionSubTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewAllText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  carouselList: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  upcomingList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 14,
  },
  upcomingImageRadius: {
    borderRadius: 20,
  },
  upcomingViewport: {
    // Extra vertical space to avoid top/bottom clipping when scaled
    paddingVertical: 28,
    height: 320,
  },
  upcomingCardSmall: {
    width: 139,
    height: 226,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  upcomingCardLarge: {
    width: 163,
    height: 264,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  upcomingImageSmall: {
    width: 139,
    height: 226,
  },
  upcomingImageLarge: {
    width: 163,
    height: 264,
  },
  gradientFull: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  upTextOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
  },
  upVenueSmall: {
    color: '#FFFFFF',
    fontSize: 9,
    textAlign: 'left',
    marginBottom: 2,
  },
  upTitleSmall: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  upVenueLarge: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'left',
    marginBottom: 4,
  },
  upTitleLarge: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  carouselCard: {
    width: 260,
    borderRadius: 12,
    backgroundColor: '#111111',
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
  carouselGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  carouselHeartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  carouselHeartText: {
    fontSize: 16,
    color: '#D81B60',
    fontWeight: '800',
  },
  carouselContent: {
    padding: 12,
  },
  carouselContentOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  carouselEventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  carouselVenue: {
    fontSize: 13,
    color: '#CCCCCC',
    marginTop: 2,
  },
  carouselTime: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 6,
  },
  eventCard: {
    backgroundColor: '#111111',
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
    color: '#FFFFFF',
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#AAAAAA',
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
    color: '#CCCCCC',
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
  interestButton: {
    backgroundColor: '#fde7ef',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  interestButtonActive: {
    backgroundColor: '#f8cfe0',
  },
  interestButtonText: {
    color: '#D81B60',
    fontSize: 14,
    fontWeight: '600',
  },
  nearbyContainer: {
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  nearbyImage: {
    width: '100%',
    height: 249,
  },
  nearbyImageRadius: {
    borderRadius: 23,
  },
  nearbyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 23,
    borderBottomRightRadius: 23,
  },
  nearbyInfoBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  nearbyGlass: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 161,
    bottom: 7,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(190, 190, 190, 0.32)',
  },
  nearbyGlassTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  nearbyGlassRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nearbyMetaTextLight: {
    color: '#FFFFFF',
    fontSize: 12,
  },
 
  nearbyTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  nearbyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearbyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '48%',
  },
  nearbyMetaText: {
    color: '#878787',
    fontSize: 11,
  },
  featuredContainer: {
    paddingHorizontal: 23,
    paddingTop: 8,
  },
  featuredImage: {
    width: '100%',
    height: 474,
  },
  featuredRadius: {
    borderRadius: 20,
  },
  featuredOverlayBox: {
    position: 'absolute',
    bottom: 16 + 110, // approximate to align like figma overlay box area height
    left: 45,
    right: 45,
    alignItems: 'center',
    gap: 12,
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
  featuredChip: {
    backgroundColor: 'rgba(255,56,60,0.5)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  featuredChipText: {
    color: '#FFFFFF',
    fontSize: 17,
  },
  featuredSubtitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  topBar: {
    paddingHorizontal: 14,
   
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
    paddingHorizontal: 14,
    
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  defaultAvatar: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 12,
  },
  settingsButton: {
    marginLeft: 'auto',
  },
  interestedEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  interestedThumb: {
    width: 78,
    height: 78,
    borderRadius: 12,
    backgroundColor: '#D9D9D9',
  },
  interestedTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  interestedSub: {
    fontSize: 11,
    color: '#FFFFFF',
    opacity: 0.9,
  },
}) 