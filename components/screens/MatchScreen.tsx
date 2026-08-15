import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import OptimizedImage from '../OptimizedImage'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { SkeletonBlock } from '../Skeleton'
import { pickActiveRoom, type CheckinLike } from '../../lib/activeRoom'
import {
  likeAccessibilityLabel,
  likeStateAfter,
  likeStatusFor,
  shouldSendLike,
  type LikeStatus,
} from '../../lib/likes'
import { intentSentence, matchBand, matchBandLabel, sharedInterestSentence } from '../../lib/matchBand'
import { revealChipLabel } from '../../lib/reveal'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { getBlockedUsers, showUserSafetyActions } from '../../lib/safetyUtils'
import { useAuth } from '../../lib/useAuth'
import {
  subscribeToEventCheckIn,
  subscribeToEventCheckOut,
  EventCheckInCallback,
  EventCheckOutCallback
} from '../../lib/socketClient'
import { useLiveSync } from '../../lib/useLiveSync'
import { APP_COLORS, EMBER } from '../../lib/theme'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')

// Memoized card components to prevent re-renders
/**
 * The button that was missing.
 *
 * Sits on the card rather than behind "View dossier", because the mechanic only
 * works if liking is cheaper than deciding — a like that costs a screen
 * transition is one people ration, and rationing is the hesitation the product
 * exists to remove.
 *
 * Four states and no spinner. `sending` dims the heart it has already filled in
 * rather than replacing it, so the thing you just chose stays on screen for the
 * length of the round trip. A spinner here reads as "did that work?" on exactly
 * the tap that must feel free.
 */
const LikeButton = memo(({
  name,
  status,
  onPress,
  size,
}: {
  name: string
  status: LikeStatus
  onPress: () => void
  size: number
}) => {
  const matched = status === 'matched'
  const liked = status === 'liked' || status === 'sending'
  return (
    <TouchableOpacity
      style={[
        styles.likeButton,
        { width: size, height: size, borderRadius: size / 2 },
        (liked || matched) && styles.likeButtonOn,
        status === 'sending' && styles.likeButtonSending,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: liked || matched, busy: status === 'sending' }}
      accessibilityLabel={likeAccessibilityLabel(name, status)}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <Ionicons
        name={matched ? 'chatbubble' : liked ? 'heart' : 'heart-outline'}
        size={Math.round(size * 0.45)}
        color={matched || liked ? EMBER.onGradientChip : '#FFFFFF'}
      />
    </TouchableOpacity>
  )
})

LikeButton.displayName = 'LikeButton'

const SimilarCard = memo(({
  attendee,
  onOpenProfile,
  onSafetyPress,
  reasonLabel,
  likeStatus,
  onLike,
}: {
  attendee: AttendeeProfile
  onOpenProfile: () => void
  onSafetyPress: () => void
  reasonLabel?: string
  likeStatus: LikeStatus
  onLike: () => void
}) => {
  const rawUrl = attendee.profile_photos?.[0] || ''

  const formatTimeAgo = (iso?: string) => {
    if (!iso) return ''
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.max(0, Math.floor(diffMs / 60000))
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} mins ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <View style={styles.similarCardWrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.similarCard}
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`Open ${getDisplayName(attendee.name)} profile`}
      >
        {rawUrl ? (
          <OptimizedImage
            source={rawUrl as any}
            style={styles.similarImage as any}
            contentFit="cover"
            width={SIMILAR_CARD_WIDTH}
            height={SIMILAR_CARD_HEIGHT}
            quality={70}
          />
        ) : (
          <Image source={placeholderImg} style={styles.similarImage} contentFit="cover" />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
          style={styles.similarGradient}
        />
        <View style={styles.similarInfo}>
          <Text style={styles.similarName} numberOfLines={1}>
            {getDisplayName(attendee.name)}{attendee.age ? `, ${attendee.age}` : ''}
          </Text>
          {!!reasonLabel && (
            <View style={styles.reasonPill}>
              <Text style={styles.reasonPillText} numberOfLines={1}>{reasonLabel}</Text>
            </View>
          )}
          <View style={styles.timeChip}>
            <Text style={styles.timeChipText}>{attendeePresenceLabel(attendee, formatTimeAgo)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cardSafety}
          onPress={onSafetyPress}
          accessibilityRole="button"
          accessibilityLabel={`Safety options for ${getDisplayName(attendee.name)}`}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#FFFFFF" />
        </TouchableOpacity>
        <LikeButton
          name={getDisplayName(attendee.name)}
          status={likeStatus}
          onPress={onLike}
          size={40}
        />
      </TouchableOpacity>
    </View>
  )
})

SimilarCard.displayName = 'SimilarCard'


const StartupItem = memo(({
  attendee,
  onOpenProfile,
  onSafetyPress,
  isRightColumn,
  statusLabel,
  likeStatus,
  onLike,
}: {
  attendee: AttendeeProfile
  onOpenProfile: () => void
  onSafetyPress: () => void
  isRightColumn?: boolean
  statusLabel?: string
  likeStatus: LikeStatus
  onLike: () => void
}) => {
  const rawUrl = attendee.profile_photos?.[0] || ''
  const cardWidth = GRID_ITEM_WIDTH
  const cardHeight = GRID_ITEM_HEIGHT

  const formatTimeAgo = (iso?: string) => {
    if (!iso) return ''
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.max(0, Math.floor(diffMs / 60000))
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} mins ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <View
      style={[
        styles.gridItem,
        { width: cardWidth, height: cardHeight, marginRight: isRightColumn ? 0 : GRID_GAP },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.gridTouch}
        onPress={onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel={`Open ${getDisplayName(attendee.name)} profile`}
      >
        {rawUrl ? (
          <OptimizedImage
            source={rawUrl as any}
            style={styles.gridImage as any}
            contentFit="cover"
            width={cardWidth}
            height={cardHeight}
            quality={60}
          />
        ) : (
          <Image source={placeholderImg} style={styles.gridImage} contentFit="cover" />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.gridGradient} />
        <View style={styles.gridInfo}>
          <Text style={styles.gridName} numberOfLines={1}>{getDisplayName(attendee.name)}{attendee.age ? `, ${attendee.age}` : ''}</Text>
          {!!statusLabel && (
            <View style={styles.gridStatusPill}>
              <Text style={styles.gridStatusPillText} numberOfLines={1}>{statusLabel}</Text>
            </View>
          )}
          <View style={[styles.timeChip, styles.timeChipCompact]}>
            <Text style={styles.timeChipText}>{attendeePresenceLabel(attendee, formatTimeAgo)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.gridSafety}
          onPress={onSafetyPress}
          accessibilityRole="button"
          accessibilityLabel={`Safety options for ${getDisplayName(attendee.name)}`}
        >
          <Ionicons name="ellipsis-horizontal" size={14} color="#FFFFFF" />
        </TouchableOpacity>
        <LikeButton
          name={getDisplayName(attendee.name)}
          status={likeStatus}
          onPress={onLike}
          size={34}
        />
      </TouchableOpacity>
    </View>
  )
})

StartupItem.displayName = 'StartupItem'
// Figma base frame width for iPhone 16
const BASE_FRAME_WIDTH = 393

// Similar Interests cards are 163x260 at 393 width
const SIMILAR_CARD_WIDTH = Math.round(width * (163 / BASE_FRAME_WIDTH))
const SIMILAR_CARD_HEIGHT = Math.round(SIMILAR_CARD_WIDTH * (260 / 163))

// Content spacing + grid sizing (2 columns)
const CONTENT_SIDE_PADDING = 18
const GRID_GAP = 12
const gridContentWidth = Math.max(0, width - CONTENT_SIDE_PADDING * 2)
const GRID_ITEM_WIDTH = Math.floor((gridContentWidth - GRID_GAP) / 2)
const GRID_ITEM_HEIGHT = 160

/**
 * A person in the room, as the MATCH endpoint describes them.
 *
 * `name` is a pseudonym unless they revealed for this event, and
 * `profile_photos` is empty unless they did. That rule is enforced server-side
 * inside `rankMatches`, not here, so no screen can forget it.
 *
 * `interests` are shared-interest NAMES, already intersected with yours by the
 * server -- "you both picked Techno and Board games" is the whole card. It is
 * not their full interest list.
 */
interface AttendeeProfile {
  user_id: string
  name?: string
  age?: number
  bio?: string
  /** The *shared* interests, named, as the server computed them. Not their whole list. */
  interests?: string[]
  /** The shared subset only — "Both here to network". Never their full intent. */
  sharedIntents?: string[]
  /** A label like "Design". Null in rooms under 8, where it would identify. */
  workField?: string | null
  profile_photos?: string[]
  last_seen?: string
  /** Still physically in the room, per presence. */
  insideNow?: boolean
  /** You already liked them. The reverse is never disclosed. */
  youLiked?: boolean
}

/**
 * What the chip on a match card says.
 *
 * "Still here" beats "checked in 40 mins ago" on this screen, because the
 * question the user is actually asking is whether they can walk over now.
 *
 * Match cards carry `insideNow` from presence but no check-in time, so the old
 * time chip rendered empty against the match endpoint. Attendees added live
 * over the socket still carry a timestamp and nothing else, so both are
 * handled here rather than at two call sites that could drift.
 */
function attendeePresenceLabel(
  attendee: { insideNow?: boolean; last_seen?: string },
  formatTimeAgo: (iso?: string) => string
): string {
  if (attendee.insideNow === true) return 'Still here'
  if (attendee.insideNow === false) return ''
  return formatTimeAgo(attendee.last_seen)
}

interface RecommendedEntry {
  attendee: AttendeeProfile
  reasonLabel: string
}

type EventRoomStatus = 'idle' | 'checking' | 'available' | 'unavailable'

/*
 * `parseTimestamp` and `extractEventIdFromCheckin` moved to `lib/activeRoom.ts`
 * along with the loop that used them. They were untestable here — the suite has
 * no React Native testing library, so nothing inside a component file is
 * reachable from a test, and the loop shipped a bug that abandoned every
 * remaining check-in after one failure.
 */

const getDisplayName = (name?: string) => {
  const normalized = String(name || '').trim()
  return normalized.length > 0 ? normalized : 'Guest'
}

export default function Match() {
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


  const [newJoinsCount, setNewJoinsCount] = useState(0)
  const { setScrollProgress } = useGradientOverlay()
  const [similarIndex, setSimilarIndex] = useState(0)
  const lastSimilarIndex = useRef(0)
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslate = useRef(new Animated.Value(8)).current
  const similarScrollX = useRef(new Animated.Value(0)).current
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
  const [openRoomPending, setOpenRoomPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [eventRoomStatus, setEventRoomStatus] = useState<EventRoomStatus>('idle')
  const [eventRoomId, setEventRoomId] = useState<string | null>(null)
  /*
   * Whether *you* are named in this room, and what you would be named.
   *
   * Read from the roster rather than a dedicated endpoint: the check-ins list
   * already returns this user's own row, and there is no GET for per-event
   * preferences. Defaults to anonymous, which is both the server's default and
   * the safe thing to claim if the read fails.
   */
  const [myRevealed, setMyRevealed] = useState(false)
  const [myName, setMyName] = useState<string | null>(null)
  const getSimilarItemLayout = useCallback(
    /*
     * `unknown` because this reads nothing but `index` — every row is the same
     * fixed width. Naming one row type made the helper unusable on the other
     * two lists that have identical geometry: the skeleton list of numbers and
     * the recommended list. Three call sites, one measurement, no data.
     */
    (_: ArrayLike<unknown> | null | undefined, index: number) => ({
      length: SIMILAR_CARD_WIDTH + 16,
      offset: (SIMILAR_CARD_WIDTH + 16) * index,
      index,
    }),
    []
  )

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

  const getLiftStyle = useCallback(
    (index: number) => {
      const cardSpan = SIMILAR_CARD_WIDTH + 16
      const inputRange = [(index - 1) * cardSpan, index * cardSpan, (index + 1) * cardSpan]
      const scale = similarScrollX.interpolate({
        inputRange,
        outputRange: [0.98, 1, 0.98],
        extrapolate: 'clamp',
      })
      const translateY = similarScrollX.interpolate({
        inputRange,
        outputRange: [2, 0, 2],
        extrapolate: 'clamp',
      })

      return { transform: [{ translateY }, { scale }] }
    },
    [similarScrollX]
  )

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

  useEffect(() => {
    let mounted = true
    const resolveRoom = async () => {
      if (!eventInfo?.id) {
        if (!mounted) return
        setEventRoomStatus('idle')
        setEventRoomId(null)
        return
      }
      setEventRoomStatus('checking')
      try {
        const result = await apiClient.getEventChat(eventInfo.id)
        if (!mounted) return
        if (result.success && result.data?.chatGroupId) {
          setEventRoomStatus('available')
          setEventRoomId(String(result.data.chatGroupId))
        } else {
          setEventRoomStatus('unavailable')
          setEventRoomId(null)
        }
      } catch {
        if (!mounted) return
        setEventRoomStatus('unavailable')
        setEventRoomId(null)
      }
    }
    resolveRoom()
    return () => {
      mounted = false
    }
  }, [eventInfo?.id])

  const openEventRoom = useCallback(async () => {
    if (!eventInfo?.id) return
    if (eventRoomStatus !== 'available') return
    void Haptics.selectionAsync()
    if (eventRoomId) {
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: eventRoomId,
          roomName: eventInfo.title || 'Event Chat',
          eventTitle: eventInfo.title || 'Event',
        } as any,
      })
      return
    }
    if (openRoomPending) return
    setOpenRoomPending(true)
    try {
      const result = await apiClient.getEventChat(eventInfo.id)
      if (result.success && result.data?.chatGroupId) {
        setEventRoomStatus('available')
        setEventRoomId(String(result.data.chatGroupId))
        router.push({
          pathname: '/chat/[id]',
          params: {
            id: String(result.data.chatGroupId),
            roomName: result.data.chatGroupName || eventInfo.title || 'Event Chat',
            eventTitle: eventInfo.title || 'Event',
          } as any,
        })
      } else {
        setEventRoomStatus('unavailable')
        setEventRoomId(null)
      }
    } catch {
      setEventRoomStatus('unavailable')
      setEventRoomId(null)
    } finally {
      setOpenRoomPending(false)
    }
  }, [eventInfo?.id, eventInfo?.title, eventRoomId, eventRoomStatus, openRoomPending])

  const openUserProfile = useCallback((userId: string) => {
    void Haptics.selectionAsync()
    router.push({ pathname: '/user/[id]', params: { id: userId } as any })
  }, [])

  const onBrowseEvents = useCallback(() => {
    void Haptics.selectionAsync()
    router.push('/(tabs)/events' as any)
  }, [])

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

  const onHeaderRefreshPress = useCallback(async () => {
    if (!authUser) return
    void Haptics.selectionAsync()
    await loadActiveEventAndAttendees(authUser.id, true)
  }, [authUser, loadActiveEventAndAttendees])

  const recommendedEntries = useMemo(() => {
    /*
     * The server's order, kept.
     *
     * This used to re-sort with a local score, and every term in it was wrong:
     *
     *   points += shared * 12
     *   if (attendee.bio) points += 6
     *   if (attendee.profile_photos?.length) points += 8      // <- the bad one
     *   points += max(0, 30 - minutesSince(last_seen) / 30)
     *
     * **The photo term promoted people who had revealed themselves.** A photo
     * only reaches the client when `revealed` is true — the ranking nulls it
     * otherwise — so `+8 for having a photo` is `+8 for not being anonymous`,
     * in the one screen whose entire premise is that staying anonymous costs
     * you nothing. It quietly inverted rule 2.
     *
     * The `last_seen` term scored zero for everyone, because the match card has
     * never carried that field. And `shared * 12` recomputed an overlap the
     * server had already computed, by lowercasing names and intersecting them —
     * so it double-counted, and produced a different answer whenever a category
     * name did not survive the round trip identically.
     *
     * Meanwhile the real ranking — IDF-weighted rarity, so two people who both
     * picked "Modular synths" outrank two who both picked "Music", plus intent,
     * presence and arrival recency — was being thrown away four lines after it
     * arrived. The comment at the fetch site already said "no client-side
     * sort"; this is the place that was doing it anyway.
     *
     * `slice(0, 5)` stays: the top of the list is a shelf, not the whole room.
     */
    return attendees.slice(0, 5).map((attendee): RecommendedEntry => {
      /*
       * `interests` is the *shared* set, already computed by the server, so its
       * length is the count — no intersection needed, and no chance of
       * disagreeing with what the sentence below says.
       */
      const shared = attendee.interests ?? []
      const band = matchBand({ sharedInterests: shared, sharedIntents: attendee.sharedIntents ?? [] })

      /*
       * What the card actually says, in order of how much it tells you:
       *
       *  1. the overlap, named        — "You both picked Techno and Board games"
       *  2. the shared intent         — "Both here to network"
       *  3. their field of work       — "Works in design"
       *  4. the band                  — "Worth saying hello"
       *
       * The old fallback was `'Popular nearby'`, which was a fabrication: it
       * fired whenever there was no overlap *and* `last_seen` was stale, and
       * `last_seen` is never populated — so it fired on every card with nothing
       * in common, claiming a popularity the app does not measure. The band is
       * the honest version, and `matchBandLabel('some')` is deliberately
       * "Worth saying hello" rather than anything that reads as a failure.
       */
      const reasonLabel =
        sharedInterestSentence({ sharedInterests: shared }) ??
        intentSentence(attendee.sharedIntents) ??
        (attendee.workField ? `Works in ${attendee.workField}` : null) ??
        matchBandLabel(band)

      return { attendee, reasonLabel }
    })
  }, [attendees])

  const recommendedIds = useMemo(
    () => new Set(recommendedEntries.map((entry) => entry.attendee.user_id)),
    [recommendedEntries]
  )

  const alsoHereAttendees = useMemo(
    () => attendees.filter((a) => !recommendedIds.has(a.user_id)).slice(0, 12),
    [attendees, recommendedIds]
  )

  const recommendedKeyExtractor = useCallback((entry: RecommendedEntry) => `similar_${entry.attendee.user_id}`, [])
  const alsoHereKeyExtractor = useCallback((attendee: AttendeeProfile) => `grid_${attendee.user_id}`, [])

  const renderRecommendedItem = useCallback(
    ({ item, index }: { item: RecommendedEntry; index: number }) => (
      <Animated.View style={getLiftStyle(index)}>
        <SimilarCard
          attendee={item.attendee}
          reasonLabel={item.reasonLabel}
          onSafetyPress={() => onSafetyPress(item.attendee.name || 'User', item.attendee.user_id)}
          onOpenProfile={() => openUserProfile(item.attendee.user_id)}
          likeStatus={likeStatusFor(item.attendee.youLiked, likeState[item.attendee.user_id])}
          onLike={() => handleLike(item.attendee)}
        />
      </Animated.View>
    ),
    [getLiftStyle, onSafetyPress, openUserProfile, likeState, handleLike]
  )

  const renderAlsoHereItem = useCallback(
    ({ item: attendee, index }: { item: AttendeeProfile; index: number }) => (
      <StartupItem
        attendee={attendee}
        statusLabel="Here now"
        onSafetyPress={() => onSafetyPress(attendee.name || 'User', attendee.user_id)}
        onOpenProfile={() => openUserProfile(attendee.user_id)}
        isRightColumn={(index + 1) % 2 === 0}
        likeStatus={likeStatusFor(attendee.youLiked, likeState[attendee.user_id])}
        onLike={() => handleLike(attendee)}
      />
    ),
    [onSafetyPress, openUserProfile, likeState, handleLike]
  )

  /**
   * Four states, four answers.
   *
   * This rendered "Not Checked In Yet" for every one of them — including to
   * somebody standing in the venue whose request had just failed. Each branch
   * below is a different thing to tell the user and a different next action.
   */
  const renderEmptyState = useCallback(() => {
    if (!authInitialized) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={APP_COLORS.textTertiary} />
        </View>
      )
    }

    if (!authUser) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyGlyph}>
            <Ionicons name="person-outline" size={40} color={APP_COLORS.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Sign in to see the room</Text>
          <Text style={styles.emptyText}>
            Matches are tied to the event you are checked in to.
          </Text>
        </View>
      )
    }

    if (loadError) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyGlyph}>
            <Ionicons name="cloud-offline-outline" size={40} color={APP_COLORS.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Could not load the room</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <TouchableOpacity
            style={styles.eventsButton}
            onPress={onPullToRefresh}
            accessibilityRole="button"
          >
            <Text style={styles.eventsButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyGlyph}>
          <Ionicons name="location-outline" size={40} color={APP_COLORS.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>Not Checked In Yet</Text>
        <Text style={styles.emptyText}>
          Check in to an event to unlock recommendations and nearby attendees.
        </Text>
        <TouchableOpacity style={styles.eventsButton} onPress={onBrowseEvents}>
          <Text style={styles.eventsButtonText}>Browse Events</Text>
        </TouchableOpacity>
      </View>
    )
  }, [authInitialized, authUser, loadError, onBrowseEvents, onPullToRefresh])

  /*
   * Auth still restoring counts as loading. Otherwise the screen flashes
   * "Sign in to see the room" at somebody who is signed in, every cold start,
   * for as long as SecureStore takes.
   */
  const isLoading = loading || !authInitialized

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
        onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 320)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullToRefresh}
            tintColor="#FFFFFF"
            progressBackgroundColor={APP_COLORS.backgroundElevated}
          />
        }
      >
        <View style={[styles.headerGradient, { paddingTop: insets.top }]}>
          <LinearGradient
            colors={['#111214', APP_COLORS.backgroundBase]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitleText}>Blend&apos;n Match</Text>
            </View>
            <TouchableOpacity
              style={styles.headerRight}
              onPress={onHeaderRefreshPress}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
            >
              <Ionicons name="refresh" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/*
          * Your own state, in the room, at a glance.
          *
          * Not who else has revealed — that turns a personal choice into a
          * count and makes the last holdout visible, which
          * `PLACEHOLDER_SCREENS.md` rules out. But a person is entitled to know
          * whether the room can currently see their name, and not knowing is
          * the state that makes people close the app.
          *
          * Tapping opens the per-event screen, carrying the current value so it
          * does not have to be fetched to be shown correctly.
          */}
        {!!eventInfo && (
          <TouchableOpacity
            style={styles.revealChip}
            onPress={() =>
              router.push({
                pathname: '/event-preferences/[eventId]',
                params: { eventId: eventInfo.id, revealed: myRevealed ? '1' : '0' },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={revealChipLabel(myRevealed, myName)}
          >
            <Ionicons
              name={myRevealed ? 'eye-outline' : 'eye-off-outline'}
              size={14}
              color={APP_COLORS.textSecondary}
            />
            <Text style={styles.revealChipText} numberOfLines={1}>
              {revealChipLabel(myRevealed, myName)}
            </Text>
          </TouchableOpacity>
        )}

        <RealtimeStatusBanner status={socketStatus} style={styles.socketBanner} />
        {newJoinsCount > 0 && !!eventInfo && (
          <View style={styles.newJoinsPill}>
            <View style={styles.newJoinsDot} />
            <Text style={styles.newJoinsText}>
              {newJoinsCount} new {newJoinsCount === 1 ? 'person' : 'people'} joined
            </Text>
          </View>
        )}

        {!!eventInfo && (
          <View style={styles.liveRow}>
            <View style={styles.liveTextWrap}>
              <View style={styles.liveLabelRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>Live at</Text>
              </View>
              <Text style={styles.liveTitle} numberOfLines={1}>
                {eventInfo.title || 'Current Event'}
              </Text>
              <View style={styles.liveMetaRow}>
                <View style={styles.liveCountPill}>
                  <Text style={styles.liveCountText}>
                    {attendees.length} {attendees.length === 1 ? 'person' : 'people'} here
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.chatButton, (openRoomPending || eventRoomStatus !== 'available') && styles.chatButtonDisabled]}
              onPress={openEventRoom}
              activeOpacity={0.9}
              disabled={openRoomPending || eventRoomStatus !== 'available'}
            >
              <Text style={styles.chatButtonText}>
                {openRoomPending
                  ? 'Opening...'
                  : eventRoomStatus === 'checking'
                    ? 'Loading Room...'
                    : eventRoomStatus === 'available'
                      ? 'Event Room'
                      : 'Room Unavailable'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recommended</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>0</Text>
              </View>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.similarList}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[...Array(5)].map((_, i) => i)}
                keyExtractor={(item) => `sk-sim-${item}`}
                getItemLayout={getSimilarItemLayout}
                renderItem={() => (
                  <SkeletonBlock width={SIMILAR_CARD_WIDTH} height={SIMILAR_CARD_HEIGHT} borderRadius={24} style={{ marginRight: 16 }} />
                )}
              />
            </View>
            <View style={styles.dotsRow}>
              <View style={styles.dotLong} />
              <View style={styles.dotSmall} />
              <View style={styles.dotSmall} />
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Also Here</Text>
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>0</Text>
              </View>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.gridWrap}>
              {[...Array(8)].map((_, i) => (
                <SkeletonBlock
                  key={`sk-g-${i}`}
                  width={GRID_ITEM_WIDTH}
                  height={GRID_ITEM_HEIGHT}
                  borderRadius={24}
                  style={{ marginRight: (i % 2 === 0 ? GRID_GAP : 0), marginBottom: GRID_GAP }}
                />
              ))}
            </View>
          </>
        ) : (
          <Animated.View
            style={[
              styles.contentReveal,
              { opacity: contentOpacity, transform: [{ translateY: contentTranslate }] },
            ]}
          >
            {!eventInfo ? (
              renderEmptyState()
            ) : attendees.length === 0 ? (
        <View style={styles.noMoreContainer}>
            <View style={styles.emptyGlyph}>
              <Ionicons name="time-outline" size={36} color={APP_COLORS.textTertiary} />
            </View>
            <Text style={styles.noMoreTitle}>You&apos;re early!</Text>
            <Text style={styles.noMoreText}>No other active attendees yet. We&apos;ll refresh this automatically.</Text>
            <TouchableOpacity
              style={[styles.eventsButton, (openRoomPending || eventRoomStatus !== 'available') && styles.eventsButtonDisabled]}
              onPress={openEventRoom}
              disabled={openRoomPending || eventRoomStatus !== 'available'}
            >
              <Text style={styles.eventsButtonText}>
                {openRoomPending
                  ? 'Opening...'
                  : eventRoomStatus === 'checking'
                    ? 'Loading Room...'
                    : eventRoomStatus === 'available'
                      ? 'Open Event Room'
                      : 'Room Unavailable'}
              </Text>
            </TouchableOpacity>
            {eventRoomStatus !== 'available' && (
              <TouchableOpacity
                style={styles.secondaryGhostButton}
                onPress={onBrowseEvents}
              >
                <Text style={styles.secondaryGhostText}>Browse Events</Text>
              </TouchableOpacity>
            )}
          </View>
            ) : (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Recommended</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{recommendedEntries.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionDivider} />
                <Animated.FlatList
                  data={recommendedEntries}
                  keyExtractor={recommendedKeyExtractor}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.similarList}
                  snapToInterval={SIMILAR_CARD_WIDTH + 16}
                  decelerationRate="fast"
                  getItemLayout={getSimilarItemLayout}
                  removeClippedSubviews
                  initialNumToRender={3}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: similarScrollX } } }],
                    {
                      useNativeDriver: true,
                      // Typed explicitly: `Animated.event` widens its listener
                      // parameter to `unknown`, so the offset read below is an
                      // error without it.
                      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                        const x = e.nativeEvent.contentOffset.x || 0
                        const idx = Math.round(x / (SIMILAR_CARD_WIDTH + 16))
                        if (idx !== lastSimilarIndex.current) {
                          lastSimilarIndex.current = idx
                          setSimilarIndex(Math.max(0, idx))
                        }
                      },
                    }
                  )}
                  scrollEventThrottle={16}
                  renderItem={renderRecommendedItem}
                />
                <View style={styles.dotsRow}>
                  <View style={[styles.dotLong, (similarIndex % 3) === 0 && styles.dotActive]} />
                  <View style={[styles.dotSmall, (similarIndex % 3) === 1 && styles.dotActive]} />
                  <View style={[styles.dotSmall, (similarIndex % 3) === 2 && styles.dotActive]} />
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Also Here</Text>
                  {/*
                    * How many we are showing, not "of how many".
                    *
                    * `/matches` is ranked, not paginated — it returns the top N
                    * and no room total, so a denominator was never available.
                    * `attendeesTotalCount` was set to the length of the first
                    * page and then never moved, so this read "20/20" forever
                    * and the button below counted down to a negative number.
                    */}
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{alsoHereAttendees.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionDivider} />
                <FlatList
                  data={alsoHereAttendees}
                  keyExtractor={alsoHereKeyExtractor}
                  numColumns={2}
                  scrollEnabled={false}
                  removeClippedSubviews
                  windowSize={5}
                  initialNumToRender={8}
                  maxToRenderPerBatch={6}
                  contentContainerStyle={styles.gridListContent}
                  columnWrapperStyle={styles.gridColumn}
                  renderItem={renderAlsoHereItem}
                />
                {attendeesHasMore && (
                  <TouchableOpacity
                    style={styles.loadMoreButton}
                    onPress={loadMoreAttendees}
                    disabled={loadingMoreAttendees}
                    accessibilityRole="button"
                    accessibilityLabel="Load more attendees"
                  >
                    {loadingMoreAttendees ? (
                      <ActivityIndicator size="small" color={APP_COLORS.textPrimary} />
                    ) : (
                      <Text style={styles.loadMoreText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  headerGradient: {
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 24,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    letterSpacing: 0.1,
  },
  headerRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  scrollBody: {
    paddingBottom: 40,
  },
  contentReveal: {
    paddingBottom: 4,
  },
  liveRow: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revealChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  revealChipText: {
    color: APP_COLORS.textSecondary,
    fontSize: 13,
  },
  socketBanner: {
    marginHorizontal: 18,
    marginTop: 10,
  },
  newJoinsPill: {
    marginHorizontal: 18,
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(52,199,89,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.3)',
  },
  newJoinsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: '#34C759',
  },
  newJoinsText: {
    color: APP_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  liveTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  liveLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  liveLabel: {
    color: APP_COLORS.textTertiary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  liveTitle: {
    color: APP_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  liveMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  liveCountText: {
    color: APP_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  chatButtonText: {
    color: APP_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  chatButtonDisabled: {
    opacity: 0.55,
  },
  sectionTitle: {
    color: APP_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 9,
    letterSpacing: 0.1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  sectionCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  sectionCountText: {
    color: APP_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: 18,
    backgroundColor: APP_COLORS.separator,
    marginBottom: 6,
  },
  similarList: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  similarCardWrap: {
    width: SIMILAR_CARD_WIDTH,
    height: SIMILAR_CARD_HEIGHT,
    marginRight: 16,
  },
  similarCard: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  similarImage: {
    width: '100%',
    height: '100%',
  },
  similarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  similarInfo: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
  },
  reasonPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(10,132,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  reasonPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  similarName: {
    color: APP_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  timeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(28,28,30,0.74)',
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  timeChipCompact: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  timeChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  /*
   * Bottom-right, opposite the safety control top-right.
   *
   * Deliberately far from it: one of these two is "I would like to meet this
   * person" and the other is "report or block them", and a mis-tap between
   * adjacent buttons would be the worst possible one in this app.
   */
  likeButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  likeButtonOn: {
    backgroundColor: EMBER.gradientFrom,
    borderColor: EMBER.gradientTo,
  },
  // Dimmed, not replaced by a spinner. The heart is already filled in, and
  // swapping it mid-write makes the thing you just chose disappear for the
  // length of a round trip on the tap that most needs to feel free.
  likeButtonSending: { opacity: 0.6 },
  cardSafety: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.72)',
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  dotLong: {
    width: Math.round(width * (60 / BASE_FRAME_WIDTH)),
    height: 6,
    borderRadius: 11,
    backgroundColor: 'rgba(235,235,245,0.34)',
    marginHorizontal: 7,
  },
  dotSmall: {
    width: Math.round(width * (7 / BASE_FRAME_WIDTH)),
    height: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(235,235,245,0.34)',
    marginHorizontal: 7,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  gridWrap: {
    paddingHorizontal: CONTENT_SIDE_PADDING,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridListContent: {
    paddingHorizontal: CONTENT_SIDE_PADDING,
  },
  gridColumn: {
    justifyContent: 'space-between',
  },
  loadMoreButton: {
    marginHorizontal: CONTENT_SIDE_PADDING,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: APP_COLORS.textSecondary,
  },
  gridItem: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: GRID_GAP,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  gridTouch: {
    flex: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  gridInfo: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  gridStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(10,132,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  gridStatusPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  gridName: {
    color: APP_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  gridSafety: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.72)',
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
  },
  noMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: APP_COLORS.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  noMoreText: {
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyGlyph: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  emptyText: {
    fontSize: 16,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  eventsButton: {
    backgroundColor: APP_COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  eventsButtonDisabled: {
    opacity: 0.58,
  },
  eventsButtonText: {
    color: APP_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryGhostButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  secondaryGhostText: {
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
}) 
