import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { SkeletonBlock } from '../Skeleton';
import { getDistanceMetres } from '../../lib/geo'
import { checkInRefusal, CHECK_IN_CODES } from '../../lib/checkInRefusal'
import { amenityTiles, type ServerAmenity } from '../../lib/amenityTile'
import { eventDetailBlocks, type ServerEventDetails } from '../../lib/eventDetails'
import { showEventReportOptions } from '../../lib/safetyUtils'
import { apiClient, type RsvpStatus } from '../../lib/apiClient';
import { Logger } from '../../lib/logger';
import { NotificationHelpers } from '../../lib/notifications';
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient';
import { EMBER, EMBER_TYPE } from '../../lib/theme';
import { PulseTopBar } from '../pulse/PulseTopBar';
import { SceneHero } from '../scene/SceneHero';
import { SceneLightbox } from '../scene/SceneLightbox';
import {
  SCENE_CTA_HEIGHT,
  SCENE_CTA_ICON,
  SCENE_CTA_INSET,
  SCENE_PADDING_HORIZONTAL,
  SCENE_SECTION_GAP,
  AMENITY_TINTS,
  SceneAmenity,
  SceneAttendees,
  SceneBody,
  SceneBodyAccent,
  SceneCTA,
  SceneGallery,
  SceneHeading,
  SceneLocationCard,
  SceneMap,
  SceneDetails,
  type SceneCTAState,
} from '../scene/SceneSections';
import { clipFirst, feedPlaylist } from '../../lib/feedMedia';
import { highlightEntities } from '../../lib/entityHighlight';
import { heroPillLabel } from '../../lib/scarcity';
import { useAuth } from '../../lib/useAuth';
import { useInteractionFeedback } from '../../lib/useInteractionFeedback';
import { getEventDetailCache, setEventDetailCache } from '../../lib/eventDetailCache';

interface EventDetailData {
  /** Curated facilities, already in the vocabulary's `sort_order`. */
  amenities?: EventAmenity[]
  /** What the organiser wrote: house rules, FAQ, accessibility, and the rest. */
  details?: ServerEventDetails
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
  /**
   * Everything the organiser uploaded, which the screen has always been sent
   * and never read.
   *
   * `EventDetailSchema` returns `media: [{ id, url, type }]` and the fetch
   * below mapped every other field and dropped this one -- so the Scene showed
   * one cover image while the event had a gallery and, since #244, video. The
   * hero and the gallery are the two things the frame is mostly made of.
   */
  media?: { id: string; url: string; type: string; thumbnail_url?: string | null; order?: number | null }[]
}

type EventAmenity = ServerAmenity

interface CheckInStatus {
  success: boolean
  checked_in: boolean
  /**
   * The raw status, which answers a different question from `checked_in`.
   *
   * `checked_in` is "are you inside now" and goes false at checkout — including
   * the automatic one. Whether you *were* here is `status !== null`, and the
   * server has been sending it as `userStatus.checkInStatus` the whole time
   * with nothing reading it. Without it there is no way to tell somebody who
   * attended from somebody who merely opened the page.
   */
  status?: string | null
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
  const [event, setEvent] = useState<EventDetailData | null>(() => {
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
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  // Initialize from params for instant display
  const [checkInCount, setCheckInCount] = useState(0)
  const [goingCount, setGoingCount] = useState(0)
  const [interestCount, setInterestCount] = useState<number>(() => {
    if (interestCountParam && typeof interestCountParam === 'string') {
      const parsed = parseInt(interestCountParam, 10)
      return Number.isNaN(parsed) ? 0 : parsed
    }
    return 0
  })
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
  /** Which gallery item the lightbox is on, or null when it is closed. */
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [announcementText, setAnnouncementText] = useState('')
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editShortDescription, setEditShortDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
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
          media: Array.isArray(d.media) ? d.media : [],
          amenities: Array.isArray(d.amenities) ? (d.amenities as EventAmenity[]) : [],
          details: (d.details ?? undefined) as ServerEventDetails | undefined,
        })
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
          // Both, because the Attendees block reports a different one either
          // side of the doors -- see `attendeeBlock` below.
          setCheckInCount(d.stats.checkInCount || 0)
          setGoingCount(d.stats.rsvpCount || 0)
        }
        if (d.userStatus) {
          setUserInterested(d.userStatus.isFavorited || false)
          setCheckInStatus({
            success: true,
            checked_in: d.userStatus.isCheckedIn || false,
            status: d.userStatus.checkInStatus ?? null,
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
    // fetchEventDetails is redefined every render, and `user` there is only
    // read to set the organizer flag inside its own callback — adding either
    // would refetch on every render/auth-object refresh instead of once per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Deferred loading for smoother navigation - reduced delays for faster perceived loading
  useEffect(() => {
    setShowMapImage(false)
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

  /*
   * The progressive-hero effect is gone with the old render.
   *
   * It swapped a low-res cover for a high-res one after interactions settled.
   * `SceneHero` hands its media to `expo-image` with `cachePolicy` and a
   * transition, and `SceneHeroMedia` owns the pager -- so this was a second,
   * cruder implementation of a thing the component already does.
   */

  useEffect(() => {
    // Check proximity when user location changes
    if (userLocation && event) {
      checkProximityStatus()
    }
    // checkProximityStatus is redefined every render; only the listed values
    // should trigger a proximity check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // fetchEventDetails is redefined every render; only id/user should
    // re-establish these subscriptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Hoisted out of the `try` so the `catch` can put it back: a thrown
    // request (timeout, no network) left the optimistic "You're going" on
    // screen with no row behind it. Only the `!result.success` branches
    // rolled back. Seen on the simulator when the RSVP call timed out.
    const prevStatus = rsvpStatus
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
      setRsvpStatus(prevStatus)
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

      /*
       * Logged, not stored.
       *
       * `proximityStatus` was written here and read by nothing -- the old
       * render showed a distance readout, the frame has none, and the CTA
       * derives availability from the clock while the server re-validates the
       * GPS on the actual check-in. Keeping the journey log: it is how a failed
       * check-in gets diagnosed after the fact.
       */
      const isNearby = distance <= (event.check_in_radius || 100)
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
        // Map API response (camelCase) to EventDetailData interface (snake_case)
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
          media: Array.isArray(d.media) ? d.media : [],
          amenities: Array.isArray(d.amenities) ? (d.amenities as EventAmenity[]) : [],
          details: (d.details ?? undefined) as ServerEventDetails | undefined,
        })
        // Set interest info and check-in status from userStatus
        if (d.userStatus) {
          setUserInterested(d.userStatus.isFavorited || false)
          // Set check-in status from event detail response - no separate API call needed
          setCheckInStatus({
            success: true,
            checked_in: d.userStatus.isCheckedIn || false,
            status: d.userStatus.checkInStatus ?? null,
            check_in_id: d.userStatus.checkInId,
          })
          setRsvpStatus((d.userStatus.rsvpStatus as RsvpStatus | null) || null)
        }
        if (d.stats) {
          setInterestCount(d.stats.favoriteCount || 0)
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
      // fetchEventDetails is redefined every render; only id/loading should
      // gate the on-focus refresh.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
        longitude: location.coords.longitude,
        /*
         * The number the server has been asking for and never receiving.
         *
         * It is read six lines above to refuse a weak fix, and was then dropped
         * at this return — so `deviceInfo.gpsAccuracy` was `undefined` on every
         * check-in the app has ever sent, and four separate server mechanisms
         * that read it saw nothing:
         *
         *   - `MAX_GPS_ACCURACY_METERS` (150m) — unreachable, so the ceiling is
         *     whatever this file happens to enforce
         *   - `evaluateCheckIn`'s allowance — every fix judged as the assumed
         *     35m rather than as itself
         *   - `check_in_refusals.accuracy_metres` — the column that exists to
         *     tell a wrong pin from bad phones. Measured on staging: **zero**
         *     rows written by the API carry one
         *   - `presence_sessions.last_accuracy` — 37 sessions, none with a value
         *
         * `accuracy` is nullable on iOS and Android both, so it is passed
         * through as-is rather than coerced; `accuracyAllowance` already treats
         * null as "no information" and applies the assumed value.
         */
        accuracy: location.coords.accuracy ?? null,
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
          // `gpsAccuracy` is the key the route reads — `deviceInfo?.gpsAccuracy`
          // — not a top-level field. Sending it anywhere else is the same as
          // not sending it.
          deviceInfo: { platform: Platform.OS, gpsAccuracy: location.accuracy }
        }),
        12000
      )

      if (!result.success) {
        Logger.error('events', 'checkin:api:error', {
          error: result.error,
          code: result.errorCode,
        })

        /*
         * Dispatch on the server's code, never on its sentence.
         *
         * This matched `'too far'` against a message that reads "outside the
         * check-in area", so the one refusal a map can fix was the only one
         * that never offered a map. See `lib/checkInRefusal.ts`.
         */
        const refusal = checkInRefusal(result.errorCode, result.error)

        if (result.errorCode === CHECK_IN_CODES.ALREADY_CHECKED_IN) {
          Logger.journey('checkin', 'detail:alreadyCheckedIn')
          setCheckInStatus({ success: true, checked_in: true })
        } else {
          feedback.error()
        }

        showTray(
          refusal.title,
          refusal.message,
          refusal.offerDirections
            ? [
                { label: 'Done', onPress: closeTray },
                {
                  label: 'Open Maps',
                  variant: 'primary',
                  onPress: () => {
                    closeTray()
                    openInMaps()
                  },
                },
              ]
            : undefined
        )
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

  /*
   * `handleCheckout` lived here and is gone -- the control moved, it was not
   * dropped.
   *
   * The CTA is one slot whose subject changes with the clock, so there is no
   * second control on this screen to hang it from. When you are checked in the
   * CTA reads "You're in" and opens the room, and check out is in the room's
   * top bar -- one tap from here. The Pulse's long-press tray has it too.
   *
   * `apiClient.checkOut` is called from both of those, so this was the third
   * copy of a flow with two homes already.
   */

  // === ORGANIZER ACTIONS ===

  /*
   * One composer, both platforms.
   *
   * iOS used `Alert.prompt` and Android this modal, for one action — and the
   * iOS half was the worse of the two in three ways that all point the same
   * direction: no character limit against the server's 1,000, no pending
   * state, and **no disable while sending**, so a second tap sent a second
   * announcement to every attendee in the room. A system dialog also cannot
   * carry the app's design, which is the whole reason the modal was written.
   *
   * `Alert.prompt` is iOS-only, so the modal was already the general answer;
   * it was simply never used where the shortcut existed.
   */
  const openAnnouncementComposer = () => {
    setAnnouncementText('')
    setShowAnnouncementModal(true)
  }

  const sendAnnouncement = async () => {
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

  const openEditComposer = () => {
    if (!event) return
    setEditTitle(event.title)
    setEditDescription(event.description)
    setEditShortDescription(event.short_description)
    setShowEditModal(true)
  }

  const saveEventEdit = async () => {
    if (!editTitle.trim()) return
    setSavingEdit(true)
    try {
      const result = await apiClient.updateEvent(String(id), {
        title: editTitle.trim(),
        description: editDescription.trim(),
        shortDescription: editShortDescription.trim(),
      })
      if (result.success) {
        feedback.success()
        setShowEditModal(false)
        setEvent((prev) =>
          prev
            ? {
                ...prev,
                title: editTitle.trim(),
                description: editDescription.trim(),
                short_description: editShortDescription.trim(),
              }
            : prev
        )
        showTray('Event updated', 'Your changes have been saved.')
      } else {
        feedback.error()
        showTray('Failed', result.error || 'Could not update event.')
        setShowEditModal(false)
      }
    } catch {
      feedback.error()
      showTray('Error', 'Failed to update event.')
      setShowEditModal(false)
    } finally {
      setSavingEdit(false)
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




  /**
   * The hero's date, without the time.
   *
   * This used to return both in one string. The frame gives them separate
   * slots with their own icons — a calendar and a clock — and a single blob
   * under a calendar icon reads as the wrong label for half of what it says.
   */

  /**
   * "21:00 — 02:00", or "21:00 — Late" when the end lands on another day.
   *
   * The frame draws "21:00 — Late", and "Late" is the honest word for it:
   * printing "02:00" beside a 21:00 start reads as ending *before* it began
   * unless you also print the date, which is more chrome than a hero meta row
   * can carry. Rolling past midnight is the normal case for these events, so
   * this is the common path rather than an edge case.
   */

  const isLoading = loading
  const isCheckedIn = checkInStatus?.checked_in || false
  /*
   * Were you here — not are you here now. A check-in row exists whatever the
   * current status, and auto-checkout makes `checked_in` false for most people
   * by the time the event ends.
   */
  const attended = !!checkInStatus?.status
  const isEnded = event ? (new Date(event.end_time).getTime() < Date.now()) : false

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


  /*
   * `rate` is never disabled. Every other post-doors state routes through
   * `actionStage`, which is about checking in and is meaningless once the event
   * is over — leaving it in charge here would disable the button for anyone who
   * had checked in, which is precisely everyone this state exists for.
   */
  const primaryActionDisabled =
    isEnded && attended ? false : checkingIn || actionStage === 'checked'
  const primaryActionPress = () => {
    /*
     * The night is over and you were here. `PLACEHOLDER_SCREENS.md` asks for
     * "an entry point after an event ends"; the screen it opens has been built,
     * tested and reachable from nowhere since it was written.
     *
     * First branch on purpose — every check below asks a question about
     * checking in, which cannot happen any more.
     */
    if (isEnded && attended) {
      router.push({ pathname: '/rate/[eventId]', params: { eventId: String(id) } as any })
      return
    }
    if (checkingIn) return
    // Before the doors, the button is the RSVP and its own off-switch.
    if (!isCheckedIn && !hasStarted) {
      void handleToggleRsvp()
      return
    }
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

  /*
   * Everything the organiser uploaded, as one list.
   *
   * `clipFirst`, and the wrapper is the whole point -- `feedPlaylist` alone
   * leads with the cover, which is right for a card in a feed and wrong here.
   * `clipFirst`'s own note says why: opening the event is a different act, the
   * person has committed a tap, the hero is two thirds of the screen, and the
   * clip is the best thing the organiser uploaded. Calling the bare
   * `feedPlaylist` buried every video behind the stills.
   */
  const playlist = clipFirst(feedPlaylist(event?.media, event?.cover_image_url))

  /*
   * Accented mid-paragraph by exact match against things the payload already
   * carries -- never by a model. See `lib/entityHighlight.ts`.
   */
  const entities = [event?.title, event?.venue_name, event?.city, event?.category].filter(
    (e): e is string => !!e && e.length > 2
  )

  /*
   * One control, and what it offers depends on the clock.
   *
   * "Blend in" is a check-in, and a check-in needs the event to be **running**
   * -- the server re-validates the time and `pickInsideEvent` requires
   * `start <= now`. So on an event two days out the button was offering the one
   * action that cannot succeed. A dead control in the most prominent position
   * on the screen is the exact fault the centre nav button was redesigned to
   * stop having.
   *
   * Before the doors it offers the thing that *is* available. After they open
   * it becomes the check-in. That also retires the secondary "I'm going" pill
   * this screen briefly grew: RSVP was never a second action alongside
   * checking in, it is the same slot at an earlier hour.
   */
  const hasStarted = event ? new Date(event.start_time).getTime() <= Date.now() : false
  const rsvpd = rsvpStatus === 'going' || rsvpStatus === 'waitlisted'

  /*
   * The count means two different things either side of the doors.
   *
   * Before an event starts nobody has checked in, so an "Attendees" heading
   * over a dash is the screen reporting emptiness for a night that has not
   * happened yet. What is true then is how many people said they are coming --
   * RSVPs, falling back to saves when nobody has RSVP'd, since a save is the
   * weaker version of the same signal and a real number beats a dash.
   */
  const amenities = amenityTiles(event?.amenities)
  const detailBlocks = eventDetailBlocks(event?.details)

  const attendeeBlock = hasStarted
    ? { label: 'Attendees', count: checkInCount }
    : { label: goingCount > 0 ? 'Going' : 'Interested', count: goingCount || interestCount }

  const ctaState: SceneCTAState = isEnded
    ? (attended ? 'rate' : 'ended')
    : isCheckedIn
      ? 'going'
      : !hasStarted
        ? (rsvpd ? 'rsvpd' : 'rsvp')
        : 'join'


  const when = event ? new Date(event.start_time) : null
  const dateLabel = when
    ? when.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : ''
  const timeLabel = when
    ? when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <View style={styles.container}>
      {/*
        The Pulse's bar, not a second one that looks like it.

        The Scene's header (`1141:4930`) and the Pulse's (`1141:4819`) are the
        same component in the design -- same 64pt height, same 80% #0F0E0E, same
        12pt backdrop blur, same accent wordmark. A lookalike here would be two
        things to keep in sync, and they would drift the first time one of them
        was touched.
      */}
      <PulseTopBar
        /*
          Zero, because `app/_layout.tsx` presents this route with
          `presentation: 'modal'`.

          `useSafeAreaInsets()` reads the *root* provider, so inside a sheet it
          reports the device's notch even though iOS has already dropped the
          sheet below it. The bar then pads by an inset that is not there and
          the wordmark sits in a dark band. Same fault, same fix as `room.tsx`
          -- see `topInset` on the bar.
        */
        leading={<SceneBarButton icon="chevron-back" label="Back" onPress={() => router.back()} />}
        /*
          Back, heart, share -- exactly the harness, and nothing else.

          An overflow "..." was added here for RSVP and was wrong twice over:
          it is not in frame `1141:4853`, and it put a control the design never
          asked for in the most prominent slot on the screen. The two undesigned
          actions live together below the CTA instead, which is where secondary
          things belong and where the frame leaves room.
        */
        actions={
          <>
            <SceneBarButton
              icon={userInterested ? 'heart' : 'heart-outline'}
              label={userInterested ? 'Remove from interested events' : 'Save this event'}
              active={userInterested}
              onPress={handleToggleInterest}
            />
            <SceneBarButton icon="share-outline" label="Share" onPress={handleShare} />
            {/*
              The third reportable subject, and the one that had no path.
              `event_reports` sat with zero writers and zero readers, so
              somebody looking at an unsafe venue or a listing that reads as a
              lure could report a *person* or a *message* — but not the thing
              they were being asked to physically turn up to.

              No check-in gate, matching the server: two of the three reasons
              are visible from the listing, and the value is catching them
              before somebody travels to a venue.
            */}
            <SceneBarButton
              icon="flag-outline"
              label="Report this event"
              onPress={() => showEventReportOptions(event?.title || 'this event', String(id))}
            />
          </>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        /*
          Room for the floating CTA, and no more.

          `TAB_BAR_CLEARANCE` was in here and does not belong: `/event/[id]` is
          a root stack route, not a child of `(tabs)`, so there is no tab bar
          beneath it. Counting it anyway padded the scroll by 88pt and lifted
          the dock into the middle of the content -- the harness carries a note
          about the same double-count from the other direction.
        */
        contentContainerStyle={{
          paddingBottom: insets.bottom + SCENE_CTA_HEIGHT + 10 + 16 + 24,
        }}
      >
        {isLoading && !event ? (
          <SkeletonBlock width="100%" height={420} borderRadius={0} />
        ) : (
          <SceneHero
            playlist={playlist}
            /*
              Undefined, not the app icon.

              `placeholderImg` is `assets/images/icon.png` -- a square app icon,
              and `SceneHero` draws its source with `contentFit: 'cover'` into a
              440x647 box. A coverless event therefore rendered the icon blown
              up to fill two thirds of the screen, which is the "half the image
              is behind the header" this looked like. `expo-image` draws nothing
              for an undefined source, leaving the hero's own dark panel with
              the title and gradient on it -- which is what a coverless event
              should look like.
            */
            source={event?.cover_image_url ? { uri: event.cover_image_url } : undefined}
            title={event?.title || ''}
            dateLabel={dateLabel}
            timeLabel={timeLabel}
            scarcity={heroPillLabel({
              maxCapacity: event?.max_capacity,
              currentCapacity: event?.current_capacity,
            })}
            onPressMedia={(i) => setLightbox(i)}
          />
        )}

        <View style={styles.content}>
          {event?.description ? (
            <View style={styles.section}>
              <SceneHeading>The Experience</SceneHeading>
              <SceneBody>
                {highlightEntities(event.description, entities).map((seg, i) =>
                  seg.entity ? <SceneBodyAccent key={i}>{seg.text}</SceneBodyAccent> : seg.text
                )}
              </SceneBody>
            </View>
          ) : null}

          {/*
            The facilities row. Frame `1141:4853` draws it two-up under the
            description.

            `SceneAmenity` was built to that frame and rendered nowhere, under a
            docstring saying the screen "should not draw it until there is
            something true to put in it" — the vocabulary now exists and is on
            this payload, so it does.

            Tints alternate rather than being mapped per amenity: the vocabulary
            is curated and open-ended, and a per-slug colour would leave every
            amenity added later without one.
          */}
          {amenities.length > 0 ? (
            <View style={styles.amenityRow}>
              {amenities.map((a, i) => (
                <SceneAmenity
                  key={a.id}
                  icon={a.icon}
                  title={a.title}
                  subtitle={a.subtitle}
                  color={AMENITY_TINTS[i % AMENITY_TINTS.length]}
                  style={styles.amenityTile}
                />
              ))}
            </View>
          ) : null}

          {/*
            What the organiser actually wrote. Six fields have been collected by
            the dashboard, stored and served since they existed, and drawn by
            nothing — including accessibility, which is the one somebody needs
            *before* deciding whether they can come.

            Below the facilities row because the tiles answer the same questions
            in one glance where they can; this is where the answer needs a
            sentence. `eventDetailBlocks` has already dropped anything malformed,
            so an empty list means the organiser wrote nothing.
          */}
          <SceneDetails blocks={detailBlocks} />

          {/* Only when there is more than the cover -- a "gallery" of one is a
              heading over the picture already at the top of the screen. */}
          {playlist.length > 1 ? (
            <SceneGallery items={playlist} onOpen={(i) => setLightbox(i)} />
          ) : null}

          {attendeeBlock.count > 0 ? (
            <SceneAttendees
              count={attendeeBlock.count}
              label={attendeeBlock.label}
              seed={event?.id || 'scene'}
            />
          ) : null}

          {event?.venue_name ? (
            <Pressable
              onPress={openInMaps}
              accessibilityRole="button"
              accessibilityLabel={`Open ${event.venue_name} in Maps`}
            >
            <SceneLocationCard
              venue={event.venue_name}
              area={event.address || event.city || ''}
              map={
                showMapImage && event.latitude && event.longitude ? (
                  <SceneMap
                    latitude={event.latitude}
                    longitude={event.longitude}
                    width={width - 24}
                  />
                ) : null
              }
            />
            </Pressable>
          ) : null}

          {/*
            No amenities row. `#244` added them server-side and the mobile
            payload does not carry them yet, so the frame's two tiles would be
            the interface asserting two facts it has not been told. They appear
            the day `EventDetailSchema` returns them.
          */}
        </View>
      </ScrollView>

      {/*
        Outside the ScrollView, as frame `1227:2903` has it -- a sibling of
        `Main`, not a child. `box-none` so the gap either side still scrolls the
        page underneath; only the pill takes touches.
      */}
      <View style={styles.ctaDock} pointerEvents="box-none">
        <View style={styles.ctaDockInner} pointerEvents="box-none">
          <SceneCTA
            state={ctaState}
            onPress={primaryActionDisabled ? undefined : primaryActionPress}
            icon={
              checkingIn ? (
                <ActivityIndicator size="small" color={EMBER.accent} />
              ) : (
                <Ionicons
                  name={actionStage === 'chat' ? 'chatbubbles-outline' : 'radio-outline'}
                  size={SCENE_CTA_ICON}
                  color={EMBER.accent}
                />
              )
            }
          />
        </View>
      </View>

      <SceneLightbox
        items={playlist}
        initialIndex={lightbox ?? 0}
        visible={lightbox !== null}
        onClose={() => setLightbox(null)}
      />

      {/*
        The organiser's own controls, kept exactly as they were.
        Not in any frame -- `1141:4853` is the attendee's Scene -- so they stay
        a tray rather than being invented into the new layout.
      */}
      {isOrganizer ? (
        <View style={styles.organiserBar} pointerEvents="box-none">
          <Pressable
            onPress={openEditComposer}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Edit event"
          >
            <Ionicons name="create-outline" size={18} color={EMBER.textPrimary} />
          </Pressable>
          <Pressable
            onPress={openAnnouncementComposer}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Send an announcement"
          >
            <Ionicons name="megaphone-outline" size={18} color={EMBER.textPrimary} />
          </Pressable>
          <Pressable
            onPress={handleDeleteEvent}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Delete this event"
          >
            <Ionicons name="trash-outline" size={18} color={EMBER.textPrimary} />
          </Pressable>
        </View>
      ) : null}

      {/*
        The announcement composer, on both platforms.

        It used to be Android's only: iOS took `Alert.prompt`, which has no
        character counter, no pending state and no way to disable itself while
        a send is in flight. Same action, two experiences, and the system one
        could not carry the app's design. Not in any frame.
      */}
      <Modal
        visible={showAnnouncementModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAnnouncementModal(false)}
      >
        <View style={styles.announcementOverlay}>
          <View style={styles.announcementModal}>
            <Text style={styles.announcementTitle}>Send announcement</Text>
            <Text style={styles.announcementSubtitle}>
              This message is broadcast to everyone in the event chat.
            </Text>
            <TextInput
              style={styles.announcementInput}
              placeholder="Enter your announcement…"
              placeholderTextColor={EMBER.textPlaceholder}
              value={announcementText}
              onChangeText={setAnnouncementText}
              multiline
              maxLength={1000}
              autoFocus
            />
            <View style={styles.announcementButtons}>
              <Pressable
                style={styles.announcementCancel}
                onPress={() => {
                  setShowAnnouncementModal(false)
                  setAnnouncementText('')
                }}
                accessibilityRole="button"
              >
                <Text style={styles.announcementCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.announcementSend,
                  !announcementText.trim() && styles.announcementSendOff,
                ]}
                onPress={sendAnnouncement}
                disabled={!announcementText.trim() || sendingAnnouncement}
                accessibilityRole="button"
              >
                {sendingAnnouncement ? (
                  <ActivityIndicator size="small" color={EMBER.onGradient} />
                ) : (
                  <Text style={styles.announcementSendText}>Send</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.announcementOverlay}>
          <View style={styles.announcementModal}>
            <Text style={styles.announcementTitle}>Edit event</Text>
            <Text style={styles.announcementSubtitle}>
              Changes are visible to everyone viewing this event.
            </Text>
            <TextInput
              style={styles.editFieldInput}
              placeholder="Title"
              placeholderTextColor={EMBER.textPlaceholder}
              value={editTitle}
              onChangeText={setEditTitle}
              maxLength={120}
            />
            <TextInput
              style={styles.editFieldInput}
              placeholder="Short description"
              placeholderTextColor={EMBER.textPlaceholder}
              value={editShortDescription}
              onChangeText={setEditShortDescription}
              maxLength={200}
            />
            <TextInput
              style={styles.announcementInput}
              placeholder="Description"
              placeholderTextColor={EMBER.textPlaceholder}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              maxLength={2000}
            />
            <View style={styles.announcementButtons}>
              <Pressable
                style={styles.announcementCancel}
                onPress={() => setShowEditModal(false)}
                accessibilityRole="button"
              >
                <Text style={styles.announcementCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.announcementSend,
                  !editTitle.trim() && styles.announcementSendOff,
                ]}
                onPress={saveEventEdit}
                disabled={!editTitle.trim() || savingEdit}
                accessibilityRole="button"
              >
                {savingEdit ? (
                  <ActivityIndicator size="small" color={EMBER.onGradient} />
                ) : (
                  <Text style={styles.announcementSendText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ActionTray
        visible={trayState.visible}
        title={trayState.title}
        message={trayState.message}
        buttons={trayState.buttons}
        onClose={closeTray}
      />
    </View>
  )
}

/**
 * A top-bar button — a 36pt disc at 8% white, as `app/preview/scene.tsx` draws it.
 *
 * Bare glyphs on the blur is what made the header read as unfinished: the bar
 * is translucent over photography, so an icon with no disc behind it has no
 * consistent contrast and no apparent hit target.
 */
function SceneBarButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.barButton}
    >
      <Ionicons name={icon} size={20} color={active ? EMBER.accent : EMBER.textPrimary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Frame `1141:4918`: two-up, 16pt gap. `flexWrap` so a vocabulary longer
  // than two runs on rather than squeezing every tile narrower.
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  amenityTile: { flexGrow: 1, flexBasis: '45%' },
  container: { flex: 1, backgroundColor: EMBER.bg },
  barButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    paddingHorizontal: SCENE_PADDING_HORIZONTAL,
    // 48 under the hero, as the harness has it -- not the 64 that separates
    // unrelated sections further down.
    paddingTop: 48,
    gap: SCENE_SECTION_GAP,
  },
  section: { gap: 16 },
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaDockInner: {
    paddingHorizontal: SCENE_CTA_INSET,
    // 10, down from 12 — see SCENE_CTA_HEIGHT for the chrome arithmetic.
    paddingTop: 10,
    paddingBottom: 16,
    /*
     * Centres the content-width pill. Without this it stretches to the dock and
     * `paddingHorizontal: 32` on the fill buys nothing — which is exactly what
     * this screen shipped: a full-bleed slab instead of the frame's pill.
     */
    alignItems: 'center',
    justifyContent: 'center',
  },
  organiserBar: {
    position: 'absolute',
    right: 16,
    bottom: SCENE_CTA_HEIGHT + 16 + 10 + 24,
    gap: 12,
  },
  organiserButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surfaceSunken,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: EMBER.bg,
  },
  errorText: { ...EMBER_TYPE.cardTitle, fontSize: 18 },
  backButton: {
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: EMBER.surfaceSunken,
  },
  backButtonText: { ...EMBER_TYPE.meta, color: EMBER.textPrimary },

  announcementOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  announcementModal: {
    width: '100%',
    borderRadius: 32,
    backgroundColor: EMBER.bg,
    padding: 24,
    gap: 12,
  },
  announcementTitle: { ...EMBER_TYPE.cardTitle, fontSize: 20 },
  announcementSubtitle: { ...EMBER_TYPE.meta },
  announcementInput: {
    minHeight: 108,
    borderRadius: 24,
    backgroundColor: EMBER.surfaceSunken,
    padding: 16,
    color: EMBER.textPrimary,
    textAlignVertical: 'top',
  },
  editFieldInput: {
    height: 48,
    borderRadius: 16,
    backgroundColor: EMBER.surfaceSunken,
    paddingHorizontal: 16,
    color: EMBER.textPrimary,
  },
  announcementButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  announcementCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: EMBER.surface,
  },
  announcementCancelText: { ...EMBER_TYPE.meta, color: EMBER.textPrimary },
  announcementSend: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: EMBER.accent,
  },
  announcementSendOff: { opacity: 0.5 },
  announcementSendText: { ...EMBER_TYPE.meta, color: EMBER.onGradient },
})
