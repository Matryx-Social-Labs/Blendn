import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Badge, Overlap } from './aboutYou'
import type { AttendeeProfile } from './attendee'
import { pickActiveRoom, extractEventId, type CheckinLike } from './activeRoom'
import { apiClient } from './apiClient'
import { DOCK_HISTORY, type ChatHistory } from './dockHistory'
import { H } from './haptics'
import { warmAvatars } from './warmAvatars'
import { markRoomJoined, markRoomLeft, rememberRoomMute } from './roomMembership'
import { subscribeCheckInChanged } from './checkIn'
import { likeRefusal, type LikeRefusal } from './likeRefusal'
import { likeStateAfter, likeStatusFor, shouldSendLike, type LikeStatus } from './likes'
import { Logger } from './logger'
import { reasonLine } from './roomMoments'
import {
  applyArrival,
  applyCheckout,
  attendeeFromMatch,
  EMPTY_LIVE,
  seedHereCount,
  withoutPerson,
  withRoster,
  type LiveRoster,
} from './roomLive'
import { ignoreWavesFrom } from './roomWaves'
import { recallRoster, rememberRoster } from './rosterMemory'
import { getBlockedUsers } from './safetyUtils'
import {
  subscribeToEventCheckOut,
  subscribeToEventRoomCheckIn,
  subscribeToRoomMatch,
  type SocketConnectionStatus,
} from './socketClient'
import { useAuth } from './useAuth'
import { useLatest } from './useLatest'
import { useLiveSync } from './useLiveSync'
import { askPushInContext } from './pushAsk'

/**
 * The Room's data: who is here, who just walked in, and what you can do about
 * any of them.
 *
 * Lifted out of `MatchScreen` so the redesigned Room can be drawn against a
 * plain interface while the rules it inherits — each paid for by a bug report
 * — stay exactly as they were:
 *
 * - **Cache on mount, force only when a human asks** (`__tests__/fetchPolicy`).
 *   Mount and sync read the SWR caches; pull-to-refresh, retry and load-more
 *   force.
 * - **Paint the remembered roster the moment the room is known**, never before
 *   (`lib/rosterMemory.ts`) — at mount the room isn't known yet, and painting
 *   the last one would flash somebody else's faces.
 * - **An honest error beats a spinner that never stops**, but only when there
 *   is nothing good on screen to keep (`lib/activeRoom.ts`).
 * - **Leaving a room you are visibly in gets a grace period**; arriving at "no
 *   room" from nothing does not.
 * - **Local like state wins over the roster's `youLiked`** (`lib/likes.ts`),
 *   and a refused like says why without ever mentioning the other person
 *   (`lib/likeRefusal.ts`).
 *
 * Presentation is the caller's: this navigates nowhere and renders nothing. A
 * refused like or wave comes back as its sentence (`lib/likeRefusal.ts`), for
 * the card's one neutral line (R3-D4 4.3) or a toast when no card is open.
 * Waves *to* you are `lib/roomWaves.ts`'s, heard at the tab layout.
 */

export interface RoomPerson {
  id: string
  name: string
  age?: number
  photo: string | null
  interests: string[]
  sharedIntents: string[]
  sharedWorkField: boolean
  workField: string | null
  sharedEvents: number
  sharedPlans: number
  /** Matching v2: shared display lines, their sign chip, their badges (server-budgeted). */
  overlaps: Overlap[]
  sign: string | null
  badges: Badge[]
  insideNow: boolean
  arrivedAt: string | null
  liked: boolean
  matched: boolean
  conversationId: string | null
  requested: boolean
  /** A like is in flight — draw the heart as pressed, but don't allow a second. */
  pending: boolean
  /**
   * `reasonLine` at the time the list was built. "Just walked in" expires
   * after ten minutes, so a screen with its own clock tick should call
   * `reasonLine(person, now)` instead.
   */
  reason: string
  /** For the existing sheets (profile, safety, connect). */
  raw: AttendeeProfile
}



export interface RoomState {
  status: 'loading' | 'none' | 'ready' | 'error'
  /**
   * Ready, and its first count and chat have answered too (or failed): what
   * the Room needs to reveal without a number jumping or the dock arriving
   * late after a check-in's pour (PR #401 drive).
   */
  settled: boolean
  /** The dock's first read of the room chat, fetched with the room so the dock opens on its real last line. */
  chatHistory: ChatHistory | null
  event: { id: string; title: string; startsAt?: string; endsAt?: string } | null
  checkedInAt: string | null
  /**
   * Whether *you* are named in this room — never anyone else's state. From
   * the active check-in, the only place the app can learn it.
   */
  revealed: boolean
  hereCount: number
  /** Server rank order, blocked and removed people filtered out. */
  people: RoomPerson[]
  /** Newest first, arrived this session, at most 8. */
  arrivals: RoomPerson[]
  hasMore: boolean
  loadingMore: boolean
  refreshing: boolean
  /** The room's group chat, resolved once per room; null if it isn't open. */
  chatGroupId: string | null
  /** The mutual just made — from your like, or from theirs over the socket. */
  /**
   * The mutual just made — from your like, or from theirs over the socket.
   * `you` is how *they* see you (your pseudonym unless you revealed), when the
   * like response said; the socket event does not carry it.
   */
  match: { person: RoomPerson | null; name: string; you: string | null; conversationId: string; at: number } | null
  /**
   * Why the room failed to load, when `status` is `error`. For diagnosis: the
   * screen says a fixed sentence and never prints this raw.
   */
  error: string | null
  /** For `RealtimeStatusBanner`. */
  connection: SocketConnectionStatus
}

/** A like's or a wave's answer: what happened, or the sentence that says it didn't. */
export type RoomAnswer<T extends string> = { kind: T } | { kind: 'refused'; refusal: LikeRefusal }

export interface RoomActions {
  refresh(): Promise<void>
  loadMore(): Promise<void>
  retry(): void
  like(id: string): Promise<RoomAnswer<'liked' | 'matched' | 'already'>>
  /** Wave at somebody. "Too soon" is the server's once-per-ten-minutes rule: said as "Waved", never as an error. */
  sendWave(id: string): Promise<RoomAnswer<'sent' | 'too-soon'>>
  connect(id: string, note?: string): Promise<boolean>
  /** After a block or report: gone from every list for the rest of the session. */
  remove(id: string): void
  clearMatch(): void
}

/** The roster is ranked, not paged — see `loadMore`. */
const PAGE = 20

/** See "grace period" above. Kept from MatchScreen, where it was measured. */
const LEAVE_GRACE_MS = 2200

const displayName = (name?: string) => {
  const trimmed = String(name || '').trim()
  return trimmed.length > 0 ? trimmed : 'Guest'
}

type RoomEvent = NonNullable<RoomState['event']>

/** The here count's candidates: the room preview (the server's own "here now"), else the detail's `stats.hereCount` (never who came). */
async function countCandidates(eventId: string, force: boolean): Promise<unknown[]> {
  try {
    const preview = await apiClient.getRoomPreview(eventId, { force })
    if (preview.success && preview.data) return [preview.data.hereCount]
    const detail = await apiClient.getEvent(eventId)
    return [detail.data?.stats?.hereCount]
  } catch (e) {
    Logger.warn('match', 'Could not seed the here count', { error: e })
    return []
  }
}

export function useRoom(): RoomState & RoomActions {
  const { user: authUser, initialized: authInitialized } = useAuth()
  const userId = authUser?.id ?? null

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [event, setEvent] = useState<RoomEvent | null>(null)
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null)
  // Absent reads as anonymous: the server default, and the safe claim.
  const [revealed, setRevealed] = useState(false)
  const [live, setLive] = useState<LiveRoster>(EMPTY_LIVE)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [chatGroupId, setChatGroupId] = useState<string | null>(null)
  /** The room whose first count, and whose chat lookup, have answered. */
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [chatFor, setChatFor] = useState<string | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatHistory | null>(null)
  const [avatarsFor, setAvatarsFor] = useState<string | null>(null)
  /** The chat lookup started with the check-ins read, before the roster: the chat effect takes it over. */
  const chatEarly = useRef<{ eventId: string; result: ReturnType<typeof apiClient.getEventChat> } | null>(null)

  /*
   * Session knowledge about people in this room. All of it belongs to an
   * event — a like is keyed on one — so all of it is dropped when the room
   * changes, or one room's hearts would land on the next room's faces.
   */
  const [likeState, setLikeState] = useState<Record<string, LikeStatus>>({})
  const [conversations, setConversations] = useState<Record<string, string>>({})
  /**
   * Set on a sent request, or on the `CONFLICT` that says one exists:
   * `@@unique([sender_id, recipient_id])` means a request can fail *because
   * one exists*, and re-offering it invites a send that can never succeed.
   * Never on any other failure, which the caller reports (see `connect`).
   */
  const [requested, setRequested] = useState<Record<string, boolean>>({})
  /** Blocked or reported this session. Survives refetches until the next load's block list catches up. */
  const [removed, setRemoved] = useState<Record<string, true>>({})

  const [match, setMatch] = useState<RoomState['match']>(null)

  /*
   * The loader is stable (`useCallback(..., [])`) because `useLiveSync` holds
   * it, so everything it reads from state goes through a ref.
   */
  const eventRef = useRef<RoomEvent | null>(null)
  const liveRef = useRef<LiveRoster>(EMPTY_LIVE)
  const blockedRef = useRef<Set<string>>(new Set())
  const loadIdRef = useRef(0)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Conversations whose match moment has already been shown, so the like response and the socket don't both fire it. */
  const celebratedRef = useRef<Set<string>>(new Set())
  const chatResolvedForRef = useRef<string | null>(null)

  useEffect(() => {
    eventRef.current = event
  }, [event])
  useEffect(() => {
    liveRef.current = live
  }, [live])

  useEffect(
    () => () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    },
    []
  )

  const resetRoomKnowledge = useCallback(() => {
    setLikeState({})
    setConversations({})
    setRequested({})
    setChatGroupId(null)
    chatResolvedForRef.current = null
  }, [])

  /**
   * The count's first value, from whichever source answers.
   *
   * Not awaited by the load: the roster is what the screen is waiting for, and
   * the count can land a beat later. Room preview first because it is the
   * server's own "here now"; an older server 404s it and the event detail's
   * occupancy stands in.
   */
  const seedCount = useCallback(async (eventId: string, force: boolean, loadId: number, early?: Promise<unknown[]>) => {
    const candidates = await (early ?? countCandidates(eventId, force))
    if (loadId !== loadIdRef.current || eventRef.current?.id !== eventId) return
    setSeededFor(eventId)
    setLive((prev) => {
      const hereCount = seedHereCount(candidates, prev.attendees)
      return hereCount === prev.hereCount ? prev : { ...prev, hereCount }
    })
  }, [])

  const load = useCallback(
    /**
     * `leaving` skips the grace period: after a check-out this device made,
     * an empty answer is the truth rather than a round-trip blip.
     */
    async (selfId: string, force = false, leaving = false) => {
      const loadId = ++loadIdRef.current
      // A later load has started, so this one's answer is no longer the truth.
      const superseded = () => loadId !== loadIdRef.current

      try {
        const active = await apiClient.getActiveCheckins({ force })
        if (superseded()) return

        const checkins = (active.data?.checkIns ?? []) as (CheckinLike & {
          checkInTime?: string
          event?: { id?: string; title?: string; startTime?: string; endTime?: string } | null
        })[]

        // First paint: the remembered roster, once we know which room it is.
        const firstId = extractEventId(checkins[0])
        /*
         * The count and the chat, started now rather than after the roster: a
         * check-in's Room is mounted under the pour and revealed once these
         * answer too, so they must not add two more round trips after it.
         */
        const earlyCount = firstId ? countCandidates(firstId, force) : undefined
        if (firstId && chatResolvedForRef.current !== firstId && chatEarly.current?.eventId !== firstId) {
          chatEarly.current = { eventId: firstId, result: apiClient.getEventChat(firstId) }
        }
        const remembered = recallRoster(firstId)
        if (remembered && firstId && liveRef.current.attendees.length === 0) {
          setLive((prev) => withRoster(prev, remembered.attendees, remembered.attendees.length >= PAGE))
          if (!eventRef.current) {
            const first = checkins[0]
            const seeded: RoomEvent = {
              id: firstId,
              title: remembered.eventTitle ?? first?.event?.title ?? '',
              startsAt: first?.event?.startTime,
              endsAt: first?.event?.endTime,
            }
            eventRef.current = seeded
            setEvent(seeded)
          }
        }

        if (!active.success || !active.data?.checkIns) {
          Logger.error('match', 'Error fetching active check-ins', { error: active.error })
          if (!eventRef.current) setLoadError(active.error || "Couldn't reach the server.")
          return
        }

        /*
         * Belt and braces, and no longer load-bearing. The server leaves
         * blocked people out of the roster and out of every room emit, and
         * that filter is the real one. Since SCRUM-371 the room names other
         * people by per-event `rh_` handles while `blocked_id` is a real id,
         * so this set matches nobody on a current server; it only still bites
         * against an older one. Somebody you block from the room is hidden by
         * `removed`, which is keyed on the room's own ids.
         */
        let blocked = new Set<string>()
        try {
          blocked = new Set((await getBlockedUsers()).map((b) => b.blocked_id))
        } catch (blockErr) {
          // Not fatal: the room without the block filter is worse than late,
          // but far better than nothing.
          Logger.warn('match', 'Failed to load blocked users', { error: blockErr })
        }
        if (superseded()) return
        blockedRef.current = blocked

        const outcome = await pickActiveRoom(
          checkins,
          async (eventId) => {
            const r = await apiClient.getEventMatches(eventId, { force, limit: PAGE })
            return { success: r.success, error: r.error, matches: r.data?.matches }
          },
          { excludeUserId: selfId, isBlocked: (id) => blocked.has(id) }
        )
        if (superseded()) return

        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current)
          leaveTimerRef.current = null
        }

        if (outcome.kind === 'error') {
          Logger.error('match', 'Every active check-in failed to load', { message: outcome.message })
          if (!eventRef.current) setLoadError(outcome.message)
          return
        }

        setLoadError(null)

        if (outcome.kind === 'notCheckedIn') {
          const clearRoom = () => {
            eventRef.current = null
            setEvent(null)
            setCheckedInAt(null)
            setRevealed(false)
            setLive(EMPTY_LIVE)
            setPage(1)
            resetRoomKnowledge()
          }
          // `/checkins/active` briefly answers empty during a check-out round
          // trip; without the grace the room vanishes and reappears.
          if (eventRef.current && !leaving) {
            leaveTimerRef.current = setTimeout(clearRoom, LEAVE_GRACE_MS)
            return
          }
          clearRoom()
          return
        }

        const attendees = outcome.attendees.map(attendeeFromMatch)
        const checkin = checkins.find((c) => extractEventId(c) === outcome.eventId)
        const next: RoomEvent = {
          id: outcome.eventId,
          title: outcome.eventTitle ?? checkin?.event?.title ?? '',
          startsAt: checkin?.event?.startTime,
          endsAt: checkin?.event?.endTime,
        }

        const changedRoom = eventRef.current?.id !== outcome.eventId
        if (changedRoom && eventRef.current) resetRoomKnowledge()
        eventRef.current = next
        setEvent((prev) =>
          prev &&
          prev.id === next.id &&
          prev.title === next.title &&
          prev.startsAt === next.startsAt &&
          prev.endsAt === next.endsAt
            ? prev
            : next
        )
        setCheckedInAt(checkin?.checkInTime ? String(checkin.checkInTime) : null)
        setRevealed(outcome.revealed)
        setLive((prev) => withRoster(changedRoom ? EMPTY_LIVE : prev, attendees, attendees.length >= PAGE))
        setPage(1)
        // Memory only — `lib/rosterMemory.ts` says why this never reaches disk.
        rememberRoster(outcome.eventId, attendees, outcome.eventTitle)

        void seedCount(outcome.eventId, force, loadId, outcome.eventId === firstId ? earlyCount : undefined)
        // The faces the Room opens on, decoded before it is revealed (PR #401 drive 2: blank faces filling in).
        const avatarsOf = outcome.eventId
        void warmAvatars(attendees.map((a) => a.profile_photos?.[0])).then(() => {
          if (eventRef.current?.id === avatarsOf) setAvatarsFor(avatarsOf)
        })
      } catch (e) {
        Logger.error('match', 'Failed to load the room', { error: e })
        if (superseded()) return
        if (!eventRef.current) {
          setLoadError(e instanceof Error ? e.message : "Couldn't load the room.")
        }
      }
    },
    [resetRoomKnowledge, seedCount]
  )

  // The first load: cached, so reopening the room paints without a round trip.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    // Inside its effect, the shape React documents for fetching in one.
    const run = async () => {
      try {
        await load(userId)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [userId, load])

  const connection = useLiveSync({
    enabled: !!userId,
    // Not forced: `swr: true` already revalidates behind a cache read.
    onSync: async () => {
      if (userId) await load(userId)
    },
    domains: ['match'],
    connectedIntervalMs: 30000,
    disconnectedIntervalMs: 12000,
    maxDisconnectedIntervalMs: 45000,
  })

  /*
   * Checked in or out on this device — from Tonight, the event screen or the
   * Pulse. The screen stays mounted across the switch, so it has to hear
   * about it rather than wait up to 30s for the poll. Forced: a person just
   * acted, and the matches cache may still hold the room's pre-check-in 403.
   */
  useEffect(() => {
    if (!userId) return
    return subscribeCheckInChanged(() => {
      const run = async () => {
        try {
          await load(userId, true, true)
        } finally {
          setLoading(false)
        }
      }
      void run()
    })
  }, [userId, load])

  const refresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    try {
      // A human asked, so this one forces.
      await load(userId, true)
    } finally {
      setRefreshing(false)
    }
  }, [userId, load])

  const retry = useCallback(() => {
    if (!userId) return
    setLoadError(null)
    setLoading(true)
    void load(userId, true).finally(() => setLoading(false))
  }, [userId, load])

  /**
   * A bigger slice, not a next page: `matches` is a ranking, and page 2 of a
   * ranking that moves as people arrive can repeat or drop people. So this
   * raises the limit (the server caps it at 100) and replaces the list.
   */
  const loadMore = useCallback(async () => {
    const eventId = eventRef.current?.id
    if (!eventId || loadingMore || !liveRef.current.hasMore) return
    setLoadingMore(true)
    try {
      const limit = (page + 1) * PAGE
      const result = await apiClient.getEventMatches(eventId, { force: true, limit })
      if (!result.success || !result.data || eventRef.current?.id !== eventId) return
      const matches = result.data.matches ?? []
      const attendees = matches
        .filter((m) => m.userId !== userId && !blockedRef.current.has(m.userId))
        .map(attendeeFromMatch)
      // Fewer back than asked for means the end of the room.
      setLive((prev) => withRoster(prev, attendees, matches.length >= limit))
      setPage(page + 1)
    } catch (e) {
      Logger.error('match', 'Failed to load more of the room', { error: e })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, page, userId])

  /*
   * Arrivals and departures.
   *
   * The roster room (`event:room:checkin`), not the counter room: it is the
   * one that carries names, and the server refuses it until you've checked in.
   */
  const eventId = event?.id ?? null
  useEffect(() => {
    if (!userId || !eventId) return
    const unsubIn = subscribeToEventRoomCheckIn(eventId, (data) => {
      if (blockedRef.current.has(data.userId)) return
      setLive((prev) => applyArrival(prev, data, userId))
    })
    const unsubOut = subscribeToEventCheckOut(eventId, (data) => {
      setLive((prev) => applyCheckout(prev, data, userId))
    })
    return () => {
      unsubIn()
      unsubOut()
    }
  }, [userId, eventId])

  // The group chat, once per room. Failure is "not open", and a refresh retries.
  useEffect(() => {
    if (!eventId || chatResolvedForRef.current === eventId) return
    chatResolvedForRef.current = eventId
    let cancelled = false
    const early = chatEarly.current?.eventId === eventId ? chatEarly.current.result : null
    chatEarly.current = null
    ;(early ?? apiClient.getEventChat(eventId))
      .then(async (result) => {
        if (cancelled || eventRef.current?.id !== eventId) return
        const id = result.data?.chatGroupId ?? result.data?.id
        if (result.success && id) {
          setChatGroupId(String(id))
          // Served as a member: back in, and the room's mute as the server has it.
          markRoomJoined(String(id))
          rememberRoomMute(String(id), result.data?.mute)
          // The dock's last line, with the room: it never opens on "Nobody has said anything yet" and then changes.
          const history = await apiClient.getChatMessages(String(id), { limit: DOCK_HISTORY }).catch(() => null)
          if (cancelled) return
          setChatHistory({ groupId: String(id), data: history?.success ? history.data : null, failed: !history?.success })
        } else if (result.errorCode === 'LEFT_ROOM' && result.chatGroupId) {
          /*
           * You left this room, and the server no longer rejoins you by
           * reading it. The id still comes back so the chat can open on
           * "You left" with its Rejoin, rather than on "not open yet".
           */
          markRoomLeft(result.chatGroupId)
          setChatGroupId(result.chatGroupId)
        } else {
          chatResolvedForRef.current = null
          setChatGroupId(null)
        }
      })
      .catch((e) => {
        Logger.warn('match', 'Chat group lookup failed', { error: e })
        if (!cancelled) chatResolvedForRef.current = null
      })
      // Answered either way: the Room may reveal (a failed lookup is the dock's "not open", not a wait).
      .finally(() => {
        if (!cancelled) setChatFor(eventId)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, refreshing])

  /* ------------------------------------------------------------------------ */
  /* People                                                                    */
  /* ------------------------------------------------------------------------ */

  const toPerson = useCallback(
    (a: AttendeeProfile): RoomPerson => {
      const status = likeStatusFor(a.youLiked, likeState[a.user_id])
      const arrivedAt = live.arrivedAt[a.user_id] ?? a.last_seen ?? null
      const person: Omit<RoomPerson, 'reason'> = {
        id: a.user_id,
        name: displayName(a.name),
        age: a.age,
        photo: a.profile_photos?.[0] ?? null,
        interests: a.interests ?? [],
        sharedIntents: a.sharedIntents ?? [],
        sharedWorkField: !!a.sharedWorkField,
        workField: a.workField ?? null,
        sharedEvents: a.sharedEvents ?? 0,
        sharedPlans: a.sharedPlans ?? 0,
        overlaps: a.overlaps ?? [],
        sign: a.sign ?? null,
        badges: a.badges ?? [],
        insideNow: a.insideNow !== false,
        arrivedAt,
        liked: status !== 'none',
        matched: status === 'matched',
        conversationId: conversations[a.user_id] ?? null,
        requested: !!requested[a.user_id],
        pending: status === 'sending',
        raw: a,
      }
      return { ...person, reason: reasonLine(person) }
    },
    [likeState, conversations, requested, live.arrivedAt]
  )

  const people = useMemo(
    () => live.attendees.filter((a) => !removed[a.user_id]).map(toPerson),
    [live.attendees, removed, toPerson]
  )
  const arrivals = useMemo(
    () => live.arrivals.filter((a) => !removed[a.user_id]).map(toPerson),
    [live.arrivals, removed, toPerson]
  )

  const findAttendee = useCallback((id: string): AttendeeProfile | null => {
    const l = liveRef.current
    return (
      l.attendees.find((a) => a.user_id === id) ?? l.arrivals.find((a) => a.user_id === id) ?? null
    )
  }, [])

  /* ------------------------------------------------------------------------ */
  /* Actions                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Show the match moment once per conversation, whichever side told us first. */
  const celebrate = useCallback((next: Omit<NonNullable<RoomState['match']>, 'at'>) => {
    if (celebratedRef.current.has(next.conversationId)) return
    celebratedRef.current.add(next.conversationId)
    /*
     * No haptic here. The match moment (`components/ds/MomentMatch.tsx`)
     * fires the success notification on the frame the last heart lands in
     * their face — the beat the animation builds to — and a second one as the
     * overlay rises would spend it early.
     */
    setMatch({ ...next, at: Date.now() })
  }, [])

  /**
   * Like somebody. Optimistic, because liking only works if it feels free.
   *
   * `'already'` covers liked, matched and in-flight alike: a matched person's
   * conversation is on `RoomPerson.conversationId`, and opening it is the
   * caller's navigation to make. A failure clears this session's opinion
   * rather than asserting "not liked" — the write may have landed before the
   * response was lost.
   */
  const like = useCallback(
    async (id: string): Promise<RoomAnswer<'liked' | 'matched' | 'already'>> => {
      const roomId = eventRef.current?.id
      const attendee = findAttendee(id)
      if (!roomId || !attendee) return { kind: 'refused', refusal: likeRefusal('NOT_FOUND', undefined) }

      const status = likeStatusFor(attendee.youLiked, likeState[id])
      if (!shouldSendLike(status)) return { kind: 'already' }

      setLikeState((prev) => ({ ...prev, [id]: 'sending' }))
      const forget = () =>
        setLikeState((prev) => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })

      try {
        const result = await apiClient.likeAtEvent(roomId, id)
        const next = likeStateAfter({ ok: !!result.success, mutual: result.data?.mutual })
        if (next === undefined) forget()
        else setLikeState((prev) => ({ ...prev, [id]: next }))

        if (!result.success) {
          // Never silent, and never about them — see lib/likeRefusal.ts.
          return { kind: 'refused', refusal: likeRefusal(result.errorCode, result.error) }
        }

        const conversationId = result.data?.mutual ? result.data.conversationId : undefined
        if (!conversationId) void askPushInContext('like')
        if (conversationId) {
          setConversations((prev) => ({ ...prev, [id]: conversationId }))
          celebrate({
            person: toPerson(attendee),
            name: result.data?.pseudonyms?.them || displayName(attendee.name),
            you: result.data?.pseudonyms?.you ?? null,
            conversationId,
          })
          return { kind: 'matched' }
        }
        return { kind: 'liked' }
      } catch (e) {
        Logger.error('match', 'like failed', { error: e })
        forget()
        // A throw (timeout, no network) un-fills the heart like a refusal
        // does, so it is said like one — see lib/likeRefusal.ts.
        return { kind: 'refused', refusal: likeRefusal(undefined, undefined) }
      }
    },
    [findAttendee, likeState, celebrate, toPerson]
  )

  /**
   * Wave at somebody. Unlike a like it isn't private — they're told who — so
   * it is never optimistic: nothing claims a wave was sent until it was.
   */
  const sendWave = useCallback(async (id: string): Promise<RoomAnswer<'sent' | 'too-soon'>> => {
    const roomId = eventRef.current?.id
    if (!roomId) return { kind: 'refused', refusal: likeRefusal('NOT_CHECKED_IN', undefined) }
    // Only someone on the roster, as `like`: never a removed person, never an id from elsewhere.
    if (!findAttendee(id)) return { kind: 'refused', refusal: likeRefusal('NOT_FOUND', undefined) }
    try {
      const result = await apiClient.sendWave(roomId, id)
      // No haptic on sending a wave: the hand's wiggle is the answer (ROUND3 #51).
      if (result.success) return { kind: 'sent' }
      if (result.errorCode === 'WAVE_TOO_SOON') return { kind: 'too-soon' }
      return { kind: 'refused', refusal: likeRefusal(result.errorCode, result.error) }
    } catch (e) {
      Logger.error('match', 'wave failed', { error: e })
      return { kind: 'refused', refusal: likeRefusal(undefined, undefined) }
    }
  }, [findAttendee])

  /**
   * A message request — the action that reveals you.
   *
   * Marked requested only when the ask stands: a new request, or a `CONFLICT`
   * saying one already exists between you (`@@unique` above — re-offering it
   * invites a send that can never succeed). Anything else — offline, refused,
   * a 500 — leaves the button offered, and `false` lets the caller say so;
   * it used to mark every failure "Request sent". The haptic is success-only.
   */
  const connect = useCallback(async (id: string, note?: string): Promise<boolean> => {
    try {
      const result = await apiClient.createMessageRequest(id, note)
      if (result.success) {
        H.success()
      } else {
        Logger.warn('match', 'connect request failed', { error: result.error, code: result.errorCode })
      }
      const stands = !!result.success || result.errorCode === 'CONFLICT'
      if (stands) setRequested((prev) => ({ ...prev, [id]: true }))
      return stands
    } catch (e) {
      Logger.error('match', 'connect request error', { error: e })
      return false
    }
  }, [])

  const remove = useCallback((id: string) => {
    setRemoved((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
    setLive((prev) => withoutPerson(prev, id))
    // Their waves too: heard at the tab layout now, so told here.
    ignoreWavesFrom(id)
  }, [])

  /*
   * The other side of a mutual. The liker learns it from the like response;
   * the person who liked first learns it here, while they're looking.
   */
  const toPersonRef = useLatest(toPerson)
  useEffect(() => {
    if (!userId) return
    return subscribeToRoomMatch((data) => {
      if (data.eventId === eventRef.current?.id) {
        setLikeState((prev) => ({ ...prev, [data.otherUserId]: 'matched' }))
        setConversations((prev) => ({ ...prev, [data.otherUserId]: data.conversationId }))
      }
      const attendee = findAttendee(data.otherUserId)
      celebrate({
        person: attendee ? toPersonRef.current(attendee) : null,
        name: data.name || displayName(attendee?.name),
        you: null,
        conversationId: data.conversationId,
      })
    })
  }, [userId, findAttendee, celebrate, toPersonRef])

  const clearMatch = useCallback(() => setMatch(null), [])

  /*
   * Auth still restoring is "loading", not "none": signed-out and
   * not-yet-known need different words, and a room shown as empty while auth
   * restores is a claim the screen can't back.
   */
  const status: RoomState['status'] = !authInitialized
    ? 'loading'
    : event
      ? 'ready'
      : loadError
        ? 'error'
        : loading && userId
          ? 'loading'
          : 'none'

  return {
    status,
    settled: status === 'ready' && !!event && seededFor === event.id && chatFor === event.id && avatarsFor === event.id,
    chatHistory,
    event,
    checkedInAt,
    revealed,
    hereCount: live.hereCount,
    people,
    arrivals,
    hasMore: live.hasMore,
    loadingMore,
    refreshing,
    chatGroupId,
    match,
    error: loadError,
    connection,
    refresh,
    loadMore,
    retry,
    like,
    sendWave,
    connect,
    remove,
    clearMatch,
  }
}
