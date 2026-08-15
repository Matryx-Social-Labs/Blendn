import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  AppState,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import EventCard from '../../components/EventCard'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import NearbyEventCard from '../../components/NearbyEventCard'
import OptimizedImage, { preloadImages } from '../../components/OptimizedImage'
import {
  FeaturedCard,
  FEATURED_CARD_GAP,
  FEATURED_CARD_SOLO,
  FEATURED_CARD_WIDTH,
} from '../../components/pulse/FeaturedCard'
import { PulseHeader } from '../../components/pulse/PulseHeader'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { UpcomingCard } from '../../components/pulse/UpcomingCard'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import { eventFromApi, getEvents as fetchEventsApi, type BlendnEvent } from '../../lib/api'
import {
  awayNotice,
  cityOnResume,
  isBrowsingHere,
  isServedCity,
  resolveBrowseCity,
  sameCity,
  shouldOfferSwitch,
  type CityOption,
  type StoredCity,
} from '../../lib/city'
import { readStoredCity, storeCity } from '../../lib/cityStorage'
import { formatDistance, getDistanceMetres } from '../../lib/geo'
import { publishRoomSignal } from '../../lib/roomSignal'
import {
  featuredDateLabel,
  joinedCount,
  placeLabel,
  upcomingDayLabel,
} from '../../lib/pulse'
import { revealPromptText, revealReadiness } from '../../lib/reveal'
import {
  PUBLIC_CHECKIN_WARNING,
  shouldWarnBeforePublicCheckIn,
} from '../../lib/roomVisibility'
import {
  hasSeenPublicCheckInWarning,
  markPublicCheckInWarningSeen,
} from '../../lib/roomVisibilityStorage'
import { apiClient, ProfileCache } from '../../lib/apiClient'
import { scheduleEventReminder, cancelEventReminder } from '../../lib/notifications'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { usePresence } from '../../lib/usePresence'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { formatTimeRange as fmtRange } from '../../lib/time'
import { useInteractionFeedback } from '../../lib/useInteractionFeedback'
import { useLiveSync } from '../../lib/useLiveSync'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { useAuth } from '../../lib/useAuth'
import type { TraySize } from '../../lib/uxStandards'
import { APP_COLORS, EMBER, EMBER_TYPE } from '../../lib/theme'

/*
 * Distance in METRES, not kilometres.
 *
 * This returned kilometres and was compared against `check_in_radius`, which
 * the API supplies in metres -- so `distance <= 100` was true anywhere within a
 * hundred kilometres and the "Check In" button appeared across the city. The
 * server refused correctly, so the user simply tapped and was rejected.
 *
 * Converting once here, at the boundary, rather than at each call site: the
 * bug existed because two call sites disagreed about the unit, and the fix
 * should remove the opportunity rather than patch both.
 */
/*
 * One shared definition, in `lib/api.ts`, derived from the API mapping itself.
 *
 * This was a hand-written interface duplicated across three files that pass
 * events to each other. TypeScript compared them structurally, so they drifted
 * silently until a correction in one broke a call site in another.
 */
type Event = BlendnEvent

type EventsTrayState = {
  visible: boolean
  title: string
  message?: string
  buttons: ActionTrayButton[]
  size?: TraySize
  dismissible?: boolean
}

const COORDINATE_PATTERN = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CAROUSEL_CARD_WIDTH = Math.max(260, SCREEN_WIDTH - 62)
const CAROUSEL_CARD_HEIGHT = Math.round(CAROUSEL_CARD_WIDTH * 1.55)
const CAROUSEL_ITEM_SPACING = 14
const CAROUSEL_ITEM_FULL = CAROUSEL_CARD_WIDTH + CAROUSEL_ITEM_SPACING
const TYPE_HEADER_SIZE = 22
const TYPE_HEADER_LINE = 28
const TYPE_CARD_TITLE_SIZE = 20
const TYPE_CARD_TITLE_LINE = 26
const TYPE_BODY_SIZE = 14
const TYPE_META_SIZE = 13
const TYPE_CAPTION_SIZE = 12
const SECTION_MOTION_BASE_DELAY = 34
const SECTION_MOTION_STAGGER = 44

/**
 * Which parent categories count as a night out.
 *
 * Parent **slugs** from the server's taxonomy (`scripts/seed-categories.ts` in
 * blendn-admin), not names — slugs are what shared links and the mobile filter
 * already match on, and they do not change when someone retitles a category.
 *
 * Deliberately just `nightlife`. Adding `music` would sweep in the whole family
 * including Classical and Carnatic, which is the exact false positive the old
 * substring match produced. A gig is not a party, and if music deserves a
 * section it should get its own rather than being smuggled into this one.
 */
const NIGHTLIFE_GROUPS = new Set(['nightlife'])

const formatCarouselCardDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'Date TBA'
  }
}

const isCoordinateLike = (value?: string | null) => {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (COORDINATE_PATTERN.test(trimmed)) return true
  return /^-?\d+(\.\d+)?$/.test(trimmed)
}

const resolveDisplayCity = (event: Event): string => {
  const cityRaw = event.city?.trim() || ''
  if (cityRaw && !isCoordinateLike(cityRaw)) return cityRaw

  const addressRaw = event.address?.trim() || ''
  if (!addressRaw || isCoordinateLike(addressRaw)) return 'Location TBA'

  const parts = addressRaw.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const likelyCity = parts[parts.length - 2]
    if (!isCoordinateLike(likelyCity)) return likelyCity
  }

  return 'Location TBA'
}

const normalizeEvent = (event: Event): Event => ({
  ...event,
  display_city: resolveDisplayCity(event),
})

const getFirstName = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] || null
}

// Memoized carousel card component to prevent re-renders
const CarouselCard = memo(({
  event,
  onPress,
  onLongPress,
  onToggleInterest,
  isInterested,
  interestLoading,
  statusLabel,
  showCheckout,
  onCheckout,
  checkoutLoading,
}: {
  event: Event
  onPress: () => void
  onLongPress?: () => void
  onToggleInterest?: () => void
  isInterested?: boolean
  interestLoading?: boolean
  statusLabel?: string
  showCheckout?: boolean
  onCheckout?: () => void
  checkoutLoading?: boolean
}) => {
  if (!event.cover_image_url) return null

  return (
    <TouchableOpacity style={styles.carouselCard} onPress={onPress} onLongPress={onLongPress} delayLongPress={320}>
      <View style={styles.carouselImage}>
        <OptimizedImage
          source={event.cover_image_url}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          width={260}
          height={120}
          quality={60}
          cachePolicy="memory-disk"
          priority="high"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.5, 1]}
          style={styles.carouselGradient}
        />
        {statusLabel ? (
          <View style={styles.carouselStatusPill}>
            <View style={styles.carouselStatusDot} />
            <Text style={styles.carouselStatusText}>{statusLabel}</Text>
          </View>
        ) : null}
        <View style={styles.carouselContentOverlay}>
          <Text style={styles.carouselEventTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.carouselTime}>{formatCarouselCardDate(event.start_time)}</Text>
          <Text style={styles.carouselVenue} numberOfLines={1}>{event.venue_name || event.display_city || 'Location TBA'}</Text>
          {showCheckout && onCheckout && (
            <TouchableOpacity
              onPress={onCheckout}
              disabled={checkoutLoading}
              style={styles.carouselCheckoutPill}
            >
              {checkoutLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.carouselCheckoutText}>Check out</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      {onToggleInterest && (
        <TouchableOpacity
          onPress={onToggleInterest}
          style={styles.carouselHeartButton}
          disabled={interestLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isInterested ? 'Remove from interested events' : 'Mark as interested'}
        >
          {interestLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name={isInterested ? 'heart' : 'heart-outline'} size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
})

CarouselCard.displayName = 'CarouselCard'

export default function Events() {
  const { user, loading: authLoading } = useAuth()
  const feedback = useInteractionFeedback()
  const insets = useSafeAreaInsets()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityData, setProximityData] = useState<{ [eventId: string]: any }>({})
  const [checkinStatuses, setCheckinStatuses] = useState<{ [eventId: string]: any }>({})

  /*
   * Presence: keep the organiser's live occupancy number honest.
   *
   * Check-in was a one-shot gate, so anyone who left without pressing check out
   * stayed counted all night and occupancy only ever climbed. The endpoint has
   * existed since API v0.42.0 and nothing has ever called it.
   *
   * Only ever one event: you cannot be physically inside two venues, and the
   * server would reject the second anyway. `find` rather than a list keeps that
   * assumption visible.
   */
  const [checkedInEvents, setCheckedInEvents] = useState<Event[]>([])
  const [interestStatuses, setInterestStatuses] = useState<{ [eventId: string]: boolean }>({})
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({})

  const checkedInEventId =
    Object.keys(checkinStatuses).find((id) => checkinStatuses[id]?.status === 'checked_in') ?? null
  const presence = usePresence(checkedInEventId)

  // The server has ended this check-in -- the user walked out and the grace
  // period expired, or the sweeper got there first. Reflect it rather than
  // leaving a stale "checked in" chip on screen.
  useEffect(() => {
    if (!presence.finished || !checkedInEventId) return
    setCheckinStatuses((prev) => ({
      ...prev,
      [checkedInEventId]: { ...prev[checkedInEventId], status: 'checked_out' },
    }))
  }, [presence.finished, checkedInEventId])
  const [interestPending, setInterestPending] = useState<Record<string, boolean>>({})
  const [checkInPending, setCheckInPending] = useState<Record<string, boolean>>({})
  const [checkOutPending, setCheckOutPending] = useState<Record<string, boolean>>({})
  /*
   * Browse scope, and the two things that are *not* it.
   *
   * `selectedCity` decides what is fetched and what every section is scoped to.
   * `deviceCity` is where the phone thinks it is — used only to offer a switch
   * and to decide whether distances are meaningful. `profile.location` no
   * longer feeds either: it is reverse-geocoded once at signup and goes stale
   * the moment anyone travels, which is how a Bengaluru header ended up over a
   * German query.
   */
  const [favoriteEvents, setFavoriteEvents] = useState<Event[]>([])
  /*
   * The selection carries **how it was set**, not just what it is.
   *
   * A city you tapped and a city we guessed look identical as strings, and
   * treating them the same is what produced the trap: a device in Germany got
   * dropped into Bengaluru by the busiest-city fallback and then had no way
   * back, because the guess was defended as if it were a decision.
   *
   * A guess may be replaced by a better guess. A choice never is.
   */
  const [selection, setSelection] = useState<StoredCity | null>(null)
  const selectedCity = selection?.city ?? null
  const [cityOptions, setCityOptions] = useState<CityOption[]>([])
  const [deviceCity, setDeviceCity] = useState<string | null>(null)
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const [userFirstName, setUserFirstName] = useState<string | null>(getFirstName(user?.name))
  const [showPreviewHint, setShowPreviewHint] = useState(false)
  const { setScrollProgress } = useGradientOverlay()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  const listRef = useRef<any>(null)
  const scrollY = useRef(new RNAnimated.Value(0)).current
  const [netError, setNetError] = useState<string | null>(null)

  /*
   * Search, in two pieces of state rather than one.
   *
   * `searchInput` is what is on screen and updates on every keystroke, so the
   * field never lags the finger. `searchTerm` is what the request is scoped by
   * and only catches up once typing stops — one is a render concern, the other
   * is a network one, and sharing a variable makes every keystroke a fetch.
   *
   * `GET /events` has taken a `search` parameter the whole time and no screen
   * in the app has ever sent one. This is the first.
   */
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const isSearching = searchTerm.trim().length > 0

  useEffect(() => {
    const trimmed = searchInput.trim()
    // No wait when clearing. Emptying the box is a request to see the normal
    // screen again, and making somebody watch a spinner for a third of a second
    // to get back to where they started reads as the app being slow.
    if (trimmed.length === 0) {
      setSearchTerm('')
      return
    }
    const id = setTimeout(() => setSearchTerm(trimmed), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const [trayState, setTrayState] = useState<EventsTrayState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    size: 'default',
    dismissible: true,
  })
  // Location permission status: 'checking' | 'granted' | 'denied' | 'undetermined'
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied' | 'undetermined'>('checking')
  const locationRequestInFlight = useRef(false)
  const locationRequestedRef = useRef(false)
  const interestInFlightRef = useRef<Set<string>>(new Set())
  const checkInFlightRef = useRef<Set<string>>(new Set())
  const checkOutInFlightRef = useRef<Set<string>>(new Set())
  const lastFetchLocationRef = useRef<string>('none')
  const initialLoadedRef = useRef(false)
  const previewHintSeenRef = useRef(false)

  const closeTray = useCallback(() => {
    setTrayState((prev) => ({ ...prev, visible: false }))
  }, [])

  const showTray = useCallback((next: Omit<EventsTrayState, 'visible'>) => {
    setTrayState({
      visible: true,
      title: next.title,
      message: next.message,
      buttons: next.buttons,
      size: next.size || 'default',
      dismissible: next.dismissible ?? true,
    })
  }, [])

  const previewHintKey = useMemo(
    () => (user?.id ? `events_preview_hint_seen_${user.id}` : null),
    [user?.id]
  )

  const markPreviewHintSeen = useCallback(() => {
    if (previewHintSeenRef.current) return
    previewHintSeenRef.current = true
    setShowPreviewHint(false)
    if (!previewHintKey) return
    AsyncStorage.setItem(previewHintKey, '1').catch(() => {})
  }, [previewHintKey])

  useEffect(() => {
    let mounted = true
    const hydratePreviewHint = async () => {
      if (!previewHintKey) {
        previewHintSeenRef.current = true
        if (mounted) setShowPreviewHint(false)
        return
      }
      try {
        const seen = await AsyncStorage.getItem(previewHintKey)
        const hasSeen = seen === '1'
        previewHintSeenRef.current = hasSeen
        if (mounted) setShowPreviewHint(!hasSeen)
      } catch {
        previewHintSeenRef.current = false
        if (mounted) setShowPreviewHint(true)
      }
    }
    hydratePreviewHint()
    return () => {
      mounted = false
    }
  }, [previewHintKey])

  // Memoized callbacks to prevent re-creation
  const handleEventPress = useCallback((event: Event) => {
    // Warm the event detail cache before navigation (fire-and-forget)
    apiClient.getEvent(event.id, {
      include: 'interestedUsers',
      interestedLimit: 6,
      lat: userLocation?.latitude,
      lon: userLocation?.longitude,
    }).catch(() => {})

    if (event.cover_image_url) {
      const hero = getOptimizedImageUrl(event.cover_image_url, {
        width: 1080,
        height: 520,
        resize: 'cover',
        quality: 70,
        format: 'webp',
      })
      if (hero) {
        preloadImages([hero], 'high').catch(() => {})
      }
    }

    router.push({
      pathname: '/event/[id]',
      params: {
        id: event.id,
        title: event.title,
        cover: event.cover_image_url || '',
        venue: event.venue_name,
        city: event.display_city || event.city || '',
        start: event.start_time,
        end: event.end_time,
        category: event.category || '',
        description: event.description || '',
        interestCount: String(interestCounts[event.id] ?? event.favorite_count ?? 0),
      } as any,
    })
  }, [userLocation, interestCounts])

  const handleCheckIn = useCallback(async (event: Event) => {
    if (checkInFlightRef.current.has(event.id)) return
    let previousStatus: any = undefined
    let hadCheckedInEvent = false
    try {
      Logger.journey('checkin', 'start', { eventId: event.id })
      if (!user) {
        Logger.journey('auth', 'blocked:notSignedIn')
        showTray({
          title: 'Sign in required',
          message: 'Please sign in to check in to events.',
          buttons: [
            { label: 'Not now', onPress: closeTray },
            { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
          ],
        })
        return
      }
      if (!userLocation) {
        showTray({
          title: 'Location required',
          message: 'Enable location to verify proximity and check in.',
          buttons: [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                try { (Linking as any)?.openSettings?.() } catch {}
              }
            },
          ],
        })
        return
      }

      checkInFlightRef.current.add(event.id)
      setCheckInPending((prev) => ({ ...prev, [event.id]: true }))
      feedback.tap()
      previousStatus = checkinStatuses[event.id]
      hadCheckedInEvent = checkedInEvents.some((e) => e.id === event.id)

      // Optimistic UI update
      setCheckinStatuses((prev) => ({
        ...prev,
        [event.id]: {
          status: 'checked_in',
          checkInTime: new Date().toISOString(),
        },
      }))
      if (!hadCheckedInEvent) {
        setCheckedInEvents((prev) => [event, ...prev])
      }
      
      // Call standardized production check-in RPC
      Logger.journey('checkin', 'api:checkIn:call', { eventId: event.id })
      const result = await apiClient.checkIn(event.id, {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        deviceInfo: { gpsAccuracy: 50 },
      })

      if (!result.success) {
        // Rollback optimistic update
        setCheckinStatuses((prev) => {
          const next = { ...prev }
          if (previousStatus) next[event.id] = previousStatus
          else delete next[event.id]
          return next
        })
        if (!hadCheckedInEvent) {
          setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))
        }
        Logger.error('events', 'Check-in error', { error: result.error })
        feedback.error()
        showTray({
          title: 'Check-in failed',
          message: result.error || 'Unknown error',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        })
        return
      }

      Logger.journey('checkin', 'success', { eventId: event.id })
      feedback.success()

      /*
       * The reveal suggestion, offered rather than applied.
       *
       * `revealSuggestion` is true when this person has `reveal_by_default`
       * set. Check-in used to *apply* that — so walking into a room could name
       * you, and someone visible at a work meetup in March was visible at a
       * club in August without touching anything. The server now always creates
       * `revealed: false` and hands the preference back for the app to ask
       * about.
       *
       * Asking rather than undoing is the point: there is no moment at which
       * they are named before answering. Dismissing writes nothing, because the
       * row is already false — and so does killing the app mid-prompt, which is
       * the right way for this to fail.
       *
       * **The first one explains; the rest just ask.** Someone who set this in
       * onboarding has agreed to a sentence on a settings screen, which is not
       * the same as picturing their name and face in a room full of strangers.
       * The first prompt spells out what becomes visible and to whom; after
       * that the banner carries it, continuously, which is the better teacher
       * anyway. `shouldWarnBeforePublicCheckIn` holds the three conditions.
       */
      if (result.data?.revealSuggestion) {
        const firstTime =
          !!user?.id &&
          shouldWarnBeforePublicCheckIn({
            revealByDefault: true,
            hasSeenWarning: await hasSeenPublicCheckInWarning(user.id),
            // Nothing to reveal means nothing to warn about — the same check
            // the reveal switch makes before it offers itself.
            // `User.image` is a mirror of `photos[0]`, written only by the
            // profile PUT — so it is the same photo a reveal would show.
            canReveal: revealReadiness({
              name: userFirstName,
              photos: user?.image ? [user.image] : [],
            }).ok,
          })
        if (firstTime && user?.id) await markPublicCheckInWarningSeen(user.id)

        showTray({
          title: firstTime ? PUBLIC_CHECKIN_WARNING.title : 'Show your name here?',
          message: firstTime ? PUBLIC_CHECKIN_WARNING.body : revealPromptText(userFirstName),
          buttons: [
            {
              label: firstTime ? PUBLIC_CHECKIN_WARNING.confirm : 'Yes, show my name',
              variant: 'primary',
              onPress: () => {
                closeTray()
                apiClient
                  .setMatchPreferences(event.id, { revealed: true })
                  .catch((e) => Logger.error('match', 'reveal from prompt failed', { error: e }))
              },
            },
            // Deliberately not "No" — nothing is being refused. Staying
            // anonymous is the state they are already in.
            { label: PUBLIC_CHECKIN_WARNING.cancel, onPress: closeTray },
          ],
        })
        return
      }

      // Get event chat and offer navigation
      const chatResult = await apiClient.getEventChat(event.id)
      if (chatResult.success && chatResult.data?.id) {
        // Captured before the closure: the guard above narrows `data` here, but
        // TypeScript drops that narrowing inside `onPress`, which runs later and
        // could in principle see a reassigned value.
        const chatId = chatResult.data.id
        const chatName = chatResult.data.name || 'Event Chat'
        showTray({
          title: 'Checked in',
          message: 'You have been checked in and added to the event chat.',
          buttons: [
            {
              label: 'Go to Chat',
              variant: 'primary',
              onPress: () => {
                closeTray()
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: chatId,
                    roomName: chatName,
                    eventTitle: event.title,
                  } as any,
                })
              },
            },
            { label: 'Stay here', onPress: closeTray },
          ],
        })
      } else {
        showTray({
          title: 'Checked in',
          message: 'You have been checked in.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        })
      }

      // Refresh the checkin status for this event
      loadCheckinStatusesBatch()
      loadCheckedInEvents()
    } catch (error) {
      setCheckinStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[event.id] = previousStatus
        else delete next[event.id]
        return next
      })
      if (!hadCheckedInEvent) {
        setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))
      }
      Logger.error('events', 'Unexpected error', { error: error as any })
      feedback.error()
      showTray({
        title: 'Check-in failed',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
      })
    } finally {
      checkInFlightRef.current.delete(event.id)
      setCheckInPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [user, userLocation, checkinStatuses, checkedInEvents, feedback, showTray, closeTray])

  const toggleInterest = useCallback(async (event: Event) => {
    if (interestInFlightRef.current.has(event.id)) return
    let prevInterested = false
    let prevCount = 0
    try {
      if (!user) {
        showTray({
          title: 'Sign in required',
          message: 'Please sign in to save events.',
          buttons: [
            { label: 'Not now', onPress: closeTray },
            { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
          ],
          size: 'compact',
        })
        return
      }
      interestInFlightRef.current.add(event.id)
      setInterestPending((prev) => ({ ...prev, [event.id]: true }))
      feedback.tap()
      prevInterested = !!interestStatuses[event.id]
      prevCount = interestCounts[event.id] ?? event.favorite_count ?? 0
      const optimisticCount = Math.max(0, prevInterested ? prevCount - 1 : prevCount + 1)
      // Optimistic update
      setInterestStatuses(prev => ({ ...prev, [event.id]: !prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: optimisticCount }))

      const result = await apiClient.toggleInterest(event.id)
      if (!result.success || !result.data) {
        // rollback
        setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
        setInterestCounts(prev => ({ ...prev, [event.id]: prevCount }))
        feedback.error()
        showTray({
          title: 'Update failed',
          message: 'Failed to update interest.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
        return
      }
      setInterestStatuses(prev => ({ ...prev, [event.id]: result.data!.interested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: result.data!.interestCount }))
      feedback.tap()
      Logger.journey('events', result.data!.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
      // Schedule / cancel event reminder based on interest state
      if (result.data!.interested) {
        scheduleEventReminder({
          id: event.id,
          title: event.title,
          start_time: event.start_time,
          venue_name: event.venue_name,
        }).catch(() => {})
      } else {
        cancelEventReminder(event.id).catch(() => {})
      }
    } catch {
      setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: prevCount }))
      feedback.error()
      showTray({
        title: 'Update failed',
        message: 'Failed to update interest.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    } finally {
      interestInFlightRef.current.delete(event.id)
      setInterestPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [user, interestStatuses, interestCounts, feedback, showTray, closeTray])

  const handleEventPreview = useCallback((event: Event) => {
    markPreviewHintSeen()
    const checkinStatus = checkinStatuses[event.id]
    const proximity = proximityData[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = !!proximity?.within_radius && !isCheckedIn
    const interested = !!interestStatuses[event.id]
    const summary = [
      formatCarouselCardDate(event.start_time),
      event.venue_name || event.display_city || 'Location TBA',
      (event.short_description || event.description || '').trim(),
      'Tip: long-press cards for quick actions.',
    ].filter(Boolean).join('\n')

    const buttons: ActionTrayButton[] = [
      {
        label: interested ? 'Remove Interest' : 'Mark Interested',
        onPress: () => {
          closeTray()
          toggleInterest(event)
        },
      },
      {
        label: 'View Details',
        variant: 'primary',
        onPress: () => {
          closeTray()
          handleEventPress(event)
        },
      },
    ]

    if (canCheckIn) {
      buttons.unshift({
        label: 'Check In',
        variant: 'primary',
        onPress: () => {
          closeTray()
          handleCheckIn(event)
        },
      })
    }

    showTray({
      title: event.title,
      message: summary,
      buttons,
      size: 'expanded',
    })
  }, [checkinStatuses, proximityData, interestStatuses, closeTray, toggleInterest, handleEventPress, handleCheckIn, showTray, markPreviewHintSeen])

  const handleCheckOut = useCallback(async (event: Event) => {
    if (checkOutInFlightRef.current.has(event.id)) return
    checkOutInFlightRef.current.add(event.id)
    setCheckOutPending((prev) => ({ ...prev, [event.id]: true }))
    feedback.tap()

    const previousStatus = checkinStatuses[event.id]
    const previousCheckedInEvents = checkedInEvents

    // Optimistic removal from checked-in state
    setCheckinStatuses((prev) => ({ ...prev, [event.id]: { status: 'not_checked_in' } }))
    setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))

    try {
      const result = await apiClient.checkOut(String(event.id))
      if (result.success) {
        feedback.success()
        showTray({
          title: 'Checked out',
          message: 'You have been checked out of this event.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
        loadCheckedInEvents()
        loadCheckinStatusesBatch()
      } else {
        // Rollback on failure
        setCheckinStatuses((prev) => {
          const next = { ...prev }
          if (previousStatus) next[event.id] = previousStatus
          else delete next[event.id]
          return next
        })
        setCheckedInEvents(previousCheckedInEvents)
        feedback.error()
        showTray({
          title: 'Checkout failed',
          message: result.error || 'Please try again.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
      }
    } catch {
      setCheckinStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[event.id] = previousStatus
        else delete next[event.id]
        return next
      })
      setCheckedInEvents(previousCheckedInEvents)
      feedback.error()
      showTray({
        title: 'Checkout failed',
        message: 'Please try again.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    } finally {
      checkOutInFlightRef.current.delete(event.id)
      setCheckOutPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [checkinStatuses, checkedInEvents, feedback, showTray, closeTray])

  /*
   * NOT memoised, and that is the fix.
   *
   * This was `useCallback(..., [])`. `fetchEvents` is a plain arrow function
   * redefined on every render, so an empty dependency array froze the copy
   * created on the FIRST render — the one whose closure captured
   * `userLocation` while it was still `null`, before the GPS fix arrived.
   *
   * The result was two refresh paths that disagreed forever. Pull-to-refresh
   * ran the stale copy, sent no `lat`/`lon`, and the server applied no bounding
   * box at all — so it returned **every event on the platform**, while the
   * Refresh button ran the live copy and correctly returned the ones nearby.
   * A device in Germany saw a Bengaluru event by pulling and nothing by
   * tapping, which reads as a broken button rather than a leaked query.
   *
   * A `RefreshControl` handler is called once per gesture, so there is nothing
   * to memoise for. Re-creating it per render is the cheap, obviously-correct
   * option, and it cannot go stale again.
   */
  const onRefresh = async () => {
    setRefreshing(true)
    await fetchEvents({ silent: true, force: true })
    setRefreshing(false)
  }

  const requestLocationIfNeeded = useCallback((force = false) => {
    if (userLocation) return
    if (locationRequestInFlight.current) return
    if (locationStatus === 'denied' && !force) return
    locationRequestInFlight.current = true
    locationRequestedRef.current = true
    getCurrentLocationQuietly()
      .finally(() => {
        locationRequestInFlight.current = false
      })
  }, [userLocation, locationStatus])

  const onScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y
    scrollY.setValue(y)
    setScrollProgress(y, 320)
    if (!locationRequestedRef.current && y > 180) {
      requestLocationIfNeeded(false)
    }
  }, [setScrollProgress, requestLocationIfNeeded, scrollY])

  // Single profile fetch for avatar and city - uses cached profile if available
  const loadUserProfile = useCallback(async () => {
    if (!user) return
    try {
      const authFirstName = getFirstName(user.name)
      if (authFirstName) setUserFirstName(authFirstName)

      // Check cache first. `_layout.tsx` used to populate this on every cold
      // start for its onboarding gate; that gate is gone, so this is now a
      // genuine miss on first load rather than a warm read.
      const cached = ProfileCache.get(user.id)
      const data = cached || (await apiClient.getProfile(user.id).then(r => r.success ? r.data : null))

      if (data) {
        const dataFirstName = getFirstName(data.profile?.name) || getFirstName(data.name)
        if (dataFirstName) setUserFirstName(dataFirstName)

        const profile = data.profile
        if (profile) {
          // Only use URLs that are valid and not empty
          const primary = (Array.isArray(profile.profile_photos) && profile.profile_photos[0]) ||
                         (Array.isArray(profile.photos) && profile.photos[0]) ||
                         null // Don't use data.image (Google avatar) as it often fails
          if (primary && primary.length > 0) {
            setAvatarUrl(primary)
          }
          /*
           * `profile.location` deliberately no longer sets the browse city.
           *
           * It is reverse-geocoded once at signup and never again, so it is
           * stale for anyone who has travelled — and it was being shown as the
           * header ("Bengaluru") above a query filtered to wherever the device
           * actually was. Two different notions of "where you are" in one
           * screen, and the reason this investigation started.
           */
        }
      }
    } catch {}
  }, [user])

  // Check location permission status on mount (without requesting)
  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          // Permission already granted - mark as granted immediately (before fetching coords)
          setLocationStatus('granted')
          try {
            const lastKnown = await Location.getLastKnownPositionAsync()
            if (lastKnown?.coords) {
              setUserLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude })
            }
          } catch {}
          // Defer live GPS to avoid blocking startup render
          setTimeout(async () => {
            try {
              const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
            } catch {
              // Position fetch failed but permission is still granted - don't show prompt
            }
          }, 600)
        } else if (status === 'denied') {
          setLocationStatus('denied')
        } else {
          // 'undetermined' - permission not yet requested
          setLocationStatus('undetermined')
        }
      } catch {
        // On error, assume undetermined
        setLocationStatus('undetermined')
      }
    }
    checkLocationPermission()
  }, [])

  /*
   * Refetch when the browsed city changes, as well as on sign-in.
   *
   * `selectedCity` is in the dependency list because it is what the request is
   * scoped by — without it, picking a city would change the header and leave
   * the list showing the previous city's events, which is the same class of
   * mismatch this whole change exists to remove.
   */
  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id, city: selectedCity })
      fetchEvents()
    }
    // `fetchEvents` is redefined every render and is deliberately not a
    // dependency — including it would refetch on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, selectedCity, searchTerm])

  useEffect(() => {
    const authFirstName = getFirstName(user?.name)
    if (authFirstName) {
      setUserFirstName(authFirstName)
    }
  }, [user?.name])

  // Preload images - use a ref to track already preloaded URLs and avoid redundant work
  const preloadedUrlsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (events.length === 0) return
    const urls = events
      .filter((event) => !!event.cover_image_url)
      .slice(0, 8)
      .map((event) =>
        getOptimizedImageUrl(event.cover_image_url as string, {
          width: 520,
          height: 240,
          resize: 'cover',
          quality: 60,
          format: 'webp',
        })
      )
      .filter(url => !preloadedUrlsRef.current.has(url))

    if (urls.length > 0) {
      urls.forEach(url => preloadedUrlsRef.current.add(url))
      preloadImages(urls, 'normal').catch(() => {})
    }
  }, [events])

  const loadCheckedInEvents = async () => {
    if (!user) return
    try {
      Logger.journey('checkin', 'loadActiveCheckins:start', { userId: user.id })
      const result = await apiClient.getActiveCheckins()
      if (result.success && result.data?.checkIns) {
        // Transform check-in data to Event format
        const activeEvents: Event[] = result.data.checkIns
          .filter((c: any) => c.event)
          .map((c: any) => eventFromApi(c.event))
          .map(normalizeEvent)
        setCheckedInEvents(activeEvents)
        Logger.journey('checkin', 'loadActiveCheckins:done', { count: activeEvents.length })
      } else {
        setCheckedInEvents([])
        Logger.journey('checkin', 'loadActiveCheckins:done', { count: 0 })
      }
    } catch (e) {
      Logger.error('events', 'Unexpected error', { error: e as any })
      setCheckedInEvents([])
    }
  }

  const getCarouselItemLayout = useCallback((_: any, index: number) => ({
    length: CAROUSEL_ITEM_FULL,
    offset: CAROUSEL_ITEM_FULL * index,
    index,
  }), [])

  const renderCheckedInCarousel = () => (
    <View style={styles.carouselContainer}>
      <SectionHeader title="You're checked in" />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        /*
         * No cover-image condition.
         *
         * This filtered on `!!item.cover_image_url`, so an event without one
         * silently vanished from the strip -- and with it the only Check out
         * button, for exactly the events most likely to be small and hastily
         * created. A missing image is a reason to render a placeholder, never a
         * reason to hide the thing somebody is currently checked in to.
         */
        data={checkedInEvents.slice(0, 10)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            statusLabel="Going"
            showCheckout
            onCheckout={() => handleCheckOut(item)}
            checkoutLoading={!!checkOutPending[item.id]}
          />
        )}
      />
    </View>
  )

  const renderInterestedCarousel = (items: Event[]) => (
    <View style={styles.carouselContainer}>
      <SectionHeader
        title="Interested"
        actionLabel="VIEW ALL"
        onAction={() => router.push('/going' as any)}
      />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        data={items.filter((item, idx) => !!item.cover_image_url && idx < 10)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            onToggleInterest={() => toggleInterest(item)}
            isInterested={!!interestStatuses[item.id]}
            interestLoading={!!interestPending[item.id]}
            statusLabel="Interested"
          />
        )}
      />
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
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchCheckinStatuses(eventIds)

      if (result.success && result.data?.statuses) {
        const statusMap: { [eventId: string]: any } = {}
        Object.entries(result.data.statuses).forEach(([eventId, statusData]: [string, any]) => {
          statusMap[eventId] = {
            status: statusData.status === 'checked_in' ? 'checked_in' : 'not_checked_in',
            checkInId: statusData.checkInId,
            checkInTime: statusData.checkInTime,
          }
        })
        setCheckinStatuses(statusMap)
        Logger.journey('checkin', 'statusBatch:done', { count: Object.keys(statusMap).length })
      } else {
        // Fallback: set all as not checked in
        const statusMap: { [eventId: string]: any } = {}
        events.forEach((ev) => {
          statusMap[ev.id] = { status: 'not_checked_in' }
        })
        setCheckinStatuses(statusMap)
      }
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
        setLocationStatus(status === 'denied' ? 'denied' : 'undetermined')
        Logger.warn('events', 'permission:notGranted', {})
        showTray({
          title: 'Turn on location',
          message: 'We need your location to show nearby events and enable check-in.',
          buttons: [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                try { (Linking as any)?.openSettings?.() } catch {}
              }
            },
          ],
        })
        return
      }
      setLocationStatus('granted')
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setUserLocation(coords)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      // Keep status as granted if permission was granted but position fetch failed
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
        const distanceMetres = getDistanceMetres(userLocation.latitude, userLocation.longitude, event.latitude, event.longitude)
        // Metres, matching what the API returns. The old default of 0.5 was a
        // kilometre value standing in for "500m" and made the mismatch invisible.
        const checkInRadiusMetres = event.check_in_radius || 500
        return {
          event_id: event.id,
          within_radius: distanceMetres <= checkInRadiusMetres,
          // The field name is the contract: kilometres here, metres above.
          distance_km: distanceMetres / 1000,
          can_check_in: distanceMetres <= checkInRadiusMetres
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

  /*
   * Decide which city to browse, once, before the first fetch.
   *
   * The server owns the list, so this is one request and never a geocode on
   * the cold path — a first launch on a bad connection still gets a populated
   * screen rather than a blank one. `resolveBrowseCity` holds the fallback
   * order and is tested in `__tests__/city.test.ts`.
   */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [stored, response] = await Promise.all([
        readStoredCity(),
        apiClient.getEventCities(),
      ])
      if (cancelled) return

      const available = response.success && response.data ? response.data.cities : []
      setCityOptions(available)
      setSelection((current) =>
        // Never overwrite a choice the user made while this was in flight.
        current ?? resolveBrowseCity({ stored, deviceCity: null, available })
      )
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Where the device is, in city terms. Used to *offer* a switch and to decide
   * whether distances mean anything — never to change the selection.
   *
   * `expo-location`'s reverse geocode rather than the server's: this is about
   * the phone, not about an event, and it works offline from the platform's own
   * cache. Its spelling is only ever compared against the server's list, never
   * stored or sent — `resolveBrowseCity` returns the server's spelling when the
   * two match, so the value used as a filter is always one the server knows.
   */
  useEffect(() => {
    if (!userLocation) return
    let cancelled = false
    ;(async () => {
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        })
        if (cancelled) return
        setDeviceCity(place?.city || place?.subregion || place?.region || null)
      } catch (error) {
        // Not being able to name where you are costs a "switch?" prompt and a
        // distance label. It must not interrupt browsing.
        Logger.warn('events', 'Could not resolve the device city', { error: error as any })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userLocation])

  /*
   * Once the device city is known, a **guess** may be improved. A choice is not.
   *
   * `cityOnResume` is the whole policy and it is tested; this effect only feeds
   * it. It returns null far more often than not — for a chosen city, for a
   * device city with no events, for no location fix — and null means leave the
   * selection exactly where it is.
   *
   * The replacement stays `inferred`, so it can be improved again next time.
   */
  useEffect(() => {
    if (!deviceCity || cityOptions.length === 0) return
    setSelection((current) => {
      if (!current) {
        return resolveBrowseCity({ stored: null, deviceCity, available: cityOptions })
      }
      const next = cityOnResume({ stored: current, deviceCity, available: cityOptions })
      return next ? { city: next, source: 'inferred' } : current
    })
  }, [deviceCity, cityOptions])

  /*
   * Re-check where the phone is when the app comes back to the foreground.
   *
   * Without this, "reopened after a long time" does nothing at all: the screen
   * resolves its city in a mount effect, and returning from background does not
   * remount. Someone could fly to another city, reopen the app, and be shown
   * the old one with no banner and no update — the app would not have looked.
   *
   * Only the *coordinates* are refreshed here. What happens next is the effect
   * above, which is where the never-override-a-choice rule lives.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      Location.getLastKnownPositionAsync()
        .then((position) => {
          if (!position) return
          setUserLocation((current) =>
            current &&
            Math.abs(current.latitude - position.coords.latitude) < 0.01 &&
            Math.abs(current.longitude - position.coords.longitude) < 0.01
              ? current
              : { latitude: position.coords.latitude, longitude: position.coords.longitude }
          )
        })
        // A refused or unavailable fix is not an error worth surfacing: it just
        // means the city stays where it was.
        .catch(() => {})
    })
    return () => sub.remove()
  }, [])

  /*
   * Favourites, fetched by user rather than read out of the browse list.
   *
   * Refetched when the events list is, so favouriting something on this screen
   * still updates the carousel — `interestStatuses` covers the optimistic case
   * in between.
   */
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const result = await apiClient.getUserFavorites(user.id)
      if (cancelled || !result.success || !result.data) return
      setFavoriteEvents(
        (result.data as any[]).map((e) => normalizeEvent({
          ...e,
          venue_name: e.venueName ?? e.venue_name ?? '',
          start_time: e.startTime ?? e.start_time,
          end_time: e.endTime ?? e.end_time,
          cover_image_url: e.coverImageUrl ?? e.cover_image_url ?? null,
        } as any))
      )
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, events])

  /**
   * Every path a user can take to a city, and all of them count as choosing.
   *
   * The picker, the "you're in X, switch?" banner, and "use my current
   * location" all land here. Once chosen, the app stops moving them.
   */
  const chooseCity = useCallback((city: string) => {
    setSelection({ city, source: 'chosen' })
    setCityPickerOpen(false)
    void storeCity(city, 'chosen')
  }, [])

  const switchSuggestion = useMemo(
    () => shouldOfferSwitch({ selected: selectedCity, deviceCity, available: cityOptions }),
    [selectedCity, deviceCity, cityOptions]
  )

  /**
   * The other half of `switchSuggestion`, for when there is nowhere to switch.
   *
   * Mutually exclusive with it by construction — `lib/city.ts` pins that across
   * every combination — so the screen never carries two messages about the same
   * fact.
   */
  const away = useMemo(
    () => awayNotice({ selected: selectedCity, deviceCity, available: cityOptions }),
    [selectedCity, deviceCity, cityOptions]
  )

  /*
   * Tell the server where somebody is waiting.
   *
   * Fires on exactly the condition the banner renders on — the user is standing
   * in a city we have not launched in — because that is the only demand data
   * this product gets before it has any supply, and until now the app noticed
   * it, said so on screen, and discarded it.
   *
   * **Once per city per session.** The server counts people rather than opens,
   * so repeating it changes nothing; the ref is here to avoid a pointless
   * request every time this memo recomputes, not to protect the count.
   *
   * Deliberately not awaited and deliberately silent on failure. A lost signal
   * costs a data point; a spinner over it would cost a user.
   */
  const demandSentRef = useRef<string | null>(null)
  useEffect(() => {
    if (!away) return
    const key = away.deviceCity.trim().toLowerCase()
    if (demandSentRef.current === key) return
    demandSentRef.current = key
    void apiClient.recordCityDemand(away.deviceCity)
  }, [away])

  const browsingHere = isBrowsingHere(selectedCity, deviceCity)

  /**
   * The selected city is somewhere we have no events at all.
   *
   * `cityOptions` is exactly the set of cities with something on, so a
   * selection outside it means we have not launched there — a different
   * message from "quiet week", and one the user can only reach deliberately,
   * via "use my current location". Guarded on the list having loaded, so a slow
   * request does not flash "coming soon" at someone in Bengaluru.
   */
  const notLiveHere = cityOptions.length > 0 && !isServedCity(selectedCity, cityOptions)

  const fetchEvents = async (options?: { silent?: boolean; force?: boolean }) => {
    try {
      const isInitial = !initialLoadedRef.current
      const shouldShowLoading = isInitial || !options?.silent
      if (shouldShowLoading) {
        setLoading(true)
      }
      setNetError(null)
      Logger.journey('events', 'fetch:start')

      /*
       * `city` scopes; `lat`/`lon` only sort and label.
       *
       * No `radius` is sent, and the server no longer supplies one. That
       * default — 10 km around the device — is what made this screen blank:
       * every section below is a `useMemo` over this one array, so an empty
       * result took the whole page with it, carousels and heroes included.
       */
      const lat = userLocation?.latitude
      const lon = userLocation?.longitude
      const { data: eventsData, meta, error } = await fetchEventsApi({
        page: 0,
        limit: PAGE_SIZE,
        city: selectedCity ?? undefined,
        lat,
        lon,
        include: 'checkins,activeCheckins,profile',
        search: searchTerm || undefined,
      }, { force: !!options?.force })

      if (error) {
        Logger.error('events', 'Error fetching events', { error })
        setNetError('Failed to load events')
        return
      }

      const normalized = (eventsData || []).map(normalizeEvent)
      setEvents(normalized)
      /*
       * Hand the centre button what this fetch already knows.
       *
       * This screen asks for events with a location and gets `distance` back on
       * every one. The tab bar needs two facts derived from exactly that —
       * whether you are standing inside a fence, and what you said you were
       * going to tonight — and re-deriving them there would mean a second
       * location permission dance and a second copy of this list on a timer.
       */
      publishRoomSignal(normalized)
      setPage(0)
      lastFetchLocationRef.current = lat && lon ? `${lat},${lon}` : 'none'
      initialLoadedRef.current = true
      if (eventsData) {
        const interestMap: { [eventId: string]: boolean } = {}
        const countMap: Record<string, number> = {}
        const checkinMap: { [eventId: string]: any } = {}
        eventsData.forEach((event) => {
          interestMap[event.id] = !!event.is_favorited
          countMap[event.id] = event.favorite_count || 0
          if (event.user_checkin) {
            checkinMap[event.id] = {
              status: event.user_checkin.status === 'checked_in' ? 'checked_in' : event.user_checkin.status,
              checkInId: event.user_checkin.checkInId,
              checkInTime: event.user_checkin.checkInTime,
            }
          }
        })
        setInterestStatuses(interestMap)
        setInterestCounts(countMap)
        setCheckinStatuses(checkinMap)
      }
      if (meta?.activeCheckins?.length) {
        const activeEvents: Event[] = meta.activeCheckins
          .filter((c: any) => c.event)
          .map((c: any) => eventFromApi(c.event))
          .map(normalizeEvent)
        setCheckedInEvents(activeEvents)
      } else {
        setCheckedInEvents([])
      }
      if (meta?.profile?.profile) {
        const profile = meta.profile.profile
        const profileFirstName = getFirstName(profile.name)
        if (profileFirstName) {
          setUserFirstName(profileFirstName)
        }
        const primary = (Array.isArray(profile.profile_photos) && profile.profile_photos[0]) ||
          (Array.isArray(profile.photos) && profile.photos[0]) ||
          null
        if (primary && primary.length > 0) {
          setAvatarUrl(primary)
        }
        // `profile.location` does not set the browse city — see the note where
        // the profile is loaded above.
      }
      // Image preloading is handled by useEffect when events change
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      setNetError('Failed to load events')
    } finally {
      if (!options?.silent || !initialLoadedRef.current) {
        setLoading(false)
      }
    }
  }

  const socketStatus = useLiveSync({
    enabled: !!user && !authLoading,
    onSync: () => fetchEvents({ silent: true, force: true }),
    domains: ['events'],
    connectedIntervalMs: 30000,
    disconnectedIntervalMs: 12000,
    maxDisconnectedIntervalMs: 45000,
  })

  // If location becomes available after initial load, refetch with coordinates
  useEffect(() => {
    if (!user || authLoading) return
    if (!userLocation) return
    if (loading) return
    const key = `${userLocation.latitude},${userLocation.longitude}`
    if (lastFetchLocationRef.current !== key) {
      fetchEvents({ silent: true, force: true })
    }
  }, [user, authLoading, userLocation, loading])

  // Basic pagination: fetch next page after current items
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  const fetchMore = useCallback(async () => {
    try {
      if (loading) return
      Logger.journey('events', 'fetchMore:start', { page: page + 1 })
      /*
       * The same scope as page one, which it did not used to have.
       *
       * `city` was missing here while `fetchEvents` sends it, so scrolling to
       * the bottom of a city-scoped list appended events from everywhere — the
       * list silently stopped meaning what its own header said, and only past
       * the fold where nobody looks twice. `search` would have inherited the
       * identical bug the moment it was added, which is how this was found.
       */
      const { data, error } = await fetchEventsApi({
        page: page + 1,
        limit: PAGE_SIZE,
        city: selectedCity ?? undefined,
        lat: userLocation?.latitude,
        lon: userLocation?.longitude,
        include: 'checkins',
        search: searchTerm || undefined,
      })
      if (error) return
      if (!data || data.length === 0) return
      setEvents(prev => {
        const merged = [...prev, ...data.map(normalizeEvent)]
        publishRoomSignal(merged)
        return merged
      })
      setPage(prev => prev + 1)
      const interestMap: { [eventId: string]: boolean } = {}
      const countMap: Record<string, number> = {}
      const checkinMap: { [eventId: string]: any } = {}
      data.forEach((event) => {
        interestMap[event.id] = !!event.is_favorited
        countMap[event.id] = event.favorite_count || 0
        if (event.user_checkin) {
          checkinMap[event.id] = {
            status: event.user_checkin.status === 'checked_in' ? 'checked_in' : event.user_checkin.status,
            checkInId: event.user_checkin.checkInId,
            checkInTime: event.user_checkin.checkInTime,
          }
        }
      })
      setInterestStatuses((prev) => ({ ...prev, ...interestMap }))
      setInterestCounts((prev) => ({ ...prev, ...countMap }))
      setCheckinStatuses((prev) => ({ ...prev, ...checkinMap }))
    } catch {}
  }, [loading, page, userLocation, selectedCity, searchTerm])

  const loadInterestData = async () => {
    try {
      if (!user || events.length === 0) return
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchInterestStatuses(eventIds)

      if (result.success && result.data?.interests) {
        setInterestStatuses(result.data.interests)
        Logger.info('events', 'loadInterestData: batch interest loaded', { count: Object.keys(result.data.interests).length })
      }
    } catch (e) {
      Logger.warn('events', 'loadInterestData failed', { error: e })
      setInterestStatuses({})
    }
  }

  const loadInterestCounts = async () => {
    try {
      if (events.length === 0) return
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchInterestCounts(eventIds)

      if (result.success && result.data?.counts) {
        setInterestCounts(result.data.counts)
        Logger.info('events', 'loadInterestCounts: batch counts loaded', { count: Object.keys(result.data.counts).length })
      }
    } catch (e) {
      Logger.warn('events', 'loadInterestCounts failed', { error: e })
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
        checkInLoading={!!checkInPending[event.id]}
        interestLoading={!!interestPending[event.id]}
        onPress={handleEventPress}
        onLongPress={handleEventPreview}
        onCheckIn={handleCheckIn}
        onToggleInterest={toggleInterest}
      />
    )
  }, [checkinStatuses, proximityData, interestStatuses, interestCounts, checkInPending, interestPending, handleEventPress, handleEventPreview, handleCheckIn, toggleInterest])

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: Event) => item.id, [])

  const renderCarouselWithTitle = (title: string, items: Event[]) => (
    <View style={styles.carouselContainer}>
      <SectionHeader title={title} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        data={items.filter((item, idx) => !!item.cover_image_url && idx < 10)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            onToggleInterest={() => toggleInterest(item)}
            isInterested={!!interestStatuses[item.id]}
            interestLoading={!!interestPending[item.id]}
            statusLabel={checkinStatuses[item.id]?.status === 'checked_in' ? 'Going' : undefined}
          />
        )}
      />
    </View>
  )

  const UPCOMING_ITEM_WIDTH = CAROUSEL_CARD_WIDTH
  const UPCOMING_ITEM_HEIGHT = CAROUSEL_CARD_HEIGHT
  const UPCOMING_ITEM_FULL = CAROUSEL_ITEM_FULL
  // Compensate item spacing so the snapped card centers visually.
  const UPCOMING_SIDE_PADDING = ((SCREEN_WIDTH - UPCOMING_ITEM_WIDTH) / 2) - (CAROUSEL_ITEM_SPACING / 2)

  /*
   * Featured, then Upcoming — the frame's two sections, from one sorted list.
   *
   * `upcomingItems` is already ordered by start time, so the split is a slice
   * rather than a second query. **Featured takes only events that have a cover
   * image**: the card is a photograph with words on it, and one without an image
   * is a dark rectangle with a headline — worse than not being featured. The
   * stack below reads fine either way, so everything else falls through to it.
   *
   * `featuredIds` is what stops the two sections showing the same event twice,
   * which is the same subtraction `mainListData` does further down for the same
   * reason.
   */
  const renderFeaturedRow = () => {
    if (featuredItems.length === 0) return null
    return (
      <View style={styles.pulseSection}>
        <SectionHeader
          title="Featured"
          /*
           * "VIEW ALL" only once there is more than the row already shows.
           *
           * With four featured events and four on screen it is a link to the
           * same four, which is the kind of control that teaches people the
           * app's links do nothing.
           */
          actionLabel={upcomingItems.length > featuredItems.length ? 'VIEW ALL' : undefined}
          onAction={
            upcomingItems.length > featuredItems.length
              ? () => router.push('/nearby-events')
              : undefined
          }
        />
        {/*
          A row of one is not a row.

          With a single featured event the peeking width leaves a third of the
          screen empty beside it, which reads as a layout that failed rather
          than as an invitation to scroll. One card fills the width; two or more
          go back to peeking.
        */}
        {featuredItems.length === 1 ? (
          <View style={styles.pulseRowContent}>
            <FeaturedCard
              title={featuredItems[0].title}
              tag={featuredItems[0].category || null}
              imageUrl={featuredItems[0].cover_image_url}
              dateLabel={featuredDateLabel(featuredItems[0].start_time)}
              placeLabel={placeLabel(featuredItems[0])}
              width={FEATURED_CARD_SOLO}
              onPress={() => handleEventPress(featuredItems[0])}
            />
          </View>
        ) : (
          <FlatList
            horizontal
            data={featuredItems}
            keyExtractor={(item, idx) => `feat-${item.id}-${idx}`}
            showsHorizontalScrollIndicator={false}
            snapToAlignment="start"
            snapToInterval={FEATURED_CARD_WIDTH + FEATURED_CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.pulseRowContent}
            renderItem={({ item, index }) => (
              <FeaturedCard
                title={item.title}
                tag={item.category || null}
                imageUrl={item.cover_image_url}
                dateLabel={featuredDateLabel(item.start_time)}
                placeLabel={placeLabel(item)}
                accentIndex={index}
                onPress={() => handleEventPress(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ width: FEATURED_CARD_GAP }} />}
          />
        )}
      </View>
    )
  }

  const renderUpcomingStack = () => {
    if (upcomingStackItems.length === 0) return null
    return (
      <View style={styles.pulseSection}>
        {/*
          No prev/next arrows. The frame draws a pair beside this heading, and
          they belong to a horizontal row — this is a vertical stack, so they
          would scroll nothing. `SectionHeader` only renders them when handlers
          are passed, which is why they are absent rather than inert.
        */}
        <SectionHeader title="Upcoming" />
        <View style={styles.pulseStack}>
          {upcomingStackItems.map((item) => (
            <UpcomingCard
              key={`up-${item.id}`}
              title={item.title}
              category={item.category || null}
              imageUrl={item.cover_image_url}
              dayLabel={upcomingDayLabel(item.start_time)}
              joinedCount={joinedCount(item)}
              distanceLabel={formatDistance(item.distance)}
              description={item.short_description || null}
              onPress={() => handleEventPress(item)}
              isFavorited={!!interestStatuses[item.id]}
              favoriteBusy={!!interestPending[item.id]}
              onToggleFavorite={() => toggleInterest(item)}
            />
          ))}
        </View>
      </View>
    )
  }

  const renderUpcomingFigmaCarousel = () => (
    <>
      {renderFeaturedRow()}
      {renderUpcomingStack()}
    </>
  )

  const renderCarouselFancy = (titleLines: string[], items: Event[]) => {
    if (!items.some(item => !!item.cover_image_url)) return null
    return (
    <View style={styles.carouselContainer}>
      <SectionHeader title={titleLines.join(' ')} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        data={items.filter(item => !!item.cover_image_url)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            onToggleInterest={() => toggleInterest(item)}
            isInterested={!!interestStatuses[item.id]}
            interestLoading={!!interestPending[item.id]}
            statusLabel={checkinStatuses[item.id]?.status === 'checked_in' ? 'Going' : undefined}
          />
        )}
      />
    </View>
  )}

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

  const formatInviteDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return 'Date TBA'
    }
  }

  const renderInviteHero = (ev?: Event) => {
    if (!ev || !ev.cover_image_url) return null
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => handleEventPress(ev)}
        onLongPress={() => handleEventPreview(ev)}
        style={styles.inviteHeroCard}
        accessibilityRole="button"
        accessibilityLabel={`Open invite for ${ev.title}`}
      >
        <OptimizedImage
          source={ev.cover_image_url}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          width={720}
          height={360}
          quality={70}
          cachePolicy="memory-disk"
          priority="high"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.inviteHeroContent}>
          <Text style={styles.inviteHeroKicker}>Invite</Text>
          <Text style={styles.inviteHeroTitle} numberOfLines={2}>{ev.title}</Text>
          <Text style={styles.inviteHeroMeta} numberOfLines={1}>{formatInviteDate(ev.start_time)}</Text>
          <Text style={styles.inviteHeroMeta} numberOfLines={1}>
            {ev.venue_name || ev.display_city || 'Location TBA'}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  const renderFeaturedHero = (ev?: Event) => {
    if (!ev || !ev.cover_image_url) return null
    const screenW = Dimensions.get('window').width
    const featuredWidth = Math.max(0, Math.round(screenW - 46))
    const featuredHeight = Math.round(featuredWidth * (474 / 363))
    return (
      <View style={styles.featuredContainer}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => handleEventPress(ev)} onLongPress={() => handleEventPreview(ev)}>
          <View style={[styles.featuredImage, styles.featuredRadius, { overflow: 'hidden' }]}>
            <OptimizedImage
              source={ev.cover_image_url}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              width={featuredWidth}
              height={featuredHeight}
              quality={65}
              cachePolicy="memory-disk"
              priority="high"
            />
            <LinearGradient colors={["rgba(0,0,0,0)", "#000000"]} style={[styles.gradientFull, styles.featuredRadius]} />
          </View>
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
    const place = selectedCity || 'Your area'
    /*
     * Relabelled when you are not in the city you are browsing, never hidden.
     *
     * "Nearby" is a promise about distance, and distance from a device in
     * Munich to an event in Bengaluru is noise rather than information — so the
     * section says *where* instead. Hiding it would change the page's shape for
     * a reason the user cannot see, and would flicker for someone who *is* in
     * the city but whose GPS has not resolved yet.
     */
    return (
      <View style={styles.nearbyContainer}>
        <SectionHeader
          title={browsingHere ? 'Nearby' : `In ${place}`}
          actionLabel="VIEW ALL"
          onAction={() => router.push('/nearby-events' as any)}
        />
        <Text style={styles.sectionSubTitle}><Text style={{ fontWeight: '700' }}>{place}</Text> / {day}</Text>
        <View style={{ paddingHorizontal: 0 }}>
        {items.map((ev) => {
          const screenW = Dimensions.get('window').width
          const containerPadding = 16 * 2 // styles.nearbyContainer paddingHorizontal
          const innerW = Math.max(0, screenW - containerPadding)
          const containerWidth = Math.min(420, Math.round(innerW * 0.96))
          return (
            <NearbyEventCard
              key={ev.id}
              event={ev as any}
              width={containerWidth}
              onPress={handleEventPress as any}
              onLongPress={handleEventPreview as any}
              timeLabel={formatTimeRange(ev.start_time, ev.end_time, { timezone: ev.timezone })}
              /*
                How far, when that means something.

                Distance no longer filters anything, so this label is the only
                thing between "that's across town" and someone tapping into an
                event they cannot reach. It is shown **only while browsing the
                city you are in** — measured from a device in Munich to an event
                in Bengaluru it is a true number and useless information, so the
                venue name is the better thing to give up the space to.
              */
              locationLabel={
                (browsingHere ? formatDistance(distanceMap[ev.id]) : null)
                  || ev.venue_name || ev.address || ''
              }
            />
          )
        })}
        </View>
      </View>
    )
  }

  const renderNearbyPrompt = () => (
    <View style={styles.nearbyContainer}>
      <SectionHeader title="Nearby" />
      <Text style={styles.sectionSubTitle}>
        Enable location to see events near you.
      </Text>
      <TouchableOpacity
        style={styles.nearbyCta}
        onPress={() => {
          if (locationStatus === 'denied') {
            try { (Linking as any)?.openSettings?.() } catch {}
          } else {
            requestLocationIfNeeded(true)
          }
        }}
      >
        <Text style={styles.nearbyCtaText}>
          {locationStatus === 'denied' ? 'Open Settings' : 'Enable Location'}
        </Text>
      </TouchableOpacity>
    </View>
  )

  // Compute all distances once and cache - avoids O(n^2) recalculations
  const distanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (!userLocation) return map
    for (const ev of events) {
      // Use proximity data if available, otherwise calculate
      const prox = proximityData[ev.id]
      if (prox && typeof prox.distance_km === 'number') {
        map[ev.id] = prox.distance_km
      } else if (ev.latitude && ev.longitude) {
        // This map is in kilometres -- it sits alongside `prox.distance_km`
        // and feeds sorting, not the check-in gate. Converting explicitly
        // rather than keeping a second helper in a different unit.
        map[ev.id] =
          getDistanceMetres(userLocation.latitude, userLocation.longitude, ev.latitude, ev.longitude) / 1000
      } else {
        map[ev.id] = Number.POSITIVE_INFINITY
      }
    }
    return map
  }, [events, userLocation, proximityData])

  /*
   * Your own list, and therefore **not** scoped by the city you are browsing.
   *
   * This used to be `events.filter(is_favorited)`, which was harmless while
   * `events` was everything and becomes a bug the moment `events` is one city:
   * favourite something in Munich, browse Bengaluru, and it silently vanishes
   * from a section whose whole promise is "things you said you wanted".
   *
   * Personal state is not discovery inventory. The checked-in strip already
   * gets this right — `activeCheckins` is queried by user, not by the browse
   * filter — and this brings Interested into line.
   *
   * Falls back to the in-page events if the favourites call fails, so a flaky
   * network degrades the section rather than emptying it.
   */
  const interestedItems = useMemo(() => {
    const now = Date.now()
    const source = favoriteEvents.length > 0
      ? favoriteEvents
      : events.filter(e => !!interestStatuses[e.id])
    return source.filter(e => new Date(e.end_time).getTime() >= now)
  }, [favoriteEvents, events, interestStatuses])

  const upcomingItems = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => new Date(e.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events])

  /*
   * `happeningNowItems` is gone. It was recomputed on every render and
   * rendered nowhere — its only remaining use was seeding the "already shown"
   * set below, which the sections that *do* render already cover.
   *
   * If a "happening now" section is wanted, it should be built deliberately
   * against the checked-in strip, which already knows what you are at.
   */

  const nearbyItems = useMemo(() => {
    if (!userLocation) return [] as Event[]
    return events
      .filter(e => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
      .map(e => ({ e, d: distanceMap[e.id] ?? Number.POSITIVE_INFINITY }))
      .filter(x => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d)
      .map(x => x.e)
  }, [events, userLocation, distanceMap])

  /*
   * "{City}'s Top Events" — now just an ordering, because the fetch is already
   * scoped to the city.
   *
   * This used to re-filter by city name over `events`, which was itself only
   * whatever fell inside a 10km box around the device. So the section could
   * never show a Bengaluru event you were not standing next to, and its title
   * was a radius wearing a city's name. It also matched on `address.includes`,
   * which quietly pulled in anything with the city's name in its street line.
   *
   * With `city` scoping the query, the filter can only subtract — an event
   * whose `display_city` disagrees with the server's `city` would vanish from a
   * list it belongs in. So it is gone, and this is what it always meant: the
   * city's events, most-wanted first.
   */
  const cityTopItems = useMemo(() => {
    return events
      .slice()
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, interestCounts])

  /*
   * Nightlife, by the taxonomy rather than by guessing at names.
   *
   * This used to substring-match `party|night|club|music` against the category
   * name. Events are tagged to leaves, so "Classical and Carnatic" matched on
   * `music` and was presented as one of the Best Parties.
   *
   * `category_group` is the parent slug, which is what "everything of this
   * kind" actually means — added to the payload in blendn-admin #214 so the
   * client stops inferring a tree it is already being told about.
   *
   * **The fallback is gone, and it was the worse half.** When nothing matched,
   * this returned *every* event sorted by interest — so a section titled
   * "Discover the Best Parties" would confidently show a book club. An empty
   * section is honest; a full one that ignores its own title is not. The
   * render already guards on `length > 0`, so nothing appears rather than
   * something wrong.
   */
  const bestPartiesItems = useMemo(() => {
    return events
      .filter(e => NIGHTLIFE_GROUPS.has((e.category_group || '').toLowerCase()))
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, interestCounts])

  const formatTimeRange = (startIso: string, endIso: string, opts?: { timezone?: string }) => fmtRange(startIso, endIso, { includeDate: true, timezone: opts?.timezone })

  const filteredSortedEvents = useMemo(() => events, [events])

  const featuredItems = useMemo(
    () => upcomingItems.filter(e => !!e.cover_image_url).slice(0, 6),
    [upcomingItems]
  )
  const upcomingStackItems = useMemo(() => {
    const featuredIds = new Set(featuredItems.map(e => e.id))
    return upcomingItems.filter(e => !featuredIds.has(e.id)).slice(0, 3)
  }, [upcomingItems, featuredItems])

  const mainListData = useMemo(() => {
    /*
     * A search is a flat list, not a magazine.
     *
     * Normally this holds only what the sections above did not already show,
     * because a carousel and the list beneath it repeating the same event reads
     * as a bug. Under a search that subtraction becomes the bug: the sections
     * are hidden, so every id they claim is an id that appears nowhere — and
     * searching a venue's name would return it and then not show it.
     */
    if (isSearching) return filteredSortedEvents

    const shown = new Set<string>()
    interestedItems.forEach(e => shown.add(e.id))
    upcomingItems.slice(0, 10).forEach(e => shown.add(e.id))
    nearbyItems.slice(0, 10).forEach(e => shown.add(e.id))
    cityTopItems.slice(0, 10).forEach(e => shown.add(e.id))
    bestPartiesItems.slice(0, 10).forEach(e => shown.add(e.id))
    const remaining = filteredSortedEvents.filter(e => !shown.has(e.id))
    return remaining
  }, [isSearching, filteredSortedEvents, interestedItems, upcomingItems, nearbyItems, cityTopItems, bestPartiesItems])

  /*
   * The top hero: the soonest event that has a cover image.
   *
   * Named for what it is. It used to be `inviteHeroEvent` and was presented as
   * a featured invitation, but the selection has never been editorial — it
   * walks three lists and takes the first item with an image. That is an
   * image-availability check wearing a curator's hat.
   *
   * `upcomingItems` is already sorted by start time, so "first with an image"
   * genuinely means "the soonest one we can show properly". Real curation is a
   * separate feature; this at least stops claiming to be it.
   */
  const soonestWithImage = useMemo(
    () => upcomingItems.find(e => !!e.cover_image_url),
    [upcomingItems]
  )
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    []
  )

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 720)

  /*
   * The Pulse's headline, city line and search field.
   *
   * Built once and rendered into both branches of the list header — see the
   * comment at the render site for why it cannot live in only one of them.
   */
  const pulseHeader = (
    <PulseHeader
      title="The "
      titleAccent="Pulse"
      city={selectedCity}
      dateLabel={todayLabel}
      onPressCity={() => setCityPickerOpen(true)}
      query={searchInput}
      onChangeQuery={setSearchInput}
    />
  )

  // Icon row only: the greeting and the city line that used to live up here
  // moved into the scrolling headline block.
  const stickyBarHeight = insets.top + 8 + 32
  const sectionBgTop = stickyBarHeight + 12
  const topBarTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -7],
    extrapolate: 'clamp',
  })
  const topBarScale = scrollY.interpolate({
    inputRange: [0, 240],
    outputRange: [1, 0.98],
    extrapolate: 'clamp',
  })
  const topBarOpacity = scrollY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0.93],
    extrapolate: 'clamp',
  })
  const heroParallaxY = scrollY.interpolate({
    inputRange: [0, 360],
    outputRange: [0, -18],
    extrapolate: 'clamp',
  })
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 340],
    outputRange: [1, 0.89],
    extrapolate: 'clamp',
  })
  const sectionLiftY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -8],
    extrapolate: 'clamp',
  })
  const sectionOpacity = scrollY.interpolate({
    inputRange: [0, 320],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  })

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/*
        The top bar as frame `1141:4643` draws it: a glyph, the wordmark, a bell.

        It replaces "Hey Sagar! / Bengaluru • Saturday, 15 Aug", which was not in
        any frame and was doing three jobs at once — greeting, city control and
        settings. The greeting is gone; the city control moved into the headline
        block below, where it reads as a subtitle rather than as a caption bolted
        to an avatar. Nothing was lost: the picker is still the only way out of
        an empty state, and it is now larger and nearer the content it scopes.

        Deliberately short. The screen's identity is "The Pulse" in 48pt
        underneath; a bar that also announced itself would compete with it.
      */}
      <RNAnimated.View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 8, opacity: topBarOpacity },
        ]}
        accessibilityRole="header"
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="View profile"
          // 28pt glyph + 8 each side is 44.
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onPress={() => router.push('/profile' as any)}
        >
          {avatarUrl && avatarUrl.length > 0 && !avatarError ? (
            <OptimizedImage
              source={avatarUrl}
              style={styles.topBarAvatar}
              width={56}
              height={56}
              quality={60}
              onError={() => setAvatarError(true)}
            />
          ) : (
            <Ionicons name="person-circle-outline" size={28} color={EMBER.textSecondary} />
          )}
        </TouchableOpacity>

        <Text style={styles.wordmark}>Blend&apos;n</Text>

        {/*
          The frame's bell. There is no notification centre to open, so it goes
          to settings — where push notifications are actually configured — rather
          than being drawn as a control that does nothing. Noted in
          `docs/PULSE.md`.
        */}
        <TouchableOpacity
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          // 22pt glyph needs 11 a side to clear 44; it had 8.
          hitSlop={{ top: 11, right: 11, bottom: 11, left: 11 }}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={22} color={EMBER.textPrimary} />
        </TouchableOpacity>
      </RNAnimated.View>
      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}> 
        <LinearGradient
          colors={['#111214', EMBER.bg]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Banners */}
        <View style={styles.filtersBar}>
          {/*
            * The checked-in strip, at the top of the events tab.
            *
            * `renderCheckedInCarousel` and `handleCheckOut` were both complete
            * -- optimistic update, rollback, in-flight dedupe, a Check out pill
            * -- and neither had a caller, so checking out took three taps
            * through the event detail screen. This is the whole fix.
            */}
          {checkedInEvents.length > 0 && renderCheckedInCarousel()}
          {showPreviewHint && (
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerText}>
                Tip: Long-press any event card for quick actions.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Dismiss quick actions tip"
                onPress={markPreviewHintSeen}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Got it</Text>
              </TouchableOpacity>
            </View>
          )}
          {/*
            Offline is worth saying here. A dead socket is not.

            This screen loads over HTTP, so "Realtime disconnected" was showing
            above a list that had loaded perfectly — a warning about a subsystem
            the page does not use. Chat, private chat and the room keep both,
            because there a dead socket means messages you will not see.

            No status dot replaces it either. `profiles.show_online` already
            means "other attendees can see you're here", so a green dot on your
            own avatar reads as exactly that — and wiring it to socket health
            would show green while `show_online: false` made you invisible to
            everyone. A lie in both directions, and unexplainable in support.
          */}
          <RealtimeStatusBanner
            status={socketStatus}
            style={styles.bannerWarn}
            showSocketIssues={false}
          />
          {switchSuggestion && (
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerText}>
                You&apos;re in {switchSuggestion}. Browse events here?
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${switchSuggestion}`}
                onPress={() => chooseCity(switchSuggestion)}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Switch</Text>
              </TouchableOpacity>
            </View>
          )}
          {/*
            Where you are, when there is nothing to be done about it.

            Found on a device in Saarbrücken: browsing Bengaluru, the app knew
            exactly where the user was and never said so. The switch banner
            above only speaks when the device's city has events — correct, since
            offering a move to an empty screen is worse than silence — and the
            consequence was that the people we have not launched near got no
            acknowledgement at all.

            **Passive on purpose.** There is nothing useful to tap: switching to
            a city with no events is a dead end, and the picker in the header is
            already the way to move. A button here would be a call to action
            leading nowhere.

            Never shown alongside the switch banner — `awayNotice` fires exactly
            when `shouldOfferSwitch` cannot, and `lib/city.ts` pins that across
            every combination rather than leaving it to inspection.
          */}
          {away && (
            <View style={styles.bannerNeutral}>
              <Ionicons name="location-outline" size={14} color={EMBER.textSecondary} />
              <Text style={styles.bannerNeutralText}>
                You&apos;re in {away.deviceCity} — nothing here yet. Showing {away.selected}.
              </Text>
            </View>
          )}
          {locationStatus === 'denied' && (
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
                onPress={() => fetchEvents({ force: true })}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <VirtualizedList
          forwardedRef={listRef as any}
          data={showLoadingSkeleton ? [] : mainListData}
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
            showLoadingSkeleton ? (
              <View>
                {/*
                  In both branches, deliberately.

                  Searching triggers a load, and a header that only exists on
                  the loaded branch unmounts the moment you finish typing — the
                  field loses focus, the keyboard drops, and the text you just
                  entered disappears while the results for it arrive. The search
                  box has to outlive the thing it is searching.
                */}
                {pulseHeader}
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={160} />
                  <SkeletonLine width={80} />
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselList}
                  data={[...Array(5)].map((_, i) => i)}
                  keyExtractor={(item) => `s-int-${item}`}
                  getItemLayout={getCarouselItemLayout}
                  renderItem={() => (
                    <SkeletonBlock width={260} height={120} borderRadius={12} style={{ marginHorizontal: 4 }} />
                  )}
                />
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={200} />
                </View>
                <View style={{ paddingVertical: 12, height: UPCOMING_ITEM_HEIGHT + 24 }}>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: UPCOMING_SIDE_PADDING }}
                    data={[...Array(3)].map((_, i) => i)}
                    keyExtractor={(item) => `s-up-${item}`}
                    getItemLayout={(_, index) => ({
                      length: UPCOMING_ITEM_FULL,
                      offset: UPCOMING_ITEM_FULL * index,
                      index,
                    })}
                    renderItem={() => (
                      <SkeletonBlock width={UPCOMING_ITEM_WIDTH} height={UPCOMING_ITEM_HEIGHT} borderRadius={24} style={{ marginRight: CAROUSEL_ITEM_SPACING }} />
                    )}
                  />
                </View>
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
                {pulseHeader}
                {/*
                  Empty means "this city has nothing on", and says so.

                  The old copy was "No events nearby / Try refreshing or explore
                  with location enabled" — which named the cause as the cure.
                  Location *was* enabled; enabling it is what produced the 10km
                  box that emptied the screen. Refresh could not help, because
                  nothing about the query would change.

                  The way out is now a real one: browse a different city. The
                  picker is the primary action, and it is reachable even when
                  every other section is empty.
                */}
                {events.length === 0 && (
                  <FadeInUp delay={SECTION_MOTION_BASE_DELAY} distance={10}>
                    <View style={styles.emptyState}>
                      <View style={styles.emptyGlyph}>
                        <Ionicons
                          name={notLiveHere ? 'rocket-outline' : 'calendar-outline'}
                          size={36}
                          color={EMBER.textTertiary}
                        />
                      </View>
                      {/*
                        Two different empties, and conflating them is a lie.

                        A city on the list with nothing this week is a quiet
                        week. A city *not* on the list is somewhere we have not
                        launched — the user did nothing wrong and refreshing
                        will never help, so saying "nobody has published
                        anything yet" would read as the app being broken.

                        Someone reaching this by choosing their own city is
                        telling us where to go next, which is worth saying back
                        to them rather than treating as a dead end.
                      */}
                      {/*
                        A search that found nothing is not a city that has
                        nothing.

                        Without this, typing a misspelt venue name answers
                        "Coming soon to Bengaluru" — which tells somebody we
                        have not launched in the city they are standing in,
                        because of a typo. The city copy below is about the
                        city; this one is about the query, and the way out is
                        to clear it rather than to move.
                      */}
                      <Text style={styles.emptyTitle}>
                        {isSearching
                          ? 'No matches'
                          : !selectedCity
                          ? 'No events yet'
                          : notLiveHere
                            ? `Coming soon to ${selectedCity}`
                            : `Nothing on in ${selectedCity}`}
                      </Text>
                      <Text style={styles.emptySub}>
                        {isSearching
                          ? `Nothing here matches “${searchTerm}”${selectedCity ? ` in ${selectedCity}` : ''}.`
                          : !selectedCity
                          ? 'There are no published events to show right now.'
                          : notLiveHere
                            ? "We're not live here yet — you're early. Browse another city in the meantime, and we'll be here soon."
                            : 'Nothing is on here at the moment. Try another city, or check back.'}
                      </Text>
                      {isSearching && (
                        <ScalePress
                          style={styles.ctaGhost}
                          onPress={() => setSearchInput('')}
                          accessibilityRole="button"
                          accessibilityLabel="Clear search"
                        >
                          <Text style={styles.ctaGhostText}>Clear search</Text>
                        </ScalePress>
                      )}
                      {!isSearching && cityOptions.length > 0 && (
                        <ScalePress
                          style={styles.ctaGhost}
                          onPress={() => setCityPickerOpen(true)}
                          accessibilityRole="button"
                          accessibilityLabel="Choose a different city"
                        >
                          <Text style={styles.ctaGhostText}>Change city</Text>
                        </ScalePress>
                      )}
                      {!isSearching && (
                        <ScalePress
                          style={styles.ctaGhost}
                          onPress={() => fetchEvents({ force: true })}
                          accessibilityRole="button"
                          accessibilityLabel="Refresh events"
                        >
                          <Text style={styles.ctaGhostText}>Refresh</Text>
                        </ScalePress>
                      )}
                    </View>
                  </FadeInUp>
                )}
                {/*
                  Under a search, none of the curated sections render.

                  A hero, three carousels and a nightlife rail are how you
                  browse when you do not know what you want. Somebody who has
                  typed a venue's name knows exactly what they want, and
                  making them scroll past five editorial rails to reach it is
                  the screen ignoring the question it was just asked.
                */}
                {!isSearching && soonestWithImage ? (
                  <RNAnimated.View style={{ transform: [{ translateY: heroParallaxY }], opacity: heroOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + SECTION_MOTION_STAGGER} distance={10}>
                      {renderInviteHero(soonestWithImage)}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}
                {!isSearching && interestedItems.length > 0 && interestedItems.some(e => !!e.cover_image_url) ? (
                  <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 2)} distance={8}>
                      {renderInterestedCarousel(interestedItems.slice(0, 10))}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}
                {!isSearching && upcomingItems.length > 0 ? (
                  <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                      {renderUpcomingFigmaCarousel()}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}

                {isSearching
                  ? null
                  : userLocation
                  ? (nearbyItems.length > 0 ? (
                    <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 4)} distance={8}>
                        {renderNearbyList(nearbyItems.slice(0, 4))}
                      </FadeInUp>
                    </RNAnimated.View>
                  ) : null)
                  : ((locationStatus === 'denied' || locationStatus === 'undetermined') ? (
                    <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 4)} distance={8}>
                        {renderNearbyPrompt()}
                      </FadeInUp>
                    </RNAnimated.View>
                  ) : null)}

                {!isSearching && selectedCity && cityTopItems.length > 0 ? (
                  <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 5)} distance={8}>
                      {renderCarouselFancy([`${selectedCity}’s`, 'Top Events'], cityTopItems.slice(0, 10))}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}

                {/*
                  Nightlife, and only when there is actually nightlife.

                  Two things were wrong here and they compounded. The heading
                  said "Discover the Best Parties" — "Best" being an editorial
                  claim nothing backs, since the ordering is interest count.
                  And the hero fell back through `cityTopItems` and
                  `upcomingItems`, so when no nightlife existed the section
                  still rendered, under a parties heading, showing whatever
                  happened to have a cover image. A book club presented as the
                  best party in town.

                  No fallback now. If there is no nightlife, there is no
                  section — which is what an honest empty looks like.
                */}
                {(() => {
                  if (isSearching) return null
                  const featuredNightlife = bestPartiesItems.find(e => !!e.cover_image_url)
                  if (!featuredNightlife) return null
                  return (
                    <RNAnimated.View style={{ transform: [{ translateY: heroParallaxY }], opacity: heroOpacity }}>
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 6)} distance={8}>
                        <View style={styles.carouselContainer}>
                          <SectionHeader
                            title={`Nightlife in ${selectedCity ?? 'your city'}`}
                          />
                        </View>
                        {renderFeaturedHero(featuredNightlife)}
                      </FadeInUp>
                    </RNAnimated.View>
                  )
                })()}
                <View style={{ height: 8 }} />
              </View>
            )
          )}
        />
      </View>

      {/*
        The city picker.

        A plain sheet of the server's list, because that list is the whole
        contract: every entry opens with the number of events it claims. The
        selection is written to storage on tap, so a restart does not re-ask —
        a selection that does not survive a restart is not a selection.

        Design is a placeholder, like the interest picker before it. See
        `docs/PLACEHOLDER_SCREENS.md`.
      */}
      <Modal
        visible={cityPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.cityPickerBackdrop}
          activeOpacity={1}
          onPress={() => setCityPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close city picker"
        >
          <View style={styles.cityPickerSheet}>
            <Text style={styles.cityPickerTitle} accessibilityRole="header">
              Browse events in
            </Text>

            {/*
              Getting back to where you actually are.

              This row is **not** conditional on your city having events, and
              that is the entire point. The list below only ever contains cities
              with something on, so without this a user standing somewhere we
              have not launched yet has no way to say so: absent from the list,
              absent from the switch banner, and stuck in whichever city the
              busiest-city fallback picked for them. Found on a device in
              Germany, sitting in Bengaluru with no route home.

              Choosing an empty city is allowed and useful. It gets an honest
              "we're not here yet" instead of a blank page, and it is the
              clearest signal we have about where to launch next.
            */}
            {deviceCity && !sameCity(deviceCity, selectedCity) ? (
              <TouchableOpacity
                style={[styles.cityPickerRow, styles.cityPickerRowLocate]}
                onPress={() => chooseCity(deviceCity)}
                accessibilityRole="button"
                accessibilityLabel={`Use my current location, ${deviceCity}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="navigate-outline" size={17} color={EMBER.accent} />
                  <View>
                    <Text style={styles.cityPickerCity}>Use my current location</Text>
                    <Text style={styles.cityPickerCount}>{deviceCity}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}

            {cityOptions.length === 0 ? (
              <Text style={styles.cityPickerEmpty}>
                {deviceCity
                  ? 'No cities have published events yet.'
                  : 'No cities have published events yet. Turn on location to browse where you are.'}
              </Text>
            ) : (
              <FlatList
                data={cityOptions}
                keyExtractor={(item) => item.city}
                renderItem={({ item }) => {
                  const active = sameCity(item.city, selectedCity)
                  const here = sameCity(item.city, deviceCity)
                  return (
                    <TouchableOpacity
                      style={[styles.cityPickerRow, active && styles.cityPickerRowActive]}
                      onPress={() => chooseCity(item.city)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={
                        `${item.city}${here ? ', your current location' : ''}, ` +
                        `${item.eventCount} event${item.eventCount === 1 ? '' : 's'}`
                      }
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.cityPickerCity}>{item.city}</Text>
                        {here ? (
                          <Ionicons name="navigate" size={13} color={EMBER.accent} />
                        ) : null}
                      </View>
                      <Text style={styles.cityPickerCount}>{item.eventCount}</Text>
                    </TouchableOpacity>
                  )
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <ActionTray
        visible={trayState.visible}
        title={trayState.title}
        message={trayState.message}
        buttons={trayState.buttons}
        onClose={closeTray}
        size={trayState.size}
        dismissible={trayState.dismissible}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EMBER.bg,
    
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
    borderColor: APP_COLORS.separator,
    backgroundColor: EMBER.surfaceSunken,
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
    backgroundColor: EMBER.bg,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: EMBER.textPrimary,
  },
  listContainer: {
    paddingHorizontal: 1,
    paddingTop: 14,
    paddingBottom: 24,
    
   
   
  },
  carouselContainer: {
    paddingTop: 16,
  },
  // Skeletons only — the real headings are `SectionHeader`, which carries its
  // own row. Kept so a loading placeholder lines up with the heading it stands
  // in for.
  sectionHeaderRow: {
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pulseSection: { gap: 16, marginTop: 32 },
  pulseRowContent: { paddingHorizontal: 12 },
  pulseStack: { gap: 24, paddingHorizontal: 12 },
  sectionDividerLine: {
    height: 1,
    width: 73,
    backgroundColor: EMBER.textPrimary,
    opacity: 0.22,
    borderRadius: 11,
    transform: [{ rotate: '180deg' }],
  },
  sectionSubTitle: {
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    color: EMBER.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  carouselList: {
    paddingHorizontal: 12,
    paddingBottom: 20,
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
    left: 16,
    right: 16,
    bottom: 20,
  },
  upCategoryTag: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  upTitleLarge: {
    color: '#FFFFFF',
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    marginBottom: 8,
  },
  upVenueLarge: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: TYPE_META_SIZE,
  },
  carouselCard: {
    width: CAROUSEL_CARD_WIDTH,
    borderRadius: 36,
    backgroundColor: EMBER.surface,
    marginHorizontal: CAROUSEL_ITEM_SPACING / 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  carouselImage: {
    width: '100%',
    height: CAROUSEL_CARD_HEIGHT,
  },
  carouselGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CAROUSEL_CARD_HEIGHT,
  },
  carouselStatusPill: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 127, 213, 0.84)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  carouselStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#46D27B',
  },
  carouselStatusText: {
    color: '#FFFFFF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '700',
  },
  carouselHeartButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    backgroundColor: 'rgba(15,35,54,0.62)',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
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
    left: 14,
    right: 14,
    bottom: 20,
    alignItems: 'center',
  },
  carouselEventTitle: {
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    color: EMBER.textPrimary,
    textAlign: 'center',
  },
  carouselVenue: {
    fontSize: TYPE_META_SIZE,
    color: 'rgba(230,248,255,0.8)',
    marginTop: 4,
  },
  carouselTime: {
    fontSize: TYPE_META_SIZE,
    color: '#AEE5F5',
    marginTop: 8,
  },
  carouselCheckoutPill: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(16,31,48,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  carouselCheckoutText: {
    color: '#FFFFFF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '700',
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
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  nearbyCta: {
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: EMBER.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  nearbyCtaText: {
    // Dark on warm. White on #FF906D fails contrast — see `EMBER.onGradient`.
    color: EMBER.onGradient,
    fontSize: TYPE_BODY_SIZE,
    fontWeight: '700',
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
    color: EMBER.textPrimary,
    fontSize: 12,
  },
 
  nearbyTitle: {
    color: EMBER.textPrimary,
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
    color: EMBER.textSecondary,
    fontSize: 11,
  },
  featuredContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
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
    color: EMBER.textPrimary,
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    textAlign: 'center',
  },
  featuredChip: {
    backgroundColor: 'rgba(10,132,255,0.32)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  featuredChipText: {
    color: EMBER.textPrimary,
    fontSize: TYPE_META_SIZE,
    fontWeight: '600',
  },
  featuredSubtitle: {
    color: EMBER.textPrimary,
    fontSize: TYPE_META_SIZE,
    fontWeight: '600',
  },
  inviteHeroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
    minHeight: 220,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: EMBER.surface,
  },
  inviteHeroContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  inviteHeroKicker: {
    color: '#D1E8FF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inviteHeroTitle: {
    color: EMBER.textPrimary,
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    marginBottom: 8,
  },
  inviteHeroMeta: {
    color: EMBER.textSecondary,
    fontSize: TYPE_META_SIZE,
    marginBottom: 3,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarAvatar: { width: 28, height: 28, borderRadius: 14 },
  wordmark: {
    ...EMBER_TYPE.sectionHeading,
    color: EMBER.accent,
    letterSpacing: -0.8,
  },
  topBarSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
    paddingHorizontal: 14,
    backgroundColor: EMBER.bg,
    
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarCenter: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  defaultAvatar: {
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    color: EMBER.textPrimary,
    fontSize: TYPE_HEADER_SIZE,
    lineHeight: TYPE_HEADER_LINE,
    fontWeight: '700',
  },
  topBarSubtitle: {
    marginTop: 2,
    color: EMBER.textSecondary,
    fontSize: TYPE_META_SIZE,
    lineHeight: 18,
    fontWeight: '500',
  },
  cityPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cityPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  cityPickerSheet: {
    backgroundColor: EMBER.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '70%',
  },
  cityPickerTitle: {
    color: EMBER.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  cityPickerEmpty: {
    color: EMBER.textSecondary,
    fontSize: 15,
    paddingVertical: 12,
  },
  cityPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  /*
    Neutral, not a warning.

    The other banners on this screen are red or amber because something is
    wrong and an action is owed. This one is a statement of fact — you are
    somewhere we do not serve yet — and dressing it as an alert would make an
    ordinary situation read as a fault.
  */
  bannerNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bannerNeutralText: {
    flex: 1,
    color: EMBER.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  cityPickerRowLocate: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderStyle: 'dashed',
    marginBottom: 14,
  },
  cityPickerRowActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  cityPickerCity: {
    color: EMBER.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  cityPickerCount: {
    color: EMBER.textSecondary,
    fontSize: 14,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  filtersBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(10,132,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,132,255,0.45)',
  },
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  bannerText: {
    color: EMBER.textPrimary,
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    flex: 1,
    marginRight: 12,
  },
  bannerCta: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  bannerCtaText: {
    color: EMBER.onGradient,
    fontWeight: '700',
    fontSize: TYPE_CAPTION_SIZE,
  },
  emptyState: {
    paddingHorizontal: 32,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: EMBER.textPrimary,
    fontSize: TYPE_CARD_TITLE_SIZE,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: EMBER.textSecondary,
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    textAlign: 'center',
  },
  ctaGhost: {
    marginTop: 12,
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
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '600',
  },
}) 
