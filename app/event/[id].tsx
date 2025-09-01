import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logger } from '../../lib/logger';
import { NotificationHelpers } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/photoUtils';
import { EventChat, EventCheckout, EventInterest, supabase } from '../../lib/supabase';
const placeholderImg = require('../../assets/images/icon.png');
const figmaBg = require('../../assets/figma/400518654fbb40fcec84ab09d6cd2eafa457d336.png')
const gallery1 = require('../../assets/figma/92e5bab9fd27a0db4c6751d74287d75d6762ca1c.png')
const gallery2 = require('../../assets/figma/ebafaf4d1b09fd56fd54accaa108ad43fce6a4d9.png')
const gallery3 = require('../../assets/figma/aa4e9965e198c5e54ec642329ac04399f008edfb.png')
const gallery4 = require('../../assets/figma/d89da9b93a9694cd7590f5907e2a93715a5950ab.png')

interface EventDetail {
  id: string
  title: string
  description: string
  short_description: string
  city: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  category: string
  price_cents: number
  max_capacity: number
  current_capacity: number
  cover_image_url: string
  organizer: string
  latitude: number
  longitude: number
  check_in_radius: number
  // Optional media fields for gallery support
  gallery?: string[]
  gallery_photos?: string[]
  pre_event_gallery?: string[]
  images?: string[]
}

interface CheckInStatus {
  success: boolean
  checked_in: boolean
  check_in_id?: string
  checked_in_at?: string
  distance_meters?: number
  event_title?: string
  venue_name?: string
  event_latitude?: number
  event_longitude?: number
  check_in_radius?: number
  error?: string
  code?: string
}

const { width } = Dimensions.get('window')
const CONTENT_HORIZONTAL_PADDING = 14
const GALLERY_GAP = 12
const galleryTileSize = Math.floor((width - (CONTENT_HORIZONTAL_PADDING * 2) - GALLERY_GAP) / 2)
const GALLERY_FULL_WIDTH = Math.round(width - (CONTENT_HORIZONTAL_PADDING * 2))
const GALLERY_TALL_HEIGHT = (galleryTileSize * 2) + GALLERY_GAP

export default function EventDetail() {
  const { id } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityStatus, setProximityStatus] = useState<any>(null)
  const [interestCount, setInterestCount] = useState<number>(0)
  const [userInterested, setUserInterested] = useState<boolean>(false)
  const [interestedAvatars, setInterestedAvatars] = useState<string[]>([])

  useEffect(() => {
    if (id && String(id).trim()) {
      Logger.journey('events', 'detail:mount', { eventId: String(id) })
      fetchEventDetails()
      checkUserCheckInStatus()
      loadInterestInfo()
      loadInterestedAvatars()
    } else {
      // No valid ID provided, show error immediately
      setLoading(false)
      Logger.error('events', 'detail:noValidId', { id })
    }
  }, [id])

  useEffect(() => {
    // Check proximity when user location changes
    if (userLocation && event) {
      checkProximityStatus()
    }
  }, [userLocation, event])

  // Realtime: update when this user's check-in rows change (for this event)
  useEffect(() => {
    let channel: any
    const subscribe = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !id) return
      channel = supabase
        .channel(`event_checkins_detail_${user.id}_${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_checkins', filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            if (payload.new?.event_id === id || payload.old?.event_id === id) {
              checkUserCheckInStatus()
            }
          }
        )
        .subscribe()
    }
    subscribe()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [id])

  // Realtime: update interest count and status for this event
  useEffect(() => {
    let channel: any
    const subscribe = async () => {
      if (!id) return
      const { data: { user } } = await supabase.auth.getUser()
      channel = supabase
        .channel(`event_interests_detail_${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_interests', filter: `event_id=eq.${id}` },
          (payload: any) => {
            if (payload.eventType === 'INSERT') setInterestCount(prev => prev + 1)
            if (payload.eventType === 'DELETE') setInterestCount(prev => Math.max(0, prev - 1))
            const changedUserId = payload?.new?.user_id || payload?.old?.user_id
            if (user && changedUserId === user.id) {
              setUserInterested(payload.eventType === 'INSERT')
            }
            // Refresh avatars on any interest change
            loadInterestedAvatars()
          }
        )
        .subscribe()
    }
    subscribe()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [id])

  const checkProximityStatus = async () => {
    if (!userLocation || !event) return
    
    try {
      Logger.journey('proximity', 'detail:check:start', { eventId: event.id, lat: userLocation.latitude, lon: userLocation.longitude })
      const { data: userRes } = await supabase.auth.getUser()
      const currentUserId = userRes?.user?.id
      if (!currentUserId) return

      const { data, error } = await supabase
        .rpc('check_user_proximity_status', {
          p_user_id: currentUserId,
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (error) {
        Logger.error('events', 'detail:check:error', { error })
      } else {
        // Normalize to an object to avoid TS complaints
        setProximityStatus(data || {})
        Logger.journey('proximity', 'detail:check:success', { nearbyCount: data?.nearby_events?.length || 0 })
      }
    } catch (error) {
      Logger.error('events', 'detail:check:exception', { error: error as any })
    }
  }

  const fetchEventDetails = async () => {
    try {
      Logger.journey('events', 'detail:fetch:start', { eventId: String(id) })
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        Logger.error('events', 'detail:fetch:error', { error })
        Alert.alert('Error', 'Failed to load event details')
      } else {
        setEvent(data)
        Logger.journey('events', 'detail:fetch:success', { eventId: data?.id })
      }
    } catch (error) {
      Logger.error('events', 'detail:fetch:exception', { error: error as any })
    } finally {
      setLoading(false)
    }
  }

  const loadInterestInfo = async () => {
    try {
      if (!id) return
      const [count, interested] = await Promise.all([
        EventInterest.getSingleEventInterestCount(String(id)),
        EventInterest.isInterested(String(id)),
      ])
      setInterestCount(count)
      setUserInterested(interested)
    } catch {}
  }

  // Load a small set of interested user avatars for display
  const loadInterestedAvatars = async () => {
    try {
      if (!id) return
      // Fetch a handful of interested user IDs
      const { data: interestRows, error: interestErr } = await supabase
        .from('event_interests')
        .select('user_id')
        .eq('event_id', id)
        .limit(6)

      if (interestErr) {
        return
      }

      const userIds: string[] = Array.from(new Set((interestRows || []).map((r: any) => r?.user_id).filter(Boolean)))
      if (!userIds || userIds.length === 0) {
        setInterestedAvatars([])
        return
      }

      // Fetch profiles for those users to get their primary photo
      const { data: profiles, error: profErr } = await supabase
        .from('user_profiles')
        .select('user_id, profile_photos, photos')
        .in('user_id', userIds)

      if (profErr) {
        return
      }

      const primaryByUser: Record<string, string | null> = {}
      ;(profiles || []).forEach((p: any) => {
        const primary = (Array.isArray(p?.profile_photos) && p.profile_photos[0])
          || (Array.isArray(p?.photos) && p.photos[0])
          || null
        if (primary) {
          const optimized = getOptimizedImageUrl(primary, { width: 80, height: 80, resize: 'cover', quality: 60, format: 'webp' })
          primaryByUser[p.user_id] = optimized || primary
        } else {
          primaryByUser[p.user_id] = null
        }
      })

      // Preserve the order from interestRows
      const ordered = userIds.map(uid => primaryByUser[uid]).filter(Boolean) as string[]
      setInterestedAvatars(ordered)
    } catch {}
  }

  const checkUserCheckInStatus = async () => {
    try {
      Logger.journey('checkin', 'detail:status:start', { eventId: String(id) })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('event_checkins')
        .select('id')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .is('checked_out_at', null)
        .limit(1)

      if (error) {
        Logger.error('events', 'detail:status:error', { error })
        return
      }

      const checkedIn = Array.isArray(data) && data.length > 0
      setCheckInStatus({ success: true, checked_in: checkedIn })
      Logger.journey('checkin', 'detail:status:success', { checkedIn })
    } catch (error) {
      Logger.error('events', 'detail:status:exception', { error: error as any })
    }
  }

  // Refresh check-in status on focus
  useFocusEffect(
    useCallback(() => {
      checkUserCheckInStatus()
    }, [id])
  )

  // Prepare gallery sources from event or fallback - moved before early returns to follow Rules of Hooks
  const galleryUrls = React.useMemo(() => {
    if (!event) return [] as string[]
    const evt: any = event
    const candidates: any[] = [evt.gallery, evt.gallery_photos, evt.pre_event_gallery, evt.images]
    for (const arr of candidates) {
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter(Boolean)
      }
    }
    return [] as string[]
  }, [event])

  const gallerySources: Array<string | number> = React.useMemo(() => {
    if (galleryUrls.length > 0) return galleryUrls
    return [gallery1, gallery2, gallery3, gallery4]
  }, [galleryUrls])

  const getCurrentLocation = async () => {
    try {
      // Fallback if expo-location is not available
      if (!Location) {
        Logger.warn('events', 'location:moduleUnavailable')
        Alert.alert(
          'Location Service Not Available',
          'For the best experience, please use the latest version of this app with location services enabled.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Use Demo Mode', 
              onPress: () => {
                // Return demo coordinates for testing
                return Promise.resolve({
                  latitude: 18.5204,
                  longitude: 73.8567
                })
              }
            }
          ]
        )
        // Return demo coordinates for testing only
        Logger.journey('proximity', 'detail:location:demoFallback')
        return {
          latitude: 18.5204,
          longitude: 73.8567
        }
      }

      // Check if location services are enabled
      const serviceEnabled = await Location.hasServicesEnabledAsync()
      if (!serviceEnabled) {
        Logger.warn('events', 'location:servicesDisabled')
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to check in to events.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        )
        return null
      }

      // Request permission with better messaging
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Logger.warn('events', 'location:permissionDenied')
        Alert.alert(
          'Location Permission Required',
          'Blendn needs location access to verify you\'re at events. This ensures authentic meetups and prevents fake check-ins.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        )
        return null
      }

      // Get high-accuracy location for production
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 12000,
        distanceInterval: 1,
        mayShowUserSettingsDialog: true,
      })

      // Validate GPS accuracy for production
      const accuracy = location.coords.accuracy || 999
      if (accuracy > 50) {
        Logger.warn('events', 'location:lowAccuracy', { accuracy })
        Alert.alert(
          'GPS Signal Weak',
          `GPS accuracy is ${Math.round(accuracy)}m. For accurate check-ins, please move to a location with better GPS signal.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => getCurrentLocation() },
          ]
        )
        return null
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }
    } catch (error) {
      Logger.error('events', 'location:getCurrentLocation:error', { error: error as any })
      
      // Handle specific location errors for production
      const errorCode = (error as any)?.code
      if (errorCode === 'E_LOCATION_TIMEOUT') {
        Alert.alert('Location Timeout', 'Unable to get your location. Please try again or move to an area with better GPS signal.')
      } else if (errorCode === 'E_LOCATION_UNAVAILABLE') {
        Alert.alert('Location Unavailable', 'Location services are temporarily unavailable. Please try again.')
      } else {
        Alert.alert('Location Error', 'Failed to get your current location. Please check your GPS settings and try again.')
      }
      return null
    }
  }

  const handleCheckIn = async () => {
    setCheckingIn(true)
    
    try {
      Logger.journey('checkin', 'detail:start', { eventId: String(id) })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Logger.journey('auth', 'detail:blocked:notSignedIn')
        Alert.alert('Error', 'Please sign in to check in to events')
        return
      }

      // Guard: if UI thinks we are not checked in, ensure backend also has no active check-ins
      // This prevents the "Already Checked In" path from stale rows
      try {
        const { ensureNoActiveCheckins } = await import('../../lib/supabase') as any
        if (ensureNoActiveCheckins && typeof ensureNoActiveCheckins === 'function') {
          Logger.journey('checkin', 'detail:ensureNoActiveCheckins:start')
          await ensureNoActiveCheckins(String(id))
          Logger.journey('checkin', 'detail:ensureNoActiveCheckins:done')
        }
      } catch {}

      // Get current location
      const location = await getCurrentLocation()
      if (!location) {
        Logger.warn('events', 'checkin:location:unavailable')
        setCheckingIn(false)
        return
      }

      setUserLocation(location)

      // Call production check-in function with GPS accuracy
      const { data, error } = await supabase
        .rpc('check_in_to_event_production', {
          p_event_id: id,
          p_user_id: user.id,
          p_user_latitude: location.latitude,
          p_user_longitude: location.longitude,
          p_gps_accuracy: 10 // Will be actual GPS accuracy in production
        })

      if (error) {
        Logger.error('events', 'checkin:rpc:error', { error })
        Alert.alert('Error', 'Failed to check in. Please try again.')
      } else {
        if (data.success) {
          Logger.journey('checkin', 'detail:success', { eventId: String(id) })
          // Ensure the user is added to the event group chat in the background
          const ensured = await EventChat.ensureUserInEventChat(String(id), event?.title)

          Alert.alert(
            'Check-in Successful! 🎉',
            `Welcome to ${event?.title || 'this event'}! You can now chat with other attendees and start matching.`,
            [
              {
                text: 'Start Matching',
                onPress: () => router.push('/(tabs)/match' as any)
              },
              {
                text: 'Join Chat',
                onPress: () => {
                  if (ensured?.chatRoomId) {
                    const query = `?roomName=${encodeURIComponent(ensured.roomName)}&eventTitle=${encodeURIComponent(event?.title || '')}`
                    router.push(`/chat/${ensured.chatRoomId}${query}` as any)
                  } else {
                    router.push('/(tabs)/chat' as any)
                  }
                }
              },
              { text: 'OK', style: 'default' }
            ]
          )

          // Send check-in success notification to the user
          try {
            await NotificationHelpers.checkInNotification(
              event?.title || 'Event',
              user.id
            )
          } catch (notificationError) {
            Logger.warn('events', 'checkInNotification:failed', { error: notificationError as any })
            // Don't fail check-in if notification fails
          }

          // Refresh check-in status
          await checkUserCheckInStatus()
        } else {
          // If server says already checked-in, re-sync UI by re-checking status and surface a consistent message
          if (data.code === 'ALREADY_CHECKED_IN') {
            Logger.journey('checkin', 'detail:alreadyCheckedIn')
            await checkUserCheckInStatus()
            Alert.alert('Already Checked In', 'You are already checked in to this event.')
          } else {
            Logger.warn('events', 'checkin:failed', { code: data.code, message: data.error || data.message })
            handleCheckInError(data)
          }
        }
      }
    } catch (error) {
      Logger.error('events', 'checkin:exception', { error: error as any })
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  const handleCheckInError = (data: any) => {
    switch (data.code) {
      case 'TOO_FAR':
        const distance = Math.round(data.distance_meters)
        const required = data.required_radius
        Alert.alert(
          'Too Far From Event 📍',
          `You need to be within ${required}m of ${data.venue_name} to check in.\n\nYou are currently ${distance}m away.`,
          [
            { text: 'OK', style: 'default' },
            { 
              text: 'Open Maps', 
              onPress: () => openInMaps()
            }
          ]
        )
        break
      case 'ALREADY_CHECKED_IN':
        Alert.alert('Already Checked In', 'You have already checked in to this event!')
        break
      case 'EVENT_NOT_FOUND':
        Alert.alert('Event Not Found', 'This event is no longer available.')
        break
      case 'NO_LOCATION_DATA':
        Alert.alert('Location Error', 'Event location data is not available.')
        break
      default:
        Alert.alert('Check-in Failed', data.error || 'Unknown error occurred')
    }
  }

  const openInMaps = async () => {
    if (!event) return
    const lat = event.latitude
    const lon = event.longitude
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)
    const label = encodeURIComponent(event.venue_name || 'Event Location')
    const addressQuery = encodeURIComponent(event.address || event.venue_name || event.title || 'Event Location')

    if (Platform.OS === 'ios') {
      const googleScheme = 'comgooglemaps://'
      const googleUrl = hasCoords
        ? `${googleScheme}?q=${lat},${lon}`
        : `${googleScheme}?q=${addressQuery}`
      const appleUrl = hasCoords
        ? `maps:0,0?q=${label}@${lat},${lon}`
        : `maps:0,0?q=${addressQuery}`
      const webUrl = hasCoords
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
        : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
      try {
        const canOpenGoogle = await Linking.canOpenURL(googleScheme)
        if (canOpenGoogle) return Linking.openURL(googleUrl)
      } catch {}
      try {
        const canOpenApple = await Linking.canOpenURL('maps:')
        if (canOpenApple) return Linking.openURL(appleUrl)
      } catch {}
      return Linking.openURL(webUrl)
    } else {
      const googleScheme = 'comgooglemaps://'
      const googleUrl = hasCoords
        ? `${googleScheme}?q=${lat},${lon}`
        : `${googleScheme}?q=${addressQuery}`
      const geoUrl = hasCoords
        ? `geo:0,0?q=${lat},${lon}(${label})`
        : `geo:0,0?q=${addressQuery}`
      const webUrl = hasCoords
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
        : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`
      try {
        const canOpenGoogle = await Linking.canOpenURL(googleScheme)
        if (canOpenGoogle) return Linking.openURL(googleUrl)
      } catch {}
      try {
        const canOpenGeo = await Linking.canOpenURL('geo:')
        if (canOpenGeo) return Linking.openURL(geoUrl)
      } catch {}
      return Linking.openURL(webUrl)
    }
  }

  const handleShare = async () => {
    try {
      if (!event) return
      await Share.share({
        title: event.title,
        message: `${event.title}\n${event.venue_name}\n${event.address}`
      })
    } catch {}
  }

  const formatPrice = (priceInCents: number) => {
    if (priceInCents === 0) return 'Free'
    return `₹${(priceInCents / 100).toFixed(0)}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </SafeAreaView>
    )
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const spotsLeft = event.max_capacity - event.current_capacity
  const isCheckedIn = checkInStatus?.checked_in || false
  const isEnded = new Date(event.end_time).getTime() < Date.now()
  const stickyBarHeight = insets.top + 8 + 12 + 36
  const sectionBgTop = stickyBarHeight + 12

  const renderBentoGallery = (sources: Array<string | number>) => {
    if (!sources || sources.length === 0) return null

    const buildImageSource = (src: string | number, dims: { width: number; height: number }) => {
      if (typeof src === 'string') {
        const opt = getOptimizedImageUrl(src, { width: Math.round(dims.width), height: Math.round(dims.height), resize: 'cover', quality: 70, format: 'webp' })
        return opt && opt !== src ? { uri: opt } : { uri: src }
      }
      return src
    }

    const img = (src: string | number, w: number, h: number, key: string) => (
      <Image
        key={key}
        source={buildImageSource(src, { width: w, height: h }) as any}
        placeholder={placeholderImg}
        style={[styles.galleryImage, { width: Math.round(w), height: Math.round(h) }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    )

    const n = sources.length

    // 1 item: full width hero
    if (n === 1) {
      return (
        <View style={styles.galleryRow}>
          {img(sources[0], GALLERY_FULL_WIDTH, GALLERY_TALL_HEIGHT, 'g-0')}
        </View>
      )
    }

    // 2 items: two squares
    if (n === 2) {
      return (
        <View style={styles.galleryRow}>
          {img(sources[0], galleryTileSize, galleryTileSize, 'g-0')}
          {img(sources[1], galleryTileSize, galleryTileSize, 'g-1')}
        </View>
      )
    }

    // 3 items: tall on left, two stacked on right
    if (n === 3) {
      return (
        <View style={styles.galleryRow}>
          {img(sources[0], galleryTileSize, GALLERY_TALL_HEIGHT, 'g-0')}
          <View style={styles.galleryColumn}>
            {img(sources[1], galleryTileSize, galleryTileSize, 'g-1')}
            {img(sources[2], galleryTileSize, galleryTileSize, 'g-2')}
          </View>
        </View>
      )
    }

    // 4 items: 2x2 grid
    if (n === 4) {
      return (
        <View style={styles.galleryColumn}>
          <View style={styles.galleryRow}>
            {img(sources[0], galleryTileSize, galleryTileSize, 'g-0')}
            {img(sources[1], galleryTileSize, galleryTileSize, 'g-1')}
          </View>
          <View style={styles.galleryRow}>
            {img(sources[2], galleryTileSize, galleryTileSize, 'g-2')}
            {img(sources[3], galleryTileSize, galleryTileSize, 'g-3')}
          </View>
        </View>
      )
    }

    // 5+ items: 3-layout row then fill remaining as 2-col grid
    const first = sources.slice(0, 3)
    const rest = sources.slice(3)
    const rows: React.ReactNode[] = []
    rows.push(
      <View key="row-0" style={styles.galleryRow}>
        {img(first[0], galleryTileSize, GALLERY_TALL_HEIGHT, 'g-0')}
        <View style={styles.galleryColumn}>
          {img(first[1], galleryTileSize, galleryTileSize, 'g-1')}
          {img(first[2], galleryTileSize, galleryTileSize, 'g-2')}
        </View>
      </View>
    )

    for (let i = 0; i < rest.length; i += 2) {
      rows.push(
        <View key={`row-${1 + (i / 2)}`} style={styles.galleryRow}>
          {img(rest[i], galleryTileSize, galleryTileSize, `g-${3 + i}`)}
          {rest[i + 1] !== undefined && img(rest[i + 1], galleryTileSize, galleryTileSize, `g-${3 + i + 1}`)}
        </View>
      )
    }

    return <View style={styles.galleryColumn}>{rows}</View>
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Image source={figmaBg} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.bgScrim} />
      {/* Sticky top bar */}
      <View style={[styles.topBarSticky, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{event.title}</Text>
        <TouchableOpacity style={[styles.navButton, { marginLeft: 'auto' }]} onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}>
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradientFull}
        />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Image 
            source={(() => {
              const coverUrl = event.cover_image_url
              if (!coverUrl) return placeholderImg
              const opt = getOptimizedImageUrl(coverUrl, { width, height: 390, resize: 'cover', quality: 70 })
              return opt && opt !== coverUrl ? { uri: opt } : { uri: coverUrl }
            })()}
            placeholder={placeholderImg}
            style={styles.coverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
          
          <View style={styles.content}>

          <View style={styles.eventInfo}>
            </View>
            {/* <Text style={styles.title}>{event.title}</Text> */}
            
            <View style={styles.metaRow}>
              <View style={styles.categoryContainer}>
                <Text style={styles.categoryText}>{event.category}</Text>
              </View>
              <Text style={styles.price}>{formatPrice(event.price_cents)}</Text>
            </View>

            <View style={styles.attendingRow}>
              {interestedAvatars && interestedAvatars.length > 0 ? (
                <View style={[styles.avatarsRow, { width: 35 + Math.max(interestedAvatars.length - 1, 0) * 16 }]}>
                  {interestedAvatars.slice(0, 6).map((url, idx) => (
                    <Image
                      key={`${url}-${idx}`}
                      source={{ uri: url } as any}
                      placeholder={placeholderImg}
                      style={[styles.avatarImage, { left: idx * 16 }]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={120}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.avatarsRow}>
                  <View style={styles.avatarCircle} />
                  <View style={[styles.avatarCircle, { left: 16 }]} />
                  <View style={[styles.avatarCircle, { left: 32 }]} />
                </View>
              )}
              <Text style={styles.attendingText}>+{Math.max(interestCount, 0)} people are interested</Text>
            </View>

          <Text style={styles.sectionTitle}>About the Event</Text>
          <Text style={styles.description}>{event.description}</Text>

            {/* Redesigned Event Details (clean 2-up) */}
            <View style={styles.detailsGrid}>
              <View style={styles.detailsCard}>
                <Text style={styles.detailsTitle}>Date & Time</Text>
                <Text style={styles.detailsValue}>{formatDate(event.start_time)}</Text>
              </View>
              <View style={styles.detailsCard}>
                <Text style={styles.detailsTitle}>Venue</Text>
                <Text style={styles.detailsValue} numberOfLines={1}>{event.venue_name}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.locationCard}>
              <TouchableOpacity onPress={openInMaps} activeOpacity={0.9}>
                <Image 
                  source={(() => {
                    const hasCoords = Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
                    const mapHeight = 249
                    if (!hasCoords) {
                      // No coordinates available, use cover image
                      const coverUrl = event.cover_image_url
                      if (!coverUrl) return placeholderImg
                      const opt = getOptimizedImageUrl(coverUrl, { width, height: mapHeight, resize: 'cover', quality: 60 })
                      return opt && opt !== coverUrl ? { uri: opt } : { uri: coverUrl }
                    }
                    // Use map with coordinates
                    const mapWidth = Math.min(1280, Math.max(300, Math.round(width - (CONTENT_HORIZONTAL_PADDING * 2))))
                    const lat = event.latitude
                    const lon = event.longitude
                    const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=${mapWidth}x${mapHeight}&maptype=mapnik&markers=${lat},${lon},red`
                    return { uri: url }
                  })()}
                  placeholder={placeholderImg}
                  style={styles.locationImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                />
              </TouchableOpacity>
              <View style={styles.locationOverlay} pointerEvents="none" />
              <View style={styles.locationPillRow}>
                <View style={styles.locationPillIcon} />
                <Text style={styles.locationPillText} numberOfLines={1}>{event.venue_name}</Text>
              </View>
              <TouchableOpacity style={styles.locationButton} onPress={openInMaps}>
                <Text style={styles.locationButtonText}>Get Directions</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Gallery</Text>
            <View style={styles.gallerySection}>
              {renderBentoGallery(gallerySources)}
            </View>

            

            <View style={styles.actionSection}>
              {isCheckedIn ? (
                <View style={styles.checkedInContainer}>
                  <Text style={styles.checkedInText}>✅ Checked In!</Text>
                  <Text style={styles.checkedInSubtext}>
                    You checked in {checkInStatus?.distance_meters ? 
                      `${Math.round(checkInStatus.distance_meters)}m` : ''} from the venue
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                      style={styles.swipeButton}
                      onPress={() => Alert.alert('Coming Soon!', 'Swipe feature will be available soon!')}
                    >
                      <Text style={styles.swipeButtonText}>Start Meeting People 💕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.swipeButton, { backgroundColor: '#007AFF' }]}
                      onPress={async () => {
                        try {
                          const ensured = await EventChat.ensureUserInEventChat(String(id), event?.title)
                          if (ensured?.chatRoomId) {
                            const query = `?roomName=${encodeURIComponent(ensured.roomName)}&eventTitle=${encodeURIComponent(event?.title || '')}`
                            router.push(`/chat/${ensured.chatRoomId}${query}` as any)
                          } else {
                            router.push('/(tabs)/chat' as any)
                          }
                        } catch {}
                      }}
                    >
                      <Text style={styles.swipeButtonText}>Join Event Chat 💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.swipeButton, { backgroundColor: '#6c757d' }]}
                      onPress={async () => {
                        try {
                          const res = await EventCheckout.checkoutFromEvent(String(id))
                          if (res.success) {
                            Alert.alert('Checked Out', res.message || 'You have been checked out of this event.')
                            await checkUserCheckInStatus()
                          } else {
                            Alert.alert('Checkout Failed', res.message || 'Please try again.')
                          }
                        } catch (e: any) {
                          Alert.alert('Error', e?.message || 'Unknown error')
                        }
                      }}
                    >
                      <Text style={styles.swipeButtonText}>Check Out</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity 
                    style={[styles.blendnButton, checkingIn && styles.checkInButtonDisabled]}
                    onPress={handleCheckIn}
                    disabled={checkingIn}
                  >
                    {checkingIn ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.blendnButtonText}>Blend’n</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

          </View>
        </ScrollView>
      </View>

      {/* Fixed bottom tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.quickButton} onPress={handleShare}>
          <Text style={styles.quickIcon}>􀈂</Text>
          <Text style={styles.quickText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickButton}
          onPress={async () => {
            try {
              const ensured = await EventChat.ensureUserInEventChat(String(id), event?.title)
              if (ensured?.chatRoomId) {
                const query = `?roomName=${encodeURIComponent(ensured.roomName)}&eventTitle=${encodeURIComponent(event?.title || '')}`
                router.push(`/chat/${ensured.chatRoomId}${query}` as any)
              } else {
                router.push('/(tabs)/chat' as any)
              }
            } catch {}
          }}
        >
          <Text style={styles.quickIcon}>💬</Text>
          <Text style={styles.quickText}>Contact</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickButton}
          onPress={() => {
            Alert.alert(
              'More',
              undefined,
              [
                { text: 'Get Directions', onPress: openInMaps },
                { text: 'Close', style: 'cancel' }
              ]
            )
          }}
        >
          <Text style={styles.quickIcon}>⋯</Text>
          <Text style={styles.quickText}>More</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  coverImage: {
    width: '100%',
    height: 390,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  content: {
    flex: 1,
  },
  // legacy header/back styles removed; using sticky top bar
  eventInfo: {
    paddingHorizontal: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 12,
    paddingHorizontal: 14,
  },
  categoryContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  categoryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 14,
  },
  attendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  avatarsRow: {
    width: 70,
    height: 35,
    marginRight: 8,
  },
  avatarImage: {
    position: 'absolute',
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#D9D9D9',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.35)'
  },
  avatarCircle: {
    position: 'absolute',
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#D9D9D9',
    left: 0,
    top: 0,
  },
  attendingText: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    paddingHorizontal: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#CCCCCC',
    lineHeight: 22,
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  locationCard: {
    marginBottom: 16,
    borderRadius: 23,
    overflow: 'hidden',
    marginHorizontal: 14,
  },
  locationImage: {
    width: '100%',
    height: 249,
    borderRadius: 23,
  },
  locationOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    backgroundColor: 'rgba(34,21,42,0.78)',
    borderBottomLeftRadius: 23,
    borderBottomRightRadius: 23,
  },
  locationPillRow: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  locationPillIcon: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#6B6B6B',
    marginRight: 6,
  },
  locationPillText: {
    color: '#222222',
    fontSize: 12,
    maxWidth: 140,
  },
  locationButton: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: GALLERY_GAP,
    marginBottom: 20,
    paddingHorizontal: 14,
  },
  galleryTile: {
    width: galleryTileSize,
    height: galleryTileSize,
    borderRadius: 12,
  },
  gallerySection: {
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  galleryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: GALLERY_GAP,
    marginBottom: GALLERY_GAP,
  },
  galleryColumn: {
    flexDirection: 'column',
    gap: GALLERY_GAP,
    flex: 1,
  },
  galleryImage: {
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 14,
  },
  detailsCard: {
    width: (width - (CONTENT_HORIZONTAL_PADDING * 2) - 12) / 2,
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailsTitle: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
  },
  detailsValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
    color: '#FFFFFF',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  actionSection: {
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  checkedInContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 14,
  },
  checkedInText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  checkedInSubtext: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 16,
  },
  swipeButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  swipeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkInButton: {
    backgroundColor: '#E53A17',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: 14,
  },
  checkInButtonDisabled: {
    backgroundColor: '#333333',
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkInSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  blendnButton: {
    backgroundColor: '#7217b3',
    padding: 16,
    borderRadius: 100,
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: 14,
  },
  blendnButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  interestButton: {
    backgroundColor: '#fde7ef',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: 14,
  },
  interestButtonActive: {
    backgroundColor: '#f8cfe0',
  },
  interestButtonText: {
    color: '#D81B60',
    fontSize: 16,
    fontWeight: '600',
  },
  proximityIndicator: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  proximityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  proximityGood: {
    color: '#4CAF50',
  },
  proximityBad: {
    color: '#FF9800',
  },
  distanceIndicator: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  quickDock: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  quickButton: {
    width: '32%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,18,1)',
    paddingVertical: 10,
    borderRadius: 20,
  },
  quickIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 2,
  },
  quickText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  scrollContent: {
    paddingBottom: 120,
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
  gradientFull: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
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
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
    maxWidth: '62%',
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
})