import { barTop } from '../../lib/barGeometry'
import FadeInUp from '../motion/FadeInUp'
import { H } from '../../lib/haptics'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { InteractionManager, Linking, Platform, Share, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, LayoutAnimationConfig, LinearTransition, ReduceMotion, useAnimatedScrollHandler, useReducedMotion, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverflowMenu } from '../crews/OverflowMenu'
import { AmenityGrid, type AmenityTileProps } from '../ds/AmenityTile'
import { Banner } from '../ds/Banner'
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
import { AnnouncementSheet, EditEventSheet } from '../scene/EventSheets'
import { SceneBar } from '../scene/SceneBar'
import { showSheet } from '../../lib/sheet'
import { useSingleFlight } from '../../lib/useSingleFlight'
import { SkeletonBlock } from '../Skeleton'
import { liveWindow, sessionFromApi, type EventSession } from '../../lib/eventSession'
import { cardTime, peopleLabel } from '../../lib/pulse'
import { subscribeCheckInChanged } from '../../lib/checkIn'
import { openInMaps as openPlaceInMaps } from '../../lib/openInMaps'
import { addToCalendar } from '../../lib/calendar'
import { openBlendn, openPass } from '../../lib/blendnOverlay'
import { useToast } from '../Toast'
import { useToastDock } from '../toastDock'
import { amenityTiles, type ServerAmenity } from '../../lib/amenityTile'
import { eventDetailBlocks, type ServerEventDetails } from '../../lib/eventDetails'
import { showEventReportOptions } from '../../lib/safetyUtils'
import { eventShareText } from '../../lib/pulsePeek'
import { apiClient, type RsvpStatus } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import {
  subscribeToEventCheckIn,
  subscribeToEventInterest,
  EventCheckInCallback,
  EventInterestCallback
} from '../../lib/socketClient'
import { COLOR, DURATION, RADIUS, SPACE, SPRING, STAGGER, VENUE_PLATES } from '../../lib/design/tokens'
import { PAGE_WASH, PageWash } from '../ui/GradientFill'
import { Icon, type IconName } from '../ui/Icon'
import { SceneHero, sceneHeroHeight, type ScenePill } from '../scene/SceneHero'
import { SceneLightbox } from '../scene/SceneLightbox'
import ScalePress from '../motion/ScalePress'
import { BoardEntry } from '../board/BoardSections'
import { BOARD_ENABLED, boardClosed } from '../../lib/board'
import {
  SCENE_CTA_ICON,
  SCENE_PADDING_HORIZONTAL,
  SCENE_SECTION_GAP,
  SceneAttendees,
  SceneBody,
  SceneBodyAccent,
  SceneByline,
  SceneCTA,
  SceneGallery,
  SceneLocationCard,
  SceneMap,
  SceneDetails,
  rsvpCtaState,
  type SceneCTAState,
} from '../scene/SceneSections'
import { clipFirst, feedPlaylist } from '../../lib/feedMedia'
import { highlightEntities } from '../../lib/entityHighlight'
import { doorWords, heroPillLabel, pillWords } from '../../lib/scarcity'
import { clockTime } from '../../lib/roomMoments'
import { useAuth } from '../../lib/useAuth'
import { printable } from '../../lib/pulseSections'
import { useNow } from '../../lib/useNow'
import { getEventDetailCache, setEventDetailCache } from '../../lib/eventDetailCache'
import { claimUrlFrom } from '../../lib/claimLink'

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
  /** `cancelled` draws the banner, the struck date and the quiet "Cancelled" button. */
  status?: string
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
  const { id, title, cover, venue, city, start, end, category, description: descriptionParam, interestCount: interestCountParam } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
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
  const lastFetchRef = React.useRef<number>(0)
  const [menuOpen, setMenuOpen] = useState(false)
  /** The map mounts once the push has settled, so it does not cost the transition a frame. */
  const [showMap, setShowMap] = useState(false)
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
      venue_name: d.venueName || d.venue_name || '',
      address: d.address || '',
      start_time: d.startTime || d.start_time || '',
      end_time: d.endTime || d.end_time || '',
      session: sessionFromApi(d.session),
      timezone: d.timezone,
      category: d.categories?.[0]?.name || '',
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
        check_in_id: d.userStatus.checkInId,
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
    // Determine if current user is the organizer
    if (user && d.organizer?.id) {
      setIsOrganizer(d.organizer.id === user.id)
    }
  }

  const applyEventDetails = (result: Awaited<ReturnType<typeof apiClient.getEvent>>) => {
    if (!result.success || !result.data) {
      Logger.error('events', 'detail:fetch:error', { error: result.error })
      const failure = eventLoadFailure(result)
      setLoadFailure(failure)
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

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setShowMap(true))
    return () => task?.cancel?.()
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
      } else if (typeof result.data?.rsvpCount === 'number') {
        // The server's count after the change, as on the RSVP below.
        setGoingCount(result.data.rsvpCount)
      }
    } catch {
      setRsvpStatus(prevStatus)
      H.error()
      notice('Couldn’t update your RSVP', 'Try again.')
    } finally {
      rsvpInFlight.current = false
    }
  }, [id, rsvpStatus])

  const confirmWithdrawRsvp = useCallback(() => {
    const waitlisted = rsvpStatus === 'waitlisted'
    showSheet({
      kind: 'actions',
      title: waitlisted ? 'Leave the waitlist?' : 'Cancel your RSVP?',
      message: waitlisted
        ? "You'll lose your place in line. If you join again later, you go to the back."
        : "You'll come off the list of people going. If it fills up, your place goes to someone else.",
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
          showToast("You're going.", 'success', {
            action: { label: 'Add to calendar', onPress: () => addToCalendar(planned) },
          })
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
    // The text stays from the last try: it is cleared only by a send that went through.
    setShowAnnouncementModal(true)
  }

  // One broadcast per tap, however fast the taps come (`useSingleFlight`).
  const { run: sendAnnouncement, pending: sendingAnnouncement } = useSingleFlight(async () => {
    if (!announcementText.trim()) return
    try {
      const result = await apiClient.sendAnnouncement(String(id), announcementText.trim())
      if (result.success) {
        H.success()
        showToast('Announcement sent.', 'success')
        setShowAnnouncementModal(false)
        setAnnouncementText('')
      } else {
        H.error()
        showToast('Couldn’t send the announcement. Try again.', 'error')
        setShowAnnouncementModal(false)
      }
    } catch {
      H.error()
      showToast('Couldn’t send the announcement. Try again.', 'error')
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
        H.success()
        showToast('Event updated.', 'success')
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
      } else {
        H.error()
        showToast('Couldn’t save your changes. Try again.', 'error')
        setShowEditModal(false)
      }
    } catch {
      H.error()
      showToast('Couldn’t save your changes. Try again.', 'error')
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
                H.error()
                return { ok: false, error: "Couldn't delete the event. Try again." }
              }
            } catch {
              H.error()
              return { ok: false, error: "Couldn't delete the event. Try again." }
            }
            H.success()
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
        message: eventShareText(event)
      })
    } catch {}
  }

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


  /*
   * The check-in is the pass's (Flow 3 Discovery #04–#06, Flow 4): "Blend in"
   * opens this event's VenuePass in the Blend'n overlay, whose hold is the one
   * check-in in the app; outside the fence the server refuses it there ("Not
   * quite there yet"). Once checked in the CTA reads "You're in" and leads to
   * the Room. Back to the tabs first: the overlay is under the root stack.
   */
  const toTheOverlay = (open: () => void) => {
    router.dismissTo('/(tabs)/events')
    open()
  }
  const openThisPass = () =>
    event &&
    toTheOverlay(() =>
      openPass({
        id: String(id),
        title: event.title,
        venue: event.venue_name,
        photo: event.cover_image_url ?? null,
        startsAt: event.start_time,
        endsAt: event.end_time,
        distanceKm: null,
        hereCount: hereNow ?? detailHere ?? 0,
        capacity: null,
        going: rsvpStatus === 'going',
        tasteMatchCount: null,
        goingCount: null,
      })
    )

  /*
   * Nothing after the end is disabled. Every other post-doors state routes
   * through `actionStage`, which is about checking in and is meaningless once
   * the event is over — leaving it in charge here would disable the button for
   * anyone who had checked in, which is precisely everyone `rate` exists for.
   */
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
      toTheOverlay(openBlendn)
      return
    }
    // Before the doors, the button is the RSVP and its own off-switch.
    if (!isCheckedIn && !hasStarted) {
      void handleToggleRsvp()
      return
    }
    if (!isCheckedIn) {
      openThisPass()
      return
    }
    toTheOverlay(openBlendn)
  }


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
  const cancelled = event?.status === 'cancelled'
  const waitlisted = rsvpStatus === 'waitlisted'

  /** The fourth fact: who, now or after the doors, is there. Before them: who said they are coming. */
  const crowd = isEnded
    ? { label: 'ATTENDED', count: checkInCount }
    : isLive
      ? { label: 'HERE NOW', count: hereNow ?? detailHere ?? checkInCount }
      : { label: goingCount > 0 ? 'GOING' : 'INTERESTED', count: goingCount || interestCount }

  // The count means two things either side of the doors: who said they are coming (RSVPs, else saves), then who turned up.
  const attendeeBlock = hasStarted
    ? { label: 'Attendees', count: checkInCount }
    : { label: goingCount > 0 ? 'Going' : 'Interested', count: goingCount || interestCount }

  const ctaState: SceneCTAState = cancelled
    ? 'cancelled'
    : isEnded
      ? (attended ? 'rate' : 'ended')
      : isCheckedIn
        ? 'going'
        : !hasStarted
          ? rsvpCtaState(rsvpStatus)
          : 'join'

  // "I'm going" carries no glyph; "You're going" carries the check (A78).
  const ctaIcon: IconName | null =
    ctaState === 'ended'
      ? 'arrow-up-right'
      : ctaState === 'rsvpd'
        ? 'check'
        : ctaState === 'waitlisted'
          ? 'clock'
          : ctaState === 'rsvp' || ctaState === 'cancelled'
            ? null
            : 'radio'

  /*
   * The hero's words. The badge is the Pulse's date grammar (`cardTime`), so a card and the page it opens never
   * disagree; read off the live window, not the run: on day 2 of a festival the hero says today's doors.
   */
  const heroStart = live?.start_time ?? null
  const when = isEnded ? 'Ended' : isLive ? 'Live' : event ? cardTime(event, now) : ''
  const place = event?.venue_name ? `at ${[event.venue_name, event.city].filter(Boolean).join(', ')}` : ''
  const scarcity = heroPillLabel({
    doorPolicy: event?.door_policy as never,
    maxCapacity: event?.max_capacity,
    currentCapacity: event?.current_capacity,
    goingCount,
  })
  const minAge = event?.min_age ?? null
  const people = isEnded || cancelled ? null : peopleLabel({ here_count: hereNow ?? detailHere, going_count: goingCount }, isLive)
  const pills: ScenePill[] = [
    ...(cancelled ? [{ key: 'cancelled', text: 'Cancelled', white: true }] : scarcity ? [{ key: 'scarcity', text: pillWords(scarcity) }] : []),
    ...(minAge && minAge > MIN_AGE ? [{ key: 'age', text: `${minAge}+` }] : []),
    ...(people ? [{ key: 'people', text: people }] : []),
  ]

  /*
   * The 2 x 2 facts, then the organiser's curated ones (`AmenityGrid`: two up, "+n more" past seven). Doors and
   * Where are always known; the crowd tile waits for a real number; Door says the age floor and the organiser's door.
   */
  const door = [`${minAge ?? MIN_AGE}+`, doorWords(event?.door_policy)].filter(Boolean).join(' · ')
  const tiles: AmenityTileProps[] = [
    ...(heroStart ? [{ label: 'DOORS', value: clockTime(new Date(heroStart).getTime()), mono: true, testID: 'scene-tile-doors' }] : []),
    ...(event?.venue_name
      ? [{ label: 'WHERE', value: [event.venue_name, event.city].filter(Boolean).join(', '), onPress: openInMaps, testID: 'scene-tile-where' }]
      : []),
    ...(printable(crowd.count) !== null ? [{ label: crowd.label, value: String(crowd.count), mono: true, testID: 'scene-tile-crowd' }] : []),
    { label: 'DOOR', value: door, testID: 'scene-tile-door' },
    ...amenities.map((a) => ({ label: a.title.toUpperCase(), value: a.subtitle || 'Included', testID: `scene-tile-${a.id}` })),
  ]

  // The ⋯: report for anyone; the organiser's own three, with Delete last and in red (U-L8).
  const menu: MenuItem[] = [
    ...(isOrganizer
      ? [
          { icon: 'pencil' as const, label: 'Edit event', onPress: openEditComposer },
          { icon: 'megaphone' as const, label: 'Send an announcement', onPress: openAnnouncementComposer },
        ]
      : []),
    { icon: 'flag', label: 'Report this event', onPress: () => showEventReportOptions(event?.title || 'this event', String(id)) },
    ...(isOrganizer ? [{ icon: 'trash' as const, label: 'Delete event', onPress: handleDeleteEvent, destructive: true }] : []),
  ]

  const onFirstLoad = loading && !event
  return (
    <View style={styles.container}>
      {/* First in the tree: Back is the first thing a screen reader reaches. */}
      <SceneBar
        title={event?.title || ''}
        saved={userInterested}
        onBack={goBack}
        onSave={handleToggleInterest}
        onShare={handleShare}
        onMore={() => setMenuOpen(true)}
        scrollY={scrollY}
      />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Room for the dock, and no more: `/event/[id]` is a root stack route, there is no tab bar beneath it.
        contentContainerStyle={{ paddingBottom: ctaDockHeight + SPACE.xl }}
      >
        {/*
          The hero fades in over the skeleton's slot instead of cutting in.
          `skipEntering` means a cached event, which paints the hero first,
          doesn't fade — only the skeleton-to-hero swap does.
        */}
        <LayoutAnimationConfig skipEntering>
          {onFirstLoad ? (
            <SkeletonBlock width="100%" height={sceneHeroHeight()} borderRadius={0} />
          ) : (
            <Animated.View entering={HERO_FADE_IN}>
              <SceneHero
                playlist={playlist}
                source={event?.cover_image_url ? { uri: event.cover_image_url } : undefined}
                title={event?.title || ''}
                when={when}
                struck={cancelled}
                pills={pills}
                place={place}
                onPressMedia={(i) => setLightbox(i)}
                scrollY={scrollY}
              />
            </Animated.View>
          )}
        </LayoutAnimationConfig>

        {/* The warm wash under the hero: the page is the hero's, not a black sheet laid under it. */}
        <PageWash color={VENUE_PLATES.brewery[1]} pointerEvents="none" style={styles.wash} />

        <Animated.View layout={glide} style={styles.content}>
          <OfflineBanner text="Offline. Showing what you had." testID="scene-offline" />
          {cancelled ? <Banner kind="offline" text="Cancelled. The organiser called this one off. Your RSVP is released." testID="scene-cancelled" /> : null}
          {waitlisted && !cancelled ? <Banner kind="paused" text="On the waitlist. You’ll be first in line in the order you joined." testID="scene-waitlisted" /> : null}

          {onFirstLoad ? (
            <View testID="scene-skeleton" accessibilityLabel="Loading the event" accessibilityState={{ busy: true }} style={styles.skeleton}>
              <SkeletonBlock width="60%" height={30} borderRadius={RADIUS.thumb} />
              <View style={styles.skeletonTiles}>
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} width="47%" height={76} borderRadius={RADIUS.rowInCard} />
                ))}
              </View>
            </View>
          ) : (
            <>
              <FadeInUp delay={SECTION_DELAY[0]}>
                <AmenityGrid tiles={tiles} testID="scene-tiles" />
              </FadeInUp>

              {event?.organizer || isLive ? (
                <FadeInUp delay={SECTION_DELAY[0]}>
                  <SceneByline host={event?.organizer} hereNow={isLive ? hereNow ?? detailHere : null} />
                </FadeInUp>
              ) : null}

              {event?.description ? (
                <FadeInUp delay={SECTION_DELAY[1]} style={styles.section}>
                  <SectionHeader title="The experience" />
                  <SceneBody>
                    {highlightEntities(event.description, entities).map((seg, i) =>
                      seg.entity ? <SceneBodyAccent key={i}>{seg.text}</SceneBodyAccent> : seg.text
                    )}
                  </SceneBody>
                </FadeInUp>
              ) : null}

              {/*
                What the organiser actually wrote: house rules, FAQ, accessibility, and the rest. Accessibility is
                the one somebody needs *before* deciding whether they can come. `eventDetailBlocks` has already
                dropped anything malformed, so an empty list means the organiser wrote nothing; wrapped only when
                it draws something, since an empty wrapper still takes a gap.
              */}
              {detailBlocks.length > 0 ? (
                <FadeInUp delay={SECTION_DELAY[2]}>
                  <SceneDetails blocks={detailBlocks} />
                </FadeInUp>
              ) : null}

              {/* Only when there is more than the cover: a "gallery" of one is a heading over the picture already at the top. */}
              {playlist.length > 1 ? (
                <FadeInUp delay={SECTION_DELAY[3]}>
                  <SceneGallery items={playlist} onOpen={(i) => setLightbox(i)} />
                </FadeInUp>
              ) : null}

              {attendeeBlock.count > 0 ? (
                <FadeInUp delay={SECTION_DELAY[3]}>
                  <SceneAttendees count={attendeeBlock.count} label={attendeeBlock.label} seed={event?.id || 'scene'} />
                </FadeInUp>
              ) : null}

              {/*
                The board: going alone, and looking for somebody to go with. Before doors only — after them the room is
                the place, and the board is closed. Reading needs an RSVP or a save; the board itself says so if
                neither. The run's start, not today's session: the server closes the board at the first doors.
                Behind BOARD_ENABLED until the board's safety half ships (lib/board.ts).
              */}
              {event && BOARD_ENABLED && !boardClosed(event.start_time) ? (
                <FadeInUp delay={SECTION_DELAY[3]}>
                  <BoardEntry onPress={() => router.push({ pathname: '/board/[eventId]', params: { eventId: event.id } } as never)} />
                </FadeInUp>
              ) : null}

              {event?.venue_name ? (
                <FadeInUp delay={SECTION_DELAY[3]}>
                  {/* No haptic: it leaves the app, and the Maps hand-off is the feedback. */}
                  <ScalePress pressedScale={0.98} haptic={false} onPress={openInMaps} accessibilityRole="button" accessibilityLabel={`Open ${event.venue_name} in Maps`}>
                    <SceneLocationCard
                      venue={event.venue_name}
                      area={event.address || event.city || ''}
                      map={showMap && event.latitude && event.longitude ? <SceneMap latitude={event.latitude} longitude={event.longitude} /> : null}
                    />
                  </ScalePress>
                </FadeInUp>
              ) : null}

              {/*
                Only on a curated event nobody has claimed, which the server decides. It leaves the app for the public
                claim page on the dashboard host: the app refuses host accounts by design, and that page needs no
                account. Filing there grants nothing until a person reviews it.
              */}
              {claimUrl ? (
                <FadeInUp delay={SECTION_DELAY[3]} style={styles.claim}>
                  <Button
                    kind="tertiary"
                    size="md"
                    icon="external-link"
                    label="Running this event? Claim it"
                    accessibilityHint="Opens the Blend'n dashboard in your browser"
                    onPress={() => openClaimPage(claimUrl)}
                    testID="claim-event-link"
                  />
                </FadeInUp>
              ) : null}
            </>
          )}
        </Animated.View>
      </Animated.ScrollView>

      {/* The dock: a glass bar outside the scroll, so the one action stays where the thumb is. */}
      <Dock floating onHeight={setCtaDockHeight} testID="scene-dock">
        <SceneCTA
          state={ctaState}
          pending={rsvpPending}
          alone={checkInCount <= 1}
          onPress={cancelled ? undefined : primaryActionPress}
          iconKey={ctaIcon ?? undefined}
          icon={ctaIcon ? (color) => <Icon name={ctaIcon} size={SCENE_CTA_ICON} color={color} /> : undefined}
        />
      </Dock>

      <SceneLightbox
        items={playlist}
        initialIndex={lightbox ?? 0}
        visible={lightbox !== null}
        onClose={() => setLightbox(null)}
      />

      {/* The ⋯: Report for anyone; the organiser's Edit, Announce and Delete (their own sheets below). */}
      <OverflowMenu visible={menuOpen} items={menu} onClose={() => setMenuOpen(false)} testID="scene-menu" />

      {/* The announcement composer and the event editor: the app's own Sheet, above the keyboard (components/scene/EventSheets.tsx). */}
      <AnnouncementSheet
        visible={showAnnouncementModal}
        text={announcementText}
        onChangeText={setAnnouncementText}
        sending={sendingAnnouncement}
        onSend={sendAnnouncement}
        onClose={() => setShowAnnouncementModal(false)}
      />
      <EditEventSheet
        visible={showEditModal}
        title={editTitle}
        onChangeTitle={setEditTitle}
        shortDescription={editShortDescription}
        onChangeShortDescription={setEditShortDescription}
        description={editDescription}
        onChangeDescription={setEditDescription}
        saving={savingEdit}
        onSave={saveEventEdit}
        onClose={() => setShowEditModal(false)}
      />
    </View>
  )
}

/** Strictly 18+: an age pill appears only above the floor. */
const MIN_AGE = 18

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  // The warm wash under the hero's foot (PageWash's own 300).
  wash: { position: 'absolute', left: 0, right: 0, top: sceneHeroHeight() - 1, height: PAGE_WASH.height },
  content: { paddingHorizontal: SCENE_PADDING_HORIZONTAL, paddingTop: SPACE.xl, gap: SCENE_SECTION_GAP },
  section: { gap: SPACE.lg },
  claim: { alignSelf: 'flex-start' },
  skeleton: { gap: SPACE.lg },
  skeletonTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  stateBar: { position: 'absolute', left: SPACE.lg, zIndex: 2 },
  stateBody: { flex: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xxxl * 4 },
})
