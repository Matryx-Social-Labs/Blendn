import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { ConnectSheet } from '../grid/ConnectSheet'
import { GridCard, type GridPerson } from '../grid/GridCard'
import { ConnectionSheet } from '../match/ConnectionSheet'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { SkeletonBlock } from '../Skeleton'
import { pickActiveRoom, type CheckinLike } from '../../lib/activeRoom'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import {
  applyGridFilters,
  availableWorkFields,
  emptyReason,
  hasActiveFilters,
  NO_GRID_FILTERS,
  type GridFilters,
} from '../../lib/gridFilters'
import {
  likeStateAfter,
  likeStatusFor,
  shouldSendLike,
  type LikeStatus,
} from '../../lib/likes'
import { Logger } from '../../lib/logger'
import { getBlockedUsers, showUserSafetyActions } from '../../lib/safetyUtils'
import {
  subscribeToEventCheckIn,
  subscribeToEventCheckOut,
  EventCheckInCallback,
  EventCheckOutCallback,
} from '../../lib/socketClient'
import { EMBER, EMBER_FONTS } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { useLiveSync } from '../../lib/useLiveSync'

/**
 * The Grid — the matchmaking roster, once you are checked in. Frame `1141:4951`.
 *
 * ## What this replaced
 *
 * Two sections: **Recommended**, the top five in a horizontal carousel, and
 * **Also Here**, everyone else in a two-column grid of 160pt tiles. The frame
 * has one vertical list.
 *
 * Collapsing them is right — `rankMatches` already orders the roster, so
 * "Recommended" was the head of the same list under a second heading, and the
 * carousel showed two of those five at a time. What it costs is scanning
 * density: at 420pt a card, a room of forty is sixteen screens rather than
 * four. **The filters are what make that acceptable**, which is why they are
 * not a later nicety — you narrow, then read.
 *
 * ## Two actions, and they are not the same thing
 *
 *   Like     private, symmetric, stays pseudonymous
 *   Connect  a message request, and it reveals your name and photo
 *
 * Both are on the card; the profile opens from the card body. See `GridCard`.
 *
 * ## Filtering never becomes a request parameter
 *
 * `workField` is null in rooms below eight people. A server-side filter would
 * narrow on the real column while the response still suppressed it, so one
 * result would name a suppressed attribute by elimination. Filtering the
 * payload the client already holds cannot do that. See `lib/gridFilters.ts`.
 */

interface AttendeeProfile {
  user_id: string
  name?: string
  /**
   * Whole years, derived server-side. Never a birth date.
   *
   * Newly on the roster: it was already public on `/profiles/[userId]` for any
   * authenticated caller, so a card could not say what the profile one tap
   * away said anyway.
   */
  age?: number
  /*
   * `bio` used to be declared here and the roster has never sent it --
   * `MatchCard` carries eight fields and it is not among them. Declaring it
   * made the card look richer than it could ever be, and the age in its own
   * title never rendered for the same reason until now.
   */
  /** The *shared* interests, named, as the server computed them. Not their whole list. */
  interests?: string[]
  /** The shared subset only — "Both here to network". Never their full intent. */
  sharedIntents?: string[]
  /**
   * You are both in this field.
   *
   * `lib/matching.ts` has always computed it — it moves the ranking — and never
   * returned it. "Design" under a name is an attribute; "You both work in
   * Design" is a reason to walk over, from the same fact.
   */
  sharedWorkField?: boolean
  /** A label like "Design". Null in rooms under 8, where it would identify. */
  workField?: string | null
  profile_photos?: string[]
  /**
   * Only ever set by the socket, for somebody who walked in while you were
   * looking. The REST roster does not carry it — `MatchCard` has no such field.
   */
  last_seen?: string
  /** Still physically in the room, per presence. */
  insideNow?: boolean
  /** You already liked them. The reverse is never disclosed. */
  youLiked?: boolean
}

const getDisplayName = (name?: string) => {
  const normalized = String(name || '').trim()
  return normalized.length > 0 ? normalized : 'Guest'
}

export default function Match({
  /**
   * How many people the roster found, reported up.
   *
   * `room.tsx` draws the page heading and the frame's subtitle names the count
   * — "240 Curated Minds at Future Echoes '24". The count is the reason to
   * look, and this screen is the one that fetches it, so it says so rather than
   * the header running a second request for a number already in memory here.
   */
  onRosterCount,
}: { onRosterCount?: (count: number) => void } = {}) {
  const insets = useSafeAreaInsets()
  /*
   * `initialized`, not just `user`.
   *
   * The screen gated on `authUser` alone, so while auth was still restoring
   * from SecureStore it showed the same spinner as a request in flight — and if
   * auth never finished, that spinner was permanent with nothing to explain it.
   * Auth-still-loading and signed-out are different states and need different
   * words.
   */
  const { user: authUser, initialized: authInitialized } = useAuth()
  const [loading, setLoading] = useState(true)
  // Distinct from "no room": something failed and we can say what.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [eventInfo, setEventInfo] = useState<{ id: string; title?: string } | null>(null)
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([])
  const [attendeesHasMore, setAttendeesHasMore] = useState(false)
  const [attendeesPage, setAttendeesPage] = useState(1)
  const [loadingMoreAttendees, setLoadingMoreAttendees] = useState(false)
  const currentEventIdRef = useRef<string | null>(null)

  /*
   * Who you have liked in this room, as far as this session knows.
   *
   * Layered over the server's `youLiked` rather than replacing it — see
   * `likeStatusFor` in `lib/likes.ts` for why local has to win. The map is
   * keyed by user id and deliberately not cleared on refetch; it is cleared
   * when the room changes, because a like belongs to an event.
   */
  const [likeState, setLikeState] = useState<Record<string, LikeStatus>>({})
  const [matchedConversations, setMatchedConversations] = useState<Record<string, string>>({})

  /**
   * Like someone, which is the one thing this screen could not do.
   *
   * Optimistic, because the mechanic only works if liking feels free. The
   * rollback on failure is `undefined` rather than `'none'`: a request can fail
   * after the write landed, so asserting not-liked would offer a like the
   * server already holds.
   *
   * A mutual like opens a conversation server-side for both people at once, so
   * the only thing left to do here is go to it. Nothing is sent to the other
   * person on a one-sided like, and nothing is shown about them — there is no
   * field for it and deliberately so.
   */
  const handleLike = useCallback(async (attendee: AttendeeProfile) => {
    const eventId = currentEventIdRef.current
    if (!eventId) return

    const status = likeStatusFor(attendee.youLiked, likeState[attendee.user_id])

    // Already matched: this tap opens the conversation instead of sending a
    // second like the server would reject.
    if (status === 'matched') {
      const conversationId = matchedConversations[attendee.user_id]
      if (conversationId) {
        router.push({
          pathname: '/private-chat/[conversationId]',
          params: {
            conversationId,
            otherUserName: getDisplayName(attendee.name),
            otherUserId: attendee.user_id,
          } as any,
        })
      }
      return
    }

    if (!shouldSendLike(status)) return

    setLikeState((prev) => ({ ...prev, [attendee.user_id]: 'sending' }))
    try {
      const result = await apiClient.likeAtEvent(eventId, attendee.user_id)
      const next = likeStateAfter({
        ok: !!result.success,
        mutual: result.data?.mutual,
      })
      setLikeState((prev) => {
        const copy = { ...prev }
        if (next === undefined) delete copy[attendee.user_id]
        else copy[attendee.user_id] = next
        return copy
      })

      if (result.success && result.data?.mutual && result.data.conversationId) {
        const conversationId = result.data.conversationId
        setMatchedConversations((prev) => ({ ...prev, [attendee.user_id]: conversationId }))
        /*
         * The moment, as a sheet rather than the frame's full screen.
         *
         * The like mechanic only works if liking feels free -- which is why the
         * handler above is optimistic -- and a full-screen takeover after every
         * mutual makes browsing expensive. A sheet dismisses back to the same
         * scroll position.
         *
         * Both pseudonyms come down with the like (`pseudonyms`), so the sheet
         * paints immediately instead of fetching the conversation first.
         */
        setConnection({
          conversationId,
          userId: attendee.user_id,
          them: result.data.pseudonyms?.them || getDisplayName(attendee.name),
          you: result.data.pseudonyms?.you || 'You',
        })
      }
    } catch (e) {
      Logger.error('match', 'like failed', { error: e })
      setLikeState((prev) => {
        const copy = { ...prev }
        delete copy[attendee.user_id]
        return copy
      })
    }
  }, [likeState, matchedConversations])


  /** The mutual just made, if its sheet is still up. */
  const [connection, setConnection] = useState<{
    conversationId: string
    userId: string
    them: string
    you: string
  } | null>(null)

  /** Client-side, always. See `lib/gridFilters.ts` for why that is not optional. */
  const [filters, setFilters] = useState<GridFilters>(NO_GRID_FILTERS)
  /** Who the request composer is open for, so the disclosure can name them. */
  const [connectTo, setConnectTo] = useState<AttendeeProfile | null>(null)
  const [connectSending, setConnectSending] = useState(false)
  /**
   * Requests already sent this session.
   *
   * Never reset on failure: `@@unique([sender_id, recipient_id])` means a send
   * can fail *because one already exists*, and re-offering the button would
   * invite an attempt that can never succeed.
   */
  const [requested, setRequested] = useState<Record<string, boolean>>({})

  const [newJoinsCount, setNewJoinsCount] = useState(0)
  const { setScrollProgress } = useGradientOverlay()
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslate = useRef(new Animated.Value(8)).current
  const attendeeLoadIdRef = useRef(0)
  const joinPillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventInfoRef = useRef<{ id: string; title?: string } | null>(null)
  /*
   * The loader is `useCallback(..., [])` on purpose — it is handed to
   * `useLiveSync` and to the pull-to-refresh handler, and a changing identity
   * would re-subscribe the poller on every render. So anything it needs from
   * props or state is read through a ref rather than closed over.
   */
  const authUserNameRef = useRef<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  /*
   * Whether *you* are named in this room, and what you would be named.
   *
   * Read from the roster rather than a dedicated endpoint: the check-ins list
   * already returns this user's own row, and there is no GET for per-event
   * preferences. Defaults to anonymous, which is both the server's default and
   * the safe thing to claim if the read fails.
   */
  /*
   * The reveal state moved to `room.tsx`, which renders `RoomVisibilityBanner`
   * above both segments -- being named in the chat is the same exposure as
   * being named here, so one banner serves both. The setters stay because the
   * effect below still writes them; the values are simply read one level up.
   */
  const [, setMyRevealed] = useState(false)
  const [, setMyName] = useState<string | null>(null)
  /*
   * `getSimilarItemLayout` and `getLiftStyle` lived here for the horizontal
   * Recommended carousel. The frame has one vertical list, so both went with it
   * rather than being kept alive by a constant nothing measures.
   */

  useEffect(() => {
    if (loading) {
      contentOpacity.setValue(0)
      contentTranslate.setValue(8)
      return
    }

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslate, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start()
  }, [loading, contentOpacity, contentTranslate])


  useEffect(() => {
    eventInfoRef.current = eventInfo
  }, [eventInfo])

  useEffect(() => {
    authUserNameRef.current = authUser?.name ?? null
  }, [authUser?.name])

  useEffect(() => {
    setNewJoinsCount(0)
  }, [eventInfo?.id])

  useEffect(() => {
    return () => {
      if (joinPillTimerRef.current) {
        clearTimeout(joinPillTimerRef.current)
      }
      if (emptyStateTimerRef.current) {
        clearTimeout(emptyStateTimerRef.current)
      }
    }
  }, [])

  // Real-time check-in/check-out updates via Socket.io
  useEffect(() => {
    if (!authUser || !eventInfo?.id) return

    Logger.debug('match', `Subscribing to event check-ins: ${eventInfo.id}`)

    // Handle when someone checks into the event
    const handleCheckIn: EventCheckInCallback = (data) => {
      if (data.userId === authUser.id) return // Ignore our own check-in

      Logger.debug('match', 'New check-in received', { userId: data.userId, userName: data.userName })

      setAttendees(prev => {
        // Don't add if already in list
        if (prev.some(a => a.user_id === data.userId)) return prev

        // Add new attendee at the beginning
        const newAttendee: AttendeeProfile = {
          user_id: data.userId,
          name: data.userName,
          profile_photos: data.userImage ? [data.userImage] : undefined,
          last_seen: data.checkInTime,
          /*
           * Somebody who just checked in is, by definition, in the room. Without
           * this they arrive as the only card with no presence pin and no
           * "Here now" line — the one person you can be certain about looking
           * like the one you cannot.
           */
          insideNow: true,
        }
        return [newAttendee, ...prev]
      })

      setNewJoinsCount((count) => count + 1)
      if (joinPillTimerRef.current) {
        clearTimeout(joinPillTimerRef.current)
      }
      joinPillTimerRef.current = setTimeout(() => setNewJoinsCount(0), 4000)
    }

    // Handle when someone checks out of the event
    const handleCheckOut: EventCheckOutCallback = (data) => {
      if (data.userId === authUser.id) return // Ignore our own check-out

      Logger.debug('match', 'Check-out received', { userId: data.userId })

      setAttendees(prev => prev.filter(a => a.user_id !== data.userId))
    }

    const unsubCheckIn = subscribeToEventCheckIn(eventInfo.id, handleCheckIn)
    const unsubCheckOut = subscribeToEventCheckOut(eventInfo.id, handleCheckOut)

    return () => {
      Logger.debug('match', 'Cleaning up event subscription')
      unsubCheckIn()
      unsubCheckOut()
      if (joinPillTimerRef.current) {
        clearTimeout(joinPillTimerRef.current)
      }
    }
  }, [authUser, eventInfo?.id])

  const loadActiveEventAndAttendees = useCallback(async (userId: string, force = false) => {
    const loadId = ++attendeeLoadIdRef.current
    // Stale-response guard: a later load has started, so this one's answer is
    // no longer the truth. Bail before touching any state.
    const superseded = () => loadId !== attendeeLoadIdRef.current

    try {
      const activeCheckinsResult = await apiClient.getActiveCheckins({ force })
      if (superseded()) return

      if (!activeCheckinsResult.success || !activeCheckinsResult.data?.checkIns) {
        /*
         * An honest error, not a frozen screen.
         *
         * This used to `return` with the comment "keep previous stable UI on
         * transient failures to avoid flicker". On a warm screen that is
         * reasonable; on a cold start the previous state is nothing at all, so
         * the spinner never stopped. That was the "matchmaking page just keeps
         * loading" report.
         */
        Logger.error('match', 'Error fetching active check-ins', {
          error: activeCheckinsResult.error,
        })
        if (!eventInfoRef.current) {
          setLoadError(activeCheckinsResult.error || 'Could not reach the server.')
        }
        return
      }

      let blockedIds = new Set<string>()
      try {
        const blocked = await getBlockedUsers()
        blockedIds = new Set(blocked.map((b) => b.blocked_id))
      } catch (blockErr) {
        // Not fatal. Showing the room without the block filter is worse than
        // showing it late, but far better than showing nothing.
        Logger.warn('match', 'Failed to load blocked users', { error: blockErr })
      }
      if (superseded()) return

      const outcome = await pickActiveRoom(
        activeCheckinsResult.data.checkIns as CheckinLike[],
        async (eventId) => {
          const r = await apiClient.getEventMatches(eventId, { force, limit: 20 })
          return { success: r.success, error: r.error, matches: r.data?.matches }
        },
        { excludeUserId: userId, isBlocked: (id) => blockedIds.has(id) }
      )
      if (superseded()) return

      if (emptyStateTimerRef.current) {
        clearTimeout(emptyStateTimerRef.current)
        emptyStateTimerRef.current = null
      }

      if (outcome.kind === 'error') {
        Logger.error('match', 'Every active check-in failed to load', {
          message: outcome.message,
        })
        // Same rule: only claim failure if there is nothing good on screen.
        if (!eventInfoRef.current) setLoadError(outcome.message)
        return
      }

      setLoadError(null)

      if (outcome.kind === 'notCheckedIn') {
        const clearRoom = () => {
          currentEventIdRef.current = null
        // A like belongs to an event, so leaving the room drops what this
        // session knew about it. Keeping it would carry one room's hearts onto
        // the next room's cards for anyone who appears in both.
        setLikeState({})
        setMatchedConversations({})
          setEventInfo(null)
          setAttendees([])
          setAttendeesHasMore(false)
          setAttendeesPage(1)
        }

        /*
         * Leaving a room you are visibly in gets a grace period; arriving at
         * "no room" from nothing does not.
         *
         * `/checkins/active` briefly returns an empty list during a check-out
         * round trip and after some sync gaps. Without this, the room vanishes
         * and reappears two seconds later. The delay is kept from the original
         * code for that reason — but it is now scoped to the transition that
         * actually flickers. On a cold start there is nothing to protect, so
         * "Not Checked In Yet" appears immediately rather than after a
         * pointless 2.2s of spinner.
         */
        if (eventInfoRef.current) {
          emptyStateTimerRef.current = setTimeout(clearRoom, 2200)
          return
        }
        clearRoom()
        return
      }

      const attendeeProfiles: AttendeeProfile[] = outcome.attendees.map((m) => ({
        user_id: m.userId,
        name: m.displayName,
        profile_photos: m.photo ? [m.photo] : undefined,
        interests: m.sharedInterests,
        sharedIntents: m.sharedIntents,
        workField: m.workField,
        insideNow: m.insideNow,
        youLiked: m.youLiked,
      }))

      currentEventIdRef.current = outcome.eventId
      setEventInfo({ id: outcome.eventId, title: outcome.eventTitle })
      setMyRevealed(outcome.revealed)
      /*
       * Debris from #67: `setMyName` was declared and never called, so
       * `revealChipLabel(true, myName)` always fell through to its no-name
       * branch and the chip could only ever say "You're visible here" — never
       * "You're visible as Sagar". The name is your own, already in the auth
       * session, and needs no request.
       */
      setMyName(authUserNameRef.current)
      setAttendees(attendeeProfiles)
      setAttendeesHasMore(attendeeProfiles.length >= 20)
      setAttendeesPage(1)
    } catch (e) {
      Logger.error('match', 'Failed to load event attendees', { error: e })
      if (superseded()) return
      if (!eventInfoRef.current) {
        setLoadError(e instanceof Error ? e.message : 'Something went wrong loading the room.')
      }
    }
  }, [])

  /**
   * Fetch a bigger slice rather than a next page.
   *
   * `matches` is ranked, not paginated: page 2 of a ranking is not a stable
   * concept, because the order changes as people arrive, leave and like each
   * other. The endpoint takes a limit (capped server-side at 100) and returns
   * the top N, so "load more" raises N and replaces the list rather than
   * appending a page that might repeat or drop people.
   *
   * This previously called getEventCheckins with page+1, which returned
   * pseudonyms with no photos and in arrival order, not match order.
   */
  const loadMoreAttendees = useCallback(async () => {
    const eventId = currentEventIdRef.current
    if (!eventId || loadingMoreAttendees || !attendeesHasMore) return
    setLoadingMoreAttendees(true)
    try {
      const nextLimit = (attendeesPage + 1) * 20
      const result = await apiClient.getEventMatches(eventId, { force: true, limit: nextLimit })
      if (!result.success || !result.data) return

      const profiles: AttendeeProfile[] = (result.data.matches ?? [])
        .filter((m) => m.userId !== authUser?.id)
        .map((m) => ({
          user_id: m.userId,
          name: m.displayName,
          profile_photos: m.photo ? [m.photo] : undefined,
          interests: m.sharedInterests,
          insideNow: m.insideNow,
          youLiked: m.youLiked,
        }))

      setAttendees(profiles)
      // Fewer back than we asked for means we have reached the end of the room.
      setAttendeesHasMore(profiles.length >= nextLimit)
      setAttendeesPage(attendeesPage + 1)
    } catch (e) {
      Logger.error('match', 'Failed to load more matches', { error: e })
    } finally {
      setLoadingMoreAttendees(false)
    }
  }, [attendeesHasMore, attendeesPage, loadingMoreAttendees, authUser?.id])

  const loadInitialData = useCallback(async () => {
    try {
      if (!authUser) {
        return
      }

      /*
       * The viewer's own interests are no longer fetched here.
       *
       * They existed only to feed the client-side re-sort deleted below, and
       * they were read from `profile.interests` — the **free-text** column that
       * `interest-coverage.ts` exists to warn nobody reads, not the structured
       * graph the ranking actually uses. So this screen was intersecting the
       * server's computed overlap with a legacy list that was usually empty, on
       * every load, to produce a number it then sorted by.
       *
       * One fewer round trip before the room can render, and one fewer reader
       * of a column that is on its way out.
       */
      // Load active event and attendees
      await loadActiveEventAndAttendees(authUser.id, true)
    } catch (e) {
      Logger.error('match', 'Unexpected error during initialization', { error: e })
    } finally {
      setLoading(false)
    }
  }, [authUser, loadActiveEventAndAttendees])

  useEffect(() => {
    if (authUser) {
      loadInitialData()
    }
  }, [authUser, loadInitialData])

  const onPullToRefresh = useCallback(async () => {
    if (!authUser) return
    void Haptics.selectionAsync()
    setRefreshing(true)
    try {
      await loadActiveEventAndAttendees(authUser.id, true)
    } finally {
      setRefreshing(false)
    }
  }, [authUser, loadActiveEventAndAttendees])

  const socketStatus = useLiveSync({
    enabled: !!authUser,
    onSync: async () => {
      if (!authUser) return
      await loadActiveEventAndAttendees(authUser.id, true)
    },
    domains: ['match'],
    connectedIntervalMs: 30000,
    disconnectedIntervalMs: 12000,
    maxDisconnectedIntervalMs: 45000,
  })

  /*
   * The room-probe effect that lived here is gone with the button it fed.
   *
   * It called `getEventChat` on every mount to decide whether an "Open room"
   * control should light up. `room.tsx` owns the chat segment now and resolves
   * the group itself when you switch to it -- so this was a second request for
   * the same fact, on a screen that no longer had anywhere to put the answer.
   */


  const openUserProfile = useCallback(
    (userId: string) => {
      void Haptics.selectionAsync()
      /*
       * The event travels with the id.
       *
       * `event_likes` is keyed on one, so the profile can only offer Like when
       * it knows which room you met in. Opened from a notification or the
       * Banter there is no such context and the button is absent there — which
       * is correct rather than a gap: you cannot like somebody outside the
       * event you shared.
       */
      router.push({
        pathname: '/user/[id]',
        params: { id: userId, ...(eventInfo?.id ? { eventId: eventInfo.id } : {}) } as never,
      })
    },
    [eventInfo?.id]
  )


  const removeAttendeeFromFeed = useCallback((userId: string) => {
    setAttendees((prev) => prev.filter((a) => a.user_id !== userId))
  }, [])

  const onSafetyPress = useCallback(
    (userName: string, userId: string) => {
      showUserSafetyActions(userName || 'User', userId, () => {
        removeAttendeeFromFeed(userId)
      })
    },
    [removeAttendeeFromFeed]
  )


  /*
   * The roster, narrowed. Order is preserved -- `rankMatches` ranked this and a
   * filter must not re-rank it.
   */
  useEffect(() => {
    onRosterCount?.(attendees.length)
  }, [attendees.length, onRosterCount])

  const workFields = useMemo(() => availableWorkFields(attendees), [attendees])
  const shown = useMemo(() => applyGridFilters(attendees, filters), [attendees, filters])
  const empty = emptyReason(attendees.length, shown.length, filters)

  const toPerson = useCallback(
    (a: AttendeeProfile): GridPerson => ({
      userId: a.user_id,
      name: getDisplayName(a.name),
      age: a.age,
      workField: a.workField,
      sharedInterests: a.interests,
      sharedWorkField: a.sharedWorkField,
      photo: a.profile_photos?.[0] ?? null,
      insideNow: a.insideNow,
      liked: likeStatusFor(a.youLiked, likeState[a.user_id]) === 'matched'
        || likeState[a.user_id] === 'liked',
      requested: !!requested[a.user_id],
      pending: likeState[a.user_id] === 'sending',
    }),
    [likeState, requested]
  )

  /*
   * Sending a request, which is the action that reveals you.
   *
   * Optimistic like the like is, and for the same reason -- but it does NOT roll
   * back to "not requested" on failure. `@@unique([sender_id, recipient_id])`
   * means a request can fail *because one already exists*, and offering the
   * button again would invite a second attempt that can never succeed.
   */
  const sendConnect = useCallback(
    async (message: string) => {
      const target = connectTo
      if (!target) return
      setConnectSending(true)
      try {
        const result = await apiClient.createMessageRequest(target.user_id, message)
        if (!result.success) {
          Logger.warn('match', 'connect request failed', { error: result.error })
        }
        setRequested((prev) => ({ ...prev, [target.user_id]: true }))
      } catch (e) {
        Logger.error('match', 'connect request error', { error: e })
        setRequested((prev) => ({ ...prev, [target.user_id]: true }))
      } finally {
        setConnectSending(false)
        setConnectTo(null)
      }
    },
    [connectTo]
  )

  if (!authInitialized || (loading && attendees.length === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <SkeletonBlock key={i} width="100%" height={280} borderRadius={32} />
          ))}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        /*
          Feeds the shared gradient overlay, the same way the Pulse and the
          Banter do. Clamped to 0..1 here rather than in the overlay, so a short
          list that cannot scroll reports 0 instead of a NaN from dividing by a
          zero-height content area.
        */
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          const scrollable = contentSize.height - layoutMeasurement.height
          setScrollProgress(scrollable > 0 ? Math.min(1, Math.max(0, contentOffset.y / scrollable)) : 0)
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullToRefresh}
            tintColor={EMBER.accent}
          />
        }
      >
        {/*
          Frame `1141:4966`. Horizontal, because the number of professions in a
          room is unbounded and a wrapping row would push the first card off the
          screen in a mixed crowd.

          Hidden entirely when there is nothing to filter -- a control that can
          only narrow to nothing is worse than no control.
        */}
        {/*
          Somebody walked in while you were reading. The roster updates itself
          over the socket, so without this the list silently grows under your
          thumb and the new card is indistinguishable from one you scrolled
          past. Clears itself after four seconds -- it is an announcement, not
          a status.
        */}
        {newJoinsCount > 0 ? (
          <View style={styles.joins} accessibilityLiveRegion="polite">
            <Text style={styles.joinsLabel} maxFontSizeMultiplier={1.3}>
              {newJoinsCount} just arrived
            </Text>
          </View>
        ) : null}

        {(workFields.length > 0 || attendees.length > 1) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRail}
            contentContainerStyle={styles.chipRow}
          >
            {/*
              "All" as a chip, not as the absence of a selection. A filter row
              whose off-state is "nothing looks pressed" gives no way to see
              that you are unfiltered and no obvious way back.
            */}
            <Chip
              label="All"
              selected={filters.workFields.length === 0}
              onPress={() => setFilters(NO_GRID_FILTERS)}
            />
            {workFields.map((field) => (
              <Chip
                key={field}
                label={field}
                selected={filters.workFields.includes(field)}
                onPress={() =>
                  setFilters((f) => ({
                    ...f,
                    workFields: f.workFields.includes(field)
                      ? f.workFields.filter((x) => x !== field)
                      : [...f.workFields, field],
                  }))
                }
              />
            ))}
          </ScrollView>
        )}

        {loadError ? (
          /*
           * A failed request and an empty room look identical once the list is
           * empty, and they are not the same thing: one is "nobody is here",
           * the other is "we could not find out". Telling somebody the room is
           * empty when the network dropped is a lie they will act on.
           */
          <View style={styles.empty}>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.4}>
              Could not load the room
            </Text>
            <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
              {loadError}
            </Text>
            <Pressable
              onPress={onPullToRefresh}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Text style={styles.clearLabel}>Try again</Text>
            </Pressable>
          </View>
        ) : empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.4}>
              {empty === 'filtered-out' ? 'Nobody here matches' : 'Nobody here yet'}
            </Text>
            <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
              {empty === 'filtered-out'
                ? 'Try widening the filters — the room has people in it.'
                : 'When people check in, they show up here.'}
            </Text>
            {hasActiveFilters(filters) ? (
              <Pressable
                onPress={() => setFilters(NO_GRID_FILTERS)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
              >
                <Text style={styles.clearLabel}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {shown.map((attendee) => (
              <GridCard
                key={attendee.user_id}
                person={toPerson(attendee)}
                onOpenProfile={() => openUserProfile(attendee.user_id)}
                onLike={() => handleLike(attendee)}
                onConnect={() => setConnectTo(attendee)}
                onSafety={() => onSafetyPress(getDisplayName(attendee.name), attendee.user_id)}
              />
            ))}

            {attendeesHasMore ? (
              <Pressable
                onPress={loadMoreAttendees}
                disabled={loadingMoreAttendees}
                accessibilityRole="button"
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                {loadingMoreAttendees ? (
                  <ActivityIndicator color={EMBER.accent} />
                ) : (
                  <Text style={styles.moreLabel}>Show more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      <RealtimeStatusBanner status={socketStatus} />

      {/*
        The moment a like turns mutual. Both pseudonyms ride down with the like
        response, so this paints without fetching the conversation first.
      */}
      <ConnectionSheet
        visible={!!connection}
        pseudonym={connection?.them ?? ''}
        youPseudonym={connection?.you ?? 'You'}
        onSendMessage={() => {
          const open = connection
          setConnection(null)
          if (!open) return
          router.push({
            pathname: '/private-chat/[conversationId]',
            params: {
              conversationId: open.conversationId,
              otherUserName: open.them,
              otherUserId: open.userId,
            } as never,
          })
        }}
        onDismiss={() => setConnection(null)}
      />

      {/*
        The request composer. `displayName` is whatever the roster calls them --
        the pseudonym until they reveal -- because the sheet's disclosure names
        them, and naming an unrevealed person with a real name is the identity
        gate's mistake made in prose.
      */}
      <ConnectSheet
        visible={!!connectTo}
        displayName={connectTo ? getDisplayName(connectTo.name) : ''}
        theyAreRevealed={!!connectTo?.profile_photos?.length}
        sending={connectSending}
        onSend={sendConnect}
        onDismiss={() => setConnectTo(null)}
      />
    </SafeAreaView>
  )
}

/** One filter chip. Frame `1141:4969`: px24 py8, radius full. */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} filter`}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelOn]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  scroll: { gap: 24, paddingTop: 16 },
  pressed: { opacity: 0.7 },

  chipRail: { marginHorizontal: -12 },
  chipRow: { gap: 8, paddingHorizontal: 24 },
  chip: {
    paddingHorizontal: 24,
    paddingVertical: 9,
    borderRadius: 9999,
    backgroundColor: EMBER.surfaceSunken,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: EMBER.surface, borderColor: EMBER.accent },
  chipLabel: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },
  chipLabelOn: { color: EMBER.accent, fontFamily: EMBER_FONTS.bodyBold },

  // Frame `1141:4977`: 12pt gutter, cards 24 apart.
  list: { paddingHorizontal: 12, gap: 24 },

  more: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 9999,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
  },
  moreLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textPrimary,
  },

  joins: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: EMBER.surface,
  },
  joinsLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    color: EMBER.accent,
  },

  empty: { paddingHorizontal: 24, paddingTop: 48, gap: 8, alignItems: 'flex-start' },
  emptyTitle: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 28,
    color: EMBER.textPrimary,
  },
  emptyBody: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },
  clear: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 9999,
    backgroundColor: EMBER.surface,
  },
  clearLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textPrimary,
  },
})
