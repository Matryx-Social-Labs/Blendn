import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { router, useScrollToTop } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  AppState,
  FlatList,
  type LayoutChangeEvent,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton, type TraySize } from '../../components/ActionTray'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import NearbyEventCard from '../../components/NearbyEventCard'
import { preloadImages } from '../../components/OptimizedImage'
import {
  FeaturedCard,
  FEATURED_CARD_GAP,
  featuredCardLayout,
} from '../../components/pulse/FeaturedCard'
import { PULSE_HEADER_HEIGHT, PulseHeader } from '../../components/pulse/PulseHeader'
import { CityArtBanner, CityArtCard } from '../../components/cityArt/CityArtCard'
import { drawableCityArt } from '../../components/cityArt/drawable'
import { TAB_BAR_CLEARANCE, tabBarTop } from './_layout'
import { FilterSheet, type CategoryOption } from '../../components/pulse/FilterControl'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { DayHeading } from '../../components/ui/DayHeading'
import { HomeShell, type HomeBrowse } from '../../components/home/HomeShell'
import { DRAWER_HEADER_HEIGHT } from '../../lib/home'
import { H } from '../../lib/haptics'
import { UPCOMING_THUMB, UpcomingCard } from '../../components/pulse/UpcomingCard'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import { getEvents as fetchEventsApi, type BlendnEvent } from '../../lib/api'
import {
  activeFilterCount,
  filtersToQuery,
  hasActiveFilters,
  NO_FILTERS,
  type EventFilters,
} from '../../lib/eventFilters'
import { feedPlaylist } from '../../lib/feedMedia'
import { useLatest } from '../../lib/useLatest'
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
  nextUpLabel,
  placeLabel,
  groupByDay,
  timeLabel,
} from '../../lib/pulse'
import { liveWindow, sessionOver } from '../../lib/eventSession'
import { mergeEventPage, pageHasMore, pulseEmptyCopy, pulseEmptyKind } from '../../lib/pulseFeed'
import { checkOutOf } from '../../lib/checkIn'
import { openBlendn } from '../../lib/blendnOverlay'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { usePresence } from '../../lib/usePresence'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { formatTimeRange } from '../../lib/time'
import { useLiveSync } from '../../lib/useLiveSync'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { useAuth } from '../../lib/useAuth'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { CoachMark } from '../../components/ds/CoachMark'
import { CONTROL, EMBER, EMBER_FONTS, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE, tint } from '../../lib/theme'
import { RisingSheet, SheetFlatList, SheetModal } from '../../components/motion/RisingSheet'
import { Grabber } from '../../components/ui/Grabber'
import Animated from 'react-native-reanimated'
import { fadeInFast, fadeOutFast } from '../../components/motion/presence'

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
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
/**
 * The page's rhythm, from the design system (`docs/DESIGN_SYSTEM.md`).
 *
 * One side margin for everything; 32 between sections, 16 from a heading to
 * its content, 24 between stacked cards. The top bar's clearance is added at
 * the render site with the safe-area insets.
 */
const SCREEN_HEIGHT = Dimensions.get('window').height
const MAIN_PADDING_HORIZONTAL = GUTTER
const MAIN_PADDING_BOTTOM = 128
const MAIN_GAP = SPACE.xxl
/** A section's own rows; a vertical stack of cards inside one. */
const SECTION_GAP = SPACE.lg
const STACK_GAP = SPACE.xl

/**
 * The Pulse's coach mark: the long-press on a card, which nothing on screen
 * says exists (docs/NAVIGATION.md, "Coach marks"). Its id is the key the old
 * "Got it" banner stored, so whoever dismissed that is not taught again.
 */
const PULSE_COACH = 'events_preview_hint'
const PULSE_COACH_TEXT = 'Hold an event to save, share or preview it.'

const SECTION_MOTION_BASE_DELAY = 34
const SECTION_MOTION_STAGGER = 44
/**
 * Main-list rows that rise in on the first reveal: `initialNumToRender`'s worth,
 * the rows that mount with the content. Later batches mount off-screen, where
 * an entrance is invisible work.
 */
const MAIN_REVEAL_ROWS = 4

/*
 * A main-list row, rising in after the sections above it — once.
 *
 * The decision is taken at mount and frozen: flipping between a wrapper and no
 * wrapper on a later render would remount the card and re-decode its photo.
 * Only rows mounted by the first skeleton → content swap animate; a refetch
 * keeps its rows mounted, and a row the list mounts later while scrolling
 * finds the flag already cleared.
 */
function RevealRow({
  index,
  pending,
  children,
}: {
  index: number
  pending: React.RefObject<boolean>
  children: React.ReactNode
}) {
  const [animate] = useState(() => pending.current && index < MAIN_REVEAL_ROWS)
  if (!animate) return <>{children}</>
  return (
    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + SECTION_MOTION_STAGGER * (4 + index)} distance={8}>
      {children}
    </FadeInUp>
  )
}

/** One `UpcomingCard`-shaped placeholder: words left, square photo right. */
function UpcomingSkeletonRow() {
  return (
    <View style={styles.upcomingSkeletonCard}>
      <View style={{ flex: 1, gap: SPACE.sm }}>
        <SkeletonLine width={'40%'} />
        <SkeletonLine width={'85%'} />
        <SkeletonLine width={'55%'} />
      </View>
      <SkeletonBlock width={UPCOMING_THUMB} height={UPCOMING_THUMB} borderRadius={EMBER_RADIUS.sm} />
    </View>
  )
}

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

/** "12.97" or "12.97, 77.59": a raw coordinate standing in for a place name. */
const isCoordinateLike = (value?: string | null) =>
  !!value && /^-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)?$/.test(value.trim())

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

/*
 * Which events are close enough to check in to, and how far each one is.
 *
 * Calculated client-side, since there is no proximity endpoint. Pure, so the
 * screen derives it during render. It used to be stored by an effect, which
 * left it one render behind the list it describes.
 */
/** The interest, count and check-in maps one page of events carries. */
const feedMaps = (list: Event[]) => {
  const interests: { [eventId: string]: boolean } = {}
  const counts: Record<string, number> = {}
  const checkins: { [eventId: string]: any } = {}
  for (const event of list) {
    interests[event.id] = !!event.is_favorited
    counts[event.id] = event.favorite_count || 0
    if (event.user_checkin) {
      checkins[event.id] = {
        status: event.user_checkin.status,
        checkInId: event.user_checkin.checkInId,
        checkInTime: event.user_checkin.checkInTime,
      }
    }
  }
  return { interests, counts, checkins }
}

/** Puts one event's check-in status back as it was, or removes it if there was none. */
const restoreStatus =
  (id: string, previous: any) =>
  (prev: { [eventId: string]: any }) => {
    const next = { ...prev }
    if (previous) next[id] = previous
    else delete next[id]
    return next
  }

const proximityFor = (
  events: Event[],
  at: { latitude: number; longitude: number }
): { [eventId: string]: any } => {
  const proximityMap: { [eventId: string]: any } = {}
  for (const event of events) {
    if (!event.latitude || !event.longitude) continue
    const distanceMetres = getDistanceMetres(at.latitude, at.longitude, event.latitude, event.longitude)
    // Metres, matching what the API returns. The old default of 0.5 was a
    // kilometre value standing in for "500m" and made the mismatch invisible.
    const checkInRadiusMetres = event.check_in_radius || 500
    proximityMap[event.id] = {
      within_radius: distanceMetres <= checkInRadiusMetres,
      // The field name is the contract: kilometres here, metres above.
      distance_km: distanceMetres / 1000,
    }
  }
  return proximityMap
}

function EventsInner({ onBrowse, visible, full }: { onBrowse: (browse: HomeBrowse) => void; visible: boolean; full: boolean }) {
  const { user, loading: authLoading } = useAuth()
  const insets = useSafeAreaInsets()
  // The hero card sits under the home drawer's header too (components/home/HomeDrawer.tsx).
  const cardInsets = useMemo(() => ({ top: insets.top + DRAWER_HEADER_HEIGHT, bottom: insets.bottom }), [insets.top, insets.bottom])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Pull-to-refresh count: a failed Upcoming thumb tries its cover again (SCRUM-480).
  const [pulls, setPulls] = useState(0)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number, accuracy?: number | null} | null>(null)
  const proximityData = useMemo(
    () => (userLocation ? proximityFor(events, userLocation) : {}),
    [events, userLocation]
  )
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
  const [interestStatuses, setInterestStatuses] = useState<{ [eventId: string]: boolean }>({})
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({})

  /*
   * The four maps every action handler reads, held so they do not force the
   * handlers to change identity. See lib/useLatest.ts for what that was costing.
   *
   * The `Ref` suffix is load-bearing. The React Compiler cannot see through
   * `useLatest`, and it only recognises a ref by its name. Without the suffix
   * it reads `.current` as a dependency of every handler.
   */
  const latestCheckinStatusesRef = useLatest(checkinStatuses)
  const latestProximityDataRef = useLatest(proximityData)
  const latestInterestStatusesRef = useLatest(interestStatuses)
  const latestInterestCountsRef = useLatest(interestCounts)

  const checkedInEventId =
    Object.keys(checkinStatuses).find((id) => checkinStatuses[id]?.status === 'checked_in') ?? null
  const presence = usePresence(checkedInEventId)

  // The server has ended this check-in -- the user walked out and the grace
  // period expired, or the sweeper got there first. Reflect it rather than
  // leaving a stale "checked in" chip on screen.
  //
  // Done during render, not in an effect, so the stale chip is never painted.
  // It cannot loop: marking the event checked out takes it out of
  // `checkedInEventId`, and that is the condition that brought us here.
  if (presence.finished && checkedInEventId) {
    setCheckinStatuses((prev) => ({
      ...prev,
      [checkedInEventId]: { ...prev[checkedInEventId], status: 'checked_out' },
    }))
  }
  const [interestPending, setInterestPending] = useState<Record<string, boolean>>({})
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
  // Decided once the city list has been read: stored, inferred, or none at all.
  const [cityResolved, setCityResolved] = useState(false)
  const [cityOptions, setCityOptions] = useState<CityOption[]>([])
  const [deviceCity, setDeviceCity] = useState<string | null>(null)
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  // Bumped by every city the person chooses, so the map moves even to the city it already shows; `here` when they chose where they stand.
  const [cityPick, setCityPick] = useState({ n: 0, here: false })
  const listRef = useRef<any>(null)
  // Tapping Pulse while already on it goes back to the top (the bar emits `tabPress`).
  useScrollToTop(listRef)
  /** Height of the banners above the header, so the Featured card still clears the bar. */
  const [bannersHeight, setBannersHeight] = useState(0)
  const onBannersLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height)
    setBannersHeight((prev) => (prev === h ? prev : h))
  }, [])
  const [netError, setNetError] = useState<string | null>(null)
  /** The header still on screen, so the coach mark above the first card is too. */
  const [listAtTop, setListAtTop] = useState(true)
  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setListAtTop(e.nativeEvent.contentOffset.y < PULSE_HEADER_HEIGHT)
  }, [])

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
  // Held in state so the identities are guaranteed never to change. FlatList
  // throws if either one changes on a mounted list.
  const [featuredViewability] = useState(() => ({ itemVisiblePercentThreshold: 60, minimumViewTime: 250 }))
  const [onFeaturedViewable] = useState(
    () => ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
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

  const changeSearchInput = useCallback((next: string) => {
    setSearchInput(next)
    // No wait when clearing. Emptying the box is a request to see the normal
    // screen again, and making somebody watch a spinner for a third of a second
    // to get back to where they started reads as the app being slow.
    if (next.trim().length === 0) setSearchTerm('')
  }, [])

  useEffect(() => {
    const trimmed = searchInput.trim()
    // Clearing has already happened, with no wait, in `changeSearchInput`.
    if (trimmed.length === 0) return
    const id = setTimeout(() => setSearchTerm(trimmed), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const [trayState, setTrayState] = useState<EventsTrayState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    size: 'default',
  })
  // Location permission status: 'checking' | 'granted' | 'denied' | 'undetermined'
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied' | 'undetermined'>('checking')
  const locationRequestInFlight = useRef(false)
  const interestInFlightRef = useRef<Set<string>>(new Set())
  const checkOutInFlightRef = useRef<Set<string>>(new Set())
  const lastFetchLocationRef = useRef<string>('none')
  const initialLoadedRef = useRef(false)

  const closeTray = useCallback(() => {
    setTrayState((prev) => ({ ...prev, visible: false }))
  }, [])

  const showTray = useCallback((next: Omit<EventsTrayState, 'visible'>) => {
    setTrayState({ ...next, visible: true })
  }, [])

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
        interestCount: String(latestInterestCountsRef.current[event.id] ?? event.favorite_count ?? 0),
      } as any,
    })
  }, [userLocation, latestInterestCountsRef])

  /*
   * Re-reads the active check-ins after a check-in or out. Nothing here draws
   * them: the read refreshes the SWR entry the tab bar's Blend'n button reads
   * (`app/(tabs)/_layout.tsx`).
   */
  const loadCheckedInEvents = useCallback(async () => {
    if (!user) return
    try {
      Logger.journey('checkin', 'loadActiveCheckins:start', { userId: user.id })
      const result = await apiClient.getActiveCheckins()
      const count = result.success && result.data?.checkIns ? result.data.checkIns.filter((c: any) => c.event).length : 0
      Logger.journey('checkin', 'loadActiveCheckins:done', { count })
    } catch (e) {
      Logger.error('events', 'Unexpected error', { error: e as any })
    }
  }, [user])

  const loadCheckinStatusesBatch = useCallback(async () => {
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
  }, [user, events])

  const toggleInterest = useCallback(async (event: Event) => {
    if (interestInFlightRef.current.has(event.id)) return
    let prevInterested = false
    let prevCount = 0
    const fail = () => {
      setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: prevCount }))
      H.error()
      showTray({
        title: prevInterested ? "Couldn't remove it" : "Couldn't save",
        message: prevInterested
          ? "Couldn't remove this event from Saved. Try again."
          : "Couldn't save this event. Try again.",
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    }
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
      prevInterested = !!latestInterestStatusesRef.current[event.id]
      prevCount = latestInterestCountsRef.current[event.id] ?? event.favorite_count ?? 0
      const optimisticCount = Math.max(0, prevInterested ? prevCount - 1 : prevCount + 1)
      // Optimistic update
      setInterestStatuses(prev => ({ ...prev, [event.id]: !prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: optimisticCount }))

      const result = await apiClient.toggleInterest(event.id)
      if (!result.success || !result.data) {
        fail()
        return
      }
      setInterestStatuses(prev => ({ ...prev, [event.id]: result.data!.interested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: result.data!.interestCount }))
      // Outcome after truth: a save the server kept. Taking one back is silent.
      if (result.data!.interested) H.success()
      Logger.journey('events', result.data!.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
    } catch {
      fail()
    } finally {
      interestInFlightRef.current.delete(event.id)
      setInterestPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [user, showTray, closeTray, latestInterestStatusesRef, latestInterestCountsRef])

  const handleCheckOut = useCallback(async (event: Event) => {
    if (checkOutInFlightRef.current.has(event.id)) return
    checkOutInFlightRef.current.add(event.id)
    // The confirm's "Check out" was just pressed: `H.destructive` (§10.2). A
    // refusal answers with `H.error`; a success with the tray alone.
    H.destructive()

    const previousStatus = latestCheckinStatusesRef.current[event.id]
    const fail = () => {
      setCheckinStatuses(restoreStatus(event.id, previousStatus))
      H.error()
      showTray({
        title: 'Check-out failed',
        message: "Couldn't check you out. Try again.",
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    }

    // Optimistic removal from checked-in state
    setCheckinStatuses((prev) => ({ ...prev, [event.id]: { status: 'not_checked_in' } }))

    try {
      const result = await checkOutOf(String(event.id))
      if (result.success) {
        showTray({
          title: 'Checked out',
          message: 'You have been checked out of this event.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
        loadCheckedInEvents()
        loadCheckinStatusesBatch()
      } else {
        fail()
      }
    } catch {
      fail()
    } finally {
      checkOutInFlightRef.current.delete(event.id)
    }
  }, [showTray, closeTray, latestCheckinStatusesRef, loadCheckedInEvents, loadCheckinStatusesBatch])

  const handleEventPreview = useCallback((event: Event) => {
    markCoachUsed(PULSE_COACH)
    const checkinStatus = latestCheckinStatusesRef.current[event.id]
    const proximity = latestProximityDataRef.current[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = !!proximity?.within_radius && !isCheckedIn
    const interested = !!latestInterestStatusesRef.current[event.id]
    const summary = [
      formatCarouselCardDate(event.start_time),
      event.venue_name || event.display_city || 'Location TBA',
      (event.short_description || event.description || '').trim(),
    ].filter(Boolean).join('\n')

    const buttons: ActionTrayButton[] = [
      {
        label: interested ? 'Remove from saved' : 'Save',
        onPress: () => {
          closeTray()
          toggleInterest(event)
        },
      },
      {
        label: 'View details',
        // One primary per tray: Check In takes it when it is on offer.
        variant: canCheckIn ? 'secondary' : 'primary',
        onPress: () => {
          closeTray()
          handleEventPress(event)
        },
      },
    ]

    if (canCheckIn) {
      buttons.unshift({
        // The check-in's name everywhere else in the app (the Scene's CTA).
        label: 'Blend in',
        variant: 'primary',
        // Into the Blend'n pass: a check-in always goes through the hold (docs/redesign/SCREENS.md, Pulse).
        onPress: () => {
          closeTray()
          openBlendn()
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
        label: 'Check out',
        /*
         * Asks first, with the Room's words. Checking out closes the room and
         * coming back needs a fresh location fix, so a stray tap in a tray
         * of four buttons should not be able to do it on its own.
         */
        onPress: () => {
          showTray({
            title: `Check out of ${event.title}?`,
            message: 'You’ll leave the room and its people. To come back in you’ll need to check in again, with your location.',
            buttons: [
              { label: 'Stay', onPress: closeTray },
              {
                label: 'Check out',
                variant: 'primary',
                onPress: () => {
                  closeTray()
                  void handleCheckOut(event)
                },
              },
            ],
          })
        },
      })
    }

    showTray({
      title: event.title,
      message: summary,
      buttons,
      size: 'expanded',
    })
  }, [closeTray, toggleInterest, handleEventPress, handleCheckOut, showTray, latestCheckinStatusesRef, latestProximityDataRef, latestInterestStatusesRef])

  const getCurrentLocationQuietly = useCallback(async () => {
    try {
      // Best-effort permission request with quick timeout; fallback if denied/unavailable
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setUserLocation(null)
        setLocationStatus(status === 'denied' ? 'denied' : 'undetermined')
        Logger.warn('events', 'permission:notGranted', {})
        showTray({
          title: 'Turn on location',
          message: 'We need your location to show nearby events and to check you in.',
          buttons: [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open settings',
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
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
      setUserLocation(coords)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      // Keep status as granted if permission was granted but position fetch failed
      Logger.warn('events', 'quietLocation:error', { error: error as any })
    }
  }, [showTray, closeTray])

  // Settles when the ask does, so the map's "my location" can show it is waiting.
  const requestLocationIfNeeded = useCallback((): Promise<void> => {
    if (userLocation) return Promise.resolve()
    if (locationRequestInFlight.current) return Promise.resolve()
    locationRequestInFlight.current = true
    return getCurrentLocationQuietly()
      .finally(() => {
        locationRequestInFlight.current = false
      })
  }, [userLocation, getCurrentLocationQuietly])

  // Places browses the same city from the same spot, and the map follows it (components/home/HomeShell.tsx).
  useEffect(
    () =>
      onBrowse({
        city: selectedCity,
        location: userLocation,
        ready: cityResolved,
        cityCentre: cityOptions.find((c) => c.city === selectedCity)?.centre ?? null,
        cityPick,
        requestLocation: requestLocationIfNeeded,
      }),
    [onBrowse, selectedCity, userLocation, cityResolved, cityOptions, cityPick, requestLocationIfNeeded]
  )

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
              setUserLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude, accuracy: lastKnown.coords.accuracy })
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
        const result = await apiClient.getCategories()
        const rows = result.success ? result.data : undefined
        if (cancelled || !Array.isArray(rows)) return
        setCategoryOptions(
          rows
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

  // Pagination, declared ahead of `fetchEvents` because it resets the page.
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  /*
   * Whether another page could exist. A short page is the last one
   * (`pageHasMore`), so the end of a twelve-event city stops asking.
   */
  const [hasMore, setHasMore] = useState(true)
  const fetchMoreInFlightRef = useRef(false)
  /*
   * Bumped by every page-one load. A page two that was in flight when the
   * city, search or filters changed belongs to the old list, and appending it
   * to the new one would put another city's events under this one's header.
   */
  const feedGenerationRef = useRef(0)
  /*
   * When `events` was last written. "Upcoming" means not started as of the
   * load, so this is set beside every `setEvents` and not read from the clock
   * during render.
   */
  const [eventsLoadedAt, setEventsLoadedAt] = useState(() => Date.now())

  const fetchEvents = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    try {
      const isInitial = !initialLoadedRef.current
      const shouldShowLoading = isInitial || !options?.silent
      if (shouldShowLoading) {
        setLoading(true)
      }
      setNetError(null)
      feedGenerationRef.current += 1
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
      const { data: eventsData, error } = await fetchEventsApi({
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
        setNetError("Couldn't load events.")
        return
      }

      const normalized = (eventsData || []).map(normalizeEvent)
      setEvents(normalized)
      setEventsLoadedAt(Date.now())
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
      setHasMore(pageHasMore(normalized.length, PAGE_SIZE))
      lastFetchLocationRef.current = lat && lon ? `${lat},${lon}` : 'none'
      initialLoadedRef.current = true
      if (eventsData) {
        const maps = feedMaps(eventsData)
        setInterestStatuses(maps.interests)
        setInterestCounts(maps.counts)
        setCheckinStatuses(maps.checkins)
      }
      // Image preloading is handled by useEffect when events change
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      setNetError("Couldn't load events.")
    } finally {
      if (!options?.silent || !initialLoadedRef.current) {
        setLoading(false)
      }
    }
  }, [userLocation, selectedCity, searchTerm, filters])

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
    setPulls((n) => n + 1)
    await fetchEvents({ silent: true, force: true })
    setRefreshing(false)
  }

  /*
   * Which of the four dependencies actually changed, so a search keystroke
   * or a filter change can be told apart from a city switch.
   *
   * A city change swaps the whole list and earns the full skeleton. Search
   * and filters are refinements of what is already on screen — the old
   * behaviour ran all four through one non-silent `fetchEvents()`, so typing
   * a query dropped the *entire* screen (including the Featured/Upcoming
   * rails a search hides anyway) into skeleton for at least the 720ms
   * `useMinimumVisible` floor, every time the debounce settled. Refs rather
   * than state because this only needs to be read inside the effect below,
   * once, the render after each of these actually changes.
   */
  const prevSelectedCityRef = useRef(selectedCity)
  const prevSearchTermRef = useRef(searchTerm)
  const prevFiltersRef = useRef(filters)
  const [refining, setRefining] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      const cityChanged = prevSelectedCityRef.current !== selectedCity
      const refinementChanged =
        prevSearchTermRef.current !== searchTerm || prevFiltersRef.current !== filters
      prevSelectedCityRef.current = selectedCity
      prevSearchTermRef.current = searchTerm
      prevFiltersRef.current = filters

      // Only silent once there is something on screen to refine, and only
      // when a city change is not also in play — a city switch is a real
      // reload and should look like one.
      const silent = initialLoadedRef.current && !cityChanged && refinementChanged

      Logger.journey('events', 'mount:authorized', { userId: user.id, city: selectedCity })
      if (silent) setRefining(true)
      fetchEvents({ silent }).finally(() => {
        if (silent) setRefining(false)
      })
    }
    // fetchEvents is deliberately not a dependency here: it also changes
    // identity when userLocation changes, and a userLocation-triggered fetch
    // is already handled below (with its own lastFetchLocationRef dedupe) —
    // including it here would fire that fetch a second, unguarded time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, selectedCity, searchTerm, filters])

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

  // The journey log the proximity pass has always written, on the same
  // conditions. `proximityData` itself is derived near the top (`proximityFor`).
  useEffect(() => {
    if (!userLocation || !user || events.length === 0) return
    Logger.journey('proximity', 'checkAll:start', { lat: userLocation.latitude, lon: userLocation.longitude })
    Logger.journey('proximity', 'checkAll:success', { eventsEvaluated: events.length, nearbyCount: Object.keys(proximityData).length })
  }, [userLocation, user, events, proximityData])

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
      setCityResolved(true)
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
        Logger.warn('events', "Couldn't resolve the device city", { error: error as any })
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
   *
   * Run during render when either input changes, not in an effect. An effect
   * committed the old selection first, and that fetched the old city before
   * the new one.
   */
  const [cityInputsSeen, setCityInputsSeen] = useState({ deviceCity, cityOptions })
  if (cityInputsSeen.deviceCity !== deviceCity || cityInputsSeen.cityOptions !== cityOptions) {
    setCityInputsSeen({ deviceCity, cityOptions })
    if (deviceCity && cityOptions.length > 0) {
      setSelection((current) => {
        if (!current) {
          return resolveBrowseCity({ stored: null, deviceCity, available: cityOptions })
        }
        const next = cityOnResume({ stored: current, deviceCity, available: cityOptions })
        return next ? { city: next, source: 'inferred' } : current
      })
    }
  }

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
      /*
       * Re-check permission, not only coordinates. The mount effect reads the
       * permission once; the "Enable location" banner is keyed off
       * `locationStatus`, so somebody who granted location in Settings (or in
       * the OS dialog after the app was backgrounded) came back to a banner
       * that stayed pinned for ever — the app never looked again. Refresh the
       * status on every foreground so a grant elsewhere clears it.
       */
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          setLocationStatus(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined')
        })
        .catch(() => {})
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
  const chooseCity = useCallback((city: string, here = false) => {
    setSelection({ city, source: 'chosen' })
    setCityPick((p) => ({ n: p.n + 1, here }))
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
  }, [user, authLoading, userLocation, loading, fetchEvents])

  // Basic pagination: fetch next page after current items
  const fetchMore = useCallback(async () => {
    // `onEndReached` fires more than once per arrival at the end; one request
    // at a time, and none once a short page has said there is nothing more.
    if (loading || !hasMore || fetchMoreInFlightRef.current) return
    fetchMoreInFlightRef.current = true
    const generation = feedGenerationRef.current
    try {
      Logger.journey('events', 'fetchMore:start', { page: page + 1 })
      /*
       * The same scope as page one — city, search **and filters**.
       *
       * `city` was missing here once, and scrolling to the bottom of a
       * city-scoped list appended events from everywhere. The filters were
       * missing until this: page one honoured "this weekend, within 2 km" and
       * page two appended everything, below the fold where nobody looks twice.
       */
      const { data, error } = await fetchEventsApi({
        page: page + 1,
        limit: PAGE_SIZE,
        city: selectedCity ?? undefined,
        lat: userLocation?.latitude,
        lon: userLocation?.longitude,
        include: 'checkins',
        search: searchTerm || undefined,
        ...filtersToQuery(filters),
      })
      // The list was replaced while this was in flight; this page is not its.
      if (generation !== feedGenerationRef.current) return
      if (error) return
      const received = data ?? []
      setHasMore(pageHasMore(received.length, PAGE_SIZE))
      if (received.length === 0) return
      setEvents(prev => {
        const merged = mergeEventPage(prev, received.map(normalizeEvent))
        publishRoomSignal(merged)
        return merged
      })
      setEventsLoadedAt(Date.now())
      setPage(prev => prev + 1)
      const maps = feedMaps(received)
      setInterestStatuses((prev) => ({ ...prev, ...maps.interests }))
      setInterestCounts((prev) => ({ ...prev, ...maps.counts }))
      setCheckinStatuses((prev) => ({ ...prev, ...maps.checkins }))
    } catch (error) {
      Logger.warn('events', 'fetchMore:failed', { error: error as any })
    } finally {
      fetchMoreInFlightRef.current = false
    }
  }, [loading, hasMore, page, userLocation, selectedCity, searchTerm, filters])

  // Cleared once the first content has committed; see `RevealRow`.
  const mainRowsRevealPending = useRef(true)

  /*
   * The rows under the sections — everything Featured, Upcoming and Nearby did
   * not draw, and the whole result while searching or filtering.
   *
   * The same `UpcomingCard` row as the Upcoming section. This used to be
   * `EventCard`, the photo-on-top card from before the redesign, with its own
   * check-in button and "move closer" chips — so scrolling past Nearby dropped
   * you into the old app. Check-in lives on the event screen, where the
   * geofence is explained; a row only needs to say when, where and how far.
   *
   * Not grouped by day, so the eyebrow carries the date as well as the time.
   */
  const renderEventItem = useCallback(({ item: event, index }: { item: Event; index: number }) => {
    const isCheckedIn = checkinStatuses[event.id]?.status === 'checked_in'
    // Today's day of a multi-day run, not the run — `lib/eventSession.ts`.
    const live = liveWindow(event)
    const isEnded = sessionOver(event)
    const note = isCheckedIn ? 'Checked in' : isEnded ? 'Ended' : null

    return (
      <RevealRow index={index} pending={mainRowsRevealPending}>
        <View style={styles.mainRow}>
          <UpcomingCard
            title={event.title}
            category={event.category || null}
            imageUrl={event.cover_image_url}
            retry={pulls}
            timeLabel={nextUpLabel(live.start_time, live.end_time)}
            placeLabel={placeLabel(event)}
            joinedCount={joinedCount(event)}
            distanceLabel={browsingHere ? formatDistance(proximityData[event.id]?.distance_km ?? event.distance) : null}
            note={note}
            onPress={() => handleEventPress(event)}
            onLongPress={() => handleEventPreview(event)}
            isFavorited={!!interestStatuses[event.id]}
            favoriteBusy={!!interestPending[event.id]}
            onToggleFavorite={() => toggleInterest(event)}
          />
        </View>
      </RevealRow>
    )
  }, [checkinStatuses, proximityData, interestStatuses, interestPending, browsingHere, handleEventPress, handleEventPreview, toggleInterest, pulls])

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: Event) => item.id, [])

  const upcomingItems = useMemo(() => {
    return events
      .filter(e => new Date(e.start_time).getTime() >= eventsLoadedAt)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, eventsLoadedAt])

  const nearbyItems = useMemo(() => {
    if (!userLocation) return [] as Event[]
    return events
      .filter(e => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
      .map(e => ({ e, d: proximityData[e.id]?.distance_km ?? Number.POSITIVE_INFINITY }))
      .filter(x => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d)
      .map(x => x.e)
  }, [events, userLocation, proximityData])



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
      featuredItems.map((item) => ({
        id: item.id,
        title: item.title,
        tag: item.category || null,
        playlist: feedPlaylist(item.media, item.cover_image_url),
        dateLabel: featuredDateLabel(item.start_time),
        placeLabel: placeLabel(item),
        onPress: () => handleEventPress(item),
        onLongPress: () => handleEventPreview(item),
      })),
    [featuredItems, handleEventPress, handleEventPreview]
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
    if (isNarrowed) return events

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
    upcomingStackItems.forEach(e => shown.add(e.id))
    nearbyItems.slice(0, 4).forEach(e => shown.add(e.id))
    return events.filter(e => !shown.has(e.id))
  }, [isNarrowed, events, featuredItems, upcomingStackItems, nearbyItems])

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
    const featured = featuredCardLayout(
      cardInsets,
      tabBarTop(SCREEN_HEIGHT, insets.bottom),
      featuredItems.length === 1,
      bannersHeight
    )
    return (
      <View style={styles.pulseSection}>
        {/*
          No "VIEW ALL". It opened the Nearby list, sorted by distance, which is
          not the featured events it sat above; and every event not in a section
          is already in the list further down this screen.
        */}
        <SectionHeader title="Featured" />
        {/*
          A row of one is not a row.

          With a single featured event the peeking width leaves a third of the
          screen empty beside it, which reads as a layout that failed rather
          than as an invitation to scroll. One card fills the width; two or more
          go back to peeking.
        */}
        <View>
          {featuredItems.length === 1 ? (
            <View style={[styles.featuredBleed, { paddingHorizontal: featured.inset }]}>
              <FeaturedCard {...featuredCards[0]} isActive={visible} width={featured.width} />
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
              viewabilityConfig={featuredViewability}
              onViewableItemsChanged={onFeaturedViewable}
              renderItem={({ item, index }) => (
                <FeaturedCard {...item} isActive={visible && index === featuredActiveIndex} width={featured.width} />
              )}
              // Hoisted: an inline component is a new type every render, which
              // remounts every separator rather than reusing them.
              ItemSeparatorComponent={FeaturedSeparator}
            />
          )}
          {coachMark}
        </View>
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
        {/*
          Grouped by day, the way a calendar is (and Luma's event list): the
          date is said once, above its events, so each card only needs a time.
        */}
        <View style={styles.dayGroups}>
          {groupByDay(upcomingStackItems).map((group, groupIndex) => (
            <View key={group.key} style={styles.dayGroup}>
              <DayHeading title={group.title} detail={group.weekday} />
              {group.items.map((item, index) => (
                // The page's first card when nothing is featured: it carries the coach mark.
                <View key={`up-${item.id}`}>
                  <UpcomingCard
                    title={item.title}
                    category={item.category || null}
                    imageUrl={item.cover_image_url}
                    retry={pulls}
                    timeLabel={timeLabel(item.start_time)}
                    placeLabel={placeLabel(item)}
                    joinedCount={joinedCount(item)}
                    // Distance from you only means something in the city you are in;
                    // browsing elsewhere it read "6412km away". Same rule as Nearby.
                    distanceLabel={browsingHere ? formatDistance(item.distance) : null}
                    onPress={() => handleEventPress(item)}
                    onLongPress={() => handleEventPreview(item)}
                    isFavorited={!!interestStatuses[item.id]}
                    favoriteBusy={!!interestPending[item.id]}
                    onToggleFavorite={() => toggleInterest(item)}
                  />
                  {featuredItems.length === 0 && groupIndex === 0 && index === 0 ? coachMark : null}
                </View>
              ))}
            </View>
          ))}
        </View>
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
              // The window the door goes by: a multi-day run's day, not the run.
              timeLabel={formatTimeRange(liveWindow(ev).start_time, liveWindow(ev).end_time ?? ev.end_time, { includeDate: true, timezone: ev.timezone })}
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
                (browsingHere ? formatDistance(proximityData[ev.id]?.distance_km) : null)
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
        Turn on location to see events near you.
      </Text>
      <TouchableOpacity
        style={styles.nearbyCta}
        onPress={() => {
          if (locationStatus === 'denied') {
            try { (Linking as any)?.openSettings?.() } catch {}
          } else {
            requestLocationIfNeeded()
          }
        }}
        accessibilityRole="button"
        accessibilityHint={
          locationStatus === 'denied'
            ? 'Opens Settings so you can allow location'
            : 'Asks for your location to show events near you'
        }
      >
        <Text style={styles.nearbyCtaText}>
          {locationStatus === 'denied' ? 'Open settings' : 'Turn on location'}
        </Text>
      </TouchableOpacity>
    </View>
  )

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 720)

  /*
   * The coach mark, over the first card the page draws (Featured's first, or
   * Upcoming's when nothing is featured). Ready only with the drawer all the
   * way up and the list at its top -- at half the first card sits under the
   * tab bar -- and with none of this screen's sheets open. The bell's sheet is
   * the shell's and is not counted; it covers the page while it is up anyway.
   */
  const coach = useCoachMark(PULSE_COACH, {
    ready:
      full &&
      listAtTop &&
      !showLoadingSkeleton &&
      !isNarrowed &&
      upcomingItems.length > 0 &&
      !trayState.visible &&
      !filterSheetOpen &&
      !cityPickerOpen,
  })
  // Out of the flow and above the card, so nothing moves and the card stays tappable; after it, for a screen reader.
  const coachMark = coach.visible ? (
    <View style={styles.coachMark} pointerEvents="box-none">
      <CoachMark text={PULSE_COACH_TEXT} caret="bottom" onDismiss={coach.dismiss} testID="pulse-coach-mark" />
    </View>
  ) : null
  useEffect(() => {
    if (!showLoadingSkeleton && mainListData.length > 0) mainRowsRevealPending.current = false
  }, [showLoadingSkeleton, mainListData.length])

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
          <View style={styles.filtersBar} onLayout={onBannersLayout}>
            {/*
              Offline is worth saying here. A dead socket is not.

              This screen loads over HTTP, so "Realtime disconnected" was showing
              above a list that had loaded perfectly — a warning about a subsystem
              the page does not use. Chat, private chat and the room keep both,
              because there a dead socket means messages you will not see.

              No status dot replaces it either. `profiles.show_online` means
              "other attendees can see you're in the room" — since SCRUM-141 the
              roster and the grid honour it — so a green dot on your own avatar
              reads as exactly that, and wiring it to socket health would show
              green while `show_online: false` kept you off every list. A lie
              in both directions, and unexplainable in support.
            */}
            <RealtimeStatusBanner
              status={socketStatus}
              style={styles.bannerWarn}
              showSocketIssues={false}
            />
            {switchSuggestion && (
              <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.bannerInfo}>
                <Text style={styles.bannerText}>
                  You&apos;re in {switchSuggestion}. Browse events here?
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${switchSuggestion}`}
                  onPress={() => chooseCity(switchSuggestion, true)}
                  style={[styles.bannerCta, styles.bannerCtaOnInfo]}
                >
                  <Text style={styles.bannerCtaText}>Switch</Text>
                </TouchableOpacity>
              </Animated.View>
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
              <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.bannerNeutral}>
                <Ionicons name="location-outline" size={ICON.sm} color={EMBER.textSecondary} />
                <Text style={styles.bannerNeutralText}>
                  You&apos;re in {away.deviceCity} — nothing here yet. Showing {away.selected}.
                </Text>
              </Animated.View>
            )}
            {/*
              Not while the Nearby section is showing its own "Open Settings"
              prompt (unnarrowed, no location): one ask, not two on one screen.
            */}
            {locationStatus === 'denied' && (isNarrowed || !!userLocation) && (
              <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.bannerWarn}>
                <Text style={styles.bannerText}>
                  Turn on location to see nearby events and check in.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open settings to turn on location"
                  onPress={() => { try { (Linking as any)?.openSettings?.() } catch {} }}
                  style={styles.bannerCta}
                >
                  <Text style={styles.bannerCtaText}>Settings</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
            {/*
              Only over a list that is still on screen. With nothing loaded the
              whole page is the error (`firstLoadFailed` below), and saying it
              twice, once small and once large, is noise.
            */}
            {!!netError && events.length > 0 && (
              <Animated.View entering={fadeInFast} exiting={fadeOutFast} style={styles.bannerError}>
                <Text style={styles.bannerText}>Couldn&apos;t refresh events.</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={() => fetchEvents({ force: true })}
                  style={styles.bannerCta}
                >
                  <Text style={styles.bannerCtaText}>Try again</Text>
                </TouchableOpacity>
              </Animated.View>
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
      onChangeQuery={changeSearchInput}
      searching={refining}
      activeFilterCount={activeFilterCount(filters)}
      onPressFilter={() => {
        setFilterDraft(filters)
        setFilterSheetOpen(true)
      }}
    />
  )

  /**
   * Shared with `renderFeaturedRow`'s own copy of this calculation, so the
   * loading skeleton's hero card is the same size as the real one rather than
   * an unrelated guess. Kept as a second call rather than a shared variable —
   * `featuredCardLayout` is pure and cheap, and threading the result through
   * as a prop would couple two render paths that would otherwise stay
   * independent.
   */
  const featuredSkeleton = featuredCardLayout(cardInsets, tabBarTop(SCREEN_HEIGHT, insets.bottom), false, bannersHeight)

  const emptyKind = pulseEmptyKind({
    searching: isSearching,
    filtered: hasActiveFilters(filters),
    city: selectedCity,
    notLiveHere,
  })
  const emptyCopy = pulseEmptyCopy(emptyKind, { city: selectedCity, term: searchTerm })

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
        <VirtualizedList
          forwardedRef={listRef as any}
          data={showLoadingSkeleton ? [] : mainListData}
          renderItem={renderEventItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={200}
          onEndReachedThreshold={0.5}
          onEndReached={fetchMore}
          onScroll={onListScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing && !isLoading} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />
          }
          contentContainerStyle={[
            styles.listContainer,
            {
              // The drawer's header above (the top bar and the status bar are
              // above the drawer); the floating nav plus the home indicator at
              // the bottom, which the feed still scrolls under.
              //
              // Kept in step with `CHROME_ABOVE_CARD`, which sizes the hero card.
              paddingTop: SPACE.lg,
              // The frame's 128 already clears the 88pt nav. `Math.max` so it
              // still does if the nav grows — the bar's height has changed
              // twice, and a feed that ends underneath it is not a visible
              // failure, just a last card nobody can reach.
              paddingBottom: insets.bottom + Math.max(MAIN_PADDING_BOTTOM, TAB_BAR_CLEARANCE + SPACE.xl),
            },
          ]}
          showsVerticalScrollIndicator={false}
          enableVirtualization={!isLoading && mainListData.length > 20}
          /*
           * 4, not 10.
           *
           * The rows below the header are `UpcomingCard`s, and
           * only a few are ever visible at once.
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
                {/*
                  Shaped like the screen it stands in for, not like a generic
                  loading state.

                  This used to be a horizontal row of five 260x120 thumbnails
                  (an "Interested" rail this screen no longer has), then a
                  horizontal Upcoming carousel (Upcoming is a vertical stack —
                  `pulseStack` — and has been since the restyle), then a lone
                  474pt block and six generic cards belonging to sections
                  ("Nightlife", a fancy carousel) that were removed from this
                  screen entirely. None of it echoed what was about to appear,
                  so the swap from skeleton to content was itself a layout
                  jump. `isNarrowed` is checked the same way the loaded branch
                  checks it, so a search or filter loading for the first time
                  does not skeleton three sections it is about to hide.
                */}
                {isNarrowed ? (
                  /*
                    The rows a search or filter returns are `UpcomingCard`s
                    (`renderEventItem`), so the placeholder is that row — not
                    the 200pt photo card it used to be, which the results then
                    replaced with something a third of its height.
                  */
                  <View style={styles.narrowedSkeleton}>
                    {[...Array(4)].map((_, i) => (
                      <UpcomingSkeletonRow key={`s-flat-${i}`} />
                    ))}
                  </View>
                ) : (
                  <>
                    {/* Featured — the real card's photo and words, with the next photo peeking. */}
                    <View style={{ marginTop: MAIN_GAP, gap: SECTION_GAP }}>
                      <View style={styles.sectionHeaderRow}>
                        <SkeletonLine width={100} />
                        <SkeletonLine width={64} />
                      </View>
                      <View style={[styles.featuredBleed, { flexDirection: 'row', paddingHorizontal: featuredSkeleton.inset, gap: FEATURED_CARD_GAP }]}>
                        <View style={{ gap: SPACE.lg }}>
                          <SkeletonBlock width={featuredSkeleton.width} height={featuredSkeleton.photoHeight} borderRadius={EMBER_RADIUS.card} />
                          <View style={{ gap: SPACE.sm }}>
                            <SkeletonLine width={featuredSkeleton.width * 0.8} />
                            <SkeletonLine width={featuredSkeleton.width * 0.5} />
                          </View>
                        </View>
                        <SkeletonBlock width={featuredSkeleton.width * 0.3} height={featuredSkeleton.photoHeight} borderRadius={EMBER_RADIUS.card} />
                      </View>
                    </View>

                    {/* Upcoming — one day heading over `UpcomingCard` rows: words left, square photo right. */}
                    <View style={{ marginTop: MAIN_GAP, gap: SECTION_GAP }}>
                      <View style={styles.sectionHeaderRow}>
                        <SkeletonLine width={120} />
                      </View>
                      <View style={styles.dayGroup}>
                        <SkeletonLine width={80} />
                        {[...Array(3)].map((_, i) => (
                          <UpcomingSkeletonRow key={`s-up-${i}`} />
                        ))}
                      </View>
                    </View>

                    {/* Nearby — image cards at their real aspect ratio (363:249), full content width. */}
                    <View style={{ marginTop: MAIN_GAP, gap: SECTION_GAP }}>
                      <View style={styles.sectionHeaderRow}>
                        <SkeletonLine width={90} />
                        <SkeletonLine width={64} />
                      </View>
                      <SkeletonLine width={140} />
                      <View style={{ gap: STACK_GAP }}>
                        {[...Array(3)].map((_, i) => (
                          <SkeletonBlock
                            key={`s-near-${i}`}
                            width={'100%'}
                            height={(SCREEN_WIDTH - MAIN_PADDING_HORIZONTAL * 2) * (249 / 363)}
                            borderRadius={EMBER_RADIUS.lg}
                          />
                        ))}
                      </View>
                    </View>
                  </>
                )}
                <View style={{ height: SPACE.sm }} />
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
                {/*
                  The first load failed: nothing on screen, and the page says
                  why with one way forward. It used to be a thin red banner
                  above a blank page, which read as a screen that had loaded
                  and was empty.
                */}
                {events.length === 0 && !!netError && (
                  <FadeInUp delay={SECTION_MOTION_BASE_DELAY} distance={10}>
                    <View style={styles.emptyState} accessibilityLiveRegion="polite">
                      <View style={styles.emptyGlyph}>
                        <Ionicons name="cloud-offline-outline" size={36} color={EMBER.textTertiary} />
                      </View>
                      <Text style={styles.emptyTitle}>Couldn&apos;t load events</Text>
                      <Text style={styles.emptySub}>Check your connection and try again.</Text>
                      <ScalePress
                        style={styles.ctaPrimary}
                        onPress={() => fetchEvents({ force: true })}
                        accessibilityRole="button"
                        accessibilityLabel="Try again"
                      >
                        <Text style={styles.ctaPrimaryText}>Try again</Text>
                      </ScalePress>
                    </View>
                  </FadeInUp>
                )}
                {events.length === 0 && !netError && (
                  <FadeInUp delay={SECTION_MOTION_BASE_DELAY} distance={10}>
                    <View style={styles.emptyState}>
                      {/*
                        The city itself, when we have drawn it. An empty week in
                        Bengaluru is still Bengaluru, and the skyline says which
                        city this is before the copy does. A search or filter
                        miss keeps the glyph: that empty is about the query,
                        not the place.
                      */}
                      {emptyKind !== 'search' && emptyKind !== 'filters' && drawableCityArt(selectedCity) ? (
                        <CityArtBanner art={drawableCityArt(selectedCity)!} height={140} />
                      ) : (
                        <View style={styles.emptyGlyph}>
                          <Ionicons
                            name={
                              emptyKind === 'notLive'
                                ? 'rocket-outline'
                                : emptyKind === 'search' || emptyKind === 'filters'
                                  ? 'search-outline'
                                  : 'calendar-outline'
                            }
                            size={36}
                            color={EMBER.textTertiary}
                          />
                        </View>
                      )}
                      {/*
                        Four different empties, and conflating them is a lie
                        (`lib/pulseFeed.ts`). A city with nothing this week is
                        a quiet week; a city not on the list is one we have not
                        launched in; and a search or a filter that found nothing
                        is about the query, not the city. "Nothing on in
                        Bengaluru" over a "this weekend, 2 km" filter told
                        somebody the city was empty when it was not.
                      */}
                      <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
                      <Text style={styles.emptySub}>{emptyCopy.message}</Text>
                      {emptyKind === 'search' ? (
                        <ScalePress
                          style={styles.ctaGhost}
                          onPress={() => changeSearchInput('')}
                          accessibilityRole="button"
                          accessibilityLabel="Clear search"
                        >
                          <Text style={styles.ctaGhostText}>Clear search</Text>
                        </ScalePress>
                      ) : emptyKind === 'filters' ? (
                        // One way out: the filters are the reason, so they are the fix.
                        <ScalePress
                          style={styles.ctaGhost}
                          onPress={() => {
                            setFilters(NO_FILTERS)
                            setFilterDraft(NO_FILTERS)
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear filters"
                        >
                          <Text style={styles.ctaGhostText}>Clear filters</Text>
                        </ScalePress>
                      ) : (
                        <>
                          {cityOptions.length > 0 && (
                            <ScalePress
                              style={styles.ctaGhost}
                              onPress={() => setCityPickerOpen(true)}
                              accessibilityRole="button"
                              accessibilityLabel="Choose a different city"
                            >
                              <Text style={styles.ctaGhostText}>Change city</Text>
                            </ScalePress>
                          )}
                          <ScalePress
                            style={styles.ctaGhost}
                            onPress={() => fetchEvents({ force: true })}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh events"
                          >
                            <Text style={styles.ctaGhostText}>Refresh</Text>
                          </ScalePress>
                        </>
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
                  <FadeInUp delay={SECTION_MOTION_BASE_DELAY + SECTION_MOTION_STAGGER} distance={10}>
                    {renderFeaturedRow()}
                  </FadeInUp>
                ) : null}

                {!isNarrowed && upcomingItems.length > 0 ? (
                  <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 2)} distance={8}>
                    {renderUpcomingStack()}
                  </FadeInUp>
                ) : null}

                {isNarrowed
                  ? null
                  : userLocation
                  ? (nearbyItems.length > 0 ? (
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                      {renderNearbyList(nearbyItems.slice(0, 4))}
                    </FadeInUp>
                  ) : null)
                  : ((locationStatus === 'denied' || locationStatus === 'undetermined') ? (
                    <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                      {renderNearbyPrompt()}
                    </FadeInUp>
                  ) : null)}
                {/* Names the rows that follow, so they read as a section rather than as overflow. */}
                {!isNarrowed && mainListData.length > 0 ? (
                  <View style={[styles.pulseSection, { marginBottom: SECTION_GAP }]}>
                    <SectionHeader title="More events" />
                  </View>
                ) : null}
                <View style={{ height: SPACE.sm }} />
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

        Cities with art (`lib/cityArt.ts`) render as an illustrated card with a
        living skyline; the rest are plain rows until they are drawn.
      */}
      <SheetModal
        visible={cityPickerOpen}
        onRequestClose={() => setCityPickerOpen(false)}
      >
        {/*
          The dismiss target is a sibling behind the sheet, not its parent.
          Wrapping the sheet made it one accessible element (VoiceOver could
          not reach a single city) and closed it on any tap on its padding.
        */}
        <View style={styles.cityPickerBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setCityPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close city picker"
          />
          <RisingSheet style={styles.cityPickerSheet}>
            <Grabber style={styles.cityPickerGrabber} />
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
                onPress={() => chooseCity(deviceCity, true)}
                accessibilityRole="button"
                accessibilityLabel={`Use my current location, ${deviceCity}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
                  <Ionicons name="navigate-outline" size={ICON.md} color={EMBER.textSecondary} />
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
              <SheetFlatList
                data={cityOptions}
                keyExtractor={(item) => item.city}
                renderItem={({ item }) => {
                  const active = sameCity(item.city, selectedCity)
                  const here = sameCity(item.city, deviceCity)
                  // A city we have drawn gets its skyline; the rest stay plain rows.
                  const art = drawableCityArt(item.city)
                  if (art) {
                    return (
                      <CityArtCard
                        city={item.city}
                        art={art}
                        eventCount={item.eventCount}
                        active={active}
                        here={here}
                        onPress={() => chooseCity(item.city)}
                      />
                    )
                  }
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                        <Text style={[styles.cityPickerCity, active && styles.cityPickerTextActive]}>{item.city}</Text>
                        {here ? (
                          <Ionicons name="navigate" size={ICON.sm} color={active ? EMBER.bg : EMBER.textSecondary} />
                        ) : null}
                      </View>
                      <Text style={[styles.cityPickerCount, active && styles.cityPickerTextActive]}>{item.eventCount}</Text>
                    </TouchableOpacity>
                  )
                }}
              />
            )}
          </RisingSheet>
        </View>
      </SheetModal>

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
 * `TYPE` role; the sizes are the scale's, not the call site's.
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
  /** A vertical column of cards inside a section — Nearby. */
  pulseStack: {
    gap: STACK_GAP,
  },
  /** Upcoming: days a section's gap apart, rows within a day close together. */
  dayGroups: { gap: SPACE.xl },
  dayGroup: { gap: SPACE.md },
  /** The coach mark, above the card it names: its caret's tip just clear of the card's edge. */
  coachMark: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: SPACE.sm },
  /** A row in the list under the sections: the Upcoming stack's spacing. */
  mainRow: { paddingBottom: SPACE.md },
  /**
   * The loading skeleton's Upcoming row — `UpcomingCard`'s own `card` style
   * (`surfaceSunken`, `EMBER_RADIUS.md`, 16 padding, 16 gap), so the
   * placeholder is the same box the real card fades into rather than a
   * differently-shaped one it has to replace.
   */
  upcomingSkeletonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
    padding: SPACE.lg,
    gap: SPACE.lg,
  },
  /** The search/filter skeleton: rows spaced like `mainRow`. */
  narrowedSkeleton: { marginTop: SPACE.xl, gap: SPACE.md },
  /** "{City} / Tuesday", under a section heading. */
  sectionSubTitle: {
    ...TYPE.meta,
  },
  /**
   * Skeletons only. The real headings are `SectionHeader`, which carries its
   * own row; this exists so a loading placeholder lines up with the heading it
   * stands in for rather than drifting a few points off it.
   */
  sectionHeaderRow: {
    marginBottom: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* ---- Nearby, when there is no location -------------------------------- */

  nearbyCta: {
    marginTop: SPACE.md,
    minHeight: CONTROL.md,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: EMBER.surface,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
  },
  nearbyCtaText: {
    ...TYPE.button,
    // Neutral: the screen's one accent is the title (docs/DESIGN_SYSTEM.md).
    color: EMBER.textPrimary,
  },

  /* ---- The rows with behaviour and no frame ----------------------------- */
  /*
   * The offline banner, the switch-city offer, the away notice, and the
   * location and network errors. One shape, flat fills: info sits on
   * `surface` with a `separator` hairline, warnings and errors on a faint
   * tint of `warning` / `destructive` with a stronger tint for the border.
   * The copy stays `textPrimary` so it reads on every fill.
   */

  filtersBar: {
    paddingBottom: SPACE.sm,
    gap: SPACE.sm,
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: tint(EMBER.warning, 0.16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tint(EMBER.warning, 0.4),
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: tint(EMBER.destructive, 0.16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tint(EMBER.destructive, 0.4),
  },
  /*
   * Neutral, not a warning.
   *
   * The other banners carry a border and an action because something is
   * wrong and an action is owed. This one is a statement of fact — you are
   * somewhere we do not serve yet — and dressing it as an alert would make an
   * ordinary situation read as a fault.
   */
  bannerNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  bannerNeutralText: {
    ...TYPE.meta,
    flex: 1,
  },
  bannerText: {
    ...TYPE.body,
    flex: 1,
    marginRight: SPACE.md,
  },
  bannerCta: {
    minHeight: CONTROL.md,
    justifyContent: 'center',
    backgroundColor: EMBER.surface,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.pill,
  },
  /*
   * On an info banner, which is itself `surface`: a `surface` button there was
   * the banner's own colour and read as plain text. One step down instead —
   * warnings and errors keep `surface`, which stands clear of their tints.
   */
  bannerCtaOnInfo: {
    backgroundColor: EMBER.surfaceSunken,
  },
  bannerCtaText: {
    ...TYPE.button,
    color: EMBER.textPrimary,
  },

  /* ---- Empty states ----------------------------------------------------- */
  /*
   * Three of them, and the copy is the design — "Coming soon to {city}",
   * "Nothing on in {city}" and "No matches" are three different situations that
   * one empty state used to conflate. See the render site.
   */

  emptyState: {
    paddingHorizontal: SPACE.xxl,
    paddingVertical: SPACE.xxl,
    alignItems: 'center',
  },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 1,
    borderColor: EMBER.separator,
    marginBottom: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...TYPE.title,
    marginBottom: SPACE.sm,
  },
  emptySub: {
    ...TYPE.body,
    color: EMBER.textSecondary,
    textAlign: 'center',
  },
  ctaGhost: {
    marginTop: SPACE.md,
    minHeight: CONTROL.md,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tint(EMBER.textPrimary, 0.3),
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  ctaGhostText: {
    ...TYPE.button,
  },
  // The error state's single action is its primary one (docs/DESIGN_SYSTEM.md).
  ctaPrimary: {
    marginTop: SPACE.lg,
    minHeight: CONTROL.md,
    justifyContent: 'center',
    backgroundColor: EMBER.accent,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.xl,
  },
  ctaPrimaryText: {
    ...TYPE.button,
    color: EMBER.onGradient,
  },

  /* ---- The city picker -------------------------------------------------- */
  /*
   * A placeholder sheet, like the interest picker before it — see
   * `docs/PLACEHOLDER_SCREENS.md`. The server's list is the whole contract:
   * every entry opens with the number of events it claims.
   */

  // No fill: `SheetModal` draws the dim and fades it on its own.
  cityPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // The app's sheet: `surfaceSunken`, with `surface` rows on it (the filter
  // and notification sheets are the same).
  cityPickerSheet: {
    backgroundColor: EMBER.surfaceSunken,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
    paddingHorizontal: GUTTER,
    // The grabber's own top inset, as the filter sheet's.
    paddingTop: SPACE.md,
    paddingBottom: SPACE.xxl,
    maxHeight: '70%',
  },
  cityPickerGrabber: { marginBottom: SPACE.lg },
  cityPickerTitle: {
    ...TYPE.heading,
    marginBottom: SPACE.lg,
  },
  cityPickerEmpty: {
    ...TYPE.body,
    color: EMBER.textSecondary,
    paddingVertical: SPACE.md,
  },
  cityPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    marginBottom: SPACE.sm,
    backgroundColor: EMBER.surface,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tint(EMBER.textPrimary, 0.18),
    borderStyle: 'dashed',
    marginBottom: SPACE.lg,
  },
  // A selected option: `textPrimary` fill, `bg` text (docs/DESIGN_SYSTEM.md).
  cityPickerRowActive: {
    backgroundColor: EMBER.textPrimary,
  },
  cityPickerTextActive: { color: EMBER.bg },
  cityPickerCity: {
    ...TYPE.bodyStrong,
  },
  cityPickerCount: {
    ...TYPE.meta,
  },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Events() {
  return (
    <ScreenProfiler id="pulse">
      <HomeShell renderEvents={renderPulse} />
    </ScreenProfiler>
  )
}

/**
 * The Pulse, as the home drawer's Events pane. Module-level, so only `visible`
 * (its pane showing, the drawer past peek) and `full` (the drawer all the way
 * up, for the coach mark) re-render it: a settle, never a drag.
 */
const renderPulse = (onBrowse: (browse: HomeBrowse) => void, visible: boolean, full: boolean) => (
  <EventsInner onBrowse={onBrowse} visible={visible} full={full} />
)
