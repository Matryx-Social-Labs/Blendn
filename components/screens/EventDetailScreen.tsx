import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import Reanimated from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Dimensions,
  Easing,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionTray, { type ActionTrayButton } from '../ActionTray';
import ScalePress from '../motion/ScalePress';
import { SkeletonBlock, SkeletonLine } from '../Skeleton';
import { apiClient } from '../../lib/apiClient';
import { Logger } from '../../lib/logger';
import { NotificationHelpers } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/photoUtils';
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient';
import { APP_COLORS } from '../../lib/theme';
import { useAuth } from '../../lib/useAuth';
import { useInteractionFeedback } from '../../lib/useInteractionFeedback';
import { getEventDetailCache, setEventDetailCache } from '../../lib/eventDetailCache';
import { getMapImageUrlCache, setMapImageUrlCache } from '../../lib/mapImageCache';
const placeholderImg = require('../../assets/images/icon.png');

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
  timezone?: string
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

type EventDetailTrayState = {
  visible: boolean
  title: string
  message?: string
  buttons: ActionTrayButton[]
}

const { width } = Dimensions.get('window')
const CONTENT_HORIZONTAL_PADDING = 14
const GALLERY_GAP = 12
const galleryTileSize = Math.floor((width - (CONTENT_HORIZONTAL_PADDING * 2) - GALLERY_GAP) / 2)
const GALLERY_FULL_WIDTH = Math.round(width - (CONTENT_HORIZONTAL_PADDING * 2))
const GALLERY_TALL_HEIGHT = (galleryTileSize * 2) + GALLERY_GAP
const TOP_BAR_EXTRA_TOP_PADDING = 0
const TOP_BAR_INSET_REDUCTION = 24
const CHECKIN_RULES_TEXT = [
  'Before you check in, please confirm:',
  '1. You are physically at the event venue.',
  '2. Location permission is enabled and accurate.',
  '3. Fake/spoofed check-ins are not allowed.',
  '4. One active check-in per event/account.',
  '5. Follow venue rules and Blendn community guidelines.',
  '6. Harassment, hate speech, or unsafe behavior is prohibited.',
  '7. Violations can lead to check-in revocation or account restrictions.',
].join('\n')

const hashSeed = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const hslToHex = (h: number, s: number, l: number) => {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = light - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const buildEventGradientPalette = (seedInput: string) => {
  const seed = hashSeed(seedInput || 'blendn-event')
  const hue = seed % 360
  const accentHue = (hue + 32 + (seed % 38)) % 360
  return {
    pageTop: hslToHex(hue, 44, 30),
    pageBottom: hslToHex(accentHue, 32, 15),
    surfaceTop: hslToHex(hue, 36, 24),
    surfaceBottom: hslToHex(accentHue, 28, 11),
    heroOverlayStart: 'rgba(0,0,0,0.06)',
    heroOverlayEnd: `rgba(6,6,10,${0.86 + ((seed % 10) * 0.008)})`,
  }
}

export default function EventDetail() {
  const { id, title, cover, venue, city, start, end, category, description: descriptionParam, interestCount: interestCountParam, interested } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const feedback = useInteractionFeedback()

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
  const [averageRating, setAverageRating] = useState<number | null>(null)
  const [ratingCount, setRatingCount] = useState<number>(0)
  const [userInterested, setUserInterested] = useState<boolean>(false)
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'maybe' | 'not_going' | null>(null)
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
  const [trayState, setTrayState] = useState<EventDetailTrayState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  })
  const galleryOffsetRef = React.useRef<number | null>(null)
  const lastFetchRef = React.useRef<number>(0)
  const actionMorph = React.useRef(new RNAnimated.Value(0)).current
  const checkedInMorphTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [actionStage, setActionStage] = useState<'blend' | 'checked' | 'chat'>('blend')
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
  const gradientPalette = React.useMemo(() => {
    const seed = `${event?.cover_image_url || cover || ''}|${event?.category || category || ''}|${event?.title || title || ''}`
    return buildEventGradientPalette(seed)
  }, [event?.cover_image_url, event?.category, event?.title, cover, category, title])

  const closeTray = useCallback(() => {
    setTrayState((prev) => ({ ...prev, visible: false }))
  }, [])

  const showTray = useCallback((titleText: string, messageText: string, buttons?: ActionTrayButton[]) => {
    setTrayState({
      visible: true,
      title: titleText,
      message: messageText,
      buttons: buttons && buttons.length > 0 ? buttons : [{ label: 'Done', variant: 'primary', onPress: closeTray }],
    })
  }, [closeTray])

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
          start_time: d.startTime || d.start_time || '',
          end_time: d.endTime || d.end_time || '',
          timezone: d.timezone,
          category: d.categories?.[0]?.name || '',
          price_cents: d.priceCents || d.price_cents || 0,
          max_capacity: d.maxCapacity || d.max_capacity || 0,
          current_capacity: d.currentCapacity || d.current_capacity || 0,
          cover_image_url: d.coverImageUrl || d.cover_image_url || '',
          organizer: d.organizer?.name || '',
          latitude: d.latitude ?? 0,
          longitude: d.longitude ?? 0,
          check_in_radius: d.checkInRadius || d.check_in_radius || 100,
          gallery: d.gallery,
          gallery_photos: d.gallery_photos,
          pre_event_gallery: d.pre_event_gallery,
          images: d.images,
        })
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
          if (d.stats.averageRating != null) setAverageRating(d.stats.averageRating)
          setRatingCount(d.stats.ratingCount || 0)
        }
        if (d.userStatus) {
          setUserInterested(d.userStatus.isFavorited || false)
          setCheckInStatus({
            success: true,
            checked_in: d.userStatus.isCheckedIn || false,
            check_in_id: d.userStatus.checkInId,
          })
          setRsvpStatus((d.userStatus.rsvpStatus as 'going' | 'maybe' | 'not_going' | null) || null)
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
        if (user && d.organizer?.id) {
          setIsOrganizer(d.organizer.id === user.id)
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
    const unsubCheckIn = subscribeToEventCheckIn(String(id), handleCheckIn)
    const unsubInterest = subscribeToEventInterest(String(id), handleInterest)

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
        showTray('Sign in required', 'Please sign in to show interest.', [
          { label: 'Not now', onPress: closeTray },
          { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
        ])
        return
      }
      feedback.tap()
      const prevInterested = userInterested
      setUserInterested(!prevInterested)
      setInterestCount((prev) => Math.max(0, prev + (prevInterested ? -1 : 1)))
      const result = await apiClient.toggleInterest(String(id))
      if (!result.success || !result.data) {
        // rollback
        setUserInterested(prevInterested)
        setInterestCount((prev) => Math.max(0, prev + (prevInterested ? 1 : -1)))
        feedback.error()
        showTray('Error', 'Failed to update interest.')
        return
      }
      setUserInterested(result.data.interested)
      setInterestCount(result.data.interestCount || 0)
    } catch {
      feedback.error()
      showTray('Error', 'Failed to update interest.')
    }
  }, [id, user, userInterested, showTray, closeTray, feedback])

  const handleToggleRsvp = useCallback(async () => {
    try {
      if (!id) return
      if (!user) {
        showTray('Sign in required', 'Please sign in to RSVP to events.', [
          { label: 'Not now', onPress: closeTray },
          { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
        ])
        return
      }
      feedback.tap()
      const isCurrentlyGoing = rsvpStatus === 'going'
      const prevStatus = rsvpStatus
      setRsvpStatus(isCurrentlyGoing ? null : 'going')
      if (isCurrentlyGoing) {
        const result = await apiClient.cancelRsvp(String(id))
        if (!result.success) {
          setRsvpStatus(prevStatus)
          feedback.error()
          showTray('Error', 'Failed to cancel RSVP.')
        }
      } else {
        const result = await apiClient.rsvpToEvent(String(id), 'going')
        if (!result.success || !result.data) {
          setRsvpStatus(prevStatus)
          feedback.error()
          showTray('Error', 'Failed to RSVP to event.')
        } else {
          setRsvpStatus(result.data.rsvpStatus as 'going' | 'maybe' | 'not_going' | null)
        }
      }
    } catch {
      feedback.error()
      showTray('Error', 'Failed to update RSVP.')
    }
  }, [id, user, rsvpStatus, showTray, closeTray, feedback])

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
        showTray('Error', 'Failed to load event details.')
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
          start_time: d.startTime || d.start_time || '',
          end_time: d.endTime || d.end_time || '',
          timezone: d.timezone,
          category: d.categories?.[0]?.name || '',
          price_cents: d.priceCents || d.price_cents || 0,
          max_capacity: d.maxCapacity || d.max_capacity || 0,
          current_capacity: d.currentCapacity || d.current_capacity || 0,
          cover_image_url: d.coverImageUrl || d.cover_image_url || '',
          organizer: d.organizer?.name || '',
          latitude: d.latitude ?? 0,
          longitude: d.longitude ?? 0,
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
          setRsvpStatus((d.userStatus.rsvpStatus as 'going' | 'maybe' | 'not_going' | null) || null)
        }
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
          if (d.stats.averageRating != null) setAverageRating(d.stats.averageRating)
          setRatingCount(d.stats.ratingCount || 0)
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
        // Determine if current user is the organizer
        if (user && d.organizer?.id) {
          setIsOrganizer(d.organizer.id === user.id)
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
    return galleryUrls
  }, [galleryUrls])

  const getCurrentLocation = async () => {
    try {
      // Fallback if expo-location is not available
      if (!Location) {
        Logger.warn('events', 'location:moduleUnavailable')
        showTray(
          'Location service not available',
          'Location services are required to check in to events. Please ensure you have the latest version of this app.'
        )
        return null
      }

      // Check if location services are enabled
      const serviceEnabled = await Location.hasServicesEnabledAsync()
      if (!serviceEnabled) {
        Logger.warn('events', 'location:servicesDisabled')
        showTray(
          'Location services disabled',
          'Please enable location services in your device settings to check in to events.',
          [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                Linking.openSettings().catch(() => {})
              }
            }
          ]
        )
        return null
      }

      // Request permission with better messaging
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Logger.warn('events', 'location:permissionDenied')
        showTray(
          'Location permission required',
          'Blendn needs location access to verify you are at events. This keeps check-ins authentic.',
          [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                Linking.openSettings().catch(() => {})
              }
            }
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
        showTray(
          'GPS signal weak',
          `GPS accuracy is ${Math.round(accuracy)}m. Move to a location with better GPS signal for accurate check-ins.`,
          [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Try Again',
              variant: 'primary',
              onPress: () => {
                closeTray()
                getCurrentLocation().catch(() => {})
              },
            },
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
        showTray('Location timeout', 'Unable to get your location. Please try again or move to an area with better GPS signal.')
      } else if (errorCode === 'E_LOCATION_UNAVAILABLE') {
        showTray('Location unavailable', 'Location services are temporarily unavailable. Please try again.')
      } else {
        showTray('Location error', 'Failed to get your current location. Please check your GPS settings and try again.')
      }
      return null
    }
  }

  const handleCheckIn = async (skipRules = false) => {
    if (!skipRules) {
      showTray('Rules and regulations', CHECKIN_RULES_TEXT, [
        { label: 'Cancel', onPress: closeTray },
        {
          label: "I Agree, Continue",
          variant: 'primary',
          onPress: () => {
            closeTray()
            handleCheckIn(true)
          },
        },
      ])
      return
    }

    setCheckingIn(true)

    try {
      Logger.journey('checkin', 'detail:start', { eventId: String(id) })
      if (!user) {
        Logger.journey('auth', 'detail:blocked:notSignedIn')
        showTray('Sign in required', 'Please sign in to check in to events.')
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
          showTray('Already checked in', 'You are already checked in to this event.')
        } else if (result.error?.includes('too far') || result.error?.includes('TOO_FAR')) {
          handleCheckInError({ code: 'TOO_FAR', error: result.error })
        } else {
          feedback.error()
          showTray('Check-in failed', result.error || 'We could not verify your check-in. Please try again.')
        }
      } else {
        Logger.journey('checkin', 'detail:success', { eventId: String(id) })
        feedback.success()

        // Keep user in context and offer next step instead of forcing a full-screen jump.
        showTray(
          'Checked in',
          'You are now checked in. Join the event chat now, or stay on this screen.',
          [
            {
              label: 'Stay here',
              onPress: closeTray,
            },
            {
              label: 'Go to Chat',
              variant: 'primary',
              onPress: async () => {
                closeTray()
                await openEventChat()
              }
            }
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
        showTray('Still checking you in', 'This is taking longer than expected. Please try again.', [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Retry',
            variant: 'primary',
            onPress: () => {
              closeTray()
              handleCheckIn(true)
            }
          }
        ])
      } else {
        feedback.error()
        showTray('Check-in failed', 'Something went wrong. Please try again.')
      }
    } finally {
      setCheckingIn(false)
    }
  }

  const handleCheckInError = (data: any) => {
    switch (data.code) {
      case 'TOO_FAR':
        const distance = Math.round(data.distance_meters || 0)
        const required = data.required_radius || event?.check_in_radius || 100
        showTray(
          'Too far from event',
          `You need to be within ${required}m to check in. You are currently ${distance}m away.`,
          [
            { label: 'Done', onPress: closeTray },
            { label: 'Open Maps', variant: 'primary', onPress: () => { closeTray(); openInMaps() } },
          ]
        )
        break
      case 'ALREADY_CHECKED_IN':
        showTray('Already checked in', 'You have already checked in to this event.')
        break
      case 'EVENT_NOT_FOUND':
        showTray('Event not found', 'This event is no longer available.')
        break
      case 'NO_LOCATION_DATA':
        showTray('Location error', 'Event location data is not available.')
        break
      default:
        showTray('Check-in failed', data.error || 'Unknown error occurred')
    }
  }

  const handleCheckout = async () => {
    setCheckingOut(true)
    try {
      const result = await apiClient.checkOut(String(id))
      if (result.success) {
        feedback.success()
        showTray('Checked out', 'You have been checked out of this event.')
        // Update check-in status directly - no need for another API call
        setCheckInStatus({ success: true, checked_in: false })
      } else {
        feedback.error()
        showTray('Checkout failed', result.error || 'Please try again.')
      }
    } catch (e: any) {
      feedback.error()
      showTray('Error', e?.message || 'Unknown error')
    } finally {
      setCheckingOut(false)
    }
  }

  // === ORGANIZER ACTIONS ===

  const handleSendAnnouncement = async () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Send Announcement',
        'Enter your announcement for all attendees:',
        async (text) => {
          if (!text || !text.trim()) return
          try {
            const result = await apiClient.sendAnnouncement(String(id), text.trim())
            if (result.success) {
              feedback.success()
              showTray('Announcement sent', 'Your announcement has been broadcast to the event chat.')
            } else {
              feedback.error()
              showTray('Failed', result.error || 'Could not send announcement.')
            }
          } catch {
            feedback.error()
            showTray('Error', 'Failed to send announcement.')
          }
        },
        'plain-text'
      )
    } else {
      setAnnouncementText('')
      setShowAnnouncementModal(true)
    }
  }

  const handleSendAnnouncementAndroid = async () => {
    if (!announcementText.trim()) return
    setSendingAnnouncement(true)
    try {
      const result = await apiClient.sendAnnouncement(String(id), announcementText.trim())
      if (result.success) {
        feedback.success()
        setShowAnnouncementModal(false)
        setAnnouncementText('')
        showTray('Announcement sent', 'Your announcement has been broadcast to the event chat.')
      } else {
        feedback.error()
        showTray('Failed', result.error || 'Could not send announcement.')
        setShowAnnouncementModal(false)
      }
    } catch {
      feedback.error()
      showTray('Error', 'Failed to send announcement.')
      setShowAnnouncementModal(false)
    } finally {
      setSendingAnnouncement(false)
    }
  }

  const handleDeleteEvent = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await apiClient.deleteEvent(String(id))
              if (result.success) {
                feedback.success()
                router.back()
              } else {
                feedback.error()
                showTray('Failed', result.error || 'Could not delete event.')
              }
            } catch {
              feedback.error()
              showTray('Error', 'Failed to delete event.')
            }
          },
        },
      ]
    )
  }

  const openInMaps = async () => {
    if (!event) return
    const lat = event.latitude
    const lon = event.longitude
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)
    const addressQuery = encodeURIComponent(event.address || event.venue_name || event.title || 'Event Location')

    const googleScheme = 'comgooglemaps://'
    const googleAppUrl = hasCoords
      ? `${googleScheme}?q=${lat},${lon}`
      : `${googleScheme}?q=${addressQuery}`
    const googleWebUrl = hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
      : `https://www.google.com/maps/search/?api=1&query=${addressQuery}`

    try {
      const canOpenApp = await Linking.canOpenURL(googleScheme)
      if (canOpenApp) return Linking.openURL(googleAppUrl)
    } catch {}
    return Linking.openURL(googleWebUrl)
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

  const formatDate = (dateString: string, tz?: string) => {
    const date = new Date(dateString)
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(tz ? { timeZone: tz, timeZoneName: 'short' } : {}),
    }
    try {
      return date.toLocaleDateString('en-US', opts)
    } catch {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
  }

  const formatHeroDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const isLoading = loading

  const spotsLeft = event ? (event.max_capacity - event.current_capacity) : 0
  const isCheckedIn = checkInStatus?.checked_in || false
  const isEnded = event ? (new Date(event.end_time).getTime() < Date.now()) : false
  const sharedEventId = String(event?.id || id || '')
  const effectiveTopInset = Math.max(6, insets.top - TOP_BAR_INSET_REDUCTION)
  const stickyBarHeight = effectiveTopInset + TOP_BAR_EXTRA_TOP_PADDING + 12 + 36
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

    const img = (src: string | number, w: number, h: number, key: string) => {
      const photoIndex = parseInt(key.replace('g-', ''), 10)
      return (
        <Image
          key={key}
          source={buildImageSource(src, { width: w, height: h }) as any}
          placeholder={placeholderImg}
          style={[styles.galleryImage, { width: Math.round(w), height: Math.round(h) }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessibilityLabel={`Event photo ${photoIndex + 1}`}
        />
      )
    }

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

  const openEventChat = useCallback(async () => {
    try {
      let chatId = eventChatGroupId
      let chatName = event?.title || 'Event Chat'

      if (!chatId && id) {
        const chatResult = await apiClient.getEventChat(String(id))
        if (chatResult.success && chatResult.data?.chatGroupId) {
          chatId = chatResult.data.chatGroupId
          chatName = chatResult.data.chatGroupName || chatName
        }
      }

      if (chatId) {
        const query = `?roomName=${encodeURIComponent(chatName)}&eventTitle=${encodeURIComponent(event?.title || '')}`
        router.replace(`/chat/${chatId}${query}` as any)
        return
      }
    } catch (err) {
      Logger.warn('events', 'openEventChat:failed', { error: err as any })
    }

    router.replace('/(tabs)/chat' as any)
  }, [eventChatGroupId, event?.title, id])

  useEffect(() => {
    const animateTo = (toValue: number, duration: number) => {
      RNAnimated.timing(actionMorph, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    }

    if (checkedInMorphTimeoutRef.current) {
      clearTimeout(checkedInMorphTimeoutRef.current)
      checkedInMorphTimeoutRef.current = null
    }

    if (!isCheckedIn) {
      setActionStage('blend')
      animateTo(0, 220)
      return
    }

    setActionStage('checked')
    animateTo(1, 220)
    checkedInMorphTimeoutRef.current = setTimeout(() => {
      setActionStage('chat')
      animateTo(2, 260)
    }, 900)

    return () => {
      if (checkedInMorphTimeoutRef.current) {
        clearTimeout(checkedInMorphTimeoutRef.current)
        checkedInMorphTimeoutRef.current = null
      }
    }
  }, [isCheckedIn, actionMorph])

  const blendOpacity = actionMorph.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.15, 0],
    extrapolate: 'clamp',
  })
  const checkedOpacity = actionMorph.interpolate({
    inputRange: [0.6, 1, 1.4],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  })
  const chatOpacity = actionMorph.interpolate({
    inputRange: [1.2, 2],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const primaryActionDisabled = checkingIn || checkingOut || actionStage === 'checked'
  const primaryActionPress = () => {
    if (checkingIn || checkingOut) return
    if (!isCheckedIn) {
      handleCheckIn()
      return
    }
    if (actionStage === 'chat') {
      openEventChat()
    }
  }

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {event?.cover_image_url ? (
        <Image source={{ uri: event.cover_image_url }} style={styles.bgImage} contentFit="cover" blurRadius={20} />
      ) : null}
      <LinearGradient
        colors={[gradientPalette.pageTop, gradientPalette.pageBottom]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgScrim}
      />
      {/* Sticky top bar */}
      <View style={[styles.topBarSticky, { paddingTop: effectiveTopInset + TOP_BAR_EXTRA_TOP_PADDING }]}>
        <TouchableOpacity style={styles.navButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{event?.title || ''}</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[styles.navButton, userInterested && styles.navButtonActive]}
            onPress={handleToggleInterest}
            accessibilityRole="button"
            accessibilityLabel={userInterested ? 'Remove from interested events' : 'Mark as interested'}
          >
            <Ionicons name={userInterested ? 'heart' : 'heart-outline'} size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share event">
            <Ionicons name="share-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}>
        <LinearGradient
          colors={[gradientPalette.surfaceTop, gradientPalette.surfaceBottom]}
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
            <SkeletonBlock width={'100%'} height={430} borderRadius={30} />
          ) : (
            <View style={styles.heroCard}>
              <Reanimated.View sharedTransitionTag={`event-image-${sharedEventId}`} style={styles.coverImage}>
                <Image
                  source={(() => {
                    const coverUrl = event!.cover_image_url
                    if (!coverUrl) return placeholderImg
                    const opt = getOptimizedImageUrl(coverUrl, {
                      width,
                      height: 430,
                      resize: 'cover',
                      quality: showHeroHighRes ? 75 : 45,
                      format: 'webp',
                    })
                    return opt && opt !== coverUrl ? { uri: opt } : { uri: coverUrl }
                  })()}
                  placeholder={placeholderImg}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </Reanimated.View>
              <LinearGradient
                colors={[gradientPalette.heroOverlayStart, gradientPalette.heroOverlayEnd]}
                style={styles.heroGradient}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.48)']}
                start={{ x: 0.5, y: 0.25 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroInfoGradient}
              />
              <View style={styles.heroInfo}>
                <Reanimated.Text sharedTransitionTag={`event-title-${sharedEventId}`} style={styles.heroTitle} numberOfLines={2}>
                  {event?.title || ''}
                </Reanimated.Text>
                <View style={styles.heroMetaRow}>
                  <Ionicons name="time-outline" size={13} color="#FFFFFF" />
                  <Reanimated.Text sharedTransitionTag={`event-date-${sharedEventId}`} style={styles.heroMetaText}>
                    {event ? formatHeroDate(event.start_time) : ''}
                  </Reanimated.Text>
                </View>
                <View style={styles.heroMetaRow}>
                  <Ionicons name="location-outline" size={13} color="#FFFFFF" />
                  <Text style={styles.heroMetaText} numberOfLines={1}>{event?.venue_name || 'Location TBA'}</Text>
                </View>
              </View>
            </View>
          )}
          
          <View style={styles.content}>
            <View style={styles.eventInfo} />
            
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
                {!isEnded ? (
                  <View style={styles.statusChip}>
                    <Text style={styles.statusChipText}>{spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}</Text>
                  </View>
                ) : (
                  <View style={[styles.statusChip, styles.statusChipMuted]}>
                    <Text style={styles.statusChipText}>Ended</Text>
                  </View>
                )}
                <Text style={styles.price}>{formatPrice(event!.price_cents)}</Text>
              </View>
            )}

            {(isLoading || interestCount > 0 || (showAvatars && interestedAvatars.length > 0)) && (
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
                  ) : null}
                </>
              )}
              </View>
            )}

          {isLoading || !event?.description ? (
            <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
              <SkeletonLine width={160} style={{ marginBottom: 10 }} />
              {[...Array(3)].map((_, i) => (
                <SkeletonLine key={`ab-${i}`} width={`${90 - i * 10}%`} style={{ marginBottom: 6 }} />
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>About The Event</Text>
              <View style={styles.aboutCard}>
                <Text style={styles.description}>{event.description}</Text>
              </View>
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
                  <Text style={styles.detailsValue}>{formatDate(event!.start_time, event!.timezone)}</Text>
                </View>
                <View style={styles.detailsCard}>
                  <Text style={styles.detailsTitle}>Venue</Text>
                  <Text style={styles.detailsValue} numberOfLines={1}>{event!.venue_name}</Text>
                </View>
                {averageRating != null && ratingCount > 0 && (
                  <View style={styles.detailsCard}>
                    <Text style={styles.detailsTitle}>Rating</Text>
                    <Text style={styles.detailsValue}>
                      {'★'.repeat(Math.round(averageRating))}{'☆'.repeat(5 - Math.round(averageRating))} {averageRating.toFixed(1)} ({ratingCount})
                    </Text>
                  </View>
                )}
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
                <View style={styles.locationCardFrame}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.08)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.locationCardBorder}
                    pointerEvents="none"
                  />
                  <View style={styles.locationCard}>
                    <TouchableOpacity onPress={openInMaps} activeOpacity={0.92}>
                      {showMapImage ? (
                        <Image
                          source={(() => {
                            const lat = event!.latitude
                            const lon = event!.longitude
                            const hasCoords =
                              Number.isFinite(lat) &&
                              Number.isFinite(lon) &&
                              (Math.abs(lat) > 0.0001 || Math.abs(lon) > 0.0001)
                            const mapHeight = 200
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
                            const gmapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
                            const marker = `markers=${lat},${lon}`
                            const darkStyle = 'style=feature:all|element:geometry|color:0x1f1f1f&style=feature:all|element:labels.text.fill|color:0xcfcfcf&style=feature:all|element:labels.text.stroke|color:0x1f1f1f&style=feature:road|element:geometry|color:0x2f2f2f&style=feature:road.highway|element:geometry|color:0x3a3a3a&style=feature:water|element:geometry|color:0x111827&style=feature:poi|element:geometry|color:0x252525'
                            const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=15&size=${mapWidth}x${mapHeight}&scale=2&${marker}&${darkStyle}&key=${gmapsKey}`
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
                  </View>
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
              ) : null}
            </View>

            {isOrganizer && !isLoading && (
              <View style={styles.organizerPanel}>
                <Text style={styles.organizerPanelTitle}>Organizer Tools</Text>
                <View style={styles.organizerButtonRow}>
                  <TouchableOpacity
                    style={[styles.organizerButton, styles.organizerButtonAnnounce]}
                    onPress={handleSendAnnouncement}
                    accessibilityRole="button"
                    accessibilityLabel="Send announcement to attendees"
                  >
                    <Ionicons name="megaphone-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.organizerButtonText}>Announce</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.organizerButton, styles.organizerButtonDelete]}
                    onPress={handleDeleteEvent}
                    accessibilityRole="button"
                    accessibilityLabel="Delete this event"
                  >
                    <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.organizerButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </ScrollView>
      </View>

     
      <View style={styles.tabBar}>
        <ScalePress
          style={[
            styles.blendnButton,
            isCheckedIn && styles.blendnButtonWithSecondary,
            primaryActionDisabled && styles.checkInButtonDisabled
          ]}
          onPress={primaryActionPress}
          disabled={primaryActionDisabled}
          pressedScale={0.975}
          accessibilityRole="button"
          accessibilityLabel={isCheckedIn ? (actionStage === 'chat' ? 'Go to event chat' : 'Checked in') : 'Check in to event'}
        >
          <BlurView intensity={42} tint="dark" style={styles.glassButtonBlur} />
          <LinearGradient
            colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.06)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.glassButtonSheen}
            pointerEvents="none"
          />
          {(checkingIn || checkingOut) ? (
            <View style={styles.actionRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.blendnButtonText}>{checkingIn ? 'Checking in...' : 'Checking out...'}</Text>
            </View>
          ) : (
            <View style={styles.actionLabelStack}>
              <RNAnimated.Text style={[styles.blendnButtonText, styles.actionLabelLayer, { opacity: blendOpacity }]}>
                Blend&apos;n
              </RNAnimated.Text>
              <RNAnimated.Text style={[styles.blendnButtonText, styles.actionLabelLayer, { opacity: checkedOpacity }]}>
                Checked In
              </RNAnimated.Text>
              <RNAnimated.Text style={[styles.blendnButtonText, styles.actionLabelLayer, { opacity: chatOpacity }]}>
                Go to Chat
              </RNAnimated.Text>
            </View>
          )}
        </ScalePress>
        {isCheckedIn && (
          <ScalePress
            style={[styles.secondaryActionButton, checkingOut && styles.checkInButtonDisabled]}
            onPress={handleCheckout}
            disabled={checkingOut}
            accessibilityRole="button"
            accessibilityLabel="Check out of event"
            pressedScale={0.96}
          >
            <BlurView intensity={36} tint="dark" style={styles.glassButtonBlur} />
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.glassButtonSheen}
              pointerEvents="none"
            />
            {checkingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="exit-outline" size={20} color="#FFFFFF" />
            )}
          </ScalePress>
        )}
        {!isCheckedIn && !isLoading && (
          <ScalePress
            style={[
              styles.secondaryActionButton,
              rsvpStatus === 'going' && styles.rsvpButtonActive,
            ]}
            onPress={handleToggleRsvp}
            accessibilityRole="button"
            accessibilityLabel={rsvpStatus === 'going' ? 'Cancel RSVP' : 'RSVP as going'}
            pressedScale={0.96}
          >
            <BlurView intensity={36} tint="dark" style={styles.glassButtonBlur} />
            <LinearGradient
              colors={
                rsvpStatus === 'going'
                  ? ['rgba(94,234,141,0.32)', 'rgba(34,197,94,0.12)']
                  : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']
              }
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.glassButtonSheen}
              pointerEvents="none"
            />
            <Ionicons
              name={rsvpStatus === 'going' ? 'checkmark-circle' : 'calendar-outline'}
              size={20}
              color={rsvpStatus === 'going' ? '#4ade80' : '#FFFFFF'}
            />
          </ScalePress>
        )}
      </View>
      <ActionTray
        visible={trayState.visible}
        title={trayState.title}
        message={trayState.message}
        buttons={trayState.buttons}
        onClose={closeTray}
      />

      {/* Announcement modal for Android (iOS uses Alert.prompt) */}
      <Modal
        visible={showAnnouncementModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnnouncementModal(false)}
      >
        <View style={styles.announcementOverlay}>
          <View style={styles.announcementModal}>
            <Text style={styles.announcementModalTitle}>Send Announcement</Text>
            <Text style={styles.announcementModalSubtitle}>
              This message will be broadcast to all event attendees.
            </Text>
            <TextInput
              style={styles.announcementInput}
              placeholder="Enter your announcement..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={announcementText}
              onChangeText={setAnnouncementText}
              multiline
              maxLength={1000}
              autoFocus
            />
            <View style={styles.announcementModalButtons}>
              <TouchableOpacity
                style={[styles.announcementModalBtn, styles.announcementModalBtnCancel]}
                onPress={() => { setShowAnnouncementModal(false); setAnnouncementText('') }}
              >
                <Text style={styles.announcementModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.announcementModalBtn, styles.announcementModalBtnSend, !announcementText.trim() && { opacity: 0.5 }]}
                onPress={handleSendAnnouncementAndroid}
                disabled={!announcementText.trim() || sendingAnnouncement}
              >
                {sendingAnnouncement ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.announcementModalBtnText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
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
    backgroundColor: APP_COLORS.backgroundBase,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: APP_COLORS.textPrimary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: APP_COLORS.textPrimary,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: APP_COLORS.destructive,
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
    height: 430,
    backgroundColor: '#1A1A1A',
    borderRadius: 30,
  },
  heroCard: {
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroInfoGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
  heroInfo: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  heroMetaText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    marginLeft: 6,
    flexShrink: 1,
  },
  content: {
    flex: 1,
    marginTop: 8,
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
    marginBottom: 12,
    marginTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryContainer: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  categoryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 'auto',
  },
  statusChip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusChipMuted: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  attendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    marginHorizontal: 14,
    paddingVertical: 10,
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
    fontSize: 17,
    color: '#FFFFFF',
    marginBottom: 7,
    paddingHorizontal: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  aboutCard: {
    marginHorizontal: 14,
    marginBottom: 16,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
    marginBottom: 0,
    paddingHorizontal: 0,
  },
  locationCardFrame: {
    marginBottom: 16,
    marginHorizontal: 14,
    borderRadius: 20,
    overflow: 'hidden',
    padding: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  locationCardBorder: {
    ...StyleSheet.absoluteFillObject,
  },
  locationCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(26,16,37,0.55)',
  },
  locationImage: {
    width: '100%',
    height: 200,
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
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  detailsCard: {
    width: (width - (CONTENT_HORIZONTAL_PADDING * 2) - 12) / 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
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
    opacity: 0.58,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    padding: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    overflow: 'hidden',
  },
  blendnButtonWithSecondary: {
    flex: 1,
    width: 'auto',
    flexShrink: 1,
    minWidth: 0,
  },
  blendnButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  actionLabelStack: {
    height: 24,
    width: '100%',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabelLayer: {
    position: 'absolute',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryActionButton: {
    width: 52,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  rsvpButtonActive: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.5)',
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
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#111214',
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
  topBarActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButtonActive: {
    backgroundColor: 'rgba(255, 79, 122, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(18,18,19,0.45)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  glassButtonBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  glassButtonSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  // Organizer tools panel
  organizerPanel: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  organizerPanelTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  organizerButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  organizerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  organizerButtonAnnounce: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: 'rgba(99,102,241,0.5)',
  },
  organizerButtonDelete: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  organizerButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  // Announcement modal (Android)
  announcementOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  announcementModal: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  announcementModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  announcementModalSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  announcementInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    color: '#FFFFFF',
    fontSize: 15,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  announcementModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  announcementModalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  announcementModalBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  announcementModalBtnSend: {
    backgroundColor: APP_COLORS.accent,
    borderColor: 'transparent',
  },
  announcementModalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})
