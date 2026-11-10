import { barCircleBottom, barTop } from '../../lib/barGeometry'
import FadeInUp from '../motion/FadeInUp'
import { EVENT_DETAIL_QUERY } from '../../lib/eventDetailQuery'
import { H } from '../../lib/haptics'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AccessibilityInfo, Linking, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, LayoutAnimationConfig, LinearTransition, ReduceMotion, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverflowMenu } from '../crews/OverflowMenu'
import { AmenityGrid } from '../ds/AmenityTile'
import { Banner } from '../ds/Banner'
import { BannerPresence } from '../motion/BannerPresence'
import { Button } from '../ds/Button'
import { Dock } from '../ds/Dock'
import { IconButton } from '../ds/IconButton'
import { SectionHeader } from '../ds/SectionHeader'
import { StateScreen } from '../ds/StateScreen'
import { RefusalCard } from '../system/RefusalCard'
import { linkRefusalCard } from '../../lib/linkRefusalCard'
import { eventLoadFailure, type EventLoadFailure } from '../../lib/eventLinkRefusal'
import type { MenuItem } from '../ds/ContextMenu'
import { OfflineBanner } from '../OfflineBanner'
import { EventCheckOutSheet, EventHold } from '../scene/EventHold'
import { useEventCheckIn } from '../scene/useEventCheckIn'
import { SceneBar } from '../scene/SceneBar'
import { SceneChangedLines, SceneDayStrip } from '../scene/SceneChange'
import { changeLines, parseEventChange, type EventChange } from '../../lib/eventChange'
import { betweenDaysLine, dayOfWords, parseEventDays, runRange, sessionIsToday, type EventDays } from '../../lib/eventDays'
import { showSheet } from '../../lib/sheet'
import { SkeletonBlock } from '../Skeleton'
import { liveWindow, sessionFromApi, type EventSession } from '../../lib/eventSession'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { askPushInContext } from '../../lib/pushAsk'
import { openInMaps as openPlaceInMaps } from '../../lib/openInMaps'
import { addToCalendar } from '../../lib/calendar'
import { attendancePhase, sceneCtaState } from '../../lib/attendanceState'
import { openBlendn } from '../../lib/blendnOverlay'
import { useToast } from '../Toast'
import { useToastDock } from '../toastDock'
import { amenityTiles, type ServerAmenity } from '../../lib/amenityTile'
import { eventDetailBlocks, type ServerEventDetails } from '../../lib/eventDetails'
import { showEventReportOptions } from '../../lib/safetyUtils'
import { takeSceneSeed } from '../../lib/sceneSeed'
import { eventTarget } from '../../lib/shareEvent'
import { openShare, shareNatively } from '../../lib/shareTray'
import { apiClient, type RsvpStatus } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient'
import { COLOR, DURATION, MAX_FONT_SCALE, RADIUS, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import { PosterLight, SceneHero, posterSide } from '../scene/SceneHero'
import { EventGuide } from '../scene/EventGuide'
import { DockRow } from '../ds/DockRow'
import { PAGE_TITLE } from '../ds/shared'
import { dateStamp, eventDock, shortDistance, untilWords, whoLine, type DockDoes } from '../../lib/eventFacts'
import { SceneLightbox } from '../scene/SceneLightbox'
import { EventLobbyPreview } from '../board/LobbyPreview'
import { BOARD_ENABLED } from '../../lib/board'
import { SCENE_PADDING_HORIZONTAL, SCENE_SECTION_GAP, SceneBody, SceneBodyAccent, SceneDetails, type SceneCTAState } from '../scene/SceneSections'
import { clipFirst, feedPlaylist } from '../../lib/feedMedia'
import { highlightEntities } from '../../lib/entityHighlight'
import { calendarDate, eventClock } from '../../lib/time'
import { eventRoomDoor } from '../../lib/eventRoomDoor'
import { doorWords, heroPillLabel, pillWords } from '../../lib/scarcity'
import { roomOpensAt } from '../../lib/preEventRoom'
import { usePreEventRoom } from '../../lib/usePreEventRoom'
import { useAuth } from '../../lib/useAuth'
import { useNow } from '../../lib/useNow'
import { forgetEventDetailCache, getEventDetailCache, setEventDetailCache } from '../../lib/eventDetailCache'
import { claimUrlFrom } from '../../lib/claimLink'
import * as Location from 'expo-location'
import { getDistanceKm } from '../../lib/geo'
import { ROUGH_FIX_MAX_AGE_MS } from '../../lib/locationFix'
import { useReducedMotion } from '../../lib/motion'

/*
 * What the Scene says in the app's one Sheet (lib/sheet.ts, drawn by SheetHost on the DS Sheet), in the frame's words.
 * A destructive confirm's own press plays `H.destructive` (the Button), so a handler never plays it again.
 */
const notice = (title: string, message: string) =>
  showSheet({ kind: 'actions', title, message, actions: [{ label: 'Done', variant: 'secondary', then: () => {} }] })
const signInSheet = (title: string, message: string) =>
  showSheet({
    kind: 'actions',
    title,
    message,
    actions: [
      { label: 'Sign in', variant: 'primary', then: () => router.replace('/' as never) },
      { label: 'Not now', cancel: true },
    ],
  })

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

/**
 * How far the event is from the phone's last fix ("2.4km away"), when one is recent and location is already allowed. It
 * never asks: a Scene is read in bed as often as on the street, and no fix is simply no WHERE tile.
 */
function useDistanceAway(latitude?: number, longitude?: number): number | null {
  const [km, setKm] = useState<number | null>(null)
  useEffect(() => {
    // 0,0 is an unset coordinate in this schema, not the Gulf of Guinea.
    if (!latitude || !longitude) return
    let live = true
    Location.getLastKnownPositionAsync({ maxAge: ROUGH_FIX_MAX_AGE_MS })
      .then((fix) => {
        if (live && fix) setKm(getDistanceKm(fix.coords.latitude, fix.coords.longitude, latitude, longitude))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [latitude, longitude])
  return km
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
  /** The venue's neighbourhood, else the city: what an unlisted event is shared as (ROOM-17). */
  area?: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  /** The day LIVE and check-in are judged by — `lib/eventSession.ts`. */
  session?: EventSession | null
  /** What moved under the people who had heard of it (`lib/eventChange.ts`); null for an event that has not changed or an older server. */
  change?: EventChange | null
  /** The days of a run of more than one (`lib/eventDays.ts`); null for a one-day event or an older server. */
  days?: EventDays | null
  timezone?: string
  category: string
  /** The first category's slug ("music"), for the hero's plate when there is no picture (TG-06). */
  category_slug?: string
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
  media?: { id: string; url: string; type: string; thumbnail_url?: string | null; thumbnailUrl?: string | null; order?: number | null }[]
  /** The public claim page, for a curated event nobody has claimed. See `claimUrlFrom`. */
  claim_url?: string | null
  /** `cancelled` draws the banner, the struck date and the quiet "Cancelled" button. */
  status?: string
  /** `public`, `unlisted` or `private`: whether, and how much of it, may be put in a link (`lib/shareLinks.ts`). */
  visibility?: string
  /** The organiser's age floor and door: the Door tile and the age pill. */
  min_age?: number | null
  door_policy?: string | null
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

/*
 * The Scene's entrance (DS #16). The hero crossfades over the skeleton (a fade is the reduced form, so it stays under
 * Reduce Motion); the sections below rise `RISE.list` a stagger apart, capped at the fourth: by then they are below
 * the fold.
 */
const HERO_FADE_IN = FadeIn.duration(DURATION.base).reduceMotion(ReduceMotion.Never)
const SECTION_DELAY = [0, 1, 2, 3].map((i) => Math.min(i * STAGGER.loose, STAGGER.windowMax))

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
  // The route gives the id and a one-time seed token, nothing else: every other param is ignored (see `lib/sceneSeed.ts`).
  const { id, seed: seedToken } = useLocalSearchParams<{ id?: string; seed?: string }>()
  const [seed] = useState(() => takeSceneSeed(seedToken, id))
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  // The Android snackbar stands above the CTA dock.
  const [ctaDockHeight, setCtaDockHeight] = useState(0)
  useToastDock(ctaDockHeight)
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
  const { showToast } = useToast()
  // The badge's clock moves a minute at a time: a render never reads it itself.
  const now = useNow(60_000)
  /** Out to the browser; the dashboard's claim page needs no account. */
  const openClaimPage = (url: string) => {
    Linking.openURL(url).catch(() => showToast("That page didn’t open. Try again.", 'error'))
  }

  // Draw at once from the card that opened this screen, if the app did.
  const hasParams = !!(seed && (seed.title || seed.cover || seed.venue))
  const [event, setEvent] = useState<EventDetailData | null>(() => {
    if (seed && hasParams) {
      return {
        id: String(id || ''),
        title: seed.title,
        venue_name: seed.venue,
        cover_image_url: seed.cover,
        city: seed.city,
        start_time: seed.start || new Date().toISOString(),
        end_time: seed.end || new Date().toISOString(),
        category: seed.category,
        description: seed.description,
        short_description: '',
        address: '',
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
  const [loadFailure, setLoadFailure] = useState<EventLoadFailure | null>(null)
  /** The room's own "here now", while the event is running. */
  const [hereNow, setHereNow] = useState<number | null>(null)
  /** The detail's `stats.hereCount` (inside now), null from an older server: then no here-now line. */
  const [detailHere, setDetailHere] = useState<number | null>(null)
  // Don't show loading skeleton if we have params - show content immediately
  const [loading, setLoading] = useState(!hasParams)
  // Initialize from params for instant display
  const [checkInCount, setCheckInCount] = useState(0)
  const [goingCount, setGoingCount] = useState(0)
  const [interestCount, setInterestCount] = useState<number>(() => seed?.interestCount ?? 0)
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
  const lastFetchRef = React.useRef<number>(0)
  const [menuOpen, setMenuOpen] = useState(false)
  /** Which gallery item the lightbox is on, or null when it is closed. */
  const [lightbox, setLightbox] = useState<number | null>(null)
  /*
   * The detail payload (camelCase, or snake_case from an older cache entry)
   * into the screen's state. One mapper for the fetch and the cache: a field
   * carried by one path and not the other made a section appear and disappear
   * depending on how you reached the screen.
   */
  const applyDetail = (d: NonNullable<Awaited<ReturnType<typeof apiClient.getEvent>>['data']>) => {
    setEvent({
      id: d.id,
      title: d.title,
      description: d.description || '',
      short_description: d.shortDescription || d.short_description || '',
      city: d.city || '',
      area: (d as { area?: string | null }).area ?? undefined,
      venue_name: d.venueName || d.venue_name || '',
      address: d.address || '',
      start_time: d.startTime || d.start_time || '',
      end_time: d.endTime || d.end_time || '',
      session: sessionFromApi(d.session),
      change: parseEventChange(d),
      days: parseEventDays(d),
      timezone: d.timezone,
      category: d.categories?.[0]?.name || '',
      category_slug: d.categories?.[0]?.slug || undefined,
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
      status: d.status,
      visibility: d.visibility,
      min_age: d.minAge ?? null,
      door_policy: d.doorPolicy ?? null,
    })
    // Interest, check-in and RSVP from userStatus - no separate API call needed
    if (d.userStatus) {
      setUserInterested(d.userStatus.isFavorited || false)
      setCheckInStatus({
        success: true,
        checked_in: d.userStatus.isCheckedIn || false,
        status: d.userStatus.checkInStatus ?? null,
      })
      setRsvpStatus((d.userStatus.rsvpStatus as RsvpStatus | null) || null)
    }
    if (d.stats) {
      setInterestCount(d.stats.favoriteCount || 0)
      // Both, because the Attendees block reports a different one either
      // side of the doors -- see `attendeeBlock` below.
      setCheckInCount(d.stats.checkInCount || 0)
      setDetailHere(typeof d.stats.hereCount === 'number' ? d.stats.hereCount : null)
      setGoingCount(d.stats.rsvpCount || 0)
    }
  }

  const applyEventDetails = (result: Awaited<ReturnType<typeof apiClient.getEvent>>) => {
    if (!result.success || !result.data) {
      Logger.error('events', 'detail:fetch:error', { error: result.error })
      const failure = eventLoadFailure(result)
      setLoadFailure(failure)
      /*
       * The server says it is gone (the organiser was suspended, or it was taken down): the card or the cached copy this page
       * opened on is not true any more, so the page is the "No longer available" card (Flow 15 #10), not a stale event.
       */
      if (failure === 'notFound') {
        forgetEventDetailCache(String(id))
        setEvent(null)
      }
      return failure
    } else {
      setLoadFailure(null)
      // Map API response (camelCase) to EventDetailData interface (snake_case)
      const d = result.data
      lastFetchRef.current = Date.now()
      setEventDetailCache(String(id), d)
      applyDetail(d)
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
      .getEvent(String(id), { ...EVENT_DETAIL_QUERY })
      .then((result) => {
        /*
         * With nothing on screen the page itself says so (below). With the
         * params' outline on screen, say it once, with a way to try again — a
         * background refetch that fails later keeps what is there and says
         * nothing.
         */
        if (applyEventDetails(result) === 'network' && event && lastFetchRef.current === 0) {
          showSheet({
            kind: 'actions',
            icon: 'cloud-off',
            title: 'Couldn’t load everything',
            message: 'Some details are missing. Check your connection and try again.',
            actions: [
              { label: 'Try again', variant: 'primary', then: () => void fetchEventDetails() },
              { label: 'Not now', cancel: true },
            ],
          })
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
    if (id && String(id).trim()) {
      // Params are already handled in initial state - just check cache for more complete data
      const cached = getEventDetailCache<any>(String(id))
      if (cached) {
        applyDetail(cached)
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
        signInSheet('Sign in to save events', 'Saved events come with you to every device.')
        return
      }
      interestInFlight.current = true
      const prevInterested = userInterested
      setUserInterested(!prevInterested)
      setInterestCount((prev) => Math.max(0, prev + (prevInterested ? -1 : 1)))
      const result = await apiClient.toggleInterest(String(id))
      if (!result.success || !result.data) {
        // rollback
        setUserInterested(prevInterested)
        setInterestCount((prev) => Math.max(0, prev + (prevInterested ? 1 : -1)))
        H.error()
        notice('Couldn’t save the event', 'Try again.')
        return
      }
      setUserInterested(result.data.interested)
      setInterestCount(result.data.interestCount || 0)
      // Saving is silent everywhere (the heart's fill is the cue); only a refusal buzzes (above).
    } catch {
      H.error()
      notice('Couldn’t save the event', 'Try again.')
    } finally {
      interestInFlight.current = false
    }
  }, [id, user, userInterested])

  /*
   * Taking it back. Split out of the toggle because it now sits behind a
   * confirmation: the CTA is the RSVP *and* its off-switch, so one tap on
   * "You're going" used to cancel with nothing said — and on a full event it
   * gave your waitlist place to the next person, with no way back to it.
   */
  /** An RSVP or a cancel is out: the CTA spins and nothing else is sent, or offered (the cancel tray). */
  const rsvpInFlight = useRef(false)
  const [rsvpPending, setRsvpPending] = useState(false)

  const withdrawRsvp = useCallback(async () => {
    // Hoisted out of the `try` so the `catch` can put it back: a thrown
    // request (timeout, no network) left the optimistic state on screen with
    // no row behind it. Seen on the simulator when the RSVP call timed out.
    const prevStatus = rsvpStatus
    // One request at a time: a second confirm, or an RSVP, waits for this one.
    if (rsvpInFlight.current) return
    rsvpInFlight.current = true
    try {
      if (!id) return
      // Its confirm's destructive button just played `H.destructive` (the Button, §10.2).
      setRsvpStatus(null)
      const result = await apiClient.cancelRsvp(String(id))
      if (!result.success) {
        setRsvpStatus(prevStatus)
        H.error()
        notice('Couldn’t cancel your RSVP', 'Try again.')
      } else {
        // The server's count after the change, as on the RSVP below.
        if (typeof result.data?.rsvpCount === 'number') setGoingCount(result.data.rsvpCount)
        /*
         * Said, as "You’re going." is: the CTA now reads "I’m going", the invitation, which looked like the status just
         * removed ("it still shows I’m going", SCRUM-881).
         */
        showToast(prevStatus === 'waitlisted' ? 'You’ve left the waitlist.' : 'RSVP cancelled.', 'success')
      }
    } catch {
      setRsvpStatus(prevStatus)
      H.error()
      notice('Couldn’t update your RSVP', 'Try again.')
    } finally {
      rsvpInFlight.current = false
    }
  }, [id, rsvpStatus, showToast])

  const confirmWithdrawRsvp = useCallback(() => {
    const waitlisted = rsvpStatus === 'waitlisted'
    showSheet({
      kind: 'actions',
      title: waitlisted ? 'Leave the waitlist?' : 'Cancel your RSVP?',
      message: waitlisted
        ? "You’ll lose your place in line. If you join again later, you go to the back."
        : "You’ll come off the list of people going. If it fills up, your place goes to someone else.",
      actions: [
        { label: waitlisted ? 'Stay on it' : 'Keep it', variant: 'secondary', then: () => {} },
        { label: waitlisted ? 'Leave waitlist' : 'Cancel RSVP', variant: 'destructive', then: () => void withdrawRsvp() },
      ],
    })
  }, [rsvpStatus, withdrawRsvp])

  const handleToggleRsvp = useCallback(async () => {
    const prevStatus = rsvpStatus
    if (rsvpInFlight.current) return
    let sent = false
    try {
      if (!id) return
      if (!user) {
        signInSheet('Sign in to RSVP', 'Your RSVP is kept on your account.')
        return
      }
      // Waitlisted counts as "already committed": tapping should offer to take
      // you off the list, not try to RSVP again. Treating it as not-going would
      // send a second RSVP and leave the user unable to withdraw.
      if (rsvpStatus === 'going' || rsvpStatus === 'waitlisted') {
        confirmWithdrawRsvp()
        return
      }
      /*
       * No press haptic on I'm going: the answer plays one (§10.2, ROUND3 #45).
       * Not optimistic: the label stays and the pill spins until the server
       * answers, then the "You're going" (or "On the waitlist") sequence runs.
       */
      rsvpInFlight.current = true
      sent = true
      setRsvpPending(true)
      const result = await apiClient.rsvpToEvent(String(id), 'going')
      if (!result.success || !result.data) {
        setRsvpStatus(prevStatus)
        H.error()
        notice('Couldn’t RSVP', 'Try again.')
      } else {
        H.success()
        setRsvpStatus(result.data.rsvpStatus)
        // The response carries the new count; without it "Going" stayed at 24
        // beside "You're going" until the screen was reopened.
        if (typeof result.data.rsvpCount === 'number') setGoingCount(result.data.rsvpCount)
        if (result.data.rsvpStatus === 'waitlisted') {
          // Say it plainly. An amber icon alone would let someone believe
          // they have a place and turn up to an event that is full.
          showSheet({
            kind: 'actions',
            icon: 'clock',
            title: 'You’re on the waitlist',
            message: 'This event is full. We’ll let you know if a place frees up. You’ll be first in line in the order you joined.',
            actions: [{ label: 'Got it', variant: 'secondary', then: () => {} }],
          })
        } else if (event) {
          /*
           * The calendar, offered in the moment and not in the way: a toast
           * with an action rather than a tray, so saying yes is still one tap
           * and the offer goes away on its own. Only for a seat — a waitlist
           * place is not a plan yet.
           */
          const planned = event
          showToast("You’re going.", 'success', {
            action: { label: 'Add to calendar', onPress: () => addToCalendar(planned) },
          })
          // The first time only, and only to a phone that can still be asked (Flow 9 · 9.7).
          void askPushInContext('rsvp', planned.title)
        }
      }
    } catch {
      setRsvpStatus(prevStatus)
      H.error()
      notice('Couldn’t update your RSVP', 'Try again.')
    } finally {
      // Only this handler's own request: the confirm-tray path never sent one.
      if (sent) {
        rsvpInFlight.current = false
        setRsvpPending(false)
      }
    }
  }, [id, user, event, rsvpStatus, confirmWithdrawRsvp, showToast])

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

  const openInMaps = () => {
    if (event) void openPlaceInMaps(event)
  }
  const { hold, checkOut, openCheckOut, overlays } = useEventCheckIn({ id: String(id), event, openMaps: openInMaps })
  // The dock's "You're in · Check out": a screen reader's focus comes back to it when the sheet closes without checking out.
  const checkOutLink = useRef<View>(null)
  const refocusCheckOut = () => {
    if (checkOutLink.current) AccessibilityInfo.sendAccessibilityEvent(checkOutLink.current, 'focus')
  }

  /*
   * What this event may say in a link: null for a private one or a draft, and then there is no share control at all
   * (hidden, never disabled). An unlisted one shares its area only (`lib/shareEvent.ts`).
   */
  const shareTarget = event
    ? eventTarget({
        id: event.id,
        title: event.title,
        startTime: event.start_time,
        venueName: event.venue_name,
        city: event.city,
        area: event.area,
        coverImageUrl: event.cover_image_url,
        status: event.status,
        visibility: event.visibility,
        timezone: event.timezone,
      })
    : null
  // Flow 4, option B: the dock's Invite is the system share sheet ("Bring someone?" folded into it); the bar's Share is
  // the one tray (Flow 16: WhatsApp first, the Story card).
  const handleInvite = shareTarget
    ? async () => {
        if ((await shareNatively(shareTarget)) === 'failed') showToast('Couldn’t open sharing. Try again.', 'error')
      }
    : undefined

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
  /*
   * The pre-event room's countdown is the Scene's (R6-5): the room opens at the run's first doors (the server's
   * `chatOpensAt`, start − 90 min), and somebody going or saved is told when, then that it is open, with the way in.
   * "Opens in" ticks once a minute and is null once the room is open; the line is drawn below.
   */
  const roomOpensIn = usePreEventRoom(event?.start_time)
  const [roomOpening, setRoomOpening] = useState(false)
  const isLive = hasStarted && !isEnded
  /** WHERE says how far, never the venue again (the hero and the Location card do): dropped when no fix is known (D16). */
  const away = useDistanceAway(event?.latitude, event?.longitude)

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


  /*
   * The check-in is this page's own hold (SCRUM-966, owner 2026-10-31): "Blend in" is the VenuePass's hold, `useEventCheckIn`, with
   * the server's refusals ("Not quite there yet", "Doors aren't open") said here. Once checked in the CTA reads "You're in" and
   * leads to the Room. Back to the tabs first: the overlay is under the root stack.
   */
  const toTheOverlay = (open: () => void) => {
    router.dismissTo('/(tabs)/events')
    open()
  }
  // The attendance flow's one state (`lib/attendanceState.ts`): the Going card, the disc and this CTA cannot disagree.
  const ctaNow = (): SceneCTAState => sceneCtaState({ phase: event ? attendancePhase(event) : 'upcoming', rsvpStatus, checkedIn: isCheckedIn, attended })

  const reduceMotion = useReducedMotion()
  // Layout glides as a banner arrives or leaves (DS #44); Reduce Motion cuts.
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)
  const goBack = () => router.back()

  if (!loading && !event) {
    const network = loadFailure === 'network'
    return (
      <View style={styles.container} testID="scene-failed">
        <View style={[styles.stateBar, { top: barTop(insets.top) }]}>
          <IconButton icon={Platform.OS === 'android' ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={goBack} testID="scene-back" />
        </View>
        {/* Arrives like any other content, rather than cutting in after the skeleton. */}
        <FadeInUp style={styles.stateBody}>
          {network ? (
            <StateScreen
              icon="cloud-off"
              title="Couldn’t load this event"
              body="Check your connection and try again."
              actions={[
                {
                  label: 'Try again',
                  onPress: () => {
                    setLoadFailure(null)
                    setLoading(true)
                    void fetchEventDetails()
                  },
                },
                { label: 'Go back', kind: 'secondary', onPress: goBack },
              ]}
            />
          ) : (
            <RefusalCard {...linkRefusalCard(loadFailure, { toPulse: () => router.replace('/(tabs)/events'), toProfile: () => router.push('/edit-profile' as never) })} />
          )}
        </FadeInUp>
      </View>
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
   * Who is there, one word per state (D17, TG-05): "going" before the doors (saves, "interested", when nobody has
   * RSVP'd), "here now" while it runs, "went" after. A cancelled night has nobody to count.
   */
  const amenities = amenityTiles(event?.amenities)
  const detailBlocks = eventDetailBlocks(event?.details)
  /** The public claim page, when the server offers one (curated, unclaimed). */
  const claimUrl = event?.claim_url ?? null
  const cancelled = event?.status === 'cancelled'
  const waitlisted = rsvpStatus === 'waitlisted'
  const crowdWord = isEnded ? 'went' : isLive ? 'here now' : goingCount > 0 ? 'going' : 'interested'
  const crowdCount = cancelled ? 0 : isEnded ? checkInCount : isLive ? (hereNow ?? detailHere ?? checkInCount) : goingCount || interestCount

  const ctaState = ctaNow()

  /*
   * The When row and the dock say the live window's doors, not the run's (on day 2 of a festival, today's), in the
   * event city's clock with no zone named. A run of days says its own dates ("Sat 27 – Mon 29 Sep", Flow 3 · 3.2).
   */
  const heroStart = live?.start_time ?? null
  const tz = event?.timezone
  const startDay = heroStart ? calendarDate(heroStart, { weekday: true, timeZone: tz, now }) : ''
  const startClock = heroStart ? eventClock(heroStart, tz) : null
  const dockWhen = [startDay, startClock].filter(Boolean).join(' · ')
  const sessionToday = event?.days ? sessionIsToday(event.days, tz, now) : false
  // Between days, to somebody who is going: the next door, said where "Change" was (frame 06). Nothing else changes.
  const betweenLine =
    event?.days && ctaState === 'rsvpd' && !sessionToday && heroStart && Date.parse(event.start_time) <= now
      ? betweenDaysLine(event.days, heroStart, tz)
      : null
  /*
   * Said to the people who had heard of the night (going, maybe, waitlisted, saved): what moved, and what it was. A cancel is
   * the banner's, so it is no line here.
   */
  const heardOfIt = (rsvpStatus !== null && rsvpStatus !== 'not_going') || userInterested
  // Before the doors, to somebody going or saved: "Room opens Sat 24 Oct 9 PM", then the dock's "The room is open".
  const roomOpens = roomOpensAt(event?.start_time)
  const roomLine =
    event && !cancelled && !hasStarted && roomOpens !== null && (rsvpStatus === 'going' || userInterested)
      ? roomOpensIn
        ? { open: false as const, when: `${calendarDate(roomOpens, { weekday: true, timeZone: tz, now })} ${eventClock(roomOpens, tz)}` }
        : { open: true as const }
      : null
  const openRoom = async () => {
    if (!event || roomOpening) return
    setRoomOpening(true)
    try {
      const door = await eventRoomDoor(String(id), event.title)
      if (door.kind === 'say') showToast(door.line)
      else router.push({ pathname: '/chat/[id]', params: door.params } as never)
    } finally {
      setRoomOpening(false)
    }
  }
  const changeRows = event?.change && heardOfIt ? changeLines(event.change, event, now) : []

  // The ⋯: report, for anyone. An organiser edits, announces and deletes on the dashboard (Flow 15 #2, owner ruling D3): the Scene is the
  // attendee's one surface, and shows no staff control to anybody.
  const menu: MenuItem[] = [{ icon: 'flag', label: 'Report this event', onPress: () => showEventReportOptions(event?.title || 'this event', String(id)) }]

  /** The dock's state and its one action (`lib/eventFacts.ts`); null at the doors, where the hold is the dock. */
  const dock = eventDock({ cta: ctaState, when: dockWhen, roomOpen: roomLine?.open === true, canInvite: !!shareTarget, between: betweenLine, alone: checkInCount <= 1 })
  const dockPress: Record<DockDoes, () => void> = {
    rsvp: () => void handleToggleRsvp(),
    invite: () => void (handleInvite && handleInvite()),
    openRoom: () => void openRoom(),
    room: () => toTheOverlay(openBlendn),
    tonight: () => toTheOverlay(openBlendn),
    rate: () => router.push({ pathname: '/rate/[eventId]', params: { eventId: String(id) } as any }),
  }
  /*
   * A run of days says where today is in it under its dates ("Day 2 of 3 · Till 2 AM", Flow 3 · 3.2), but only when the
   * session is today in the event's own zone. Between days it says the next doors; an ended run promises none (SCRUM-981).
   */
  const runLine = event?.days
    ? sessionToday
      ? [dayOfWords(event.days), untilWords(live?.end_time, tz)].filter(Boolean).join(' · ')
      : event.days.dayNumber && !isEnded
        ? `Next doors ${startDay}`
        : null
    : null
  // How full it is, in the Pulse's words ("Full", "8 spots left"): a fact in the Who row, never a pill on the poster.
  const scarcity = heroPillLabel({ doorPolicy: event?.door_policy as never, maxCapacity: event?.max_capacity, currentCapacity: event?.current_capacity, goingCount })
  const door = doorWords(event?.door_policy)
  // The pill's own words can be the door's ("Guest list only"): said once.
  const spots = cancelled || !scarcity || (door && pillWords(scarcity).startsWith(door)) ? null : pillWords(scarcity)
  const stamp = dateStamp(heroStart, tz)
  const area = event?.area || event?.city || ''
  const minAge = event?.min_age ?? null
  const posterTop = barCircleBottom(insets.top, Platform.OS === 'android') + SPACE.sm

  const onFirstLoad = loading && !event
  return (
    <View style={styles.container}>
      {/* The poster's light, fixed behind the page: it fades with the poster as the page scrolls, never to nothing. */}
      <PosterLight scrollY={scrollY} />
      {/* First in the tree: Back is the first thing a screen reader reaches. */}
      <SceneBar
        title={event?.title || ''}
        saved={userInterested}
        onBack={goBack}
        onSave={handleToggleInterest}
        onShare={shareTarget ? () => void openShare(shareTarget) : undefined}
        onMore={() => setMenuOpen(true)}
        scrollY={scrollY}
        reveal={posterSide(width)}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Room for the dock, and no more: `/event/[id]` is a root stack route, there is no tab bar beneath it.
        contentContainerStyle={{ paddingTop: posterTop, paddingBottom: ctaDockHeight + SPACE.xl }}
      >
        {/* The poster fades in over the skeleton's slot; a cached event, which paints it first, doesn't fade. */}
        <LayoutAnimationConfig skipEntering>
          {onFirstLoad ? (
            <View style={styles.posterSlot}>
              <SkeletonBlock width={posterSide(width)} height={posterSide(width)} borderRadius={RADIUS.disc} />
            </View>
          ) : (
            <Animated.View entering={HERO_FADE_IN}>
              <SceneHero
                playlist={playlist}
                title={event?.title || ''}
                category={event?.category_slug}
                stamp={stamp}
                venueLine={[event?.venue_name, area].filter(Boolean).join(' · ')}
                onPressMedia={(i) => setLightbox(i)}
                scrollY={scrollY}
              />
            </Animated.View>
          )}
        </LayoutAnimationConfig>

        <Animated.View layout={glide} style={styles.content}>
          {onFirstLoad ? (
            <View testID="scene-skeleton" accessibilityLabel="Loading the event" accessibilityState={{ busy: true }} style={styles.skeleton}>
              <SkeletonBlock width="80%" height={TITLE_LINE} borderRadius={RADIUS.thumb} />
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} width="100%" height={SPACE.xxxl} borderRadius={RADIUS.thumb} />
              ))}
            </View>
          ) : (
            <>
              <Text testID="scene-title" accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={styles.title}>
                {event?.title || ''}
              </Text>

              {/* The state's own slot under the title (never glued to a value): offline, called off, waitlisted, the room's hour, what moved. */}
              <View style={styles.state}>
                <OfflineBanner text="Offline. Showing what you had." testID="scene-offline" />
                {cancelled ? <BannerPresence><Banner kind="offline" text="Cancelled. The organizer called this one off. Your RSVP is released." testID="scene-cancelled" /></BannerPresence> : null}
                {waitlisted && !cancelled ? <BannerPresence><Banner kind="paused" text="On the waitlist. You’ll be first in line in the order you joined." testID="scene-waitlisted" /></BannerPresence> : null}
                {roomLine && !roomLine.open ? <BannerPresence key="room-opens"><Banner kind="info" icon="clock" text="Room opens" mono={roomLine.when} testID="scene-room-opens" /></BannerPresence> : null}
                {changeRows.length > 0 ? <SceneChangedLines lines={changeRows} changedAt={event?.change?.changedAt} testID="scene-changed" /> : null}
              </View>

              <FadeInUp delay={SECTION_DELAY[0]}>
                <EventGuide
                  when={{
                    day: event?.days ? runRange(event.days, event, tz) : startDay,
                    time: startClock,
                    until: runLine ?? untilWords(live?.end_time, tz),
                    add: event && !cancelled && !isEnded ? { label: 'Add to calendar', icon: 'calendar-plus', onPress: () => addToCalendar(event), testID: 'scene-add-calendar' } : undefined,
                  }}
                  where={
                    event?.venue_name
                      ? { venue: event.venue_name, area: area || null, distance: shortDistance(away), directions: { label: 'Directions', icon: 'navigation', onPress: openInMaps, testID: 'scene-directions' } }
                      : null
                  }
                  who={{ ...whoLine({ count: crowdCount, word: crowdWord, minAge, door, spots }), host: event?.organizer || null }}
                />
              </FadeInUp>

              <View style={styles.sections}>
                {/*
                  P-A, the Lobby (SCRUM-1026), after the facts: its card until the close, and "The room is open" once the doors
                  open on a Lobby nobody posted in. The server decides whether there is one to show; a refusal draws nothing.
                */}
                {event && BOARD_ENABLED && !cancelled ? (
                  <FadeInUp delay={SECTION_DELAY[1]}>
                    <EventLobbyPreview eventId={event.id} timeZone={tz} here={hereNow ?? detailHere} onOpenRoom={() => void openRoom()} />
                  </FadeInUp>
                ) : null}

                {/* Flow 4b's Tickets section (rows A) lands here, above the experience, when ticketing ships. */}
                {event?.days ? (
                  <FadeInUp delay={SECTION_DELAY[1]}>
                    <SceneDayStrip days={event.days} today={sessionToday} testID="scene-days" />
                  </FadeInUp>
                ) : null}

                {event?.description ? (
                  <FadeInUp delay={SECTION_DELAY[1]}>
                    <View testID="scene-experience" style={styles.section}>
                      <SectionHeader title="The experience" />
                      <SceneBody>
                        {highlightEntities(event.description, entities).map((seg, i) =>
                          seg.entity ? <SceneBodyAccent key={i}>{seg.text}</SceneBodyAccent> : seg.text
                        )}
                      </SceneBody>
                    </View>
                  </FadeInUp>
                ) : null}

                {/* What the organiser wrote: house rules, FAQ, accessibility. Wrapped only when it draws something. */}
                {detailBlocks.length > 0 ? (
                  <FadeInUp delay={SECTION_DELAY[2]}>
                    <SceneDetails blocks={detailBlocks} />
                  </FadeInUp>
                ) : null}

                {/* The organiser's curated facilities, two up ("+n more" past seven). */}
                {amenities.length > 0 ? (
                  <FadeInUp delay={SECTION_DELAY[3]}>
                    <AmenityGrid tiles={amenities.map((a) => ({ label: a.title.toUpperCase(), value: a.subtitle || 'Included', testID: `scene-tile-${a.id}` }))} testID="scene-tiles" />
                  </FadeInUp>
                ) : null}

                {/*
                  Only on a curated event nobody has claimed, which the server decides. It leaves the app for the public
                  claim page on the dashboard host: the app refuses host accounts by design, and that page needs no account.
                */}
                {claimUrl ? (
                  <FadeInUp delay={SECTION_DELAY[3]} style={styles.claim}>
                    <Button
                      kind="tertiary"
                      size="md"
                      icon="external-link"
                      label="Running this event? Claim it"
                      accessibilityHint="Opens the Blend’n dashboard in your browser"
                      onPress={() => openClaimPage(claimUrl)}
                      testID="claim-event-link"
                    />
                  </FadeInUp>
                ) : null}
              </View>
            </>
          )}
        </Animated.View>
      </Animated.ScrollView>

      {/* The dock: one line, the state on the left and one action on the right; at the doors the hold. */}
      {dock ? (
        <Dock floating line onHeight={setCtaDockHeight} testID="scene-dock">
          <DockRow
            testID="scene-cta"
            state={dock.state}
            sub={dock.sub}
            subIsLink={(dock.change && dock.sub === 'Change') || dock.checkOut}
            onPressState={dock.change ? () => void handleToggleRsvp() : dock.checkOut ? openCheckOut : undefined}
            stateHint={dock.change ? 'Double-tap to change your RSVP' : dock.checkOut ? 'Opens check out' : undefined}
            stateRef={dock.checkOut ? checkOutLink : undefined}
            action={
              dock.action
                ? {
                    ...dock.action,
                    onPress: dockPress[dock.action.does],
                    loading: dock.action.does === 'rsvp' ? rsvpPending : dock.action.does === 'openRoom' ? roomOpening : false,
                    // I'm going: the answer plays the haptic (§10.2), never the press as well.
                    pressHaptic: dock.action.does !== 'rsvp',
                    testID: `scene-cta-${dock.action.does}`,
                  }
                : undefined
            }
          />
        </Dock>
      ) : (
        <Dock floating onHeight={setCtaDockHeight} testID="scene-dock">
          <EventHold {...hold} />
        </Dock>
      )}
      {overlays}
      {/* Checked in, the way out (option A, SCRUM-1035): the standard sheet with the hold, opened from the dock's "Check out". */}
      <EventCheckOutSheet {...checkOut} visible={checkOut.visible && ctaState === 'going'} onDismissed={refocusCheckOut} />

      <SceneLightbox items={playlist} initialIndex={lightbox ?? 0} visible={lightbox !== null} onClose={() => setLightbox(null)} />

      {/* The ⋯: Report. */}
      <OverflowMenu visible={menuOpen} items={menu} onClose={() => setMenuOpen(false)} testID="scene-menu" />
    </View>
  )
}

const TITLE_TYPE = PAGE_TITLE
const TITLE_LINE = TITLE_TYPE.lineHeight

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  posterSlot: { alignItems: 'center' },
  content: { paddingHorizontal: SCENE_PADDING_HORIZONTAL, paddingTop: SPACE.xl },
  title: { ...TITLE_TYPE, color: COLOR.textPrimary },
  // The state slot: empty takes no room; each banner 16 below the title.
  state: { gap: SPACE.lg, paddingTop: SPACE.lg },
  sections: { marginTop: SPACE.xxl, gap: SCENE_SECTION_GAP },
  section: { gap: SPACE.md },
  claim: { alignSelf: 'flex-start' },
  skeleton: { gap: SPACE.lg },
  stateBar: { position: 'absolute', left: SPACE.lg, zIndex: 2 },
  stateBody: { flex: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xxxl * 4 },
})
