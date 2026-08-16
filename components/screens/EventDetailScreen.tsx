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
import { getDistanceMetres } from '../../lib/geo'
import { apiClient, type RsvpStatus } from '../../lib/apiClient';
import { Logger } from '../../lib/logger';
import { NotificationHelpers } from '../../lib/notifications';
import { getOptimizedImageUrl } from '../../lib/photoUtils';
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient';
import { APP_COLORS, EMBER } from '../../lib/theme';
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
const TOP_BAR_EXTRA_TOP_PADDING = 0
const TOP_BAR_INSET_REDUCTION = 24

/*
 * The Scene — frame `1141:4853`, 390 wide. See `docs/SCENE.md`.
 *
 * Type is used at the frame's own values because that is what this codebase
 * already does: `EMBER_TYPE.screenTitle` ships 48/-2.4 unscaled, and the
 * frame's "The Experience" is 16/24 exactly like `sectionHeading`. Only
 * *layout* is scaled, and only where it is genuinely proportional.
 *
 * The hero is one of those: it is a photograph, so its shape has to survive the
 * change of screen width rather than its absolute height. 574 on a 390 frame is
 * an aspect, not a number of points.
 */
const HERO_ASPECT = 390 / 574
const HERO_HEIGHT = Math.round(width / HERO_ASPECT)
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

export default function EventDetail() {
  const { id, title, cover, venue, city, start, end, category, description: descriptionParam, interestCount: interestCountParam } = useLocalSearchParams()
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
  /*
   * `waitlisted` is included because the server can return it.
   *
   * A full event answers `waitlisted` rather than `going` (API 0.51.0) and
   * promotes whoever waited longest when a seat frees. This state was typed
   * without it and the three reads below cast the response to fit, so someone
   * on the waitlist saw a green "Going" tick -- and would have turned up to an
   * event they had no seat at.
   */
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | null>(null)
  const [eventChatGroupId, setEventChatGroupId] = useState<string | null>(null)
  const [showMapImage, setShowMapImage] = useState(false)
  const [showHeroHighRes, setShowHeroHighRes] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [trayState, setTrayState] = useState<EventDetailTrayState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  })
  const lastFetchRef = React.useRef<number>(0)
  const actionMorph = React.useRef(new RNAnimated.Value(0)).current
  const checkedInMorphTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [actionStage, setActionStage] = useState<'blend' | 'checked' | 'chat'>('blend')
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
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
          setRsvpStatus((d.userStatus.rsvpStatus as RsvpStatus | null) || null)
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
    const task = InteractionManager.runAfterInteractions(() => {})
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
      // Waitlisted counts as "already committed": tapping should take you off
      // the list, not try to RSVP again. Treating it as not-going would send a
      // second RSVP and leave the user unable to withdraw.
      const isCommitted = rsvpStatus === 'going' || rsvpStatus === 'waitlisted'
      const prevStatus = rsvpStatus
      setRsvpStatus(isCommitted ? null : 'going')
      if (isCommitted) {
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
          setRsvpStatus(result.data.rsvpStatus)
          if (result.data.rsvpStatus === 'waitlisted') {
            // Say it plainly. An amber icon alone would let someone believe
            // they have a place and turn up to an event that is full.
            showTray(
              "You're on the waitlist",
              "This event is full. We'll let you know if a place frees up — you'll be first in line in the order you joined."
            )
          }
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
      const distance = getDistanceMetres(
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
          setRsvpStatus((d.userStatus.rsvpStatus as RsvpStatus | null) || null)
        }
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
          if (d.stats.averageRating != null) setAverageRating(d.stats.averageRating)
          setRatingCount(d.stats.ratingCount || 0)
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

  /**
   * The hero's date, without the time.
   *
   * This used to return both in one string. The frame gives them separate
   * slots with their own icons — a calendar and a clock — and a single blob
   * under a calendar icon reads as the wrong label for half of what it says.
   */
  const formatHeroDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  /**
   * "21:00 — 02:00", or "21:00 — Late" when the end lands on another day.
   *
   * The frame draws "21:00 — Late", and "Late" is the honest word for it:
   * printing "02:00" beside a 21:00 start reads as ending *before* it began
   * unless you also print the date, which is more chrome than a hero meta row
   * can carry. Rolling past midnight is the normal case for these events, so
   * this is the common path rather than an edge case.
   */
  const formatHeroTimeRange = (startString: string, endString?: string | null) => {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
    const start = new Date(startString)
    const startLabel = start.toLocaleTimeString('en-GB', opts)
    if (!endString) return startLabel
    const end = new Date(endString)
    if (Number.isNaN(end.getTime())) return startLabel
    const sameDay = start.toDateString() === end.toDateString()
    return `${startLabel} — ${sameDay ? end.toLocaleTimeString('en-GB', opts) : 'Late'}`
  }

  const isLoading = loading

  const spotsLeft = event ? (event.max_capacity - event.current_capacity) : 0
  const isCheckedIn = checkInStatus?.checked_in || false
  const isEnded = event ? (new Date(event.end_time).getTime() < Date.now()) : false
  const sharedEventId = String(event?.id || id || '')
  const effectiveTopInset = Math.max(6, insets.top - TOP_BAR_INSET_REDUCTION)
  const stickyBarHeight = effectiveTopInset + TOP_BAR_EXTRA_TOP_PADDING + 12 + 36

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
      {/*
        Flat #0F0E0E, which is what the frame specifies for the whole page.

        This was a blurred copy of the cover at 58% opacity under a gradient
        generated from a hash of the event id, so every event washed the screen
        — chrome, surfaces and all — in its own hue. Measured on a test event it
        was painting the top bar rgb(20,52,46): green. The frame's page is one
        flat near-black with #141313 cards on it, and the colour in the design
        comes from the accent and the photography, not from tinting the
        furniture.
      */}
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

      {/*
        The content scrolls the page, not a sheet on top of it.

        This was an absolutely-positioned panel pinned below the top bar with a
        30pt radius, a light border and its own gradient — a bottom sheet the
        hero peeked out from behind. The frame has no such object: the hero
        dissolves into the page and the sections sit directly on it, which is
        also why the hero can be full-bleed now. The sheet was what forced it to
        be a card.
      */}
      <View style={styles.sectionBg}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
        >
          {isLoading ? (
            <SkeletonBlock width={'100%'} height={HERO_HEIGHT} borderRadius={0} />
          ) : (
            <View style={styles.heroCard}>
              <Reanimated.View sharedTransitionTag={`event-image-${sharedEventId}`} style={styles.coverImage}>
                <Image
                  source={(() => {
                    const coverUrl = event!.cover_image_url
                    if (!coverUrl) return placeholderImg
                    const opt = getOptimizedImageUrl(coverUrl, {
                      width,
                      height: HERO_HEIGHT,
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
              {/*
                The photograph is not tinted. A second gradient used to sit here
                in a hue derived from the event's id, so the organiser's image
                was recoloured by a hash of its primary key. The frame has one
                gradient over the hero and it is neutral.
              */}
              {/*
                Transparent to the page's own background, not to black. The
                frame ends this gradient on #0F0E0E so the photograph dissolves
                into the screen rather than into a darker band sitting on it —
                the same "nobody diffs two blacks" trap the launch overlay hit.
              */}
              <LinearGradient
                colors={['rgba(15,14,14,0)', EMBER.bg]}
                start={{ x: 0.5, y: 0.25 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroInfoGradient}
              />
              <View style={styles.heroInfo}>
                {/*
                  Driven by real capacity, not decoration. The frame draws this
                  unconditionally, but an event with no cap is not limited
                  access and saying so would be a lie the card tells on every
                  event. `max_capacity` of 0 means uncapped.
                */}
                {event && event.max_capacity > 0 ? (
                  <View style={styles.heroPill}>
                    <Text style={styles.heroPillText}>LIMITED ACCESS</Text>
                  </View>
                ) : null}
                <Reanimated.Text sharedTransitionTag={`event-title-${sharedEventId}`} style={styles.heroTitle} numberOfLines={2}>
                  {event?.title || ''}
                </Reanimated.Text>
                {/*
                  Date and time, side by side — the venue moved out of the hero
                  and into the Location card, which is where the frame puts it
                  and where the address it belongs with already lives.
                */}
                <View style={styles.heroMetaRow}>
                  <View style={styles.heroMetaItem}>
                    <Ionicons name="calendar-outline" size={18} color={EMBER.textSecondary} />
                    <Reanimated.Text sharedTransitionTag={`event-date-${sharedEventId}`} style={styles.heroMetaText}>
                      {event ? formatHeroDate(event.start_time) : ''}
                    </Reanimated.Text>
                  </View>
                  <View style={styles.heroMetaItem}>
                    <Ionicons name="time-outline" size={18} color={EMBER.textSecondary} />
                    <Text style={styles.heroMetaText} numberOfLines={1}>
                      {event ? formatHeroTimeRange(event.start_time, event.end_time) : ''}
                    </Text>
                  </View>
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

            {(isLoading || interestCount > 0) && (
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
                  {/*
                    Anonymous discs, not faces.

                    This row used to render `interestedPreview` — real
                    photographs of everyone who had favourited the event, from an
                    endpoint that handed them to any authenticated caller with no
                    identity gate. The server stopped sending them (blendn-admin
                    #229) and this stops asking for them.

                    Favouriting is a private act: unlike the roster it has no
                    check-in, no pseudonym and no reveal, so nobody who used it
                    consented to being shown. The count is the social proof the
                    design actually asks for — the frame leads with "124+" and
                    the faces were decoration on top of it.

                    The discs stay because the composition needs a mass beside
                    the number, and three grey circles say "several people"
                    without saying which.
                  */}
                  {interestCount > 0 ? (
                    <View
                      style={[
                        styles.avatarsRow,
                        { width: 35 + (Math.min(interestCount, 3) - 1) * 16 },
                      ]}
                    >
                      {Array.from({ length: Math.min(interestCount, 3) }).map((_, idx) => (
                        <View
                          key={`interested-${idx}`}
                          style={[styles.avatarCircle, { left: idx * 16 }]}
                        />
                      ))}
                    </View>
                  ) : null}
                  {interestCount > 0 ? (
                    <Text style={styles.attendingText}>
                      {interestCount === 1
                        ? '1 person is interested'
                        : `${interestCount} people are interested`}
                    </Text>
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
              {/*
                "Blend in", not "Blend'n".

                This button checks you in. It was labelled with the *brand* —
                the noun — which names the product rather than the action, and
                left the one control on the screen saying nothing about what
                pressing it does. The name works here precisely because it is
                also a verb, and the other two stages of this morph are already
                verbs ("Go to Chat"), so the noun was the odd one out.

                Same label the Scene's floating CTA uses; `SceneSections.tsx`
                carries the reasoning. Pinned by `__tests__/sceneCta.test.ts` so
                the two surfaces cannot drift apart again.
              */}
              <RNAnimated.Text style={[styles.blendnButtonText, styles.actionLabelLayer, { opacity: blendOpacity }]}>
                Blend in
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
              (rsvpStatus === 'going' || rsvpStatus === 'waitlisted') && styles.rsvpButtonActive,
            ]}
            onPress={handleToggleRsvp}
            accessibilityRole="button"
            accessibilityLabel={
              rsvpStatus === 'waitlisted'
                ? 'On the waitlist. Tap to leave it'
                : rsvpStatus === 'going'
                  ? 'Cancel RSVP'
                  : 'RSVP as going'
            }
            pressedScale={0.96}
          >
            <BlurView intensity={36} tint="dark" style={styles.glassButtonBlur} />
            <LinearGradient
              colors={
                rsvpStatus === 'going'
                  ? ['rgba(94,234,141,0.32)', 'rgba(34,197,94,0.12)']
                  : rsvpStatus === 'waitlisted'
                    // Amber, not green: on the list is not the same as in.
                    ? ['rgba(251,191,36,0.32)', 'rgba(217,119,6,0.12)']
                    : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']
              }
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.glassButtonSheen}
              pointerEvents="none"
            />
            <Ionicons
              name={
                rsvpStatus === 'going'
                  ? 'checkmark-circle'
                  : rsvpStatus === 'waitlisted'
                    ? 'hourglass-outline'
                    : 'calendar-outline'
              }
              size={20}
              color={
                rsvpStatus === 'going' ? '#4ade80' : rsvpStatus === 'waitlisted' ? '#fbbf24' : '#FFFFFF'
              }
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
    height: HERO_HEIGHT,
    backgroundColor: '#1A1A1A',
  },
  /*
   * Full bleed, no card.
   *
   * This was inset 10pt with a 30pt radius and a hairline border — a card
   * floating on the page. The frame runs the photograph edge to edge and
   * dissolves its foot into the background, so the border and the radius are
   * not smaller versions of the design, they are a different idea.
   */
  heroCard: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
  },
  /*
   * The full hero, not a 180pt band at its foot.
   *
   * The frame's gradient is `inset-0` — it spans the whole photograph. At 180
   * it was sized for the old 430pt card; against a hero half again as tall the
   * 48pt title would start above the gradient's top edge and sit on bare
   * photograph, which is exactly the case the bloom shadow cannot rescue.
   */
  heroInfoGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  /* 32pt inset on all sides, bottom-aligned, 16pt between the three blocks. */
  heroInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 32,
    gap: 16,
    alignItems: 'flex-start',
  },
  heroPill: {
    backgroundColor: 'rgba(255,144,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,144,109,0.2)',
    borderRadius: 9999,
    paddingHorizontal: 17,
    paddingVertical: 7,
  },
  heroPillText: {
    color: EMBER.accent,
    fontSize: 16,
    lineHeight: 24,
    // Tracking on the real glyphs, so the string is uppercased rather than
    // `textTransform`ed — same rule as EMBER_TYPE.eyebrow and link.
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 48,
    lineHeight: 43.2,
    letterSpacing: -2.4,
    fontWeight: '800',
    // The frame's 0 0 30px rgba(255,144,109,0.3) — the warm bloom that keeps
    // 48pt of white legible over an arbitrary photograph.
    textShadowColor: 'rgba(255,144,109,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMetaText: {
    color: EMBER.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
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
  /* Just the page. See the note at its use site for what this used to be. */
  sectionBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: EMBER.bg,
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
  /*
   * Layout only. It used to be a second sheet of glass.
   *
   * This carried its own fill (`rgba(18,18,19,0.45)`), its own hairline border,
   * its own 22pt radius and `overflow: 'hidden'` — a translucent tray holding
   * two translucent buttons, each with a hairline of its own. Two nested sheets
   * of glass do not read as depth, they read as a smudge with two outlines: the
   * tray's edge and the pill's edge run parallel 8pt apart and neither one is
   * the thing you are meant to press.
   *
   * The buttons already carry a `BlurView`, a sheen and a border each. They are
   * the objects. This is the row they sit in.
   *
   * `left/right: 16` plus `paddingHorizontal: 8` puts the pill's edge at 24 —
   * `SCENE_CTA_INSET`, the gutter the frame gives the floating CTA. Left as it
   * was rather than collapsed into one number, because that is what it already
   * measured and changing it would move the button for no reason.
   */
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
