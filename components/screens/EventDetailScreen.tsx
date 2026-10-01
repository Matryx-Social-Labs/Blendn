import { LinearGradient } from 'expo-linear-gradient'
import ScalePress from '../motion/ScalePress'
import FadeInUp from '../motion/FadeInUp'
import { MOTION_DURATION, MOTION_STAGGER } from '../../lib/motion'
import { HeartIcon } from '../motion/HeartIcon'
import { ConfettiBurst } from '../motion/ConfettiBurst'
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Dimensions,
  InteractionManager,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Animated, {
  FadeIn,
  LayoutAnimationConfig,
  ReduceMotion,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionTray, { type ActionTrayButton } from '../ActionTray';
import { showSheet } from '../../lib/sheet'
import { useSingleFlight } from '../../lib/useSingleFlight'
import { SkeletonBlock } from '../Skeleton';
import { getDistanceMetres } from '../../lib/geo'
import { liveWindow, sessionFromApi, type EventSession } from '../../lib/eventSession'
import { featuredDateLabel, timeLabel as pulseTimeLabel } from '../../lib/pulse'
import { useCheckInFlow } from '../../lib/useCheckInFlow'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { openInMaps as openPlaceInMaps } from '../../lib/openInMaps'
import { addToCalendar } from '../../lib/calendar'
import { openBlendn } from '../../lib/blendnOverlay'
import { useToast } from '../Toast'
import { amenityTiles, type ServerAmenity } from '../../lib/amenityTile'
import { eventDetailBlocks, type ServerEventDetails } from '../../lib/eventDetails'
import { showEventReportOptions } from '../../lib/safetyUtils'
import { apiClient, type RsvpStatus } from '../../lib/apiClient';
import { Logger } from '../../lib/logger';
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient';
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, TYPE } from '../../lib/theme';
import { PulseTopBar } from '../pulse/PulseTopBar';
import { SceneHero, sceneHeroHeight } from '../scene/SceneHero';
import { SceneLightbox } from '../scene/SceneLightbox';
import { BoardEntry } from '../board/BoardSections';
import { BOARD_ENABLED, boardClosed } from '../../lib/board';
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
  SceneByline,
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
import { claimUrlFrom } from '../../lib/claimLink';

const NO_CLOCK_SUBSCRIPTION = () => () => {}

/**
 * Whether the clock has passed `ms` (`inclusive`: reached it), fresh on every
 * render -- exactly what the inline `Date.now()` comparisons this replaces did.
 *
 * The clock is a value outside React, so it is read the way React reads one:
 * `useSyncExternalStore`. Nothing subscribes, so as before the screen does not
 * re-render on its own when the doors open; the next render picks it up.
 */
function useClockPassed(ms: number | null, inclusive = false): boolean {
  return useSyncExternalStore(NO_CLOCK_SUBSCRIPTION, () =>
    ms === null ? false : inclusive ? ms <= Date.now() : ms < Date.now()
  )
}

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
  /** The day LIVE and check-in are judged by — `lib/eventSession.ts`. */
  session?: EventSession | null
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
  /** The public claim page, for a curated event nobody has claimed. See `claimUrlFrom`. */
  claim_url?: string | null
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
 * The Scene's entrance. The hero crossfades over the skeleton (a fade is the
 * reduced form, so it stays under Reduce Motion); the sections below fade up
 * a stagger apart, capped at the fourth — by then they are below the fold.
 */
const HERO_FADE_IN = FadeIn.duration(MOTION_DURATION.normal).reduceMotion(ReduceMotion.Never)
const SECTION_DELAY = [0, 1, 2, 3].map((i) => i * MOTION_STAGGER.normal)

/*
 * The Scene — frame `1141:4853`, 390 wide. See `docs/SCENE.md`.
 *
 * Type and spacing come from the fixed `TYPE` / `SPACE` scale. Only *layout* is
 * scaled, and only where it is genuinely proportional.
 *
 * The hero is one of those: it is a photograph, so its shape has to survive the
 * change of screen width rather than its absolute height. 574 on a 390 frame is
 * an aspect, not a number of points.
 */

export default function EventDetail() {
  const { id, title, cover, venue, city, start, end, category, description: descriptionParam, interestCount: interestCountParam } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  /*
   * The scroll position, for the hero's parallax and pull-down stretch.
   *
   * A shared value written by a worklet scroll handler, so every frame of the
   * scroll reaches `SceneHero` on the UI thread and React never re-renders for
   * it. A JS `onScroll` with state would render this 1,800-line screen 60-120
   * times a second.
   */
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })
  const { user } = useAuth()
  const feedback = useInteractionFeedback()
  const { showToast } = useToast()
  /** Out to the browser; the dashboard's claim page needs no account. */
  const openClaimPage = (url: string) => {
    Linking.openURL(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
  }

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
  /*
   * Why the first load failed, when it did. A network failure and a missing
   * event are different sentences: "Event not found" for a dropped connection
   * tells somebody the night was cancelled.
   */
  const [loadFailure, setLoadFailure] = useState<'network' | 'notFound' | null>(null)
  /** The room's own "here now", while the event is running. */
  const [hereNow, setHereNow] = useState<number | null>(null)
  // Don't show loading skeleton if we have params - show content immediately
  const [loading, setLoading] = useState(!hasParams)
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
  const [actionStage, setActionStage] = useState<'blend' | 'checked' | 'chat'>('blend')
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  /** Which gallery item the lightbox is on, or null when it is closed. */
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [announcementText, setAnnouncementText] = useState('')
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

  // Above the effects that call them: React Compiler rejects a closure that
  // reads a binding before its declaration.
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

  const applyEventDetails = (result: Awaited<ReturnType<typeof apiClient.getEvent>>) => {
    if (!result.success || !result.data) {
      Logger.error('events', 'detail:fetch:error', { error: result.error })
      const notFound = result.errorCode === 'NOT_FOUND' || /not found/i.test(result.error ?? '')
      setLoadFailure(notFound ? 'notFound' : 'network')
      return notFound ? 'notFound' : 'network'
    } else {
      setLoadFailure(null)
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
        session: sessionFromApi(d.session),
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
        claim_url: claimUrlFrom(d.claim),
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
        // As the cached path does: the live fetch dropped these, so the
        // Attendees count only ever showed what the cache last held.
        setCheckInCount(d.stats.checkInCount || 0)
        setGoingCount(d.stats.rsvpCount || 0)
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
  }

  /*
   * A promise chain rather than async/await, so every state write sits in the
   * request's continuation where the effect lint can see it: the mount effect
   * calls this, and that lint reads a write after `await` as a synchronous one.
   */
  const fetchEventDetails = () => {
    Logger.journey('events', 'detail:fetch:start', { eventId: String(id) })
    return apiClient
      .getEvent(String(id), {
        include: 'interestedUsers',
        interestedLimit: 6,
      })
      .then((result) => {
        /*
         * With nothing on screen the page itself says so (below). With the
         * params' outline on screen, say it once, with a way to try again — a
         * background refetch that fails later keeps what is there and says
         * nothing.
         */
        if (applyEventDetails(result) === 'network' && event && lastFetchRef.current === 0) {
          showTray("Couldn't load everything", 'Some details are missing. Check your connection and try again.', [
            { label: 'Not now', onPress: closeTray },
            { label: 'Try again', variant: 'primary', onPress: () => { closeTray(); void fetchEventDetails() } },
          ])
        }
      })
      .catch((error) => {
        Logger.error('events', 'detail:fetch:exception', { error: error as any })
        setLoadFailure('network')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  /*
   * A new id, handled during render rather than in the effect below, so the
   * first frame for it is already right: the cached detail in place of the
   * params' outline, and the map hidden until interactions settle. The effect
   * keeps the logging and the fetch.
   */
  const [renderedId, setRenderedId] = useState<typeof id | null>(null)
  if (renderedId !== id) {
    setRenderedId(id)
    setShowMapImage(false)
    if (id && String(id).trim()) {
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
          session: sessionFromApi(d.session),
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
          claim_url: claimUrlFrom(d.claim),
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
    } else {
      // No valid ID provided, show error immediately
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id && String(id).trim()) {
      Logger.journey('events', 'detail:mount', { eventId: String(id) })
      // fetchEventDetails returns all user status info (isCheckedIn, isFavorited) - single API call
      fetchEventDetails()
    } else {
      Logger.error('events', 'detail:noValidId', { id })
    }
    // fetchEventDetails is redefined every render, and `user` there is only
    // read to set the organizer flag inside its own callback — adding either
    // would refetch on every render/auth-object refresh instead of once per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Deferred loading for smoother navigation - reduced delays for faster perceived loading
  useEffect(() => {
    // Hidden again on an id change during render, above.
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

  /*
   * One save request at a time. A second tap while the first is in flight
   * flipped the optimistic state back and raced the two responses, so the
   * heart could end on the opposite of what the server holds.
   */
  const interestInFlight = useRef(false)
  const handleToggleInterest = useCallback(async () => {
    if (interestInFlight.current) return
    try {
      if (!id) return
      if (!user) {
        showTray('Sign in to save events', 'Saved events come with you to every device.', [
          { label: 'Not now', onPress: closeTray },
          { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
        ])
        return
      }
      interestInFlight.current = true
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
        showTray("Couldn't save the event", 'Try again.')
        return
      }
      setUserInterested(result.data.interested)
      setInterestCount(result.data.interestCount || 0)
    } catch {
      feedback.error()
      showTray("Couldn't save the event", 'Try again.')
    } finally {
      interestInFlight.current = false
    }
  }, [id, user, userInterested, showTray, closeTray, feedback])

  /*
   * Taking it back. Split out of the toggle because it now sits behind a
   * confirmation: the CTA is the RSVP *and* its off-switch, so one tap on
   * "You're going" used to cancel with nothing said — and on a full event it
   * gave your waitlist place to the next person, with no way back to it.
   */
  const withdrawRsvp = useCallback(async () => {
    // Hoisted out of the `try` so the `catch` can put it back: a thrown
    // request (timeout, no network) left the optimistic state on screen with
    // no row behind it. Seen on the simulator when the RSVP call timed out.
    const prevStatus = rsvpStatus
    try {
      if (!id) return
      feedback.tap()
      setRsvpStatus(null)
      const result = await apiClient.cancelRsvp(String(id))
      if (!result.success) {
        setRsvpStatus(prevStatus)
        feedback.error()
        showTray("Couldn't cancel your RSVP", 'Try again.')
      } else if (typeof result.data?.rsvpCount === 'number') {
        // The server's count after the change, as on the RSVP below.
        setGoingCount(result.data.rsvpCount)
      }
    } catch {
      setRsvpStatus(prevStatus)
      feedback.error()
      showTray("Couldn't update your RSVP", 'Try again.')
    }
  }, [id, rsvpStatus, showTray, feedback])

  const confirmWithdrawRsvp = useCallback(() => {
    const waitlisted = rsvpStatus === 'waitlisted'
    showTray(
      waitlisted ? 'Leave the waitlist?' : 'Cancel your RSVP?',
      waitlisted
        ? "You'll lose your place in line. If you join again later, you go to the back."
        : "You'll come off the list of people going. If it fills up, your place goes to someone else.",
      [
        { label: waitlisted ? 'Stay on it' : 'Keep it', onPress: closeTray },
        {
          label: waitlisted ? 'Leave waitlist' : 'Cancel RSVP',
          variant: 'destructive',
          onPress: () => {
            closeTray()
            void withdrawRsvp()
          },
        },
      ]
    )
  }, [rsvpStatus, showTray, closeTray, withdrawRsvp])

  const handleToggleRsvp = useCallback(async () => {
    const prevStatus = rsvpStatus
    try {
      if (!id) return
      if (!user) {
        showTray('Sign in to RSVP', 'Your RSVP is kept on your account.', [
          { label: 'Not now', onPress: closeTray },
          { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
        ])
        return
      }
      // Waitlisted counts as "already committed": tapping should offer to take
      // you off the list, not try to RSVP again. Treating it as not-going would
      // send a second RSVP and leave the user unable to withdraw.
      if (rsvpStatus === 'going' || rsvpStatus === 'waitlisted') {
        confirmWithdrawRsvp()
        return
      }
      feedback.tap()
      setRsvpStatus('going')
      const result = await apiClient.rsvpToEvent(String(id), 'going')
      if (!result.success || !result.data) {
        setRsvpStatus(prevStatus)
        feedback.error()
        showTray("Couldn't RSVP", 'Try again.')
      } else {
        setRsvpStatus(result.data.rsvpStatus)
        // The response carries the new count; without it "Going" stayed at 24
        // beside "You're going" until the screen was reopened.
        if (typeof result.data.rsvpCount === 'number') setGoingCount(result.data.rsvpCount)
        if (result.data.rsvpStatus === 'waitlisted') {
          // Say it plainly. An amber icon alone would let someone believe
          // they have a place and turn up to an event that is full.
          showTray(
            "You're on the waitlist",
            "This event is full. We'll let you know if a place frees up — you'll be first in line in the order you joined."
          )
        } else if (event) {
          /*
           * The calendar, offered in the moment and not in the way: a toast
           * with an action rather than a tray, so saying yes is still one tap
           * and the offer goes away on its own. Only for a seat — a waitlist
           * place is not a plan yet.
           */
          const planned = event
          showToast("You're going.", 'success', {
            action: { label: 'Add to calendar', onPress: () => addToCalendar(planned) },
          })
        }
      }
    } catch {
      setRsvpStatus(prevStatus)
      feedback.error()
      showTray("Couldn't update your RSVP", 'Try again.')
    }
  }, [id, user, event, rsvpStatus, showTray, closeTray, feedback, confirmWithdrawRsvp, showToast])

  /*
   * Checked in or out anywhere — this screen's CTA, the Pulse's tray, the
   * Blend'n room — and the detail is re-read from the server, whose
   * `userStatus` is the one answer to "am I in". `checkInChanged` has already
   * dropped the cached detail, so this read is fresh; before it did, the
   * re-read after a check-in was served the stale `isCheckedIn: false` and
   * the CTA went back to "Blend in" under an "Open the room" centre button.
   */
  useEffect(
    () => subscribeCheckInChanged(() => void fetchEventDetails()),
    // fetchEventDetails is redefined every render; one subscription per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  )

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

  /*
   * `handleCheckout` lived here and is gone -- the control moved, it was not
   * dropped.
   *
   * The CTA is one slot whose subject changes with the clock, so there is no
   * second control on this screen to hang it from. When you are checked in the
   * CTA reads "You're in" and opens the room, and check out is in the room's
   * top bar -- a tap and a confirm from here. The Pulse's long-press tray has it too.
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

  // One broadcast per tap, however fast the taps come (`useSingleFlight`).
  const { run: sendAnnouncement, pending: sendingAnnouncement } = useSingleFlight(async () => {
    if (!announcementText.trim()) return
    try {
      const result = await apiClient.sendAnnouncement(String(id), announcementText.trim())
      if (result.success) {
        feedback.success()
        setShowAnnouncementModal(false)
        setAnnouncementText('')
        showTray('Announcement sent', 'Your announcement has been broadcast to the event chat.')
      } else {
        feedback.error()
        showTray("Couldn't send the announcement", 'Try again.')
        setShowAnnouncementModal(false)
      }
    } catch {
      feedback.error()
      showTray("Couldn't send the announcement", 'Try again.')
      setShowAnnouncementModal(false)
    }
  })

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
        showTray("Couldn't save your changes", 'Try again.')
        setShowEditModal(false)
      }
    } catch {
      feedback.error()
      showTray("Couldn't save your changes", 'Try again.')
      setShowEditModal(false)
    } finally {
      setSavingEdit(false)
    }
  }

  // The app's one sheet, like every other "are you sure" (lib/sheet.ts): a
  // failed delete stays on the sheet with "Try again" rather than a second popup.
  const handleDeleteEvent = () => {
    showSheet({
      kind: 'actions',
      title: 'Delete this event?',
      message: "Everyone going loses it, and it can't be undone.",
      actions: [
        {
          label: 'Delete event',
          variant: 'destructive',
          run: async () => {
            try {
              const result = await apiClient.deleteEvent(String(id))
              if (!result.success) {
                feedback.error()
                return { ok: false, error: "Couldn't delete the event. Try again." }
              }
            } catch {
              feedback.error()
              return { ok: false, error: "Couldn't delete the event. Try again." }
            }
            feedback.success()
            router.back()
            return { ok: true, toast: 'Event deleted' }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
  }

  const openInMaps = () => {
    if (event) void openPlaceInMaps(event)
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
  /*
   * Judged by today's day, not the run. On a multi-day event the run said
   * "started, not ended" for days — between days and through a cancelled last
   * day — and offered a check-in the door refused. `session` is the day the
   * server's door goes by (`lib/eventSession.ts`).
   */
  const live = event ? liveWindow(event) : null
  const liveEnd = live?.end_time ? new Date(live.end_time).getTime() : null
  const isEnded = useClockPassed(liveEnd !== null && Number.isFinite(liveEnd) ? liveEnd : null)
  // Explained with the CTA below; read here, above the early return, because it is a hook.
  const hasStarted = useClockPassed(live ? new Date(live.start_time).getTime() : null, true)
  const isLive = hasStarted && !isEnded

  /*
   * "N here now", from the room itself while the event runs. Re-read when the
   * check-in count moves (the socket refetches the detail on every check-in),
   * so the two numbers on the page never disagree for long. An older server
   * 404s the preview; the byline then falls back to the detail's own count.
   */
  useEffect(() => {
    if (!isLive || !id) return
    let cancelled = false
    apiClient
      .getRoomPreview(String(id))
      .then((r) => {
        if (!cancelled && r.success && r.data) setHereNow(r.data.hereCount)
      })
      .catch((e) => Logger.warn('events', 'detail:roomPreview:failed', { error: e }))
    return () => {
      cancelled = true
    }
  }, [id, isLive, checkInCount])

  const eventTitle = event?.title
  const openEventChat = useCallback(async () => {
    try {
      let chatId = eventChatGroupId
      let chatName = eventTitle || 'Event Chat'

      if (!chatId && id) {
        const chatResult = await apiClient.getEventChat(String(id))
        if (chatResult.success && chatResult.data?.chatGroupId) {
          chatId = chatResult.data.chatGroupId
          chatName = chatResult.data.chatGroupName || chatName
        }
      }

      if (chatId) {
        const query = `?roomName=${encodeURIComponent(chatName)}&eventTitle=${encodeURIComponent(eventTitle || '')}`
        router.replace(`/chat/${chatId}${query}` as any)
        return
      }
    } catch (err) {
      Logger.warn('events', 'openEventChat:failed', { error: err as any })
    }

    router.replace('/(tabs)/chat' as any)
  }, [eventChatGroupId, eventTitle, id])

  // The check-in itself, shared with the Blend'n room's hold-to-check-in.
  const { checkingIn, celebrations, start: startCheckIn } = useCheckInFlow({
    eventId: String(id),
    eventTitle,
    showTray,
    closeTray,
    onLocated: setUserLocation,
    onOpenMaps: openInMaps,
    onOpenChat: openEventChat,
    // Update check-in status directly - no need for another API call
    onCheckedIn: (outcome) =>
      setCheckInStatus(
        outcome.kind === 'checkedIn'
          ? { success: true, checked_in: true, check_in_id: outcome.checkInId }
          : { success: true, checked_in: true }
      ),
  })

  /*
   * Checking in morphs the CTA: 'checked' at once, 'chat' 900ms later; checking
   * out puts it back to 'blend'. The immediate step is taken during render when
   * `isCheckedIn` changes; the effect owns only the delayed one. Starts from
   * `false` because `actionStage` starts at 'blend', so a screen that mounts
   * checked in still goes through 'checked'.
   */
  const [stageCheckedIn, setStageCheckedIn] = useState(false)
  if (stageCheckedIn !== isCheckedIn) {
    setStageCheckedIn(isCheckedIn)
    setActionStage(isCheckedIn ? 'checked' : 'blend')
  }

  useEffect(() => {
    if (!isCheckedIn) return
    const timeout = setTimeout(() => {
      setActionStage('chat')
    }, 900)
    return () => clearTimeout(timeout)
  }, [isCheckedIn])


  /*
   * Nothing after the end is disabled. Every other post-doors state routes
   * through `actionStage`, which is about checking in and is meaningless once
   * the event is over — leaving it in charge here would disable the button for
   * anyone who had checked in, which is precisely everyone `rate` exists for.
   */
  const primaryActionDisabled = isEnded ? false : checkingIn || actionStage === 'checked'
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
    /*
     * Over, and you weren't here: what's on tonight instead of a dead pill.
     * Back to the tabs first — the Blend'n screen is an overlay hosted there,
     * under the root stack, so opening it from here would open it beneath
     * this page.
     */
    if (isEnded) {
      router.dismissTo('/(tabs)/events')
      openBlendn()
      return
    }
    if (checkingIn) return
    // Before the doors, the button is the RSVP and its own off-switch.
    if (!isCheckedIn && !hasStarted) {
      void handleToggleRsvp()
      return
    }
    if (!isCheckedIn) {
      void startCheckIn()
      return
    }
    if (actionStage === 'chat') {
      openEventChat()
    }
  }


  if (!isLoading && !event) {
    const offline = loadFailure === 'network'
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        {/* Arrives like any other content, rather than cutting in after the skeleton. */}
        <FadeInUp style={styles.errorBody}>
          {offline ? (
            <>
              <Text style={styles.errorText}>Couldn&apos;t load this event</Text>
              <Text style={styles.errorHint}>Check your connection and try again.</Text>
              <ScalePress
                style={styles.retryButton}
                onPress={() => {
                  setLoadFailure(null)
                  setLoading(true)
                  void fetchEventDetails()
                }}
                accessibilityRole="button"
              >
                <Text style={styles.retryButtonText}>Try again</Text>
              </ScalePress>
              <ScalePress haptic={false} style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
                <Text style={styles.backButtonText}>Go back</Text>
              </ScalePress>
            </>
          ) : (
            <>
              <Text style={styles.errorText}>Event not found</Text>
              <ScalePress style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
                <Text style={styles.backButtonText}>Go back</Text>
              </ScalePress>
            </>
          )}
        </FadeInUp>
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
  /** The public claim page, when the server offers one (curated, unclaimed). */
  const claimUrl = event?.claim_url ?? null

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


  const ctaIcon =
    ctaState === 'ended'
      ? 'arrow-forward'
      : ctaState === 'rsvpd' ? 'checkmark' : actionStage === 'chat' ? 'chatbubbles-outline' : 'radio-outline'

  /*
   * The Pulse's words for a date — "Today", "Tomorrow", "Oct 24" — so a card
   * and the page it opens never disagree. Read off the live window, not the
   * run: on day 2 of a festival the hero says today's doors, not day 1's.
   * Phone-local, like every date on the Pulse (the helpers take no zone).
   */
  const heroStart = live?.start_time ?? null
  const dateLabel = heroStart ? featuredDateLabel(heroStart) : ''
  const heroTimeLabel = heroStart ? pulseTimeLabel(heroStart) : ''

  return (
    <View style={styles.container}>
      {/*
        The Pulse's bar, not a second one that looks like it.

        The Scene's header (`1141:4930`) and the Pulse's (`1141:4819`) are the
        same component in the design -- same 64pt height, same flat page-colour
        band, same wordmark. A lookalike here would be two things to keep in
        sync, and they would drift the first time one of them was touched.
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
              glyph={
                <HeartIcon on={userInterested} size={ICON.md} onColor={EMBER.textPrimary} offColor={EMBER.textPrimary} />
              }
              label={userInterested ? 'Saved' : 'Save'}
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

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        /*
          Room for the floating CTA, and no more.

          `TAB_BAR_CLEARANCE` was in here and does not belong: `/event/[id]` is
          a root stack route, not a child of `(tabs)`, so there is no tab bar
          beneath it. Counting it anyway padded the scroll by 88pt and lifted
          the dock into the middle of the content -- the harness carries a note
          about the same double-count from the other direction.
        */
        contentContainerStyle={{
          paddingBottom: insets.bottom + SCENE_CTA_HEIGHT + SPACE.md + SPACE.lg + SPACE.xl,
        }}
      >
        {/*
          The hero fades in over the skeleton's slot instead of cutting in.
          `skipEntering` means a cached event, which paints the hero first,
          doesn't fade — only the skeleton-to-hero swap does.
        */}
        <LayoutAnimationConfig skipEntering>
        {isLoading && !event ? (
          <SkeletonBlock width="100%" height={sceneHeroHeight()} borderRadius={0} />
        ) : (
          <Animated.View entering={HERO_FADE_IN}>
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
            timeLabel={heroTimeLabel}
            scarcity={heroPillLabel({
              maxCapacity: event?.max_capacity,
              currentCapacity: event?.current_capacity,
              goingCount,
            })}
            onPressMedia={(i) => setLightbox(i)}
            scrollY={scrollY}
          />
          </Animated.View>
        )}
        </LayoutAnimationConfig>

        <View style={styles.content}>
          {/*
            Each section fades up once, as it first mounts, a beat after the one
            above — they mount with the event, so a socket update or a refetch
            re-renders them in place and never replays this. Anything past the
            first screenful shares the last delay; nobody sees it arrive.
          */}
          {event?.organizer || isLive ? (
            <FadeInUp delay={SECTION_DELAY[0]}>
              <SceneByline host={event?.organizer} hereNow={isLive ? hereNow ?? checkInCount : null} />
            </FadeInUp>
          ) : null}
          {event?.description ? (
            <FadeInUp delay={SECTION_DELAY[0]} style={styles.section}>
              <SceneHeading>The Experience</SceneHeading>
              <SceneBody>
                {highlightEntities(event.description, entities).map((seg, i) =>
                  seg.entity ? <SceneBodyAccent key={i}>{seg.text}</SceneBodyAccent> : seg.text
                )}
              </SceneBody>
            </FadeInUp>
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
            <FadeInUp delay={SECTION_DELAY[1]} style={styles.amenityRow}>
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
            </FadeInUp>
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
          {/* Wrapped only when it draws something: an empty wrapper still takes a gap. */}
          {detailBlocks.length > 0 ? (
            <FadeInUp delay={SECTION_DELAY[2]}>
              <SceneDetails blocks={detailBlocks} />
            </FadeInUp>
          ) : null}

          {/* Only when there is more than the cover -- a "gallery" of one is a
              heading over the picture already at the top of the screen. */}
          {playlist.length > 1 ? (
            <FadeInUp delay={SECTION_DELAY[3]}>
              <SceneGallery items={playlist} onOpen={(i) => setLightbox(i)} />
            </FadeInUp>
          ) : null}

          {attendeeBlock.count > 0 ? (
            <FadeInUp delay={SECTION_DELAY[3]}>
              <SceneAttendees
                count={attendeeBlock.count}
                label={attendeeBlock.label}
                seed={event?.id || 'scene'}
              />
            </FadeInUp>
          ) : null}

          {/*
            The board: going alone, and looking for somebody to go with. Before
            doors only — after them the room is the place, and the board is
            closed (client plan Part 3b). Reading needs an RSVP or a save; the
            board itself says so if neither.

            The run's start, not today's session: the server closes the board
            at the first doors, so on day 2 of a festival the day's window
            would offer a board that opens onto "closed". Behind BOARD_ENABLED
            until the board's safety half ships (lib/board.ts).
          */}
          {event && BOARD_ENABLED && !boardClosed(event.start_time) ? (
            <FadeInUp delay={SECTION_DELAY[3]}>
              <BoardEntry
                onPress={() =>
                  router.push({ pathname: '/board/[eventId]', params: { eventId: event.id } } as never)
                }
              />
            </FadeInUp>
          ) : null}

          {event?.venue_name ? (
            <FadeInUp delay={SECTION_DELAY[3]}>
            {/* No haptic: it leaves the app, and the Maps hand-off is the feedback. */}
            <ScalePress
              pressedScale={0.98}
              haptic={false}
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
                    width={width - 2 * SCENE_PADDING_HORIZONTAL}
                  />
                ) : null
              }
            />
            </ScalePress>
            </FadeInUp>
          ) : null}

          {/*
            DESIGN IS A PLACEHOLDER — LOGIC IS NOT (docs/PLACEHOLDER_SCREENS.md,
            "Claim it"). Only on a curated event nobody has claimed, which the
            server decides. It leaves the app for the public claim page on the
            dashboard host: the app refuses host accounts by design, and that
            page needs no account. Filing there grants nothing until a person
            reviews it.
          */}
          {claimUrl ? (
            <FadeInUp delay={SECTION_DELAY[3]}>
              <Pressable
                testID="claim-event-link"
                onPress={() => openClaimPage(claimUrl)}
                accessibilityRole="link"
                accessibilityLabel="Running this event? Claim it"
                accessibilityHint="Opens the Blend'n dashboard in your browser"
                style={styles.claimRow}
              >
                <Text style={styles.claimText}>
                  Running this event? <Text style={styles.claimAction}>Claim it</Text>
                </Text>
                <Ionicons name="open-outline" size={ICON.sm} color={EMBER.textSecondary} />
              </Pressable>
            </FadeInUp>
          ) : null}

          {/*
            No amenities row. `#244` added them server-side and the mobile
            payload does not carry them yet, so the frame's two tiles would be
            the interface asserting two facts it has not been told. They appear
            the day `EventDetailSchema` returns them.
          */}
        </View>
      </Animated.ScrollView>

      {/*
        Outside the ScrollView, as frame `1227:2903` has it -- a sibling of
        `Main`, not a child. `box-none` so the gap either side still scrolls the
        page underneath; only the pill takes touches.
      */}
      <View style={styles.ctaDock} pointerEvents="box-none">
        {/*
          The page fading out under the pill, instead of a glow around it: the
          pill no longer carries a blur or a shadow, so this is what keeps a
          photo or the map scrolling underneath from running into it.
        */}
        <LinearGradient
          pointerEvents="none"
          colors={[EMBER.bgClear, EMBER.bg]}
          locations={[0, 0.55]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.ctaDockInner} pointerEvents="box-none">
          <SceneCTA
            state={ctaState}
            alone={checkInCount <= 1}
            onPress={primaryActionDisabled ? undefined : primaryActionPress}
            iconKey={checkingIn ? 'busy' : ctaIcon}
            icon={(color) =>
              checkingIn ? (
                <ActivityIndicator size="small" color={color} />
              ) : (
                <Ionicons name={ctaIcon} size={SCENE_CTA_ICON} color={color} />
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
          <ScalePress haptic={false} pressedScale={0.9}
            onPress={openEditComposer}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Edit event"
          >
            <Ionicons name="create-outline" size={ICON.md} color={EMBER.textPrimary} />
          </ScalePress>
          <ScalePress haptic={false} pressedScale={0.9}
            onPress={openAnnouncementComposer}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Send an announcement"
          >
            <Ionicons name="megaphone-outline" size={ICON.md} color={EMBER.textPrimary} />
          </ScalePress>
          <ScalePress haptic={false} pressedScale={0.9}
            onPress={handleDeleteEvent}
            style={styles.organiserButton}
            accessibilityRole="button"
            accessibilityLabel="Delete this event"
          >
            <Ionicons name="trash-outline" size={ICON.md} color={EMBER.textPrimary} />
          </ScalePress>
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

      {/* Out of the CTA pill: the dock's bottom padding, then half the pill. */}
      <ConfettiBurst
        trigger={celebrations}
        originBottom={insets.bottom + SPACE.lg + SCENE_CTA_HEIGHT / 2}
        originWidth={200}
      />

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
 * A top-bar button — a `CONTROL.sm` disc on `EMBER.surface`.
 *
 * The bar is the opaque page colour (`PulseTopBar`), so the disc is a control
 * on a page, not a pill on a photo: `surface`, not `scrim`. Without it a bare
 * glyph has no apparent hit target. The glyph is always `textPrimary`; the
 * saved heart says "on" by filling, not by turning orange.
 */
/*
 * Shrinks to 0.9 on press-in: at 32pt, the 0.97 a full-width button uses is
 * below what an eye notices. No haptic of its own — the heart's handler fires
 * one, and Back and Share are navigation, which does not buzz.
 */
function SceneBarButton({
  icon,
  glyph,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  /** Replaces the plain icon, for a glyph that animates itself (the heart). */
  glyph?: React.ReactNode
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.9}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={styles.barButton}
    >
      {glyph ?? <Ionicons name={icon} size={ICON.md} color={EMBER.textPrimary} />}
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  // Frame `1141:4918`: two-up, 16pt gap. `flexWrap` so a vocabulary longer
  // than two runs on rather than squeezing every tile narrower.
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.lg },
  amenityTile: { flexGrow: 1, flexBasis: '45%' },
  container: { flex: 1, backgroundColor: EMBER.bg },
  barButton: {
    width: CONTROL.sm,
    height: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surface,
  },
  content: {
    paddingHorizontal: SCENE_PADDING_HORIZONTAL,
    // 48 under the hero, as the harness has it -- more than the 32 that
    // separates sections further down.
    paddingTop: SPACE.xxxl,
    gap: SCENE_SECTION_GAP,
  },
  section: { gap: SPACE.lg },
  // The whole row is the target, taller than the 44pt minimum (Apple HIG).
  claimRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, alignSelf: 'flex-start', minHeight: CONTROL.md },
  claimText: { ...TYPE.meta },
  claimAction: { color: EMBER.textPrimary, textDecorationLine: 'underline' },
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaDockInner: {
    paddingHorizontal: SCENE_CTA_INSET,
    // See SCENE_CTA_HEIGHT for the chrome arithmetic.
    paddingTop: SPACE.md,
    paddingBottom: SPACE.lg,
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
    right: GUTTER,
    bottom: SCENE_CTA_HEIGHT + SPACE.lg + SPACE.md + SPACE.xl,
    gap: SPACE.md,
  },
  organiserButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surfaceSunken,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.bg,
  },
  errorBody: { alignItems: 'center', gap: SPACE.lg },
  errorText: { ...TYPE.title },
  errorHint: { ...TYPE.meta, color: EMBER.textSecondary, textAlign: 'center', paddingHorizontal: GUTTER },
  retryButton: {
    minHeight: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  retryButtonText: { ...TYPE.button, color: EMBER.onGradient },
  backButton: {
    minHeight: CONTROL.md,
    paddingHorizontal: SPACE.xl,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  backButtonText: { ...TYPE.button },

  announcementOverlay: {
    flex: 1,
    backgroundColor: EMBER.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: GUTTER,
  },
  announcementModal: {
    width: '100%',
    borderRadius: EMBER_RADIUS.card,
    backgroundColor: EMBER.bg,
    padding: SPACE.xl,
    gap: SPACE.md,
  },
  announcementTitle: { ...TYPE.title },
  announcementSubtitle: { ...TYPE.meta },
  announcementInput: {
    ...TYPE.body,
    minHeight: CONTROL.lg * 2,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
    padding: SPACE.lg,
    textAlignVertical: 'top',
  },
  editFieldInput: {
    ...TYPE.body,
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
    paddingHorizontal: SPACE.lg,
  },
  announcementButtons: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.xs },
  announcementCancel: {
    flex: 1,
    minHeight: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  announcementCancelText: { ...TYPE.button },
  announcementSend: {
    flex: 1,
    minHeight: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  announcementSendOff: { opacity: OPACITY.disabled },
  announcementSendText: { ...TYPE.button, color: EMBER.onGradient },
})
