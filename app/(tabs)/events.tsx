import { ScreenProfiler } from '../../lib/perf'
import * as Location from 'expo-location'
import { router, useScrollToTop } from 'expo-router'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Dimensions,
  AppState,
  Keyboard,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FadeInUp from '../../components/motion/FadeInUp'
import { preloadImages } from '../../components/OptimizedImage'
import { featuredCardLayout } from '../../components/pulse/FeaturedCard'
import {
  EverythingHeader,
  PulseSkeleton,
  SectionStack,
} from '../../components/pulse/PulseSections'
import { SectionReveal } from '../../components/pulse/Rail'
import { EventCard } from '../../components/ds/EventCard'
import { MoreRow } from '../../components/pulse/MoreRow'
import { DayHeading } from '../../components/ds/DayHeading'
import { CONTROL_FONT_CAP } from '../../components/ds/shared'
import { PULSE_HEADER_HEIGHT, PulseSearch } from '../../components/pulse/PulseHeader'
import { PulseBanners } from '../../components/pulse/PulseBanners'
import { CityPicker } from '../../components/pulse/CityPicker'
import { PulseEmpty, PulseLoadFailed } from '../../components/pulse/PulseEmpty'
import { PulsePeek, type Peek } from '../../components/pulse/PulsePeek'
import { PullIndicator } from '../../components/pulse/PullIndicator'
import { StickyBar, STICKY_BAR_AFTER } from '../../components/pulse/StickyBar'
import { TAB_BAR_CLEARANCE, tabBarTop } from './_layout'
import { FilterSheet, type CategoryOption } from '../../components/pulse/FilterControl'
import { HomeShell, type HomeBrowse } from '../../components/home/HomeShell'
import { DRAWER_HEADER_HEIGHT } from '../../lib/home'
import { useReducedMotion } from '../../lib/motion'
import { searchTermOf } from '../../lib/searchTerm'
import { showSheet } from '../../lib/sheet'
import { useToast } from '../../components/Toast'
import { Skeleton } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import { rateLimitWaitOf } from '../../lib/rateLimited'
import { RateLimitedBanner } from '../../components/system/RateLimitedBanner'
import { getEvents as fetchEventsApi, type BlendnEvent } from '../../lib/api'
import {
  activeFilterCount,
  appliedFilters,
  filtersToQuery,
  hasActiveFilters,
  NO_FILTERS,
  withoutFilter,
  type EventFilters,
} from '../../lib/eventFilters'
import { useLatest } from '../../lib/useLatest'
import {
  awayNotice,
  cityOnResume,
  isBrowsingHere,
  isServedCity,
  resolveBrowseCity,
  shouldOfferSwitch,
  type CityOption,
  type StoredCity,
} from '../../lib/city'
import { readStoredCity, storeCity } from '../../lib/cityStorage'
import { getDistanceMetres, roundCoord } from '../../lib/geo'
import { EVENT_DETAIL_QUERY } from '../../lib/eventDetailQuery'
import { FIX_MAX_AGE_MS, fixOf, type PreciseFix } from '../../lib/roomButton'
import { homeCardProps, groupByDay } from '../../lib/pulse'
import { liveWindow, sessionOver } from '../../lib/eventSession'
import {
  categoryChips,
  everythingElse,
  pulsePeekLine,
  pulseSections,
  seedDateOf,
  weekendWindow,
  type PulseSectionKey,
} from '../../lib/pulseSections'
import { useNow } from '../../lib/useNow'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE, STAGGER, TYPE as DESIGN_TYPE } from '../../lib/design/tokens'
import { mergeEventPage, pageHasMore, pulseEmptyCopy, pulseEmptyKind } from '../../lib/pulseFeed'
import { type PeekAction } from '../../lib/pulsePeek'
import { putSceneSeed } from '../../lib/sceneSeed'
import { shareEvent } from '../../lib/shareRow'
import { PulseArrival } from '../../components/share/PulseArrival'
import { checkOutOf } from '../../lib/checkIn'
import { openBlendn } from '../../lib/blendnOverlay'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { usePresence } from '../../lib/usePresence'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { useLiveSync } from '../../lib/useLiveSync'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { useAuth } from '../../lib/useAuth'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { useCoachMarkSpot } from '../../components/ds/CoachMarkHost'
import { eventClock } from '../../lib/time'

/*
 * One shared definition, in `lib/api.ts`, derived from the API mapping itself.
 *
 * This was a hand-written interface duplicated across three files that pass
 * events to each other. TypeScript compared them structurally, so they drifted
 * silently until a correction in one broke a call site in another.
 */
type Event = BlendnEvent

/** A row under the sections: a day heading, or an event. */
type PulseRow =
  | { kind: 'search'; key: 'search' }
  | { kind: 'body'; key: 'body' }
  | { kind: 'day'; key: string; title: string; weekday: string }
  | { kind: 'event'; key: string; event: Event }

/** The search is data row 0, under the list's title header (index 0): the sticky one is cell 1. */
const STICKY_SEARCH = [1]
/** The two rows before the first day or event, which the stagger does not count. */
const LEAD_ROWS = 2
const LEAD: PulseRow[] = [{ kind: 'search', key: 'search' }, { kind: 'body', key: 'body' }]

/** What the search and body rows draw, from the screen: held in context so a keystroke re-renders those two rows and not the cards. */
const PulseSlots = createContext<{ search: ReactNode; body: ReactNode; scrolled: boolean }>({ search: null, body: null, scrolled: false })
function PulseSlot({ slot }: { slot: 'search' | 'body' }) {
  const { search, body, scrolled } = useContext(PulseSlots)
  if (slot === 'body') return <>{body}</>
  return (
    <StickyBar scrolled={scrolled}>{search}</StickyBar>
  )
}

/**
 * The page's rhythm, from the design system (`docs/DESIGN_SYSTEM.md`).
 *
 * One side margin for everything; 32 between sections, 16 from a heading to
 * its content, 24 between stacked cards. The top bar's clearance is added at
 * the render site with the safe-area insets.
 */
const SCREEN_HEIGHT = Dimensions.get('window').height
const MAIN_PADDING_BOTTOM = 128

/**
 * The Pulse's coach mark: the long-press on a card, which nothing on screen
 * says exists (docs/NAVIGATION.md, "Coach marks"). Its id is the key the old
 * "Got it" banner stored, so whoever dismissed that is not taught again.
 */
const PULSE_COACH = 'events_preview_hint'
const PULSE_COACH_TEXT = 'Hold an event to save, share or preview it.'

/**
 * Room between the first card and the tip: the next section's margin and its heading line, so the tip sits under that
 * heading, never over it. Over it, the heading was hidden and its "See all" floated beside the bubble (rc7 D15).
 */
export const coachClearsNextHeader = (fontScale: number) =>
  SPACE.xxl + Math.round(DESIGN_TYPE.heading.lineHeight * Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE.heading))

/** The hole's corner radius: the card the mark names (a hero, a compact card, or a row). */
const coachRadius = (section: PulseSectionKey | null) =>
  section === 'featured' ? RADIUS.card : section === 'now' || section === 'forYou' || section === 'weekend' ? RADIUS.mediaInCard : RADIUS.rowInCard

/** Started (today's session, `lib/eventSession.ts`) and not over: the card says who is here. */
const onNow = (event: Event) => Date.parse(liveWindow(event).start_time) <= Date.now() && !sessionOver(event)

/** DS #16: the first load rises `RISE.list` on `DURATION.base`, a `STAGGER.base` apart, capped at `STAGGER.windowMax`. */
const SECTION_MOTION_BASE_DELAY = 0
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
    <FadeInUp delay={Math.min(SECTION_MOTION_BASE_DELAY + STAGGER.base * (4 + index), STAGGER.windowMax)}>{children}</FadeInUp>
  )
}

/** One `EventCard row`-shaped placeholder: the 56 pt thumb and two lines, static (DS #17). */
function MoreSkeletonRow() {
  return (
    <View style={styles.moreSkeleton}>
      <Skeleton width={SKELETON_THUMB} height={SKELETON_THUMB} borderRadius={RADIUS.thumb} />
      <View style={styles.fill}>
        <Skeleton width="70%" height={SKELETON_LINE} borderRadius={RADIUS.capsule} />
        <Skeleton width="45%" height={SKELETON_LINE} borderRadius={RADIUS.capsule} />
      </View>
    </View>
  )
}
const SKELETON_THUMB = 56
const SKELETON_LINE = 12

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
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  // The hero card sits under the home drawer's header too (components/home/HomeDrawer.tsx).
  const cardInsets = useMemo(() => ({ top: insets.top + DRAWER_HEADER_HEIGHT, bottom: insets.bottom }), [insets.top, insets.bottom])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Pull-to-refresh count: a failed Upcoming thumb tries its cover again (SCRUM-480).
  const [pulls, setPulls] = useState(0)
  const [userLocation, setUserLocation] = useState<PreciseFix | null>(null)
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
  // Narrower than `cityResolved`: the feed may fire once the city is *known* (a stored one is, from disk), without waiting for the city list.
  const [feedCityReady, setFeedCityReady] = useState(false)
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
  const [netError, setNetError] = useState<string | null>(null)
  /** Seconds the server asked us to wait, when it refused a read for asking too fast (Flow 15 #15). */
  const [rateLimit, setRateLimit] = useState<{ seconds: number; onMore: boolean } | null>(null)
  /**
   * When the server's wait is over (ms), kept apart from the banner's count: the sync timers, a pull and a scroll to the end all
   * read this list, and none of them may ask again before it, whatever they are. Only the banner's end reads again.
   */
  const rateLimitUntilRef = useRef(0)
  const withinWait = useCallback(() => Date.now() < rateLimitUntilRef.current, [])
  const refuse = useCallback((seconds: number, onMore: boolean) => {
    rateLimitUntilRef.current = Date.now() + seconds * 1000
    setRateLimit({ seconds, onMore })
  }, [])
  /**
   * The list at its top, so the first card is on screen when the coach mark
   * starts. Once it is up it rides with the card, so it stops listening.
   */
  const [listAtTop, setListAtTop] = useState(true)
  const listOffsetRef = useRef(0)
  /** The first card the page draws: the coach mark's hole. */
  const coachTarget = useRef<View>(null)
  const coachShowingRef = useRef(false)
  /** The list has scrolled past its title: the sticky search takes its bar. */
  const [searchBarOn, setSearchBarOn] = useState(false)
  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    listOffsetRef.current = e.nativeEvent.contentOffset.y
    setSearchBarOn(e.nativeEvent.contentOffset.y > STICKY_BAR_AFTER)
    if (!coachShowingRef.current) setListAtTop(e.nativeEvent.contentOffset.y < PULSE_HEADER_HEIGHT)
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
    // to get back to where they started reads as the app being slow. One
    // letter is the same: the server refuses a search under 2 characters
    // (admin #751), so the list is the normal one until there are two.
    if (searchTermOf(next) === null) setSearchTerm('')
  }, [])

  useEffect(() => {
    const term = searchTermOf(searchInput)
    // Clearing has already happened, with no wait, in `changeSearchInput`.
    if (term === null) return
    const id = setTimeout(() => setSearchTerm(term), 350)
    return () => clearTimeout(id)
  }, [searchInput])

  const { showToast } = useToast()
  /** The long-press peek: which card lifts, where it is, and what kind of card it is. */
  const [peek, setPeek] = useState<Peek | null>(null)
  // Location permission status: 'checking' | 'granted' | 'denied' | 'undetermined'
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied' | 'undetermined'>('checking')
  const locationRequestInFlight = useRef(false)
  const interestInFlightRef = useRef<Set<string>>(new Set())
  const checkOutInFlightRef = useRef<Set<string>>(new Set())
  const lastFetchLocationRef = useRef<string>('none')
  const initialLoadedRef = useRef(false)

  /**
   * The event page's own read, into the client's cache (fire-and-forget): on a
   * card's press-in (~100 ms before the press), on the press, and for the first
   * featured card once the Pulse settles. Replaces Tonight's per-card detail N+1.
   */
  const warmEvent = useCallback((event: Event) => {
    // The page's own query, byte for byte (lib/eventDetailQuery.ts): a different one warms a key nobody reads.
    apiClient.getEvent(event.id, { ...EVENT_DETAIL_QUERY }).catch(() => {})
  }, [])

  // Memoized callbacks to prevent re-creation
  const handleEventPress = useCallback((event: Event) => {
    // The list lets a card's tap through (`keyboardShouldPersistTaps`), so the card puts the search's keyboard away itself.
    Keyboard.dismiss()
    warmEvent(event)

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

    // The card's words travel in memory, not in the route: a link's query is never a seed (lib/sceneSeed.ts).
    const seed = putSceneSeed({
      eventId: event.id,
      title: event.title,
      cover: event.cover_image_url || '',
      venue: event.venue_name,
      city: event.display_city || event.city || '',
      start: event.start_time,
      end: event.end_time,
      category: event.category || '',
      description: event.description || '',
      interestCount: latestInterestCountsRef.current[event.id] ?? event.favorite_count ?? 0,
    })
    router.push({ pathname: '/event/[id]', params: { id: event.id, seed } as any })
  }, [latestInterestCountsRef, warmEvent])

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
      // A refusal says so in a toast, whose haptic is the one `H.error` (frame 24, 25).
      showToast(
        prevInterested ? "Couldn’t remove this event from Saved. Try again." : "Couldn’t save this event. Try again.",
        'error',
        { haptic: 'error' }
      )
    }
    try {
      if (!user) {
        showSheet({
          kind: 'actions',
          title: 'Sign in required',
          message: 'Sign in to save events and check in.',
          actions: [
            { label: 'Sign in', variant: 'primary', then: () => router.replace('/' as never) },
            { label: 'Not now', cancel: true },
          ],
        })
        return
      }
      interestInFlightRef.current.add(event.id)
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
      // Silent: saving is not an outcome that earns a Success (audit U-M17); a failure plays its error through the toast.
      Logger.journey('events', result.data!.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
    } catch {
      fail()
    } finally {
      interestInFlightRef.current.delete(event.id)
    }
  }, [user, showToast, latestInterestStatusesRef, latestInterestCountsRef])

  const handleCheckOut = useCallback(async (event: Event) => {
    if (checkOutInFlightRef.current.has(event.id)) return
    checkOutInFlightRef.current.add(event.id)
    // The confirm's destructive button just played `H.destructive` (the Button, §10.2). A refusal answers with the toast's
    // `H.error`; a success with the server's own words in a toast (frame 26).

    const previousStatus = latestCheckinStatusesRef.current[event.id]
    const fail = () => {
      setCheckinStatuses(restoreStatus(event.id, previousStatus))
      showToast("Couldn’t check you out. Try again.", 'error', { haptic: 'error' })
    }

    // Optimistic removal from checked-in state
    setCheckinStatuses((prev) => ({ ...prev, [event.id]: { status: 'not_checked_in' } }))

    try {
      const result = await checkOutOf(String(event.id))
      if (result.success) {
        const said = (result.data as { message?: unknown } | undefined)?.message
        showToast(typeof said === 'string' && said ? said : 'You’ve checked out.', 'success')
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
  }, [showToast, latestCheckinStatusesRef, loadCheckedInEvents, loadCheckinStatusesBatch])

  /** A card was held: lift it (its own `H.longPress` has played). The one-off coach mark is answered by the hold. */
  const openPeek = useCallback((event: Event, anchor: Peek['anchor'], kind: Peek['kind']) => {
    markCoachUsed(PULSE_COACH)
    setPeek({ event, anchor, kind })
  }, [])

  /** A row's hold: stable, so the rows can be memoised on their own values. */
  const peekRow = useCallback((event: Event, anchor: Peek['anchor']) => openPeek(event, anchor, 'row'), [openPeek])

  /** What each peek item does, once the menu has left. */
  const onPeekAction = useCallback(
    (action: PeekAction, event: Event) => {
      if (action === 'save' || action === 'unsave') return void toggleInterest(event)
      if (action === 'preview') return handleEventPress(event)
      if (action === 'share') return void shareEvent(event)
      // Into the Blend'n pass: a check-in always goes through the hold (docs/redesign/SCREENS.md, Pulse).
      if (action === 'checkIn') return openBlendn()
      /*
       * Asks first, with the Room's words. Checking out closes the room and coming back needs a fresh location fix, so a
       * stray tap in a menu of five should not be able to do it on its own.
       */
      showSheet({
        kind: 'actions',
        title: `Check out of ${event.title}?`,
        message: 'You’ll leave the room and its people. To come back in you’ll need to check in again, with your location.',
        actions: [
          { label: 'Stay', variant: 'secondary', then: () => {} },
          { label: 'Check out', variant: 'destructive', then: () => void handleCheckOut(event) },
        ],
      })
    },
    [toggleInterest, handleEventPress, handleCheckOut]
  )

  const getCurrentLocationQuietly = useCallback(async () => {
    try {
      // Best-effort permission request with quick timeout; fallback if denied/unavailable
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setUserLocation(null)
        setLocationStatus(status === 'denied' ? 'denied' : 'undetermined')
        Logger.warn('events', 'permission:notGranted', {})
        showSheet({
          kind: 'actions',
          icon: 'map-pin',
          title: 'Location needed',
          message: 'Turn on location so we can check you in.',
          actions: [
            { label: 'Open Settings', variant: 'primary', then: () => void Linking.openSettings().catch(() => {}) },
            { label: 'Cancel', cancel: true },
          ],
        })
        return
      }
      setLocationStatus('granted')
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = fixOf(position)
      setUserLocation(coords)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      // Keep status as granted if permission was granted but position fetch failed
      Logger.warn('events', 'quietLocation:error', { error: error as any })
    }
  }, [])

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

  // Check location permission status on mount (without requesting)
  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          // Permission already granted - mark as granted immediately (before fetching coords)
          setLocationStatus('granted')
          try {
            const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS })
            if (lastKnown?.coords) {
              setUserLocation(fixOf(lastKnown))
            }
          } catch {}
          // Defer live GPS to avoid blocking startup render
          setTimeout(async () => {
            try {
              const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              setUserLocation(fixOf(position))
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
  // The page the sections are drawn from: Happening now, Featured, Tonight and Nearby all read it (BUILD-SPEC request A).
  const PAGE_SIZE = 50
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
  const fetchEvents = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (withinWait()) return
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
      // Rounded, so the last-known fix and the live one are one cache key (and one request).
      const lat = roundCoord(userLocation?.latitude)
      const lon = roundCoord(userLocation?.longitude)
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
        // Asked too fast: the banner says the wait and reads again, and the page is not "couldn't load" (Flow 15 #15).
        const wait = rateLimitWaitOf(error)
        if (wait !== null) {
          refuse(wait, false)
          return
        }
        setNetError("Couldn’t load events.")
        return
      }
      setRateLimit(null)

      const normalized = (eventsData || []).map(normalizeEvent)
      setEvents(normalized)
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
      setNetError("Couldn’t load events.")
    } finally {
      if (!options?.silent || !initialLoadedRef.current) {
        setLoading(false)
      }
    }
  }, [userLocation, selectedCity, searchTerm, filters, withinWait, refuse])

  /** The filter sheet's "Show n events": the server's own count for the draft, in the scope of the list (city, search). */
  const countEventsFor = useCallback(
    async (draft: EventFilters) => {
      const r = await apiClient.getEvents({
        page: 1,
        limit: 1,
        city: selectedCity ?? undefined,
        lat: roundCoord(userLocation?.latitude),
        lon: roundCoord(userLocation?.longitude),
        search: searchTerm || undefined,
        ...filtersToQuery(draft),
      })
      return r.success && r.data?.pagination ? r.data.pagination.totalCount : null
    },
    [userLocation, selectedCity, searchTerm]
  )

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

  const pull = usePullToRefresh({ refreshing, onRefresh })

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
    // Not before the city is known: an unscoped /events fired first, then again scoped (a second skeleton).
    if (!authLoading && user && feedCityReady) {
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
  }, [user, authLoading, feedCityReady, selectedCity, searchTerm, filters])

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
      // From disk, and first: a stored city scopes the feed at once instead of after the cities request.
      const stored = await readStoredCity()
      if (cancelled) return
      if (stored) {
        setSelection((current) => current ?? stored)
        setFeedCityReady(true)
      }
      // A rejection (a permission prompt makes the app 'inactive', which clears the queue) is
      // a failed list, not a stop: the feed must still start (`feedCityReady` below).
      const response = await apiClient.getEventCities().catch(() => ({ success: false as const }))
      if (cancelled) return

      const available = response.success && 'data' in response && response.data ? response.data.cities : []
      setCityOptions(available)
      setSelection((current) =>
        // Never overwrite a choice the user made while this was in flight.
        current ?? resolveBrowseCity({ stored, deviceCity: null, available })
      )
      setCityResolved(true)
      setFeedCityReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // A guess is kept, as a guess (`cityOnResume` treats 'inferred' as replaceable): the next launch starts scoped.
  useEffect(() => {
    if (selection?.source === 'inferred') void storeCity(selection.city, 'inferred')
  }, [selection])

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
        Logger.warn('events', "Couldn’t resolve the device city", { error: error as any })
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
      Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS })
        .then((position) => {
          if (!position) return
          // The state keeps its identity for a nearby fix (a new one would refetch the feed).
          setUserLocation((current) =>
            current &&
            Math.abs(current.latitude - position.coords.latitude) < 0.01 &&
            Math.abs(current.longitude - position.coords.longitude) < 0.01
              ? current
              : fixOf(position)
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
    const key = `${roundCoord(userLocation.latitude)},${roundCoord(userLocation.longitude)}`
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
    if (loading || !hasMore || fetchMoreInFlightRef.current || withinWait()) return
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
        lat: roundCoord(userLocation?.latitude),
        lon: roundCoord(userLocation?.longitude),
        include: 'checkins',
        search: searchTerm || undefined,
        ...filtersToQuery(filters),
      })
      // The list was replaced while this was in flight; this page is not its.
      if (generation !== feedGenerationRef.current) return
      if (error) {
        // A refused page says so near the bottom, where the reader is, and waits; the page is kept (it was not counted), so the
        // end of the wait asks for this very page. No other failure here is loud (the next scroll asks again).
        const wait = rateLimitWaitOf(error)
        if (wait !== null) refuse(wait, true)
        return
      }
      const received = data ?? []
      setHasMore(pageHasMore(received.length, PAGE_SIZE))
      if (received.length === 0) return
      setEvents(prev => mergeEventPage(prev, received.map(normalizeEvent)))
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
  }, [loading, hasMore, page, userLocation, selectedCity, searchTerm, filters, withinWait, refuse])

  // Cleared once the first content has committed; see `RevealRow` and `SectionReveal`.
  const mainRowsRevealPending = useRef(true)

  /*
   * The minute clock the sections are judged by: what is live, what is later
   * tonight, the NOW tick. A render never reads the clock itself.
   */
  const now = useNow(60_000)
  const seedDate = seedDateOf(now)
  /** Distances mean something only in the city you are in, with a fix. */
  const hasFix = !!userLocation && browsingHere

  /*
   * Requests B, C and D (BUILD-SPEC §A, C1): "This weekend", "Because you like" and the featured five, in
   * parallel with the page. Each draws when its own request resolves; a failure
   * hides its section and is never an error state for the pane. Held with the
   * key they were asked for, so another city's answer is never drawn under this
   * one's header.
   */
  const lat3 = userLocation ? userLocation.latitude.toFixed(3) : '-'
  const lon3 = userLocation ? userLocation.longitude.toFixed(3) : '-'
  const sectionsKey = `${selectedCity ?? '-'}|${lat3},${lon3}|${seedDate}|${pulls}`
  const [weekendState, setWeekendState] = useState<{ key: string; events: Event[] | null } | null>(null)
  const [featuredState, setFeaturedState] = useState<{ key: string; events: Event[] | null } | null>(null)
  const [forYouState, setForYouState] = useState<{ key: string; value: { interest: { name: string; slug: string }; events: Event[] } | null } | null>(null)
  const sectionRequestsOn = !!user && !authLoading && feedCityReady && !isNarrowed
  useEffect(() => {
    if (!sectionRequestsOn) return
    let cancelled = false
    const where = { city: selectedCity ?? undefined, lat: roundCoord(userLocation?.latitude), lon: roundCoord(userLocation?.longitude) }
    const window = weekendWindow(Date.now())
    if (!window.skip) {
      fetchEventsApi({ page: 0, limit: 20, ...where, include: 'checkins', startDate: window.startDate, endDate: window.endDate })
        .then(({ data, error }) => {
          if (cancelled) return
          if (error || !data) Logger.warn('events', 'This weekend did not load', { error: error?.message })
          setWeekendState({ key: sectionsKey, events: error || !data ? null : data.map(normalizeEvent) })
        })
        .catch((error) => Logger.warn('events', 'This weekend threw', { error: String(error) }))
    }
    // Request D: the city's featured events, in the server's rank order, whatever page they would be on.
    fetchEventsApi({ page: 0, limit: 5, ...where, include: 'checkins', featured: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) Logger.warn('events', 'Featured did not load', { error: error?.message })
        setFeaturedState({ key: sectionsKey, events: error || !data ? null : data.map(normalizeEvent) })
      })
      .catch((error) => Logger.warn('events', 'Featured threw', { error: String(error) }))
    void (async () => {
      try {
        const interests = await apiClient.getProfileInterests(user.id)
        const first = interests.success ? interests.data?.interests?.[0] : undefined
        if (cancelled) return
        if (!first) return setForYouState({ key: sectionsKey, value: null })
        const { data, error } = await fetchEventsApi({ page: 0, limit: 12, ...where, include: 'checkins', categorySlug: first.slug })
        if (cancelled) return
        if (error || !data) Logger.warn('events', 'Because you like did not load', { error: error?.message })
        setForYouState({ key: sectionsKey, value: error || !data ? null : { interest: { name: first.name, slug: first.slug }, events: data.map(normalizeEvent) } })
      } catch (error) {
        Logger.warn('events', 'Because you like threw', { error: String(error) })
      }
    })()
    return () => {
      cancelled = true
    }
    // The location only moves the key (to ~100 m); the request reads the live fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionRequestsOn, sectionsKey, user?.id])
  const weekend = weekendState?.key === sectionsKey ? weekendState.events : null
  const featuredRequested = featuredState?.key === sectionsKey ? featuredState.events : null
  const forYou = forYouState?.key === sectionsKey ? forYouState.value : null

  /** The sections, in order, each claiming its events once (`lib/pulseSections.ts`). Search and filters make the pane a flat list. */
  const sections = useMemo(
    () => (isNarrowed ? [] : pulseSections<Event>({ page: events, weekend, featured: featuredRequested, forYou, now, hasFix, seedDate })),
    [isNarrowed, events, weekend, featuredRequested, forYou, now, hasFix, seedDate]
  )
  const sectionOf = (key: PulseSectionKey) => sections.find((x) => x.key === key)

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
        openCityPicker: () => setCityPickerOpen(true),
        peekLine: isNarrowed ? null : pulsePeekLine(sections),
      }),
    [onBrowse, selectedCity, userLocation, cityResolved, cityOptions, cityPick, requestLocationIfNeeded, isNarrowed, sections]
  )

  const firstSection = sections[0]?.key ?? null

  /*
   * Everything else: what no section drew, day by day (`DayHeading`), narrowed by
   * the chip. Under a search or a filter it is the whole result, flat.
   */
  const [category, setCategory] = useState<string | null>(null)
  const rest = useMemo(() => (isNarrowed ? events : everythingElse(events, sections)), [isNarrowed, events, sections])
  const chips = useMemo(() => categoryChips(rest, categoryOptions), [rest, categoryOptions])
  // A chip whose events are gone (a refresh) is no longer a filter.
  const chosen = category && chips.some((c) => c.slug === category) ? category : null
  const rows = useMemo<PulseRow[]>(() => {
    if (isNarrowed) return events.map((event) => ({ kind: 'event' as const, key: event.id, event }))
    const shown = (chosen ? rest.filter((e) => e.category_group === chosen) : rest)
      .slice()
      .sort((a, b) => Date.parse(liveWindow(a).start_time) - Date.parse(liveWindow(b).start_time))
    return groupByDay(shown, new Date(now)).flatMap((group) => [
      { kind: 'day' as const, key: `day-${group.key}`, title: group.title, weekday: group.weekday },
      ...group.items.map((event) => ({ kind: 'event' as const, key: event.id, event })),
    ])
  }, [isNarrowed, events, rest, chosen, now])

  /*
   * The first card the page draws, the coach mark's hole: the first section's
   * first event, or, with no section today, the first row under them.
   */
  const firstRowId = rows.find((r) => r.kind === 'event')?.key ?? null
  const firstCardId = isNarrowed ? null : (sections[0]?.events[0]?.id ?? firstRowId)

  const cardHandlers = useMemo(
    () => ({ onPress: handleEventPress, onPressIn: warmEvent, onLongPress: openPeek }),
    [handleEventPress, warmEvent, openPeek]
  )

  /*
   * A row under the sections: a day heading, or an event. Everything else draws the DS `EventCard row`, grouped by day so
   * a row only needs its clock, with "Checked in" or "Ended" as a pill beside it (R4.1 3-8); a search or a filter draws
   * the result as the same rows, where a promoted result is not lifted or labelled differently.
   */
  const renderRow = useCallback(({ item, index }: { item: PulseRow; index: number }) => {
    if (item.kind === 'search' || item.kind === 'body') return <PulseSlot slot={item.kind} />
    if (item.kind === 'day') {
      return (
        <View style={styles.dayRow}>
          <DayHeading date={item.title} weekday={item.weekday} />
        </View>
      )
    }
    const event = item.event
    if (isNarrowed) {
      const card = homeCardProps(event, now, hasFix)
      return (
        <View style={styles.mainRow}>
          <EventCard
            kind="row"
            title={card.title}
            time={card.time}
            venue={card.venue}
            distance={card.distance}
            cover={card.cover}
            onPress={() => handleEventPress(event)}
            onPressIn={() => warmEvent(event)}
            onLongPress={(anchor) => openPeek(event, anchor, 'row')}
            testID={`pulse-result-${event.id}`}
          />
        </View>
      )
    }
    const isCheckedIn = checkinStatuses[event.id]?.status === 'checked_in'
    const live = liveWindow(event)
    const note = isCheckedIn ? 'Checked in' : sessionOver(event) ? 'Ended' : null
    const card = homeCardProps(event, now, hasFix)
    return (
      <RevealRow index={Math.max(0, index - LEAD_ROWS)} pending={mainRowsRevealPending}>
        <MoreRow
          event={event}
          title={card.title}
          // Under its day's heading a row needs only its clock; a running event says so.
          time={onNow(event) ? 'Live' : eventClock(Date.parse(live.start_time), event.timezone)}
          venue={card.venue}
          distance={card.distance}
          cover={card.cover}
          note={note}
          saved={!!interestStatuses[event.id]}
          coachRef={sections.length === 0 && event.id === firstRowId ? coachTarget : undefined}
          onPress={handleEventPress}
          onPressIn={warmEvent}
          onPeek={peekRow}
          onSave={toggleInterest}
        />
      </RevealRow>
    )
  }, [isNarrowed, sections.length, firstRowId, now, hasFix, checkinStatuses, interestStatuses, handleEventPress, openPeek, peekRow, warmEvent, toggleInterest])
  const keyExtractor = useCallback((item: PulseRow) => item.key, [])

  const askForLocation = useCallback(() => {
    if (locationStatus === 'denied') {
      try {
        ;(Linking as any)?.openSettings?.()
      } catch {}
    } else {
      requestLocationIfNeeded()
    }
  }, [locationStatus, requestLocationIfNeeded])

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 720)
  // The first featured card, warm once the Pulse has settled: the likeliest tap.
  const firstFeatured = showLoadingSkeleton ? undefined : sectionOf('featured')?.events[0]
  useEffect(() => {
    if (firstFeatured) warmEvent(firstFeatured)
    // Once per card, not per location fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstFeatured?.id])

  /*
   * The coach mark, under the first card the page draws (the first section's
   * first card, whichever section that is today), caret up: above it, two lines at
   * 360 dp covered the search bar (R4.1). Ready only with the drawer all the
   * way up and the list at its top -- at half the first card sits under the
   * tab bar -- and with none of this screen's sheets open. The bell's sheet is
   * the shell's and is not counted; it covers the page while it is up anyway.
   */
  const { fontScale } = useWindowDimensions()
  const coach = useCoachMark(PULSE_COACH, {
    ready:
      full &&
      listAtTop &&
      !showLoadingSkeleton &&
      !isNarrowed &&
      firstCardId !== null &&
      !peek &&
      !filterSheetOpen &&
      !cityPickerOpen,
  })
  useEffect(() => {
    coachShowingRef.current = coach.visible
  }, [coach.visible])
  /*
   * Drawn by the root's CoachMarkHost, over everything, with the first card as
   * the hole. Below the featured card it would sit on the tab bar (that card is
   * sized to reach it), so the list scrolls the card up by the overlap first.
   */
  useCoachMarkSpot(coach.visible, {
    target: coachTarget,
    text: PULSE_COACH_TEXT,
    place: 'below',
    gap: coachClearsNextHeader(fontScale),
    radius: coachRadius(firstSection),
    onDismiss: coach.dismiss,
    onLost: coach.lose,
    bottomLimit: tabBarTop(SCREEN_HEIGHT, insets.bottom),
    onOverflow: (px) => listRef.current?.scrollToOffset({ offset: listOffsetRef.current + px, animated: !reduceMotion }),
    testID: 'pulse-coach-mark',
  })
  useEffect(() => {
    if (!showLoadingSkeleton && (rows.length > 0 || sections.length > 0)) mainRowsRevealPending.current = false
  }, [showLoadingSkeleton, rows.length, sections.length])

  // The wait is over: the one place a refused read is asked again, for the page it was refused on.
  const rateLimitDone = () => {
    const onMore = rateLimit?.onMore === true
    rateLimitUntilRef.current = 0
    setRateLimit(null)
    void (onMore ? fetchMore() : fetchEvents({ force: true }))
  }

  // The banners ride in the feed's header, so they clear the bar with everything else and there is one scroll surface.
  const banners = (
    <PulseBanners
      socketStatus={socketStatus}
      switchTo={switchSuggestion}
      onSwitch={(city) => chooseCity(city, true)}
      away={away}
      // Not while the Nearby section is showing its own "Open Settings" prompt (unnarrowed, no location): one ask, not two.
      locationDenied={locationStatus === 'denied' && (isNarrowed || !!userLocation)}
      onOpenSettings={() => void Linking.openSettings().catch(() => {})}
      // Only over a list that is still on screen: with nothing loaded the whole page is the error (`PulseLoadFailed`).
      refreshFailed={!!netError && events.length > 0}
      rateLimit={rateLimit && !rateLimit.onMore ? rateLimit.seconds : null}
      onRateLimitDone={rateLimitDone}
      onRetry={() => fetchEvents({ force: true })}
      onLayout={setBannersHeight}
    />
  )

  const applied = useMemo(
    () =>
      appliedFilters(filters, categoryOptions).map((a) => ({
        key: a.field,
        label: a.label,
        onRemove: () => {
          const next = withoutFilter(filters, a.field)
          setFilters(next)
          setFilterDraft(next)
        },
      })),
    [filters, categoryOptions]
  )
  const searchNode = (
    <PulseSearch
      query={searchInput}
      onChangeQuery={changeSearchInput}
      searching={refining}
      activeFilterCount={activeFilterCount(filters)}
      applied={applied}
      onPressFilter={() => {
        setFilterDraft(filters)
        setFilterSheetOpen(true)
      }}
    />
  )

  const emptyKind = pulseEmptyKind({
    searching: isSearching,
    filtered: hasActiveFilters(filters),
    city: selectedCity,
    notLiveHere,
  })
  const emptyCopy = pulseEmptyCopy(emptyKind, { city: selectedCity, term: searchTerm })

  /*
   * Under the search, as a row of the list: the loading skeleton, the empty and failed states, the results
   * count, the sections and the "Everything else" header. The search above it is a row of its own, sticky and
   * always in the list, so it outlives the thing it is searching (typing triggers a load, and a field that
   * unmounted with the loaded branch lost its focus and its text).
   */
  const bodyNode = showLoadingSkeleton ? (
    <View>
      {/*
        Shaped like the screen it stands in for, and static: a header bar and two compact cards, a header bar and two hero
        cards (`PulseSkeleton`); a search or filter loading for the first time shows the rows it will return instead, so
        the swap is not itself a layout jump.
      */}
      {isNarrowed ? (
        <View style={styles.narrowedSkeleton}>
          {[...Array(4)].map((_, i) => (
            <MoreSkeletonRow key={`s-flat-${i}`} />
          ))}
        </View>
      ) : (
        <PulseSkeleton />
      )}
      <View style={styles.spacer} />
    </View>
  ) : (
    <View>
      {events.length === 0 && !!netError && rateLimit === null ? (
        <FadeInUp delay={SECTION_MOTION_BASE_DELAY}>
          <PulseLoadFailed onRetry={() => fetchEvents({ force: true })} />
        </FadeInUp>
      ) : null}
      {/* A refused read is the banner above, and neither "couldn’t load" nor "nothing here". */}
      {events.length === 0 && !netError && rateLimit === null ? (
        <FadeInUp delay={SECTION_MOTION_BASE_DELAY}>
          <PulseEmpty
            kind={emptyKind}
            copy={emptyCopy}
            city={selectedCity}
            canChangeCity={cityOptions.length > 0}
            onClearSearch={() => changeSearchInput('')}
            onClearFilters={() => {
              setFilters(NO_FILTERS)
              setFilterDraft(NO_FILTERS)
            }}
            onChangeCity={() => setCityPickerOpen(true)}
            onRefresh={() => fetchEvents({ force: true })}
          />
        </FadeInUp>
      ) : null}
      {/*
        Under a search, none of the sections render: somebody who has typed a venue's name knows what they want. The pane
        is the result, flat, under its count.
      */}
      {isNarrowed && events.length > 0 ? (
        <View style={styles.resultsLabel}>
          <Text style={styles.resultsLabelText} accessibilityRole="header" maxFontSizeMultiplier={CONTROL_FONT_CAP}>
            <Text style={styles.resultsCount}>{events.length}</Text>
            {` ${events.length === 1 ? 'event' : 'events'}${selectedCity ? ` · ${selectedCity}` : ''}`}
          </Text>
        </View>
      ) : null}
      {!isNarrowed ? (
        <SectionStack
          sections={sections}
          now={now}
          withDistance={hasFix}
          visible={visible}
          handlers={cardHandlers}
          coachRef={coachTarget}
          pending={mainRowsRevealPending}
          featuredLayout={(solo) => featuredCardLayout(cardInsets, tabBarTop(SCREEN_HEIGHT, insets.bottom), solo, bannersHeight)}
          askForLocation={!userLocation && (locationStatus === 'denied' || locationStatus === 'undetermined') ? { denied: locationStatus === 'denied', onAsk: askForLocation } : null}
        />
      ) : null}
      {!isNarrowed && rows.length > 0 ? (
        <SectionReveal index={sections.length + 1} pending={mainRowsRevealPending}>
          <EverythingHeader chips={chips} selected={chosen} onSelect={setCategory} />
        </SectionReveal>
      ) : null}
      <View style={styles.spacer} />
    </View>
  )

  const listData = useMemo(() => (showLoadingSkeleton ? LEAD : [...LEAD, ...rows]), [showLoadingSkeleton, rows])
  // Not memoised: the two nodes are new elements every render, so a memo here would never hold.
  const slots = { search: searchNode, body: bodyNode, scrolled: searchBarOn }

  return (
    /*
     * A plain `View`, not a `SafeAreaView`.
     *
     * `edges={['top','bottom']}` inset the *container*, so the scroll surface itself ended above the home indicator and
     * the feed stopped dead at the nav with a visible edge. The insets belong on the scroll content, not on the thing that
     * scrolls: content then runs edge to edge and simply starts and ends clear of the hardware.
     */
    <View style={styles.container}>
      <PulseSlots.Provider value={slots}>
        <VirtualizedList
          forwardedRef={listRef as any}
          data={listData}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          estimatedItemSize={200}
          onEndReachedThreshold={0.5}
          onEndReached={fetchMore}
          onScroll={(e) => {
            onListScroll(e)
            pull.scrollProps.onScroll(e)
          }}
          scrollEventThrottle={16}
          onScrollEndDrag={pull.scrollProps.onScrollEndDrag}
          // iOS pulls with the monogram (motion #18) and holds the list down while it loads; Android keeps the platform's control.
          contentInset={{ top: pull.holdInset }}
          refreshControl={pull.native ? <RefreshControl refreshing={refreshing && !isLoading} onRefresh={onRefresh} tintColor={COLOR.textSecondary} /> : undefined}
          contentContainerStyle={[
            styles.listContainer,
            {
              // The drawer's header above (the top bar and the status bar are above the drawer); the floating nav plus the
              // home indicator at the bottom, which the feed still scrolls under. The frame's 128 already clears the 88 pt
              // nav; `Math.max` so it still does if the nav grows.
              paddingTop: SPACE.lg,
              paddingBottom: insets.bottom + Math.max(MAIN_PADDING_BOTTOM, TAB_BAR_CLEARANCE + SPACE.xl),
            },
          ]}
          showsVerticalScrollIndicator={false}
          /*
            The search lives in this list's header. A tap on anything that is not a control closes its keyboard, a
            control (a card, the search's clear) gets its tap on the first try, and a scroll closes it too. Outside the
            list, the map and the drawer's chrome close it (`HomeShell`).
          */
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          /*
           * 4, not 10: `initialNumToRender` is rendered *synchronously before first paint*. At 10 that is ~4,700 pt of
           * content, five screens, and ten image decodes, to show two cards. Four covers the fold with one row of slack
           * either side; `maxToRenderPerBatch` fills the rest asynchronously, which is what it is for. `windowSize` is left
           * at 10: it governs what stays mounted, not what blocks the first frame.
           */
          initialNumToRender={4 + LEAD_ROWS}
          maxToRenderPerBatch={5}
          windowSize={10}
          stickyHeaderIndices={STICKY_SEARCH}
          ListHeaderComponent={
            <View>{banners}</View>
          }
          // A page refused for asking too fast says so where the reader is, at the foot, and is asked again when it is over.
          ListFooterComponent={
            rateLimit?.onMore ? (
              <View style={styles.rateLimitFoot}>
                <RateLimitedBanner seconds={rateLimit.seconds} onDone={rateLimitDone} testID="pulse-more-rate-limited" />
              </View>
            ) : null
          }
        />
      </PulseSlots.Provider>
      {pull.native ? null : <PullIndicator progress={pull.progress} />}

      {/* The city picker: a Sheet of the server's list; the choice is written to storage on tap, so a restart does not re-ask. */}
      <CityPicker
        visible={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        cities={cityOptions}
        selectedCity={selectedCity}
        deviceCity={deviceCity}
        onChoose={chooseCity}
        onLocate={() => void requestLocationIfNeeded()}
      />

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
        countFor={countEventsFor}
      />

      <PulsePeek
        peek={peek}
        now={now}
        withDistance={hasFix}
        interested={!!(peek && interestStatuses[peek.event.id])}
        checkedIn={checkinStatuses[peek?.event.id ?? '']?.status === 'checked_in'}
        withinFence={!!proximityData[peek?.event.id ?? '']?.within_radius}
        onAction={onPeekAction}
        onClose={() => setPeek(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  /**
   * One surface with the title-tabs band above it: the drawer's own (glass at half, its ink wash at full), no panel, no border, no
   * gradient. An ink of its own here drew a hard edge under the glass band.
   */
  rateLimitFoot: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.md },
  container: { flex: 1 },
  /**
   * No horizontal padding of its own: every row carries its gutter (the rails and the Set list bleed to the edge), so a
   * section cannot disagree with the one above it.
   */
  listContainer: {},
  fill: { flex: 1, minWidth: 0 },
  spacer: { height: SPACE.sm },

  /** A row in the list under the sections: the stack's spacing, inside the gutter. */
  mainRow: { paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.md },
  /** A day's heading over its rows: a section gap above the first, the stack's rhythm below. */
  dayRow: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg, paddingBottom: SPACE.xs },
  /** "6 events · Bengaluru": the flat result's label. */
  resultsLabel: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, paddingBottom: SPACE.md },
  resultsLabelText: { ...DESIGN_TYPE.label, color: COLOR.textSecondary },
  resultsCount: { fontFamily: FONT_FAMILY.mono[700], color: COLOR.textPrimary },
  /** The search/filter skeleton: rows spaced like the real ones. */
  narrowedSkeleton: { paddingHorizontal: SPACE.gutter, marginTop: SPACE.xl, gap: SPACE.md },
  moreSkeleton: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, height: 64 },
})

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Events() {
  return (
    <ScreenProfiler id="pulse">
      <HomeShell renderEvents={renderPulse} />
      {/* "You were sent …": once, for a person who arrived from a shared link (Flow 16 · 16.7). */}
      <PulseArrival />
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
