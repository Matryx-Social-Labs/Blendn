import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import GlassTopBar from '../GlassTopBar'
import GradientButton from '../ui/GradientButton'
import GridProfileCard, { GridAttendee } from '../GridProfileCard'
import ScalePress from '../motion/ScalePress'
import RealtimeStatusBanner from '../RealtimeStatusBanner'
import { SkeletonBlock } from '../Skeleton'
import { useToast } from '../Toast'
import { SegmentedControl } from '../AppHeader'
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
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const CONTENT_SIDE_PADDING = 18
const FILTER_TAG_LIMIT = 4

type AttendeeProfile = GridAttendee

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

export default function Match() {
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
  const comingSoon = useCallback(() => showToast('Coming soon', 'info'), [showToast])

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
  const attendeeLoadIdRef = useRef(0)
  const joinPillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emptyStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventInfoRef = useRef<{ id: string; title?: string } | null>(null)
  const [openRoomPending, setOpenRoomPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [eventRoomStatus, setEventRoomStatus] = useState<EventRoomStatus>('idle')
  const [eventRoomId, setEventRoomId] = useState<string | null>(null)
  const [currentUserInterests, setCurrentUserInterests] = useState<string[]>([])
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null)

  useEffect(() => {
    eventInfoRef.current = eventInfo
  }, [eventInfo])

  useEffect(() => {
    setNewJoinsCount(0)
    setSelectedFilterTag(null)
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
            occupation: c.user?.profile?.occupation || c.user?.occupation,
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
        occupation: c.user?.profile?.occupation || c.user?.occupation,
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

  const handleSegmentChange = useCallback(
    (index: number) => {
      if (index === 1) {
        openEventRoom()
      }
    },
    [openEventRoom]
  )

  // Intersection of an attendee's interests with the current user's, preserving original casing.
  const sharedInterestsFor = useCallback(
    (attendee: AttendeeProfile): string[] => {
      const attendeeInterests = Array.isArray(attendee.interests) ? attendee.interests : []
      const seen = new Set<string>()
      const result: string[] = []
      for (const interest of attendeeInterests) {
        const lower = String(interest).toLowerCase()
        if (currentUserInterests.includes(lower) && !seen.has(lower)) {
          seen.add(lower)
          result.push(String(interest))
        }
      }
      return result
    },
    [currentUserInterests]
  )

  // Single score-sorted list — replaces the old separate "Recommended"/"Also Here" split.
  // Top-scored attendee gets the FEATURED tag.
  const scoredAttendees = useMemo(() => {
    const score = (attendee: AttendeeProfile): number => {
      let points = 0
      points += sharedInterestsFor(attendee).length * 12
      if (attendee.bio && attendee.bio.trim().length > 0) points += 6
      if (attendee.profile_photos && attendee.profile_photos.length > 0) points += 8
      points += Math.max(0, 30 - Math.floor((Date.now() - parseTimestamp(attendee.last_seen)) / (1000 * 60 * 30)))
      return points
    }

    return attendees.slice().sort((a, b) => score(b) - score(a))
  }, [attendees, sharedInterestsFor])

  const featuredUserId = scoredAttendees[0]?.user_id

  // Filter chip tags — top interest tags among current attendees (no schema/backend field needed).
  const filterTags = useMemo(() => {
    const freq = new Map<string, number>()
    for (const attendee of attendees) {
      for (const interest of attendee.interests || []) {
        const key = String(interest).trim()
        if (!key) continue
        freq.set(key, (freq.get(key) || 0) + 1)
      }
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, FILTER_TAG_LIMIT)
      .map(([tag]) => tag)
  }, [attendees])

  const displayedAttendees = useMemo(() => {
    if (!selectedFilterTag) return scoredAttendees
    return scoredAttendees.filter((attendee) =>
      (attendee.interests || []).some((i) => String(i).toLowerCase() === selectedFilterTag.toLowerCase())
    )
  }, [scoredAttendees, selectedFilterTag])

  const keyExtractor = useCallback((attendee: AttendeeProfile) => `grid_${attendee.user_id}`, [])

  const renderItem = useCallback(
    ({ item }: { item: AttendeeProfile }) => (
      <GridProfileCard
        attendee={item}
        featured={item.user_id === featuredUserId}
        sharedInterestNames={sharedInterestsFor(item)}
        onOpenProfile={() => openUserProfile(item.user_id)}
        onSafetyPress={() => onSafetyPress(item.name || 'User', item.user_id)}
      />
    ),
    [featuredUserId, sharedInterestsFor, openUserProfile, onSafetyPress]
  )

  const onEndReached = useCallback(() => {
    if (attendeesHasMore && !loadingMoreAttendees) {
      loadMoreAttendees()
    }
  }, [attendeesHasMore, loadingMoreAttendees, loadMoreAttendees])

  const listHeader = useCallback(
    () => (
      <>
        <View style={styles.headingSection}>
          <Text style={styles.gridHeading}>The Grid</Text>
          {!!eventInfo && (
            <Text style={styles.gridSubheading}>
              {attendeesTotalCount || attendees.length} Curated Minds at{' '}
              <Text style={styles.gridSubheadingAccent}>{eventInfo.title || 'this event'}</Text>
            </Text>
          )}
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
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              <ScalePress onPress={() => setSelectedFilterTag(null)} haptic={false}>
                <View style={[styles.filterChip, selectedFilterTag === null && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, selectedFilterTag === null && styles.filterChipTextActive]}>
                    All Attendees
                  </Text>
                </View>
              </ScalePress>
              {filterTags.map((tag) => (
                <ScalePress key={tag} onPress={() => setSelectedFilterTag(tag)} haptic={false} style={styles.chipSpacing}>
                  <View style={[styles.filterChip, selectedFilterTag === tag && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, selectedFilterTag === tag && styles.filterChipTextActive]}>
                      {tag}
                    </Text>
                  </View>
                </ScalePress>
              ))}
            </ScrollView>

            <View style={styles.segmented}>
              <SegmentedControl
                options={['Grid', 'Join Chat']}
                selectedIndex={0}
                onSelectionChange={handleSegmentChange}
              />
            </View>
          </>
        )}
      </>
    ),
    [eventInfo, attendees.length, attendeesTotalCount, socketStatus, newJoinsCount, selectedFilterTag, filterTags, handleSegmentChange]
  )

  const listEmpty = useCallback(() => {
    if (!eventInfo) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyGlyph}>
            <Ionicons name="location-outline" size={40} color={APP_COLORS.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>Not Checked In Yet</Text>
          <Text style={styles.emptyText}>
            Check in to an event to unlock recommendations and nearby attendees.
          </Text>
          <ScalePress style={styles.eventsButton} onPress={onBrowseEvents}>
            <Text style={styles.eventsButtonText}>Browse Events</Text>
          </ScalePress>
        </View>
      )
    }
    return (
      <View style={styles.noMoreContainer}>
        <View style={styles.emptyGlyph}>
          <Ionicons name="time-outline" size={36} color={APP_COLORS.textTertiary} />
        </View>
        <Text style={styles.noMoreTitle}>You&apos;re early!</Text>
        <Text style={styles.noMoreText}>No other active attendees yet. We&apos;ll refresh this automatically.</Text>
        <ScalePress
          style={[styles.eventsButton, (openRoomPending || eventRoomStatus !== 'available') && styles.eventsButtonDisabled]}
          onPress={openEventRoom}
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
        </ScalePress>
        {eventRoomStatus !== 'available' && (
          <ScalePress style={styles.secondaryGhostButton} onPress={onBrowseEvents}>
            <Text style={styles.secondaryGhostText}>Browse Events</Text>
          </ScalePress>
        )}
      </View>
    )
  }, [eventInfo, onBrowseEvents, openRoomPending, eventRoomStatus, openEventRoom])

  const listFooter = useCallback(() => {
    if (!eventInfo || displayedAttendees.length === 0) return null
    return (
      <>
        {loadingMoreAttendees && (
          <View style={styles.loadingMoreRow}>
            <ActivityIndicator size="small" color={APP_COLORS.textSecondary} />
          </View>
        )}
        {!attendeesHasMore && (
          <View style={styles.expandCard}>
            <View style={styles.expandGlyph}>
              <Ionicons name="link-outline" size={28} color={APP_COLORS.textTertiary} />
            </View>
            <Text style={styles.expandTitle}>Expand Your Circle</Text>
            <Text style={styles.expandSubtitle}>
              Unlock more profiles by connecting your LinkedIn or X account.
            </Text>
            <GradientButton
              label="Connect Socials"
              onPress={comingSoon}
              variant="secondary"
              fullWidth
              style={styles.expandButton}
            />
          </View>
        )}
      </>
    )
  }, [eventInfo, displayedAttendees.length, loadingMoreAttendees, attendeesHasMore, comingSoon])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />
      <GlassTopBar onMenuPress={comingSoon} onBellPress={comingSoon} wordmarkSize={24} />

      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
          <View style={styles.headingSection}>
            <Text style={styles.gridHeading}>The Grid</Text>
          </View>
          {[...Array(3)].map((_, i) => (
            <SkeletonBlock
              key={`sk-card-${i}`}
              width="100%"
              height={420}
              borderRadius={APP_RADIUS['2xl']}
              style={styles.skeletonCard}
            />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={displayedAttendees}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={styles.listBody}
          showsVerticalScrollIndicator={false}
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
        />
      )}

      <ScalePress
        style={[styles.fab, { bottom: insets.bottom + 136 }]}
        onPress={comingSoon}
        accessibilityRole="button"
        accessibilityLabel="Quick action"
      >
        <LinearGradient
          colors={APP_COLORS.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="options-outline" size={22} color={APP_COLORS.onAccent} />
        </LinearGradient>
      </ScalePress>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
  },
  scrollBody: {
    paddingHorizontal: CONTENT_SIDE_PADDING,
    paddingBottom: 40,
  },
  listBody: {
    paddingHorizontal: CONTENT_SIDE_PADDING,
    paddingBottom: 140,
  },
  skeletonCard: {
    marginBottom: APP_SPACING.lg,
  },
  headingSection: {
    paddingTop: APP_SPACING.lg,
    paddingBottom: APP_SPACING.sm,
    gap: APP_SPACING.xxs,
  },
  gridHeading: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.8,
    color: APP_COLORS.textPrimary,
  },
  gridSubheading: {
    fontFamily: APP_FONTS.body,
    fontSize: 18,
    lineHeight: 28,
    color: APP_COLORS.textSecondary,
  },
  gridSubheadingAccent: {
    color: APP_COLORS.accentSecondary,
    fontFamily: APP_FONTS.bodySemiBold,
  },
  socketBanner: {
    marginTop: APP_SPACING.xs,
  },
  newJoinsPill: {
    marginTop: APP_SPACING.xs,
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
    backgroundColor: APP_COLORS.success,
  },
  newJoinsText: {
    color: APP_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  chipsRow: {
    gap: APP_SPACING.xs,
    paddingVertical: APP_SPACING.sm,
  },
  chipSpacing: {
    marginLeft: APP_SPACING.xs,
  },
  filterChip: {
    backgroundColor: APP_COLORS.backgroundCard,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.lg,
    paddingVertical: APP_SPACING.xs,
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,144,109,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,144,109,0.2)',
  },
  filterChipText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 14,
    fontWeight: '500',
    color: APP_COLORS.textSecondary,
  },
  filterChipTextActive: {
    fontFamily: APP_FONTS.bodySemiBold,
    fontWeight: '600',
    color: APP_COLORS.accent,
  },
  segmented: {
    marginBottom: APP_SPACING.md,
  },
  loadingMoreRow: {
    paddingVertical: APP_SPACING.lg,
    alignItems: 'center',
  },
  expandCard: {
    marginTop: APP_SPACING.sm,
    padding: APP_SPACING.lg,
    borderRadius: APP_RADIUS['2xl'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: APP_COLORS.separator,
    alignItems: 'center',
    gap: APP_SPACING.xs,
  },
  expandGlyph: {
    width: 56,
    height: 56,
    borderRadius: APP_RADIUS.xl,
    backgroundColor: APP_COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: APP_SPACING.xs,
  },
  expandTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  expandSubtitle: {
    fontFamily: APP_FONTS.body,
    fontSize: 13,
    color: APP_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  expandButton: {
    marginTop: APP_SPACING.sm,
    width: '100%',
    backgroundColor: APP_COLORS.backgroundInput,
  },
  fab: {
    position: 'absolute',
    right: 24,
    zIndex: 4,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
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
