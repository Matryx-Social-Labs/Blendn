import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  ImageBackground,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import EventCard from '../../components/EventCard'
import NearbyEventCard from '../../components/NearbyEventCard'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import { getEvents as fetchEventsApi } from '../../lib/api'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { formatTimeRange as fmtRange, formatEventDateTime } from '../../lib/time'
import { useAuth } from '../../lib/useAuth'
const figmaBg = require('../../assets/figma/400518654fbb40fcec84ab09d6cd2eafa457d336.png')

// Helper to calculate distance between two coordinates in km
const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

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
  const listRef = useRef<any>(null)
  const [netError, setNetError] = useState<string | null>(null)
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false)

  // Memoized style objects to prevent re-creation
  const sectionBgStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 120,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(190, 190, 190, 0.12)'
  }), [])

  const topBarStyle = useMemo(() => ({
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
    paddingHorizontal: 14,
    paddingTop: insets.top + 8,
    paddingBottom: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const
  }), [insets.top])

  // Memoized callbacks to prevent re-creation
  const handleEventPress = useCallback((event: Event) => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } as any })
  }, [])

  const handleCheckIn = useCallback(async (event: Event) => {
    try {
      Logger.journey('checkin', 'start', { eventId: event.id })
      if (!user) {
        Logger.journey('auth', 'blocked:notSignedIn')
        Alert.alert('Sign in required', 'Please sign in to check in to events')
        return
      }
      if (!userLocation) {
        Alert.alert(
          'Location required',
          'Enable location to verify proximity and check in.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { try { (Linking as any)?.openSettings?.() } catch {} } }
          ]
        )
        return
      }
      
      // Call standardized production check-in RPC
      Logger.journey('checkin', 'api:checkIn:call', { eventId: event.id })
      const result = await apiClient.checkIn(event.id, {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        deviceInfo: { gpsAccuracy: 50 },
      })

      if (!result.success) {
        Logger.error('events', 'Check-in error', { error: result.error })
        Alert.alert('Check-in Failed', result.error || 'Unknown error')
        return
      }

      Logger.journey('checkin', 'success', { eventId: event.id })
      // Get event chat and offer navigation
      const chatResult = await apiClient.getEventChat(event.id)
      if (chatResult.success && chatResult.data?.id) {
        Alert.alert(
          'Success!',
          'You have been checked in and added to the event chat.',
          [
            { text: 'Go to Chat', onPress: () => router.push({ pathname: '/chat/[id]', params: { id: chatResult.data.id, roomName: chatResult.data.name || 'Event Chat', eventTitle: event.title } as any }) },
            { text: 'OK', style: 'default' }
          ]
        )
      } else {
        Alert.alert('Success!', 'You have been checked in!')
      }

      // Refresh the checkin status for this event
      loadCheckinStatusesBatch()
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      Alert.alert('Error', 'Failed to check in')
    }
  }, [user, userLocation])

  const toggleInterest = useCallback(async (event: Event) => {
    try {
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to save events')
        return
      }
      const prevInterested = !!interestStatuses[event.id]
      // Optimistic update
      setInterestStatuses(prev => ({ ...prev, [event.id]: !prevInterested }))

      const result = await apiClient.toggleInterest(event.id)
      if (!result.success || !result.data) {
        // rollback
        setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
        Alert.alert('Error', 'Failed to update interest')
        return
      }
      setInterestStatuses(prev => ({ ...prev, [event.id]: result.data!.interested }))
      Logger.journey('events', result.data!.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
    } catch (e) {
      Alert.alert('Error', 'Failed to update interest')
    }
  }, [user, interestStatuses])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchEvents()
    setRefreshing(false)
  }, [])

  const onScroll = useCallback((e: any) => {
    setScrollProgress(e.nativeEvent.contentOffset.y, 320)
  }, [setScrollProgress])

  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id })
      fetchEvents()
      getCurrentLocationQuietly()
      loadCheckedInEvents()
      fetchUserCity()
      // Load user avatar from profile
      ;(async () => {
        try {
          const result = await apiClient.getProfile(user.id)
          if (result.success && result.data?.profile) {
            const profile = result.data.profile
            const primary = (Array.isArray(profile.profile_photos) && profile.profile_photos[0]) ||
                           (Array.isArray(profile.photos) && profile.photos[0]) ||
                           result.data.image || null
            if (primary) {
              setAvatarUrl(primary)
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

  // TODO: Real-time subscriptions will use Socket.io instead of Supabase
  // For now, we rely on manual refresh and polling

  const loadCheckedInEvents = async () => {
    if (!user) return
    try {
      Logger.journey('checkin', 'loadActiveCheckins:start', { userId: user.id })
      // TODO: Add API endpoint to get user's active check-ins
      // For now, just set empty array
      setCheckedInEvents([])
      Logger.journey('checkin', 'loadActiveCheckins:done')
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
        {checkedInEvents.filter((item, idx) => !!item.cover_image_url && idx < 10).map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            <ImageBackground source={{ uri: item.cover_image_url as string }} style={styles.carouselImage} resizeMode="cover">
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                style={styles.carouselGradient}
              />
              <View style={styles.carouselContentOverlay}>
                <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                <Text style={styles.carouselTime}>
                  {formatEventDateTime(item.start_time)}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const result = await apiClient.checkOut(String(item.id))
                      if (result.success) {
                        Alert.alert('Checked Out', 'You have been checked out of this event.')
                        loadCheckedInEvents()
                        loadCheckinStatusesBatch()
                      } else {
                        Alert.alert('Checkout Failed', result.error || 'Please try again.')
                      }
                    } catch (e) {
                      Alert.alert('Checkout Failed', 'Please try again.')
                    }
                  }}
                  style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>Check out</Text>
                </TouchableOpacity>
              </View>
            </ImageBackground>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  const renderInterestedCarousel = (items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Interested Events</Text>
        <TouchableOpacity style={styles.viewAllRow} onPress={() => router.push('/interested' as any)}>
          <Text style={styles.viewAllText}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.filter((item, idx) => !!item.cover_image_url && idx < 10).map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            <ImageBackground source={{ uri: item.cover_image_url as string }} style={styles.carouselImage} resizeMode="cover">
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                style={styles.carouselGradient}
              />
              <View style={styles.carouselContentOverlay}>
                <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                <Text style={styles.carouselTime}>
                  {formatEventDateTime(item.start_time)}
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
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  const renderInterestedEmpty = () => (
    <View style={styles.interestedEmptyRow}>
      <View style={styles.interestedThumb} />
      <View style={{ flex: 1 }}>
        <Text style={styles.interestedTitle}>Interested Events</Text>
        <Text style={styles.interestedSub}>Events you&apos;ve liked or shown interest in will appear here.</Text>
      </View>
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
      // TODO: Add API endpoint to get check-in statuses for multiple events
      // For now, just set all as not checked in
      const statusMap: { [eventId: string]: any } = {}
      events.forEach((ev) => {
        statusMap[ev.id] = { status: 'not_checked_in' }
      })
      setCheckinStatuses(statusMap)
      Logger.journey('checkin', 'statusBatch:done', { count: events.length })
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
        setUserLocation(null)
        setLocationPermissionDenied(true)
        Logger.warn('events', 'permission:notGranted', {})
        Alert.alert(
          'Turn on Location',
          'We need your location to show nearby events and enable check-in.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { try { (Linking as any)?.openSettings?.() } catch {} } }
          ]
        )
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setUserLocation(coords)
      setLocationPermissionDenied(false)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      setUserLocation(null)
      setLocationPermissionDenied(false)
      Logger.warn('events', 'quietLocation:error', { error: error as any })
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation || !user) return

    try {
      Logger.journey('proximity', 'checkAll:start', { lat: userLocation.latitude, lon: userLocation.longitude })
      
      // Use the actual function that exists: check_user_proximity_status
      // TODO: Add API endpoint for proximity check
      // For now, calculate distance client-side
      const proximityResults = events.map(event => {
        if (!event.latitude || !event.longitude) return null
        const distance = getDistanceKm(userLocation.latitude, userLocation.longitude, event.latitude, event.longitude)
        const checkInRadius = event.check_in_radius || 0.5 // default 500m
        return {
          event_id: event.id,
          within_radius: distance <= checkInRadius,
          distance_km: distance,
          can_check_in: distance <= checkInRadius
        }
      }).filter(Boolean)

      const proximityData = { nearby_events: proximityResults }
      const error = null

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
      const result = await apiClient.getProfile(user.id)
      if (result.success && result.data?.profile?.location) {
        const firstPart = String(result.data.profile.location).split(',')[0]?.trim()
        if (firstPart) setUserCity(firstPart)
      }
    } catch {}
  }

  // Removed city override feature

  const fetchEvents = async () => {
    try {
      setLoading(true)
      setNetError(null)
      Logger.journey('events', 'fetch:start')

      // Use the API helper which handles Supabase vs admin backend switching
      const { data: eventsData, error } = await fetchEventsApi({
        page: 0,
        limit: PAGE_SIZE,
        lat: userLocation?.latitude,
        lon: userLocation?.longitude,
      })

      if (error) {
        Logger.error('events', 'Error fetching events', { error })
        setNetError('Failed to load events')
        return
      }

      setEvents(eventsData || [])
      setPage(0)
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      setNetError('Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  // Basic pagination: fetch next page after current items
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  const fetchMore = useCallback(async () => {
    try {
      if (loading) return
      Logger.journey('events', 'fetchMore:start', { page: page + 1 })
      const { data, error } = await fetchEventsApi({
        page: page + 1,
        limit: PAGE_SIZE,
        lat: userLocation?.latitude,
        lon: userLocation?.longitude,
      })
      if (error) return
      if (!data || data.length === 0) return
      setEvents(prev => [...prev, ...data])
      setPage(prev => prev + 1)
    } catch {}
  }, [loading, page, userLocation])

  const loadInterestData = async () => {
    try {
      if (!user || events.length === 0) return
      // TODO: Add batch API endpoint to get user's interested events
      // For now, interest statuses are tracked locally via toggleInterest
      // and will be properly loaded when the API is available
      Logger.info('events', 'loadInterestData: batch interest loading not yet implemented in API')
    } catch (e) {
      Logger.warn('events', 'loadInterestData failed', { error: e })
      setInterestStatuses({})
    }
  }

  const loadInterestCounts = async () => {
    try {
      if (events.length === 0) return
      // TODO: Add batch API endpoint to get interest counts for events
      // For now, interest counts will be empty until API is available
      Logger.info('events', 'loadInterestCounts: batch count loading not yet implemented in API')
    } catch (e) {
      setInterestCounts({})
    }
  }

  

  // Memoized render function for event items
  const renderEventItem = useCallback(({ item: event }: { item: Event }) => {
    const checkinStatus = checkinStatuses[event.id]
    const proximity = proximityData[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = proximity?.within_radius && !isCheckedIn
    const interested = !!interestStatuses[event.id]
    const isEnded = new Date(event.end_time).getTime() < Date.now()

    return (
      <EventCard
        event={event}
        isCheckedIn={isCheckedIn}
        canCheckIn={canCheckIn}
        interested={interested}
        isEnded={isEnded}
        proximity={proximity}
        interestCount={interestCounts[event.id]}
        onPress={handleEventPress}
        onCheckIn={handleCheckIn}
        onToggleInterest={toggleInterest}
      />
    )
  }, [checkinStatuses, proximityData, interestStatuses, handleEventPress, handleCheckIn, toggleInterest])

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: Event) => item.id, [])

  const renderCarouselWithTitle = (title: string, items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.filter((item, idx) => !!item.cover_image_url && idx < 10).map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            <ImageBackground source={{ uri: item.cover_image_url as string }} style={styles.carouselImage} resizeMode="cover">
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                style={styles.carouselGradient}
              />
              <View style={styles.carouselContentOverlay}>
                <Text style={styles.carouselEventTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.carouselVenue} numberOfLines={1}>{item.venue_name}</Text>
                <Text style={styles.carouselTime}>
                  {formatEventDateTime(item.start_time)}
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
      <View style={styles.sectionFancyRow}>
        <View style={styles.sectionDividerLine} />
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        <View style={styles.sectionDividerLine} />
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
                      <LinearGradient
                        colors={["rgba(0,0,0,0)", "#000000"]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.gradientFull, styles.upcomingImageRadius]}
                      />
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
      {/* Pagination indicator to match Figma */}
      <View style={styles.carouselIndicatorRow}>
        <View style={styles.carouselIndicatorLong} />
        <View style={styles.carouselIndicatorDot} />
        <View style={styles.carouselIndicatorDot} />
      </View>
    </View>
  )

  const renderCarouselFancy = (titleLines: string[], items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionFancyRow}>
        <View style={styles.sectionDividerLine} />
        <View>
          {titleLines.map((t, i) => (
            <Text key={`${t}-${i}`} style={styles.sectionTitle}>{t}</Text>
          ))}
        </View>
        <View style={styles.sectionDividerLine} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
        {items.filter(item => !!item.cover_image_url).map((item) => (
          <TouchableOpacity key={item.id} style={styles.carouselCard} onPress={() => handleEventPress(item)}>
            <ImageBackground source={{ uri: item.cover_image_url as string }} style={styles.carouselImage} resizeMode="cover">
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
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Pagination indicator to match Figma */}
      <View style={styles.carouselIndicatorRow}>
        <View style={styles.carouselIndicatorLong} />
        <View style={styles.carouselIndicatorDot} />
        <View style={styles.carouselIndicatorDot} />
      </View>
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
          <TouchableOpacity style={styles.viewAllRow} onPress={() => router.push('/events' as any)}>
            <Text style={styles.viewAllText}>View all</Text>
            <Ionicons name="chevron-forward" size={19} color="#E53A17" />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionSubTitle}><Text style={{ fontWeight: '700' }}>{place}</Text> / {day}</Text>
        <View style={{ paddingHorizontal: 0 }}>
        {items.map((ev) => {
          const screenW = Dimensions.get('window').width
          const containerPadding = 14 * 2 // styles.nearbyContainer paddingHorizontal
          const innerW = Math.max(0, screenW - containerPadding)
          const containerWidth = Math.min(420, Math.round(innerW * 0.96))
          return (
            <NearbyEventCard
              key={ev.id}
              event={ev as any}
              width={containerWidth}
              onPress={handleEventPress as any}
              timeLabel={formatTimeRange(ev.start_time, ev.end_time)}
              locationLabel={ev.venue_name || ev.address || ''}
            />
          )
        })}
        </View>
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
    const loops = UPCOMING_LOOPS
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

  const formatTimeRange = (startIso: string, endIso: string) => fmtRange(startIso, endIso, { includeDate: true })

  const filteredSortedEvents = useMemo(() => events, [events])

  const mainListData = useMemo(() => {
    const shown = new Set<string>()
    interestedItems.forEach(e => shown.add(e.id))
    happeningNowItems.slice(0, 10).forEach(e => shown.add(e.id))
    upcomingItems.slice(0, 10).forEach(e => shown.add(e.id))
    nearbyItems.slice(0, 10).forEach(e => shown.add(e.id))
    cityTopItems.slice(0, 10).forEach(e => shown.add(e.id))
    bestPartiesItems.slice(0, 10).forEach(e => shown.add(e.id))
    const remaining = filteredSortedEvents.filter(e => !shown.has(e.id))
    return remaining
  }, [filteredSortedEvents, interestedItems, happeningNowItems, upcomingItems, nearbyItems, cityTopItems, bestPartiesItems])

  const isLoading = authLoading || loading

  const stickyBarHeight = insets.top + 8 + 12 + 36
  const sectionBgTop = stickyBarHeight + 12

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Background image tint to match Figma */}
      {/* Image moved to global background in RootLayout */}
      {/* Sticky top bar */}
      <View style={[styles.topBarSticky, { paddingTop: insets.top + 8 }]} accessibilityRole="header">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="View profile" onPress={() => router.push('/profile' as any)}>
          {avatarUrl ? (
            <OptimizedImage source={avatarUrl} style={styles.avatar} width={72} height={72} quality={60} />
          ) : (
            <View style={[styles.avatar, styles.defaultAvatar]}>
              <Ionicons name="person" size={24} color="#666" />
            </View>
          )}
        </TouchableOpacity>
       
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.settingsButton} accessibilityLabel="Open settings" accessibilityRole="button" onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}> 
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Banners */}
        <View style={styles.filtersBar}>
          {locationPermissionDenied && (
            <View style={styles.bannerWarn}>
              <Text style={styles.bannerText}>
                Enable Location to show nearby events and check-in. 
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open settings to enable location"
                onPress={() => { try { (Linking as any)?.openSettings?.() } catch {} }}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Enable</Text>
              </TouchableOpacity>
            </View>
          )}
          {!!netError && (
            <View style={styles.bannerError}>
              <Text style={styles.bannerText}>{netError}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry loading events"
                onPress={fetchEvents}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <VirtualizedList
          forwardedRef={listRef as any}
          data={isLoading ? [] : mainListData}
          renderItem={renderEventItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={200}
          onEndReachedThreshold={0.5}
          onEndReached={fetchMore}
          refreshControl={
            <RefreshControl refreshing={refreshing && !isLoading} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          enableVirtualization={!isLoading && mainListData.length > 20}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={10}
          ListHeaderComponent={(
            isLoading ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={160} />
                  <SkeletonLine width={80} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselList}>
                  {[...Array(5)].map((_, i) => (
                    <SkeletonBlock key={`s-int-${i}`} width={260} height={120} borderRadius={12} style={{ marginHorizontal: 4 }} />
                  ))}
                </ScrollView>
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={200} />
                </View>
                <Animated.View style={[styles.upcomingViewport, { paddingVertical: 16, height: 300 }]}> 
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                    {[...Array(7)].map((_, i) => (
                      <SkeletonBlock key={`s-up-${i}`} width={163} height={264} borderRadius={20} style={{ marginRight: 14 }} />
                    ))}
                  </ScrollView>
                </Animated.View>
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={180} />
                </View>
                {[...Array(4)].map((_, i) => (
                  <SkeletonBlock key={`s-near-${i}`} width={'96%'} height={249} borderRadius={23} style={{ alignSelf: 'center', marginBottom: 16 }} />
                ))}
                <View style={{ paddingHorizontal: 23, paddingTop: 8 }}>
                  <SkeletonBlock width={'100%'} height={474} borderRadius={20} />
                </View>
                {[...Array(6)].map((_, i) => (
                  <View key={`s-card-${i}`} style={{ paddingHorizontal: 8, marginTop: 16 }}>
                    <SkeletonBlock width={'100%'} height={200} borderRadius={12} />
                    <View style={{ marginTop: 10, paddingHorizontal: 6 }}>
                      <SkeletonLine width={'60%'} />
                      <SkeletonLine width={'40%'} style={{ marginTop: 6 }} />
                    </View>
                  </View>
                ))}
                <View style={{ height: 8 }} />
              </View>
            ) : (
              <View>
                {/* Friendly empty state when there are no events at all */}
                {events.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No events found</Text>
                    <Text style={styles.emptySub}>We'll show nearby events automatically.</Text>
                  </View>
                )}
                {interestedItems.length > 0 ? renderInterestedCarousel(interestedItems.slice(0, 10)) : renderInterestedEmpty()}

                {upcomingItems.length > 0 && renderUpcomingFigmaCarousel()}

                {userLocation && nearbyItems.length > 0 && renderNearbyList(nearbyItems.slice(0, 4))}

                {userCity && cityTopItems.length > 0 && renderCarouselFancy([`${userCity}’s`, 'Top Events'], cityTopItems.slice(0, 10))}

                {/* Discover the Best Parties header without carousel */}
                {bestPartiesItems.length > 0 && (
                  <View style={styles.carouselContainer}>
                    <View style={styles.sectionFancyRow}>
                      <View style={styles.sectionDividerLine} />
                      <View>
                        <Text style={styles.sectionTitle}>Discover the</Text>
                        <Text style={styles.sectionTitle}>Best Parties</Text>
                      </View>
                      <View style={styles.sectionDividerLine} />
                    </View>
                  </View>
                )}

                {renderFeaturedHero(bestPartiesItems[0] || cityTopItems[0] || upcomingItems[0])}
                <View style={{ height: 8 }} />
              </View>
            )
          )}
        />
      </View>

      {/* City override UI removed */}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    
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
    backgroundColor: '#000000',
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
  carouselIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
  },
  carouselIndicatorLong: {
    width: 60,
    height: 6,
    borderRadius: 11,
    backgroundColor: '#D9D9D9',
    opacity: 1,
  },
  carouselIndicatorDot: {
    width: 7,
    height: 6,
    borderRadius: 9,
    backgroundColor: '#D9D9D9',
    opacity: 1,
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
    backgroundColor: '#FFFFFF',
    opacity: 0.22,
    borderRadius: 11,
    transform: [{ rotate: '180deg' }],
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
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
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
    textAlign: 'center',
    marginBottom: 4,
  },
  upTitleLarge: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
    width: '96%',
    aspectRatio: 363 / 249,
    maxWidth: 420,
    alignSelf: 'center',
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
    left: 5,
    right: 6,
    top: 161,
    bottom: 7,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  nearbyGlassSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.45,
  },
  // removed nearbyGlassInsetTop
  nearbyGlassRim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  nearbyGlassInnerShadowBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    opacity: 0.4,
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
    aspectRatio: 363 / 474,
    maxHeight: 474,
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
    backgroundColor: '#000000',
    
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  filtersBar: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
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
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
  },
  bannerText: {
    color: '#333',
    fontSize: 13,
    flex: 1,
    marginRight: 10,
  },
  bannerCta: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  bannerCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    color: '#E6E6E6',
    fontSize: 13,
  },
  ctaGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaGhostText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cityPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  cityPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
}) 