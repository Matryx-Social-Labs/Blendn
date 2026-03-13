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
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import OptimizedImage from '../OptimizedImage'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { SkeletonBlock } from '../Skeleton'
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
import { APP_COLORS } from '../../lib/theme'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')

// Memoized card components to prevent re-renders
const SimilarCard = memo(({
  attendee,
  onOpenProfile,
  onSafetyPress,
  reasonLabel,
}: {
  attendee: AttendeeProfile
  onOpenProfile: () => void
  onSafetyPress: () => void
  reasonLabel?: string
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
            <Text style={styles.timeChipText}>{formatTimeAgo(attendee.last_seen)}</Text>
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
}: {
  attendee: AttendeeProfile
  onOpenProfile: () => void
  onSafetyPress: () => void
  isRightColumn?: boolean
  statusLabel?: string
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
            <Text style={styles.timeChipText}>{formatTimeAgo(attendee.last_seen)}</Text>
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

interface AttendeeProfile {
  user_id: string
  name?: string
  age?: number
  bio?: string
  interests?: string[]
  profile_photos?: string[]
  last_seen?: string
}

interface RecommendedEntry {
  attendee: AttendeeProfile
  reasonLabel: string
}

type EventRoomStatus = 'idle' | 'checking' | 'available' | 'unavailable'

const parseTimestamp = (value: any): number => {
  const ts = new Date(value || 0).getTime()
  return Number.isFinite(ts) ? ts : 0
}

const extractEventIdFromCheckin = (checkin: any): string | null => {
  const raw = checkin?.eventId || checkin?.event_id || checkin?.event?.id || null
  if (!raw) return null
  const normalized = String(raw).trim()
  return normalized.length > 0 ? normalized : null
}

const getDisplayName = (name?: string) => {
  const normalized = String(name || '').trim()
  return normalized.length > 0 ? normalized : 'Guest'
}

export default function Match() {
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [eventInfo, setEventInfo] = useState<{ id: string; title?: string } | null>(null)
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([])
  const [attendeesHasMore, setAttendeesHasMore] = useState(false)
  const [attendeesTotalCount, setAttendeesTotalCount] = useState(0)
  const [attendeesPage, setAttendeesPage] = useState(1)
  const [loadingMoreAttendees, setLoadingMoreAttendees] = useState(false)
  const currentEventIdRef = useRef<string | null>(null)
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
  const [openRoomPending, setOpenRoomPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [eventRoomStatus, setEventRoomStatus] = useState<EventRoomStatus>('idle')
  const [eventRoomId, setEventRoomId] = useState<string | null>(null)
  const [currentUserInterests, setCurrentUserInterests] = useState<string[]>([])
  const getSimilarItemLayout = useCallback(
    (_: ArrayLike<AttendeeProfile> | null | undefined, index: number) => ({
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
    try {
      // Use active check-ins endpoint to find current event
      const activeCheckinsResult = await apiClient.getActiveCheckins({ force })

      if (!activeCheckinsResult.success || !activeCheckinsResult.data?.checkIns) {
        Logger.error('match', 'Error fetching active check-ins', { error: activeCheckinsResult.error })
        // Keep previous stable UI on transient failures to avoid flicker.
        return
      }

      const activeUserCheckins = activeCheckinsResult.data.checkIns || []
      const sortedCheckins = activeUserCheckins
        .filter((c: any) => !!extractEventIdFromCheckin(c))
        .sort((a: any, b: any) => {
          const aTime = parseTimestamp(a?.checkInTime || a?.check_in_time || a?.createdAt || a?.created_at)
          const bTime = parseTimestamp(b?.checkInTime || b?.check_in_time || b?.createdAt || b?.created_at)
          return bTime - aTime
        })

      if (sortedCheckins.length === 0) {
        if (loadId !== attendeeLoadIdRef.current) return
        if (eventInfoRef.current) {
          if (emptyStateTimerRef.current) {
            clearTimeout(emptyStateTimerRef.current)
          }
          emptyStateTimerRef.current = setTimeout(() => {
            // Delay clearing to avoid brief API sync gaps causing UI flicker.
            setEventInfo(null)
            setAttendees([])
          }, 2200)
          return
        }
        setEventInfo(null)
        setAttendees([])
        return
      }

      // Get blocked users to filter out
      let blockedIds = new Set<string>()
      try {
        const blocked = await getBlockedUsers()
        blockedIds = new Set(blocked.map(b => b.blocked_id))
      } catch (blockErr) {
        Logger.warn('match', 'Failed to load blocked users', { error: blockErr })
      }

      let selectedEventId: string | null = null
      let selectedEventTitle: string | undefined
      let selectedAttendees: AttendeeProfile[] | null = null
      let selectedPagination: { page: number; limit: number; totalCount: number; hasMore: boolean } | undefined

      for (const checkin of sortedCheckins) {
        const candidateEventId = extractEventIdFromCheckin(checkin)
        if (!candidateEventId) continue

        const checkinsResult = await apiClient.getEventCheckins(candidateEventId, { force, page: 1, limit: 20 })
        if (!checkinsResult.success || !checkinsResult.data) {
          const err = String(checkinsResult.error || '').toLowerCase()
          if (err.includes('event not found')) {
            Logger.warn('match', 'Skipping stale active check-in event', { eventId: candidateEventId })
            continue
          }
          Logger.error('match', 'Error fetching event check-ins', { error: checkinsResult.error, eventId: candidateEventId })
          if (loadId !== attendeeLoadIdRef.current) return
          return
        }

        const payload = checkinsResult.data
        const rawAttendees = Array.isArray(payload)
          ? payload
          : ((payload as any).attendees || (payload as any).checkIns || (payload as any).checkins || (payload as any).data || [])
        const pagination = (payload as any).pagination

        const attendeeProfiles: AttendeeProfile[] = rawAttendees
          .filter((c: any) => {
            const uid = c.userId || c.user_id || c.user?.id
            return uid && uid !== userId && !blockedIds.has(uid)
          })
          .map((c: any) => ({
            user_id: c.userId || c.user_id || c.user?.id,
            name: c.name || c.user?.name || c.user?.profile?.name,
            age: c.age || c.user?.profile?.age,
            bio: c.user?.profile?.bio,
            interests: c.user?.profile?.interests,
            profile_photos: c.user?.profile?.photos || (c.image ? [c.image] : undefined) || (c.user?.image ? [c.user.image] : undefined),
            last_seen: c.checkInTime || c.check_in_time,
          }))

        attendeeProfiles.sort((a, b) => {
          const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0
          const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0
          return tb - ta
        })

        selectedEventId = candidateEventId
        selectedEventTitle = checkin?.event?.title
        selectedAttendees = attendeeProfiles
        selectedPagination = pagination
        break
      }

      if (loadId !== attendeeLoadIdRef.current) return
      if (emptyStateTimerRef.current) {
        clearTimeout(emptyStateTimerRef.current)
      }
      if (!selectedEventId) {
        setEventInfo(null)
        setAttendees([])
        setAttendeesHasMore(false)
        setAttendeesTotalCount(0)
        setAttendeesPage(1)
        return
      }

      currentEventIdRef.current = selectedEventId
      setEventInfo({ id: selectedEventId, title: selectedEventTitle })
      setAttendees(selectedAttendees || [])
      setAttendeesHasMore(selectedPagination?.hasMore ?? false)
      setAttendeesTotalCount(selectedPagination?.totalCount ?? (selectedAttendees?.length ?? 0))
      setAttendeesPage(1)
    } catch (e) {
      Logger.error('match', 'Failed to load event attendees', { error: e })
      if (loadId !== attendeeLoadIdRef.current) return
      // Keep prior stable UI to avoid state thrash on transient failures.
    }
  }, [])

  const loadMoreAttendees = useCallback(async () => {
    const eventId = currentEventIdRef.current
    if (!eventId || loadingMoreAttendees || !attendeesHasMore) return
    setLoadingMoreAttendees(true)
    try {
      const nextPage = attendeesPage + 1
      const result = await apiClient.getEventCheckins(eventId, { force: true, page: nextPage, limit: 20 })
      if (!result.success || !result.data) return
      const payload = result.data
      const rawAttendees = Array.isArray(payload)
        ? payload
        : ((payload as any).attendees || (payload as any).checkIns || [])
      const pagination = (payload as any).pagination
      const newProfiles: AttendeeProfile[] = rawAttendees.map((c: any) => ({
        user_id: c.userId || c.user_id || c.user?.id,
        name: c.name || c.user?.name,
        age: c.age || c.user?.profile?.age,
        bio: c.user?.profile?.bio,
        interests: c.user?.profile?.interests,
        profile_photos: c.user?.profile?.photos || (c.image ? [c.image] : undefined) || (c.user?.image ? [c.user.image] : undefined),
        last_seen: c.checkInTime || c.check_in_time,
      }))
      setAttendees(prev => [...prev, ...newProfiles])
      setAttendeesHasMore(pagination?.hasMore ?? false)
      setAttendeesPage(nextPage)
    } catch (e) {
      Logger.error('match', 'Failed to load more attendees', { error: e })
    } finally {
      setLoadingMoreAttendees(false)
    }
  }, [attendeesHasMore, attendeesPage, loadingMoreAttendees])

  const loadInitialData = useCallback(async () => {
    try {
      if (!authUser) {
        return
      }

      const profileResult = await apiClient.getProfile(authUser.id)
      if (profileResult.success && profileResult.data?.profile) {
        const interests = Array.isArray(profileResult.data.profile.interests)
          ? profileResult.data.profile.interests
          : []
        setCurrentUserInterests(interests.map((i: string) => String(i).toLowerCase()))
      } else {
        setCurrentUserInterests([])
      }

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
    const sharedCount = (attendee: AttendeeProfile): number => {
      const attendeeInterests = Array.isArray(attendee.interests)
        ? attendee.interests.map((i) => String(i).toLowerCase())
        : []
      return attendeeInterests.filter((i) => currentUserInterests.includes(i)).length
    }

    const score = (attendee: AttendeeProfile): number => {
      let points = 0
      const shared = sharedCount(attendee)
      points += shared * 12
      if (attendee.bio && attendee.bio.trim().length > 0) points += 6
      if (attendee.profile_photos && attendee.profile_photos.length > 0) points += 8
      points += Math.max(0, 30 - Math.floor((Date.now() - parseTimestamp(attendee.last_seen)) / (1000 * 60 * 30)))
      return points
    }

    return attendees
      .slice()
      .sort((a, b) => score(b) - score(a))
      .slice(0, 5)
      .map((attendee): RecommendedEntry => {
        const shared = sharedCount(attendee)
        const recentMinutes = Math.floor((Date.now() - parseTimestamp(attendee.last_seen)) / (1000 * 60))
        const reasonLabel = shared > 0
          ? `${shared} shared interest${shared > 1 ? 's' : ''}`
          : (recentMinutes <= 30 ? 'Active now' : 'Popular nearby')
        return { attendee, reasonLabel }
      })
  }, [attendees, currentUserInterests])

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
        />
      </Animated.View>
    ),
    [getLiftStyle, onSafetyPress, openUserProfile]
  )

  const renderAlsoHereItem = useCallback(
    ({ item: attendee, index }: { item: AttendeeProfile; index: number }) => (
      <StartupItem
        attendee={attendee}
        statusLabel="Here now"
        onSafetyPress={() => onSafetyPress(attendee.name || 'User', attendee.user_id)}
        onOpenProfile={() => openUserProfile(attendee.user_id)}
        isRightColumn={(index + 1) % 2 === 0}
      />
    ),
    [onSafetyPress, openUserProfile]
  )

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyGlyph}>
        <Ionicons name="location-outline" size={40} color={APP_COLORS.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>Not Checked In Yet</Text>
      <Text style={styles.emptyText}>
        Check in to an event to unlock recommendations and nearby attendees.
      </Text>
      <TouchableOpacity 
        style={styles.eventsButton}
        onPress={onBrowseEvents}
      >
        <Text style={styles.eventsButtonText}>Browse Events</Text>
      </TouchableOpacity>
    </View>
  ), [onBrowseEvents])

  const isLoading = loading

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
                      listener: (e) => {
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
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>
                      {attendeesTotalCount > attendees.length ? `${attendees.length}/${attendeesTotalCount}` : alsoHereAttendees.length}
                    </Text>
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
                      <Text style={styles.loadMoreText}>
                        Load More ({attendeesTotalCount - attendees.length} remaining)
                      </Text>
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
