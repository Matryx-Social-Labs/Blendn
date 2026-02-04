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
  InteractionManager,
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
import { SkeletonBlock, SkeletonLine } from '../Skeleton';
import { apiClient } from '../../lib/apiClient';
import { Logger } from '../../lib/logger';
import { NotificationHelpers } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/photoUtils';
import { subscribeToEvent, EventCheckInCallback, EventInterestCallback } from '../../lib/socketClient';
import { useAuth } from '../../lib/useAuth';
import { getEventDetailCache, setEventDetailCache } from '../../lib/eventDetailCache';
import { getMapImageUrlCache, setMapImageUrlCache } from '../../lib/mapImageCache';
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
  const { id, title, cover, venue, city, start, end, category, description: descriptionParam, interestCount: interestCountParam, interested } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  // Initialize event from params if available for instant display
  const hasParams = !!(title || cover || venue)
  const [event, setEvent] = useState<EventDetail | null>(() => {
    if (hasParams) {
      return {
        id: String(id || ''),
        title: String(title || ''),
        venue_name: String(venue || ''),
        cover_image_url: String(cover || ''),
        city: String(city || ''),
        start_time: String(start || new Date().toISOString()),
        end_time: String(end || new Date().toISOString()),
        category: String(category || ''),
        description: String(descriptionParam || ''),
        short_description: '',
        address: '',
        price_cents: 0,
        max_capacity: 0,
        current_capacity: 0,
        organizer: '',
        latitude: 0,
        longitude: 0,
        check_in_radius: 100,
      }
    }
    return null
  })
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null)
  // Don't show loading skeleton if we have params - show content immediately
  const [loading, setLoading] = useState(!hasParams)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityStatus, setProximityStatus] = useState<any>(null)
  // Initialize from params for instant display
  const [interestCount, setInterestCount] = useState<number>(() => {
    if (interestCountParam && typeof interestCountParam === 'string') {
      const parsed = parseInt(interestCountParam, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    }
    return 0
  })
  const [userInterested, setUserInterested] = useState<boolean>(false)
  const [interestedAvatars, setInterestedAvatars] = useState<string[]>(() => {
    if (interested && typeof interested === 'string') {
      try {
        const parsed = JSON.parse(interested)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      } catch {}
    }
    return []
  })
  const [eventChatGroupId, setEventChatGroupId] = useState<string | null>(null)
  const [showMapImage, setShowMapImage] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [showHeroHighRes, setShowHeroHighRes] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const galleryOffsetRef = React.useRef<number | null>(null)
  const lastFetchRef = React.useRef<number>(0)

  useEffect(() => {
    if (id && String(id).trim()) {
      Logger.journey('events', 'detail:mount', { eventId: String(id) })
      // Params are already handled in initial state - just check cache for more complete data
      const cached = getEventDetailCache<any>(String(id))
      if (cached) {
        const d = cached
        setEvent({
          id: d.id,
          title: d.title,
          description: d.description || '',
          short_description: d.shortDescription || d.short_description || '',
          city: d.city || '',
          venue_name: d.venueName || d.venue_name || '',
          address: d.address || '',
          start_time: d.startTime || d.start_time,
          end_time: d.endTime || d.end_time,
          category: d.categories?.[0]?.name || '',
          price_cents: d.priceCents || d.price_cents || 0,
          max_capacity: d.maxCapacity || d.max_capacity || 0,
          current_capacity: d.currentCapacity || d.current_capacity || 0,
          cover_image_url: d.coverImageUrl || d.cover_image_url || '',
          organizer: d.organizer?.name || '',
          latitude: d.latitude,
          longitude: d.longitude,
          check_in_radius: d.checkInRadius || d.check_in_radius || 100,
          gallery: d.gallery,
          gallery_photos: d.gallery_photos,
          pre_event_gallery: d.pre_event_gallery,
          images: d.images,
        })
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
        }
        if (d.userStatus) {
          setUserInterested(d.userStatus.isFavorited || false)
          setCheckInStatus({
            success: true,
            checked_in: d.userStatus.isCheckedIn || false,
            check_in_id: d.userStatus.checkInId,
          })
        }
        if (d.interestedUsers) {
          const avatars = d.interestedUsers
            .map((u: { avatar?: string | null }) => u.avatar)
            .filter((url: string | null | undefined): url is string => !!url)
          setInterestedAvatars(avatars)
        }
        if (d.chatGroup?.id) {
          setEventChatGroupId(d.chatGroup.id)
        }
        setLoading(false)
      }
      // fetchEventDetails returns all user status info (isCheckedIn, isFavorited) - single API call
      fetchEventDetails()
    } else {
      // No valid ID provided, show error immediately
      setLoading(false)
      Logger.error('events', 'detail:noValidId', { id })
    }
  }, [id])

  // Deferred loading for smoother navigation - reduced delays for faster perceived loading
  useEffect(() => {
    setShowMapImage(false)
    setMapFailed(false)
    // Show map immediately after navigation completes
    const task = InteractionManager.runAfterInteractions(() => {
      setShowMapImage(true)
    })
    return () => {
      task?.cancel?.()
    }
  }, [id])

  useEffect(() => {
    setShowGallery(false)
    galleryOffsetRef.current = null
  }, [id])

  useEffect(() => {
    setShowAvatars(false)
    // Show avatars immediately after navigation
    const task = InteractionManager.runAfterInteractions(() => {
      setShowAvatars(true)
    })
    return () => {
      task?.cancel?.()
    }
  }, [id])

  useEffect(() => {
    setShowHeroHighRes(false)
    // Load high-res hero with minimal delay
    const task = InteractionManager.runAfterInteractions(() => {
      const t = setTimeout(() => setShowHeroHighRes(true), 100)
      return () => clearTimeout(t)
    })
    return () => {
      task?.cancel?.()
    }
  }, [id])

  useEffect(() => {
    // Check proximity when user location changes
    if (userLocation && event) {
      checkProximityStatus()
    }
  }, [userLocation, event])

  // Real-time event updates via Socket.io
  useEffect(() => {
    if (!id) return

    Logger.info('events', 'Subscribing to event updates', { eventId: id })

    // Handle check-in updates
    const handleCheckIn: EventCheckInCallback = (data) => {
      Logger.debug('events', 'Received check-in update', { userId: data.userId })
      if (user && data.userId === user.id) {
        setCheckInStatus({ success: true, checked_in: true })
      }
      // Refresh attendee count
      fetchEventDetails()
    }

    // Handle interest updates
    const handleInterest: EventInterestCallback = (data) => {
      Logger.debug('events', 'Received interest update', { interested: data.interested, count: data.interestCount })
      setInterestCount(data.interestCount)
      if (user && data.userId === user.id) {
        setUserInterested(data.interested)
      }
      // Refresh interested avatars from API payload
      fetchEventDetails()
    }

    // Subscribe to both check-in and interest events
    const unsubCheckIn = subscribeToEvent(String(id), handleCheckIn)
    const unsubInterest = subscribeToEvent(String(id), handleInterest)

    return () => {
      Logger.info('events', 'Cleaning up event subscriptions')
      unsubCheckIn()
      unsubInterest()
    }
  }, [id, user])

  const handleToggleInterest = useCallback(async () => {
    try {
      if (!id) return
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to show interest')
        return
      }
      const prevInterested = userInterested
      setUserInterested(!prevInterested)
      setInterestCount((prev) => Math.max(0, prev + (prevInterested ? -1 : 1)))
      const result = await apiClient.toggleInterest(String(id))
      if (!result.success || !result.data) {
        // rollback
        setUserInterested(prevInterested)
        setInterestCount((prev) => Math.max(0, prev + (prevInterested ? 1 : -1)))
        Alert.alert('Error', 'Failed to update interest')
        return
      }
      setUserInterested(result.data.interested)
      setInterestCount(result.data.interestCount || 0)
    } catch {
      Alert.alert('Error', 'Failed to update interest')
    }
  }, [id, user, userInterested])

  const checkProximityStatus = async () => {
    if (!userLocation || !event) return

    try {
      Logger.journey('proximity', 'detail:check:start', { eventId: event.id, lat: userLocation.latitude, lon: userLocation.longitude })
      if (!user) return

      // Calculate distance client-side for now
      // TODO: Add proximity check API endpoint if needed
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        event.latitude,
        event.longitude
      )

      const isNearby = distance <= (event.check_in_radius || 100)
      setProximityStatus({
        nearby: isNearby,
        distance_meters: distance,
        event_id: event.id
      })
      Logger.journey('proximity', 'detail:check:success', { distance, isNearby })
    } catch (error) {
      Logger.error('events', 'detail:check:exception', { error: error as any })
    }
  }

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const fetchEventDetails = async () => {
    try {
      Logger.journey('events', 'detail:fetch:start', { eventId: String(id) })
      const result = await apiClient.getEvent(String(id), {
        include: 'interestedUsers',
        interestedLimit: 6,
      })

      if (!result.success || !result.data) {
        Logger.error('events', 'detail:fetch:error', { error: result.error })
        Alert.alert('Error', 'Failed to load event details')
      } else {
        // Map API response (camelCase) to EventDetail interface (snake_case)
        const d = result.data
        lastFetchRef.current = Date.now()
        setEventDetailCache(String(id), d)
        setEvent({
          id: d.id,
          title: d.title,
          description: d.description || '',
          short_description: d.shortDescription || d.short_description || '',
          city: d.city || '',
          venue_name: d.venueName || d.venue_name || '',
          address: d.address || '',
          start_time: d.startTime || d.start_time,
          end_time: d.endTime || d.end_time,
          category: d.categories?.[0]?.name || '',
          price_cents: d.priceCents || d.price_cents || 0,
          max_capacity: d.maxCapacity || d.max_capacity || 0,
          current_capacity: d.currentCapacity || d.current_capacity || 0,
          cover_image_url: d.coverImageUrl || d.cover_image_url || '',
          organizer: d.organizer?.name || '',
          latitude: d.latitude,
          longitude: d.longitude,
          check_in_radius: d.checkInRadius || d.check_in_radius || 100,
          gallery: d.gallery,
          gallery_photos: d.gallery_photos,
          pre_event_gallery: d.pre_event_gallery,
          images: d.images,
        })
        // Set interest info and check-in status from userStatus
        if (d.userStatus) {
          setUserInterested(d.userStatus.isFavorited || false)
          // Set check-in status from event detail response - no separate API call needed
          setCheckInStatus({
            success: true,
            checked_in: d.userStatus.isCheckedIn || false,
            check_in_id: d.userStatus.checkInId,
          })
        }
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
        }
        if (d.interestedUsers) {
          const avatars = d.interestedUsers
            .map((u: { avatar?: string | null }) => u.avatar)
            .filter((url: string | null | undefined): url is string => !!url)
          setInterestedAvatars(avatars)
        }
        // Set chat group ID if available
        if (d.chatGroup?.id) {
          setEventChatGroupId(d.chatGroup.id)
        }
        Logger.journey('events', 'detail:fetch:success', { eventId: d.id, isCheckedIn: d.userStatus?.isCheckedIn })
      }
    } catch (error) {
      Logger.error('events', 'detail:fetch:exception', { error: error as any })
    } finally {
      setLoading(false)
    }
  }

  // Refresh event data (including check-in status) on focus
  useFocusEffect(
    useCallback(() => {
      if (id && String(id).trim() && !loading) {
        const now = Date.now()
        if (now - lastFetchRef.current > 20 * 1000) {
          // Re-fetch event details which includes userStatus.isCheckedIn
          fetchEventDetails()
        }
      }
    }, [id, loading])
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
          'Location services are required to check in to events. Please ensure you have the latest version of this app.',
          [{ text: 'OK', style: 'default' }]
        )
        return null
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
      if (!user) {
        Logger.journey('auth', 'detail:blocked:notSignedIn')
        Alert.alert('Error', 'Please sign in to check in to events')
        setCheckingIn(false)
        return
      }

      // Get current location
      const location = await getCurrentLocation()
      if (!location) {
        Logger.warn('events', 'checkin:location:unavailable')
        setCheckingIn(false)
        return
      }

      setUserLocation(location)

      // Call check-in API with timeout for better UX
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('CHECKIN_TIMEOUT')), ms)
          promise
            .then((res) => {
              clearTimeout(t)
              resolve(res)
            })
            .catch((err) => {
              clearTimeout(t)
              reject(err)
            })
        })
      }

      const result = await withTimeout(
        apiClient.checkIn(String(id), {
          latitude: location.latitude,
          longitude: location.longitude,
          deviceInfo: { platform: Platform.OS }
        }),
        12000
      )

      if (!result.success) {
        Logger.error('events', 'checkin:api:error', { error: result.error })
        // Handle specific error codes
        if (result.error?.includes('already checked in') || result.error?.includes('ALREADY_CHECKED_IN')) {
          Logger.journey('checkin', 'detail:alreadyCheckedIn')
          // User is already checked in - update state directly
          setCheckInStatus({ success: true, checked_in: true })
          Alert.alert('Already Checked In', 'You are already checked in to this event.')
        } else if (result.error?.includes('too far') || result.error?.includes('TOO_FAR')) {
          handleCheckInError({ code: 'TOO_FAR', error: result.error })
        } else {
          Alert.alert('Check-in Failed', result.error || 'We couldn’t verify your check-in. Please try again.')
        }
      } else {
        const data = result.data
        Logger.journey('checkin', 'detail:success', { eventId: String(id) })

        const openEventRoom = async () => {
          try {
            const chatResult = await apiClient.getEventChat(String(id))
            if (chatResult.success && chatResult.data?.id) {
              router.push({
                pathname: '/chat/[id]',
                params: {
                  id: chatResult.data.id,
                  roomName: chatResult.data.name || event?.title || 'Event Chat',
                  eventTitle: event?.title || ''
                } as any
              })
              return
            }
          } catch {}
          router.push('/(tabs)/chat' as any)
        }

        Alert.alert(
          'Check-in Successful! 🎉',
          `Welcome to ${event?.title || 'this event'}! You can now chat with other attendees and start matching.`,
          [
            {
              text: 'Start Matching',
              onPress: () => router.push('/(tabs)/match' as any)
            },
            {
              text: 'Event Room',
              onPress: () => {
                openEventRoom()
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

        // Update check-in status directly - no need for another API call
        setCheckInStatus({ success: true, checked_in: true, check_in_id: result.data?.checkInId })
      }
    } catch (error) {
      Logger.error('events', 'checkin:exception', { error: error as any })
      if ((error as any)?.message === 'CHECKIN_TIMEOUT') {
        Alert.alert(
          'Still checking you in…',
          'This is taking longer than expected. Please try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: () => handleCheckIn() }
          ]
        )
      } else {
        Alert.alert('Check-in Failed', 'Something went wrong. Please try again.')
      }
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

  const handleCheckout = async () => {
    setCheckingOut(true)
    try {
      const result = await apiClient.checkOut(String(id))
      if (result.success) {
        Alert.alert('Checked Out', 'You have been checked out of this event.')
        // Update check-in status directly - no need for another API call
        setCheckInStatus({ success: true, checked_in: false })
      } else {
        Alert.alert('Checkout Failed', result.error || 'Please try again.')
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Unknown error')
    } finally {
      setCheckingOut(false)
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

  const addToCalendar = useCallback(() => {
    try {
      if (!event) return
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
  }, [event])

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

  const isLoading = loading

  if (!isLoading && !event) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const spotsLeft = event ? (event.max_capacity - event.current_capacity) : 0
  const isCheckedIn = checkInStatus?.checked_in || false
  const isEnded = event ? (new Date(event.end_time).getTime() < Date.now()) : false
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
        <Text style={styles.topBarTitle} numberOfLines={1}>{event?.title || ''}</Text>
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={(e) => {
            if (showGallery) return
            const offset = galleryOffsetRef.current
            if (!offset) return
            const y = e.nativeEvent.contentOffset.y
            if (y > offset - 500) {
              setShowGallery(true)
            }
          }}
        >
          {isLoading ? (
            <SkeletonBlock width={'100%'} height={390} borderRadius={25} />
          ) : (
            <Image 
              source={(() => {
                const coverUrl = event!.cover_image_url
                if (!coverUrl) return placeholderImg
                const opt = getOptimizedImageUrl(coverUrl, {
                  width,
                  height: 390,
                  resize: 'cover',
                  quality: showHeroHighRes ? 75 : 45,
                  format: 'webp',
                })
                return opt && opt !== coverUrl ? { uri: opt } : { uri: coverUrl }
              })()}
              placeholder={placeholderImg}
              style={styles.coverImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          )}
          
          <View style={styles.content}>

          <View style={styles.eventInfo}>
            </View>
            {/* <Text style={styles.title}>{event.title}</Text> */}
            
            {isLoading ? (
              <View style={styles.metaRow}>
                <SkeletonBlock width={90} height={28} borderRadius={16} />
                <SkeletonLine width={60} />
              </View>
            ) : (
              <View style={styles.metaRow}>
                {event?.category ? (
                  <View style={styles.categoryContainer}>
                    <Text style={styles.categoryText}>{event.category}</Text>
                  </View>
                ) : null}
                <Text style={styles.price}>{formatPrice(event!.price_cents)}</Text>
              </View>
            )}

            <View style={styles.attendingRow}>
              {isLoading ? (
                <>
                  <View style={styles.avatarsRow}>
                    <View style={styles.avatarCircle} />
                    <View style={[styles.avatarCircle, { left: 16 }]} />
                    <View style={[styles.avatarCircle, { left: 32 }]} />
                  </View>
                  <SkeletonLine width={180} />
                </>
              ) : (
                <>
                  {showAvatars && interestedAvatars && interestedAvatars.length > 0 ? (
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
                  ) : null}
                  {interestCount > 0 ? (
                    <Text style={styles.attendingText}>+{Math.max(interestCount, 0)} people are interested</Text>
                  ) : (
                    <Text style={styles.attendingEmptyText}>Be the first to show interest</Text>
                  )}
                  {!userInterested && (
                    <TouchableOpacity
                      onPress={handleToggleInterest}
                      style={styles.interestCta}
                      accessibilityRole="button"
                      accessibilityLabel="Show interest in this event"
                    >
                      <Text style={styles.interestCtaText}>I'm Interested</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

          {isLoading || !event?.description ? (
            <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
              <SkeletonLine width={160} style={{ marginBottom: 10 }} />
              {[...Array(3)].map((_, i) => (
                <SkeletonLine key={`ab-${i}`} width={`${90 - i * 10}%`} style={{ marginBottom: 6 }} />
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>About the Event</Text>
              <Text style={styles.description}>{event.description}</Text>
            </>
          )}

            {/* Redesigned Event Details (clean 2-up) */}
            {isLoading ? (
              <View style={styles.detailsGrid}>
                <SkeletonBlock width={(width - (CONTENT_HORIZONTAL_PADDING * 2) - 12) / 2} height={70} borderRadius={14} />
                <SkeletonBlock width={(width - (CONTENT_HORIZONTAL_PADDING * 2) - 12) / 2} height={70} borderRadius={14} />
              </View>
            ) : (
              <View style={styles.detailsGrid}>
                <View style={styles.detailsCard}>
                  <Text style={styles.detailsTitle}>Date & Time</Text>
                  <Text style={styles.detailsValue}>{formatDate(event!.start_time)}</Text>
                </View>
                <View style={styles.detailsCard}>
                  <Text style={styles.detailsTitle}>Venue</Text>
                  <Text style={styles.detailsValue} numberOfLines={1}>{event!.venue_name}</Text>
                </View>
              </View>
            )}

            {isLoading ? (
              <>
                <Text style={styles.sectionTitle}>Location</Text>
                <SkeletonBlock width={'92%'} height={249} borderRadius={23} style={{ alignSelf: 'center', marginBottom: 16 }} />
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Location</Text>
                <View style={styles.locationCard}>
                  <TouchableOpacity onPress={openInMaps} activeOpacity={0.9}>
                    {showMapImage ? (
                      <Image 
                        source={(() => {
                          const lat = event!.latitude
                          const lon = event!.longitude
                          const hasCoords =
                            Number.isFinite(lat) &&
                            Number.isFinite(lon) &&
                            (Math.abs(lat) > 0.0001 || Math.abs(lon) > 0.0001)
                          const mapHeight = 249
                          if (!hasCoords || mapFailed) {
                            const coverUrl = event!.cover_image_url
                            if (!coverUrl) return placeholderImg
                            const opt = getOptimizedImageUrl(coverUrl, { width, height: mapHeight, resize: 'cover', quality: 60 })
                            return opt && opt !== coverUrl ? { uri: opt } : { uri: coverUrl }
                          }
                          const mapWidth = Math.min(1280, Math.max(300, Math.round(width - (CONTENT_HORIZONTAL_PADDING * 2))))
                          const cacheKey = `${event!.id}:${mapWidth}x${mapHeight}:${lat},${lon}`
                          const cachedUrl = getMapImageUrlCache(cacheKey)
                          if (cachedUrl) {
                            return { uri: cachedUrl }
                          }
                          const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=${mapWidth}x${mapHeight}&maptype=mapnik&markers=${lat},${lon},red`
                          setMapImageUrlCache(cacheKey, url)
                          return { uri: url }
                        })()}
                        placeholder={placeholderImg}
                        style={styles.locationImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                        onError={() => setMapFailed(true)}
                      />
                    ) : (
                      <View style={[styles.locationImage, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                    )}
                  </TouchableOpacity>
                  <View style={styles.locationOverlay} pointerEvents="none" />
                  <View style={styles.locationPillRow}>
                    <View style={styles.locationPillIcon} />
                    <Text style={styles.locationPillText} numberOfLines={1}>{event!.venue_name}</Text>
                  </View>
                  <TouchableOpacity style={styles.locationButton} onPress={openInMaps}>
                    <Text style={styles.locationButtonText}>Get Directions</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {isLoading ? (
              <View style={{ paddingHorizontal: 14, marginBottom: 20 }}>
                <SkeletonLine width={120} style={{ marginBottom: 10 }} />
                <SkeletonBlock width={'100%'} height={GALLERY_TALL_HEIGHT} borderRadius={12} />
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Gallery</Text>
                <View
                  style={styles.gallerySection}
                  onLayout={(e) => {
                    galleryOffsetRef.current = e.nativeEvent.layout.y
                  }}
                >
                  {showGallery ? (
                    renderBentoGallery(gallerySources)
                  ) : (
                    <SkeletonBlock width={'100%'} height={GALLERY_TALL_HEIGHT} borderRadius={12} />
                  )}
                </View>
              </>
            )}

            

            <View style={styles.actionSection}>
              {isLoading ? (
                <SkeletonBlock width={'92%'} height={56} borderRadius={25} style={{ alignSelf: 'center' }} />
              ) : isCheckedIn ? (
                <View style={styles.checkedInContainer}>
                  <Text style={styles.checkedInText}>✅ Checked In!</Text>
                  <Text style={styles.checkedInSubtext}>
                    You checked in {checkInStatus?.distance_meters ? 
                      `${Math.round(checkInStatus.distance_meters)}m` : ''} from the venue
                  </Text>
                  <View style={styles.actionsColumn}>
                    <TouchableOpacity 
                      style={[styles.swipeButton, { backgroundColor: '#7217b3' }]}
                      onPress={() => Alert.alert('Coming Soon!', 'Swipe feature will be available soon!')}
                    >
                      <Text style={styles.swipeButtonText}>Start Meeting People 💕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.swipeButton, { backgroundColor: '#007AFF' }]}
                      onPress={() => {
                        if (eventChatGroupId) {
                          const query = `?roomName=${encodeURIComponent(event?.title || 'Event Chat')}&eventTitle=${encodeURIComponent(event?.title || '')}`
                          router.push(`/chat/${eventChatGroupId}${query}` as any)
                        } else {
                          router.push('/(tabs)/chat' as any)
                        }
                      }}
                    >
                      <Text style={styles.swipeButtonText}>Join Event Chat 💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.swipeButton, { backgroundColor: '#6c757d' }]}
                      onPress={handleCheckout}
                    >
                      <Text style={styles.swipeButtonText}>Check Out</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {/* <TouchableOpacity 
                    style={[styles.blendnButton, checkingIn && styles.checkInButtonDisabled]}
                    onPress={handleCheckIn}
                    disabled={checkingIn}
                  >
                    {checkingIn ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.blendnButtonText}>Blend’n</Text>
                    )}
                  </TouchableOpacity> */}
                </>
              )}
            </View>

          </View>
        </ScrollView>
      </View>

     
      <View style={styles.tabBar}>
        {isCheckedIn ? (
          <TouchableOpacity 
            style={[styles.blendnButton, checkingOut && styles.checkInButtonDisabled]}
            onPress={handleCheckout}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.blendnButtonText}>Check Out</Text>
            )}
          </TouchableOpacity>
        ) : (
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
        )}
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  categoryContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  categoryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 14,
    marginLeft: 'auto',
  },
  attendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  attendingEmptyText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginLeft: 10,
  },
  interestCta: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  interestCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 19,
    color: '#FFFFFF',
    marginBottom: 8,
    paddingHorizontal: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
    marginBottom: 16,
    paddingHorizontal: 16,
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
  actionsColumn: {
    width: '100%',
    flexDirection: 'column',
    gap: 12,
  },
  swipeButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    borderRadius: 100,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    width: '100%',
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
