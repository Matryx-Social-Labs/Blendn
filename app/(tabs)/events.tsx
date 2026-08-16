import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import EventCard from '../../components/EventCard'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import NearbyEventCard from '../../components/NearbyEventCard'
import { preloadImages } from '../../components/OptimizedImage'
import {
  FeaturedCard,
  FEATURED_CARD_GAP,
  featuredCardLayout,
} from '../../components/pulse/FeaturedCard'
import { NotificationBell } from '../../components/pulse/NotificationBell'
import { PulseHeader } from '../../components/pulse/PulseHeader'
import { TAB_BAR_CLEARANCE, tabBarTop } from './_layout'
import { FilterSheet, type CategoryOption } from '../../components/pulse/FilterControl'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { UpcomingCard } from '../../components/pulse/UpcomingCard'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import { eventFromApi, getCategories, getEvents as fetchEventsApi, type BlendnEvent } from '../../lib/api'
import {
  activeFilterCount,
  filtersToQuery,
  hasActiveFilters,
  NO_FILTERS,
  type EventFilters,
} from '../../lib/eventFilters'
import { feedPlaylist } from '../../lib/feedMedia'
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
import { EMBER, EMBER_FONTS, EMBER_TYPE } from '../../lib/theme'

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
/**
 * Frame `1141:4643` — `Main`, and the two gaps its children use.
 *
 * Named rather than inlined because the render site needs two of them as well:
 * the safe-area insets are added **there**, so the frame's numbers stay literal
 * here and the device's corrections stay visibly separate from them.
 *
 * `MAIN_PADDING_TOP` is 96 on a 390pt artboard whose overlay header occupies
 * the first 64 — so it is `TOP_BAR_HEIGHT + 32`, and it is written that way at
 * the render site because the 32 is the part that means anything.
 */
const SCREEN_HEIGHT = Dimensions.get('window').height
const MAIN_PADDING_HORIZONTAL = 12
const MAIN_PADDING_BOTTOM = 128
const MAIN_GAP = 48
/** A section's own rows; a vertical stack of cards inside one. */
const SECTION_GAP = 24
const STACK_GAP = 32

const SECTION_MOTION_BASE_DELAY = 34
const SECTION_MOTION_STAGGER = 44

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

/** Stable identities for the Featured carousel — see `featuredCards`. */
const featuredKeyExtractor = (item: { id: string }) => `feat-${item.id}`
const FeaturedSeparator = () => <View style={{ width: FEATURED_CARD_GAP }} />

const getFirstName = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] || null
}

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

  /*
   * What the person asked the feed for.
   *
   * `draft` is separate from `filters` because each choice would otherwise be a
   * network round trip: picking a category, a day and a distance would fire
   * three, the first two of which nobody sees, against a list flickering
   * underneath them. The sheet edits the draft; only "Show results" commits.
   */
  /*
   * Which Featured card the viewport has settled on.
   *
   * Only that one walks its media and mounts a player — see `FeedMedia`. A row
   * where every card played would allocate a decoder per card, and it fails as
   * dropped frames and battery rather than as an error.
   *
   * 60% visible, held for 250ms: a card half-dragged past is not the one you
   * are looking at, and without the delay a fast flick would start and tear
   * down a player for every card it crossed.
   */
  const [featuredActiveIndex, setFeaturedActiveIndex] = useState(0)
  const featuredViewability = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 250 })
  const onFeaturedViewable = useRef(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const first = viewableItems.find((v) => v.index !== null)
      if (first?.index != null) setFeaturedActiveIndex(first.index)
    }
  )

  const [filters, setFilters] = useState<EventFilters>(NO_FILTERS)
  const [filterDraft, setFilterDraft] = useState<EventFilters>(NO_FILTERS)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])

  /*
   * A filtered feed is a list, not a magazine.
   *
   * The same reasoning as a search: somebody who asked for board games this
   * weekend within 2km has told you exactly what they want, and making them
   * scroll past Featured and Upcoming to reach it is the screen ignoring the
   * question it was just asked. It also stops the sections lying — "Featured"
   * over a filtered set is not what the word means.
   */
  const isNarrowed = isSearching || hasActiveFilters(filters)

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

  const handleCheckOut = useCallback(async (event: Event) => {
    if (checkOutInFlightRef.current.has(event.id)) return
    checkOutInFlightRef.current.add(event.id)
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
    }
  }, [checkinStatuses, checkedInEvents, feedback, showTray, closeTray])

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

    /*
     * The mirror of Check In, and it was missing.
     *
     * `isCheckedIn` was computed here only to be negated into `canCheckIn`, so
     * the tray offered a way in and no way out — the checked-in strip was
     * carrying that on its own. With the strip gone this is the Pulse's check
     * out, and `handleCheckOut` below (optimistic, rolled back, deduped) finally
     * has a second caller.
     */
    if (isCheckedIn) {
      buttons.unshift({
        label: 'Check Out',
        onPress: () => {
          closeTray()
          void handleCheckOut(event)
        },
      })
    }

    showTray({
      title: event.title,
      message: summary,
      buttons,
      size: 'expanded',
    })
  }, [checkinStatuses, proximityData, interestStatuses, closeTray, toggleInterest, handleEventPress, handleCheckIn, handleCheckOut, showTray, markPreviewHintSeen])

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
  /*
   * The filter's category list, from the server rather than a copy.
   *
   * Hardcoding it here is the mistake `profiles.interests` already made and
   * `/work-fields` exists to avoid: the day a parent is added, an installed
   * build is a client that cannot show it and cannot filter by it. Parents
   * only — the events route sweeps a parent's children, so offering both
   * levels would be two chips that return the same list.
   *
   * Failure is silent on purpose. No categories means no "What" group in the
   * sheet, and When and How far still work; a filter sheet that refuses to open
   * because one list did not load is worse than one with a section missing.
   */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await getCategories()
        if (cancelled || !Array.isArray(result?.data)) return
        setCategoryOptions(
          result.data
            .filter((c) => !c.parent_id && typeof c.slug === 'string' && typeof c.name === 'string')
            .map((c) => ({ slug: String(c.slug), name: String(c.name) }))
        )
      } catch (e) {
        Logger.debug('events', 'category list unavailable', { error: e })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id, city: selectedCity })
      fetchEvents()
    }
    // `fetchEvents` is redefined every render and is deliberately not a
    // dependency — including it would refetch on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, selectedCity, searchTerm, filters])

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

  /** Shared by the skeleton strips, which are all `CAROUSEL_ITEM_FULL` wide. */
  const getCarouselItemLayout = useCallback((_: any, index: number) => ({
    length: CAROUSEL_ITEM_FULL,
    offset: CAROUSEL_ITEM_FULL * index,
    index,
  }), [])

  /*
   * The checked-in strip used to be here.
   *
   * A section header, a horizontal list of full-width cards and a Check out
   * pill — roughly a third of the first screen, permanently, to say one bit of
   * information: *you are checked in somewhere*. It was the most expensive
   * square footage on the Pulse and it pushed the feed the screen exists for
   * below the fold.
   *
   * That bit now lives on the Blend'n button in the tab bar, which is where the
   * app already keeps this state — `roomButtonTarget` reads the same active
   * check-in and the button is on every screen rather than only this one. It
   * draws a steady ring when you are in a room; see `roomButtonGlow`.
   *
   * **Check out moved with it, it was not dropped.** The strip carried the only
   * one-tap check-out and that is worth protecting, so it is now in the room
   * screen's top bar — the place the glowing button takes you. `handleCheckOut`
   * below stays for the long-press action tray, which is the other caller.
   */

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
        // `categorySlug`, `startDate`, `endDate` and `radius` — every one of
        // them a parameter this endpoint has always accepted.
        ...filtersToQuery(filters),
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
    /*
     * Not forced. `getEvents` is `swr: true`, so a cached read already
     * revalidates in the background -- forcing only made every foreground
     * return block on the network before the feed could update.
     */
    onSync: () => fetchEvents({ silent: true }),
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
      // Same reasoning as `onSync`: the location changed, the cache key changed
      // with it, so there is nothing stale to force past.
      fetchEvents({ silent: true })
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
    /*
     * Sized against the viewport, not only against the frame.
     *
     * `Main` is a 390 × 3548 scrolling artboard, so the design never had to fit
     * this card between the header and the navigation — and at the frame's 85%
     * of the screen width it does not. Measured on a 440 × 956 device: the card
     * came out 374 × 508 with its top at 387, putting its bottom at 908 against
     * a tab bar that starts at ~843. Sixty-five points of the hero card, and
     * most of the gap under its title, sat beneath the bar.
     *
     * The page still runs the full height of the screen and still scrolls
     * *under* the bar — that is padding, not layout, and it is what makes the
     * bar read as a floating overlay. It is only this one card, the thing the
     * screen opens on, that is sized to clear it.
     */
    const featured = featuredCardLayout(insets, tabBarTop(SCREEN_HEIGHT, insets.bottom))
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
          <View style={[styles.featuredBleed, { paddingHorizontal: featured.inset }]}>
            <FeaturedCard
              title={featuredItems[0].title}
              tag={featuredItems[0].category || null}
              playlist={feedPlaylist(featuredItems[0].media, featuredItems[0].cover_image_url)}
              isActive
              dateLabel={featuredDateLabel(featuredItems[0].start_time)}
              placeLabel={placeLabel(featuredItems[0])}
              width={featured.width}
              onPress={() => handleEventPress(featuredItems[0])}
            />
          </View>
        ) : (
          <FlatList
            horizontal
            data={featuredCards}
            keyExtractor={featuredKeyExtractor}
            showsHorizontalScrollIndicator={false}
            /*
              Full-bleed, then inset by the row's own 24.

              Frame `1141:4660` — the carousel's mask — sits at section-x `-12`,
              cancelling `Main`'s gutter so the row is the full 390, with card 1
              starting at x=24 inside it. Built inside the gutter instead, the
              card began at 12 and the scroll area ended 12pt short of the
              screen: not centred, and a carousel that looks clipped rather than
              one running off the edge.

              `snapToInterval` is unchanged and still correct — the leading
              padding is part of the content, so card N's left edge lands at
              offset `N × (width + gap)` and snapping puts it back at x=24.
            */
            style={styles.featuredBleed}
            contentContainerStyle={{ paddingHorizontal: featured.inset }}
            snapToAlignment="start"
            snapToInterval={featured.width + FEATURED_CARD_GAP}
            decelerationRate="fast"
            viewabilityConfig={featuredViewability.current}
            onViewableItemsChanged={onFeaturedViewable.current}
            renderItem={({ item, index }) => (
              <FeaturedCard
                title={item.title}
                tag={item.tag}
                playlist={item.playlist}
                isActive={index === featuredActiveIndex}
                dateLabel={item.dateLabel}
                placeLabel={item.placeLabel}
                accentIndex={item.accentIndex}
                width={featured.width}
                onPress={item.onPress}
              />
            )}
            // Hoisted: an inline component is a new type every render, which
            // remounts every separator rather than reusing them.
            ItemSeparatorComponent={FeaturedSeparator}
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

  /*
   * `renderUpcomingFigmaCarousel` was here, and it drew Featured a second time.
   *
   *     const renderUpcomingFigmaCarousel = () => (
   *       <>
   *         {renderFeaturedRow()}     // <- already rendered by the caller
   *         {renderUpcomingStack()}
   *       </>
   *     )
   *
   * The list renders Featured in its own `!isNarrowed` branch and then this one
   * directly beneath it, so any city with at least one upcoming event drew the
   * whole Featured carousel twice — the same hero, the same events, one screen
   * apart. Live since #130.
   *
   * It had one caller and its only job was bundling two rows, one of which the
   * caller already had. Gone rather than corrected: a wrapper that returns
   * exactly one thing is the thing.
   */

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
      <View style={styles.pulseSection}>
        <SectionHeader
          title={browsingHere ? 'Nearby' : `In ${place}`}
          actionLabel="VIEW ALL"
          onAction={() => router.push('/nearby-events' as any)}
        />
        {/*
          The place is emphasised by family, not by `fontWeight`.

          `fontWeight: '700'` on a nested `<Text>` inheriting Manrope is regular
          on Android and bold on iOS, from identical code — the same trap the
          stylesheet's second rule is about, and the one place in the render
          that fell into it.
        */}
        <Text style={styles.sectionSubTitle}>
          <Text style={{ fontFamily: EMBER_FONTS.bodyBold }}>{place}</Text> / {day}
        </Text>
        <View style={styles.pulseStack}>
        {items.map((ev) => {
          // The full content width. The old 96%-of-a-16pt-gutter came from a
          // card that was inset inside a panel; there is no panel now, and the
          // frame's gutter is the list's.
          const containerWidth = SCREEN_WIDTH - (MAIN_PADDING_HORIZONTAL * 2)
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
    <View style={styles.pulseSection}>
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

  const formatTimeRange = (startIso: string, endIso: string, opts?: { timezone?: string }) => fmtRange(startIso, endIso, { includeDate: true, timezone: opts?.timezone })

  const filteredSortedEvents = useMemo(() => events, [events])

  const featuredItems = useMemo(
    () => upcomingItems.filter(e => !!e.cover_image_url).slice(0, 6),
    [upcomingItems]
  )
  /*
   * The Featured cards' props, computed once per data change.
   *
   * `renderItem` used to build these inline: a fresh `feedPlaylist(...)` array
   * and a fresh `() => handleEventPress(item)` closure for **every card on
   * every parent render**. Two allocations per card is not the cost -- the cost
   * is that both are props, so a new identity defeats any memoisation the card
   * could have, and these are the most expensive components on the screen:
   * full-bleed heroes carrying images and a video player.
   *
   * `handleEventPress` is already a `useCallback` and `featuredItems` is
   * already a `useMemo`, so binding here is stable for as long as the data is.
   */
  const featuredCards = useMemo(
    () =>
      featuredItems.map((item, index) => ({
        id: item.id,
        title: item.title,
        tag: item.category || null,
        playlist: feedPlaylist(item.media, item.cover_image_url),
        dateLabel: featuredDateLabel(item.start_time),
        placeLabel: placeLabel(item),
        accentIndex: index,
        onPress: () => handleEventPress(item),
      })),
    [featuredItems, handleEventPress]
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
    if (isNarrowed) return filteredSortedEvents

    /*
     * Subtract exactly what the three sections draw, and nothing else.
     *
     * This used to subtract Interested, city-top and nightlife as well. Those
     * sections are gone, so every id they claimed became an id that appears
     * **nowhere** — the event is not in a carousel, because there is no
     * carousel, and it is filtered out of the list underneath for being in one.
     *
     * The same bug in the other direction is why `isSearching` returns early
     * above. Keeping this list in step with what actually renders is the whole
     * job of this memo, so it now names the three and only the three.
     */
    const shown = new Set<string>()
    featuredItems.forEach(e => shown.add(e.id))
    upcomingItems.slice(0, 10).forEach(e => shown.add(e.id))
    nearbyItems.slice(0, 4).forEach(e => shown.add(e.id))
    return filteredSortedEvents.filter(e => !shown.has(e.id))
  }, [isNarrowed, filteredSortedEvents, featuredItems, upcomingItems, nearbyItems])

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 720)

  /*
   * The Pulse's headline, city line and search field.
   *
   * Built once and rendered into both branches of the list header — see the
   * comment at the render site for why it cannot live in only one of them.
   */
  /*
   * The undesigned rows, rendered into the feed's header rather than above it.
   *
   * These five — the checked-in strip, the offline banner, the switch-city
   * offer, the away notice, the location and network errors — have behaviour
   * and no frame. They used to be a sibling of the list, statically laid out
   * at the top of the screen, which the overlay header now covers. They also
   * cost a 10pt spacer on every render where none of them had anything to say.
   *
   * In the header they clear the bar with the same padding everything else
   * does, and there is one scroll surface instead of a fixed strip above one.
   * Built once and rendered into both branches, for the same reason
   * `pulseHeader` is.
   */
  const banners = (
          <View style={styles.filtersBar}>
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
  )

  const pulseHeader = (
    <PulseHeader
      title="The "
      titleAccent="Pulse"
      city={selectedCity}
      onPressCity={() => setCityPickerOpen(true)}
      query={searchInput}
      onChangeQuery={setSearchInput}
      activeFilterCount={activeFilterCount(filters)}
      onPressFilter={() => {
        setFilterDraft(filters)
        setFilterSheetOpen(true)
      }}
    />
  )

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
    /*
     * A plain `View`, not a `SafeAreaView`.
     *
     * `edges={['top','bottom']}` inset the *container*, so the scroll surface
     * itself ended above the home indicator and the feed stopped dead at the
     * nav with a visible edge. The insets belong on the scroll content, not on
     * the thing that scrolls: content then runs edge to edge and simply starts
     * and ends clear of the hardware.
     */
    <View style={styles.container}>
      {/*
        No panel around the list, and the bar is an overlay.

        This screen used to be two things stacked: a sticky bar, and a rounded
        bordered elevated sheet holding everything else — `sectionBg`, absolutely
        positioned below the bar with its own background, its own border and its
        own gradient. A homepage mounted as a screen inside a screen, which is
        why nothing lined up with the frame: the frame has one flat surface and
        this had three.

        The frame is one background, `#0F0E0E`, edge to edge, with the content
        sitting directly on it. So the list is the page now, and `PulseTopBar`
        floats over it holding nothing but the wordmark — it reserves no height
        and the feed scrolls under it.

        The old bar's other two controls did not come back with it. The avatar
        is the Me tab, where a profile picture is the more usual place to find
        yourself; settings is reached through it, as it already was from the
        profile screen; and the city picker had already moved into the headline.
      */}
        <PulseTopBar actions={<NotificationBell />} />

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
          contentContainerStyle={[
            styles.listContainer,
            {
              // The status bar and the overlay header at the top; the floating
              // nav plus the home indicator at the bottom. Padding, not layout,
              // so the feed still scrolls under all four.
              //
              // The frame's `Main` starts at y=96 on a 390pt artboard whose bar
              // occupies the first 64 — so the 32 is the clearance, and the
              // status bar is what the artboard does not have.
              paddingTop: insets.top + TOP_BAR_HEIGHT + 32,
              // The frame's 128 already clears the 88pt nav. `Math.max` so it
              // still does if the nav grows — the bar's height has changed
              // twice, and a feed that ends underneath it is not a visible
              // failure, just a last card nobody can reach.
              paddingBottom: insets.bottom + Math.max(MAIN_PADDING_BOTTOM, TAB_BAR_CLEARANCE + 24),
            },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          enableVirtualization={!isLoading && mainListData.length > 20}
          /*
           * 4, not 10 — arithmetic, not a guess.
           *
           * A row here is an `UpcomingCard`: a 165pt image plus a 200pt body
           * inside 24pt of padding, ~437pt, with `STACK_GAP` 32 between them.
           * On a 956pt screen roughly **two** are ever visible at once.
           *
           * `initialNumToRender` is rendered *synchronously before first
           * paint*. At 10 that is ~4,700pt of content — five screens — and ten
           * image decodes, to show two cards. Four covers the fold with one
           * row of slack either side; `maxToRenderPerBatch` fills the rest
           * asynchronously, which is what it is for.
           *
           * `windowSize` is left at 10. It governs what stays *mounted*, not
           * what blocks the first frame, and lowering it trades scroll
           * smoothness for memory — a trade worth making against a measurement
           * rather than against an estimate.
           */
          initialNumToRender={4}
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
                {banners}
                {pulseHeader}
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={160} />
                  <SkeletonLine width={80} />
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
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
                {banners}
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
                {/*
                  Three sections, in the frame's order, and nothing else.

                  Frame `1141:4643` draws Featured at y=277, Upcoming at y=839
                  and Nearby at y=2335. That is the whole screen.

                  What used to be here, and is now gone: an invite hero, an
                  Interested carousel, a "{City}'s Top Events" fancy carousel and
                  a nightlife hero. None of them is in any frame. They were three
                  designs' worth of sediment stacked in one list, which is why
                  every fix landed next to something older that contradicted it —
                  and why `renderFeaturedRow`, the one function built *from* the
                  frame, had no caller at all while six that were not still ran.

                  Their data is untouched in the behaviour half above, so each
                  comes back as a section the day it has a frame.
                */}
                {!isNarrowed ? (
                  <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + SECTION_MOTION_STAGGER} distance={10}>
                      {renderFeaturedRow()}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}

                {!isNarrowed && upcomingItems.length > 0 ? (
                  <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 2)} distance={8}>
                      {renderUpcomingStack()}
                    </FadeInUp>
                  </RNAnimated.View>
                ) : null}

                {isNarrowed
                  ? null
                  : userLocation
                  ? (nearbyItems.length > 0 ? (
                    <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                        {renderNearbyList(nearbyItems.slice(0, 4))}
                      </FadeInUp>
                    </RNAnimated.View>
                  ) : null)
                  : ((locationStatus === 'denied' || locationStatus === 'undetermined') ? (
                    <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                        {renderNearbyPrompt()}
                      </FadeInUp>
                    </RNAnimated.View>
                  ) : null)}
                <View style={{ height: 8 }} />
              </View>
            )
          )}
        />

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

      <FilterSheet
        visible={filterSheetOpen}
        draft={filterDraft}
        categories={categoryOptions}
        hasLocation={!!userLocation}
        onChange={setFilterDraft}
        onApply={() => {
          setFilters(filterDraft)
          setFilterSheetOpen(false)
        }}
        onClose={() => setFilterSheetOpen(false)}
      />

      <ActionTray
        visible={trayState.visible}
        title={trayState.title}
        message={trayState.message}
        buttons={trayState.buttons}
        onClose={closeTray}
        size={trayState.size}
        dismissible={trayState.dismissible}
      />
    </View>
  )
}

/**
 * The Pulse, from frame `1141:4643`.
 *
 * ## Why this was rewritten rather than corrected
 *
 * It had **107 keys** and 49 callers. The other 58 belonged to two previous
 * layouts — an invite hero, a glass-panelled Nearby card, a `#007AFF` iOS-blue
 * check-in button, a `#e8f5e8` status badge — and they were not inert: they were
 * what seven restyle PRs kept landing beside and contradicting. Three type
 * systems coexisted (local `TYPE_*` constants, raw numbers, `APP_COLORS`) and
 * there was no spacing scale at all.
 *
 * ## Two rules, and everything here follows from them
 *
 * **1. The frame's numbers, unadjusted.** Values are the 390pt artboard's.
 * Treating them as desktop measurements in need of shrinking is what produced
 * the flat screen. The only additions are the safe-area insets, applied at the
 * render site so that what came from the frame and what came from the hardware
 * never blur together.
 *
 * **2. No `fontWeight`, anywhere.** Weight comes from the family. Custom fonts
 * on Android ignore `fontWeight` outright and silently render regular, so
 * `fontWeight: '700'` on Manrope gave bold on iOS and regular on Android from
 * identical code — which the old sheet did in thirty places, and which no
 * simulator screenshot would ever show. Every text style spreads an
 * `EMBER_TYPE` entry; the sizes are the scale's, not the call site's.
 *
 * `APP_COLORS` is gone from this file entirely. It is the old blue palette, and
 * one import of it is enough to put a blue separator on a warm-black page.
 *
 * ## What is undesigned, and marked as such
 *
 * The banners, the empty states and the city picker have behaviour and no
 * frame. They are on the frame's palette and spacing scale, so they do not look
 * foreign, but nothing here should be read as a design decision — see
 * `docs/PLACEHOLDER_SCREENS.md` and the render sites for each.
 */
const styles = StyleSheet.create({
  /* ---- The page --------------------------------------------------------- */

  /**
   * One flat surface. `#0F0E0E` edge to edge — no panel, no border, no
   * gradient. This screen used to stack three of them.
   */
  container: {
    flex: 1,
    backgroundColor: EMBER.bg,
  },
  /**
   * `Main`'s horizontal padding, and the only place it is applied.
   *
   * Every child used to carry its own 12 or 16 or 23. One gutter on the scroll
   * content means a section cannot disagree with the section above it, and the
   * horizontal rows still bleed to exactly where the frame puts them — a card
   * starting at x=12 is a card starting at the content edge.
   *
   * Vertical padding is at the render site: it is the frame's 96 and 128 plus
   * the insets, and the insets are not the frame's.
   */
  listContainer: {
    paddingHorizontal: MAIN_PADDING_HORIZONTAL,
  },

  /* ---- Sections: Featured, Upcoming, Nearby ------------------------------ */

  /**
   * `Main` is `gap-[48px]`; a section is `gap-[24px]` inside.
   *
   * The gap is a `marginTop` on the section rather than a `gap` on the list's
   * header, because the header also holds the banners and the empty state and
   * those are not `Main` children — they are rows with no frame, and giving
   * them the frame's section rhythm would assert a design that does not exist.
   */
  pulseSection: {
    gap: SECTION_GAP,
    marginTop: MAIN_GAP,
  },
  /*
   * Cancels `Main`'s gutter so the Featured row runs edge to edge.
   *
   * The frame does this with a mask at section-x `-12` (`1141:4660`); a
   * negative margin is the React Native equivalent. The section *header* keeps
   * the gutter — only the scrolling row bleeds, which is what the frame draws.
   */
  featuredBleed: {
    marginHorizontal: -MAIN_PADDING_HORIZONTAL,
  },
  /** A vertical column of cards inside a section — Upcoming, Nearby. */
  pulseStack: {
    gap: STACK_GAP,
  },
  /** "{City} / Tuesday", under a section heading. */
  sectionSubTitle: {
    ...EMBER_TYPE.meta,
  },
  /**
   * Skeletons only. The real headings are `SectionHeader`, which carries its
   * own row; this exists so a loading placeholder lines up with the heading it
   * stands in for rather than drifting a few points off it.
   */
  sectionHeaderRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* ---- Nearby, when there is no location -------------------------------- */

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
    ...EMBER_TYPE.categoryPill,
    // Dark on warm. White on `#FF906D` fails contrast — see `EMBER.onGradient`.
    color: EMBER.onGradient,
  },

  /* ---- The rows with behaviour and no frame ----------------------------- */
  /*
   * The offline banner, the switch-city offer, the away notice, and the
   * location and network errors. Undesigned, so they are deliberately plain:
   * one shape, three colours, and the colour is the only thing that says how
   * much the row matters.
   */

  filtersBar: {
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
    backgroundColor: 'rgba(255,144,109,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,144,109,0.45)',
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
    // Was `APP_COLORS.separator`, which is the old blue palette's hairline. On
    // a warm-black page it reads as a cold edge around a warm card.
    borderColor: 'rgba(255,255,255,0.12)',
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
    borderColor: 'rgba(255,255,255,0.12)',
  },
  /*
   * Neutral, not a warning.
   *
   * The other banners are warm or sunken because something is wrong and an
   * action is owed. This one is a statement of fact — you are somewhere we do
   * not serve yet — and dressing it as an alert would make an ordinary
   * situation read as a fault.
   */
  bannerNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bannerNeutralText: {
    ...EMBER_TYPE.helper,
    color: EMBER.textSecondary,
    flex: 1,
  },
  bannerText: {
    ...EMBER_TYPE.cardBody,
    color: EMBER.textPrimary,
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
    ...EMBER_TYPE.categoryPill,
    color: EMBER.onGradient,
  },

  /* ---- Empty states ----------------------------------------------------- */
  /*
   * Three of them, and the copy is the design — "Coming soon to {city}",
   * "Nothing on in {city}" and "No matches" are three different situations that
   * one empty state used to conflate. See the render site.
   */

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
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...EMBER_TYPE.cardTitle,
    marginBottom: 8,
  },
  emptySub: {
    ...EMBER_TYPE.cardBody,
    textAlign: 'center',
  },
  ctaGhost: {
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaGhostText: {
    ...EMBER_TYPE.categoryPill,
  },

  /* ---- The city picker -------------------------------------------------- */
  /*
   * A placeholder sheet, like the interest picker before it — see
   * `docs/PLACEHOLDER_SCREENS.md`. The server's list is the whole contract:
   * every entry opens with the number of events it claims.
   */

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
    ...EMBER_TYPE.sectionHeading,
    marginBottom: 14,
  },
  cityPickerEmpty: {
    ...EMBER_TYPE.cardBody,
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
   * Dashed, and above the list rather than in it.
   *
   * "Use my current location" is the one row that is not gated on the city
   * having events — a user standing somewhere we have not launched is absent
   * from the list below and from the switch banner, and without this has no way
   * to say where they are. The dash is what marks it as the odd one out.
   */
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
    ...EMBER_TYPE.categoryPill,
  },
  cityPickerCount: {
    ...EMBER_TYPE.meta,
  },
})
