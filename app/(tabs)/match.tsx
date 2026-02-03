import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { memo, useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock } from '../../components/Skeleton'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { getBlockedUsers, showUserSafetyActions } from '../../lib/safetyUtils'
import { useAuth } from '../../lib/useAuth'
import { subscribeToEvent, EventCheckInCallback, EventCheckOutCallback } from '../../lib/socketClient'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')

// Memoized card components to prevent re-renders
const SimilarCard = memo(({ attendee, onPress }: { attendee: AttendeeProfile; onPress: () => void }) => {
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
      <TouchableOpacity activeOpacity={0.9} style={styles.similarCard} onPress={onPress}>
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
            {attendee.name}{attendee.age ? `, ${attendee.age}` : ''}
          </Text>
          <Text style={styles.similarTime}>{formatTimeAgo(attendee.last_seen)}</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
})

SimilarCard.displayName = 'SimilarCard'

const StartupItem = memo(({ attendee, onPress }: { attendee: AttendeeProfile; onPress: () => void }) => {
  const rawUrl = attendee.profile_photos?.[0] || ''
  const gridWidth = GRID_ITEM_WIDTH
  const gridHeight = GRID_ITEM_HEIGHT

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
    <View style={[styles.gridItem, { width: gridWidth, height: gridHeight }]}>
      <TouchableOpacity activeOpacity={0.9} style={styles.gridTouch} onPress={onPress}>
        {rawUrl ? (
          <OptimizedImage
            source={rawUrl as any}
            style={styles.gridImage as any}
            contentFit="cover"
            width={gridWidth}
            height={gridHeight}
            quality={60}
          />
        ) : (
          <Image source={placeholderImg} style={styles.gridImage} contentFit="cover" />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.gridGradient} />
        <View style={styles.gridInfo}>
          <Text style={styles.gridName} numberOfLines={1}>{attendee.name}{attendee.age ? `, ${attendee.age}` : ''}</Text>
          <Text style={styles.gridTime}>{formatTimeAgo(attendee.last_seen)}</Text>
        </View>
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

// Grid sizing (3 columns) from Figma blocks (105x115) with 26px side padding and 13px gaps
const CONTENT_SIDE_PADDING = 26
const GRID_GAP = 13
const contentWidth = Math.max(0, width - CONTENT_SIDE_PADDING * 2)
const GRID_ITEM_WIDTH = Math.floor((contentWidth - GRID_GAP * 2) / 3)
const GRID_ITEM_HEIGHT = Math.round(GRID_ITEM_WIDTH * (115 / 105))

// Legacy attendee tile sizes (kept for potential reuse elsewhere on this screen)
const TILE_WIDTH = Math.min(160, Math.max(130, Math.floor(width * 0.4)))
const TILE_HEIGHT = TILE_WIDTH * 1.35

interface AttendeeProfile {
  user_id: string
  name?: string
  age?: number
  bio?: string
  interests?: string[]
  profile_photos?: string[]
  last_seen?: string
}

interface MatchPreview {
  conversation_id: string
  other_user_id: string
  other_user_name: string
  photo_url?: string
}

export default function Match() {
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [eventInfo, setEventInfo] = useState<{ id: string; title?: string } | null>(null)
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([])
  const [matches, setMatches] = useState<MatchPreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const { setScrollProgress } = useGradientOverlay()
  const [activeSegment, setActiveSegment] = useState<'matching' | 'chat'>('matching')
  const [similarIndex, setSimilarIndex] = useState(0)

  useEffect(() => {
    if (authUser) {
      loadInitialData()
    }
  }, [authUser])

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (authUser) {
        loadActiveEventAndAttendees(authUser.id)
        loadMatches(authUser.id)
      }
    }, [authUser])
  )

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
    }

    // Handle when someone checks out of the event
    const handleCheckOut: EventCheckOutCallback = (data) => {
      if (data.userId === authUser.id) return // Ignore our own check-out

      Logger.debug('match', 'Check-out received', { userId: data.userId })

      setAttendees(prev => prev.filter(a => a.user_id !== data.userId))
    }

    const unsubCheckIn = subscribeToEvent(eventInfo.id, handleCheckIn)
    const unsubCheckOut = subscribeToEvent(eventInfo.id, handleCheckOut)

    return () => {
      Logger.debug('match', 'Cleaning up event subscription')
      unsubCheckIn()
      unsubCheckOut()
    }
  }, [authUser, eventInfo?.id])

  const loadInitialData = async () => {
    try {
      setError(null)
      if (!authUser) {
        return
      }

      // Load active event and attendees
      await loadActiveEventAndAttendees(authUser.id)
      await loadMatches(authUser.id)
    } catch (e) {
      Logger.error('match', 'Unexpected error during initialization', { error: e })
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadMatches = async (userId: string) => {
    try {
      // TODO: Add API endpoint for matches/conversations
      // GET /api/mobile/matches or /api/mobile/conversations
      // For now, just set empty matches - this feature will be implemented later
      Logger.debug('match', 'TODO: Load matches via API endpoint')
      setMatches([])
    } catch (e) {
      Logger.error('match', 'Failed to load matches', { error: e })
      setMatches([])
    }
  }

  const loadActiveEventAndAttendees = async (userId: string) => {
    try {
      // Get events to find which one user is checked into
      // We'll use the getEvents API and check userStatus
      const eventsResult = await apiClient.getEvents({ limit: 20 })

      if (!eventsResult.success || !eventsResult.data?.events) {
        Logger.error('match', 'Error fetching events', { error: eventsResult.error })
        setEventInfo(null)
        setAttendees([])
        return
      }

      // Find an event where user is checked in
      let activeEventId: string | null = null
      let activeEventTitle: string | undefined

      for (const event of eventsResult.data.events) {
        if (event.userStatus?.isCheckedIn) {
          activeEventId = event.id
          activeEventTitle = event.title
          break
        }
      }

      if (!activeEventId) {
        setEventInfo(null)
        setAttendees([])
        return
      }

      setEventInfo({ id: activeEventId, title: activeEventTitle })

      // Get blocked users to filter out
      let blockedIds = new Set<string>()
      try {
        const blocked = await getBlockedUsers()
        blockedIds = new Set(blocked.map(b => b.blocked_id))
      } catch (blockErr) {
        Logger.warn('match', 'Failed to load blocked users', { error: blockErr })
      }

      // Get attendees via check-ins API
      const checkinsResult = await apiClient.getEventCheckins(activeEventId)

      if (!checkinsResult.success || !checkinsResult.data) {
        Logger.error('match', 'Error fetching event check-ins', { error: checkinsResult.error })
        setAttendees([])
        return
      }

      const checkins = checkinsResult.data || []
      const activeCheckins = checkins.filter((c: any) =>
        c.user_id !== userId &&
        c.status === 'checked_in' &&
        !blockedIds.has(c.user_id)
      )

      if (activeCheckins.length === 0) {
        setAttendees([])
        return
      }

      // Build attendee profiles from check-in data
      const attendeeProfiles: AttendeeProfile[] = activeCheckins.map((c: any) => ({
        user_id: c.user_id,
        name: c.user?.name || c.user?.profile?.name,
        age: c.user?.profile?.age,
        bio: c.user?.profile?.bio,
        interests: c.user?.profile?.interests,
        profile_photos: c.user?.profile?.photos || (c.user?.image ? [c.user.image] : undefined),
        last_seen: c.check_in_time,
      }))

      attendeeProfiles.sort((a, b) => {
        const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0
        const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0
        return tb - ta
      })

      setAttendees(attendeeProfiles)
    } catch (e) {
      Logger.error('match', 'Failed to load event attendees', { error: e })
      setAttendees([])
    }
  }

  const startPrivateConversation = async (candidate: AttendeeProfile) => {
    try {
      // TODO: Add API endpoint for creating private conversations
      // POST /api/mobile/conversations
      // For now, just navigate to user profile
      Alert.alert(
        'Coming Soon',
        'Private messaging will be available soon. View their profile instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Profile', onPress: () => router.push({ pathname: '/user/[id]', params: { id: candidate.user_id } as any }) }
        ]
      )
    } catch (error) {
      console.error('Error starting conversation:', error)
      Alert.alert('Error', 'Something went wrong')
    }
  }

  // Netflix-style attendee tile
  const renderAttendeeTile = (attendee: AttendeeProfile) => {
    const rawUrl = attendee.profile_photos && attendee.profile_photos.length > 0
      ? attendee.profile_photos[0]
      : ''
    const optimized = rawUrl
      ? getOptimizedImageUrl(rawUrl, { width: TILE_WIDTH, height: TILE_HEIGHT, resize: 'cover', quality: 60, format: 'webp' })
      : undefined

    return (
      <View key={attendee.user_id} style={styles.tileWrapper}>
        <TouchableOpacity
          style={styles.tile}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: attendee.user_id } as any })}
        >
          {rawUrl ? (
            <OptimizedImage
              source={rawUrl as any}
              style={styles.tileImage as any}
              contentFit="cover"
              width={TILE_WIDTH}
              height={TILE_HEIGHT}
              quality={60}
            />
          ) : (
            <Image source={placeholderImg} style={styles.tileImage} contentFit="cover" />
          )}
          <View style={styles.tileGradient} />
          <View style={styles.tileInfo}>
            <Text style={styles.tileName} numberOfLines={1}>
              {attendee.name}{attendee.age ? `, ${attendee.age}` : ''}
            </Text>
            {attendee.bio ? (
              <Text style={styles.tileBio} numberOfLines={1}>{attendee.bio}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tileSafety}
          onPress={() =>
            showUserSafetyActions(attendee.name || 'User', attendee.user_id, () => {
              setAttendees(prev => prev.filter(a => a.user_id !== attendee.user_id))
            })
          }
        >
          <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🎬</Text>
      <Text style={styles.emptyTitle}>Meet People at Events</Text>
      <Text style={styles.emptyText}>
        Check in to an event to see other attendees and start a conversation.
      </Text>
      <TouchableOpacity 
        style={styles.eventsButton}
        onPress={() => router.push('/(tabs)/events' as any)}
      >
        <Text style={styles.eventsButtonText}>Browse Events</Text>
      </TouchableOpacity>
    </View>
  )

  const isLoading = loading

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
        onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 320)}
        scrollEventThrottle={16}
      >
        <View style={[styles.headerGradient, { paddingTop: insets.top }]}>
          <LinearGradient
            colors={['#480D37', '#000000']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitleText}>The Grid</Text>
            </View>
            <TouchableOpacity
              style={styles.headerRight}
              onPress={() => authUser && loadActiveEventAndAttendees(authUser.id)}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
            >
              <Ionicons name="refresh" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.segmentContainer}>
          <View style={[styles.segmentPill, { width: Math.round(width * (370 / BASE_FRAME_WIDTH)), alignSelf: 'center' }]}>
            <TouchableOpacity
              style={[styles.segmentBtn, activeSegment === 'matching' && styles.segmentBtnActive]}
              onPress={() => setActiveSegment('matching')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentText, activeSegment === 'matching' && styles.segmentTextActive]}>Start Matching</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, activeSegment === 'chat' && styles.segmentBtnActive]}
              onPress={() => {
                setActiveSegment('chat')
                router.push('/(tabs)/chat' as any)
              }}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentText, activeSegment === 'chat' && styles.segmentTextActive]}>Join Chat</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <>
            <Text style={styles.sectionTitle}>Similar Interests</Text>
            <View style={styles.similarList}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[...Array(5)].map((_, i) => (
                  <SkeletonBlock key={`sk-sim-${i}`} width={SIMILAR_CARD_WIDTH} height={SIMILAR_CARD_HEIGHT} borderRadius={24} style={{ marginRight: 16 }} />
                ))}
              </ScrollView>
            </View>
            <View style={styles.dotsRow}>
              <View style={styles.dotLong} />
              <View style={styles.dotSmall} />
              <View style={styles.dotSmall} />
            </View>

            <Text style={styles.sectionTitle}>Startup</Text>
            <View style={styles.gridWrap}>
              {[...Array(12)].map((_, i) => (
                <SkeletonBlock key={`sk-g-${i}`} width={GRID_ITEM_WIDTH} height={GRID_ITEM_HEIGHT} borderRadius={24} style={{ marginRight: GRID_GAP, marginBottom: GRID_GAP }} />
              ))}
            </View>
          </>
        ) : !eventInfo ? (
          renderEmptyState()
        ) : attendees.length === 0 ? (
          <View style={styles.noMoreContainer}>
            <Text style={styles.noMoreIcon}>👋</Text>
            <Text style={styles.noMoreTitle}>You&apos;re early!</Text>
            <Text style={styles.noMoreText}>No other active attendees yet. Check back soon.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Similar Interests</Text>
            <FlatList
              data={attendees}
              keyExtractor={(a) => `similar_${a.user_id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.similarList}
              snapToInterval={SIMILAR_CARD_WIDTH + 16}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => {
                // Only update index when scroll settles, not during scroll
                const x = e.nativeEvent.contentOffset.x
                const idx = Math.round(x / (SIMILAR_CARD_WIDTH + 16))
                setSimilarIndex(Math.max(0, idx))
              }}
              scrollEventThrottle={100}
              renderItem={({ item }) => (
                <SimilarCard
                  attendee={item}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } as any })}
                />
              )}
            />
            <View style={styles.dotsRow}>
              <View style={[styles.dotLong, (similarIndex % 3) === 0 && styles.dotActive]} />
              <View style={[styles.dotSmall, (similarIndex % 3) === 1 && styles.dotActive]} />
              <View style={[styles.dotSmall, (similarIndex % 3) === 2 && styles.dotActive]} />
            </View>

            <Text style={styles.sectionTitle}>Startup</Text>
            <View style={styles.gridWrap}>
              {attendees.slice(0, 12).map((attendee) => (
                <StartupItem
                  key={`grid_${attendee.user_id}`}
                  attendee={attendee}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: attendee.user_id } as any })}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerGradient: {
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  refreshBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 8,
  },
  scrollBody: {
    paddingBottom: 40,
  },
  heroGradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  
  segmentContainer: {
    paddingTop: 10,
  },
  segmentPill: {
    backgroundColor: 'rgba(118,118,128,0.32)',
    borderRadius: 100,
    padding: 4,
    height: 52,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.20)',
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    height: 44,
    paddingVertical: 0,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#480D37',
  },
  segmentText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  carouselContainer: {
    paddingTop: 16,
  },
  matchesContainer: {
    paddingTop: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  rowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  rowCount: {
    fontSize: 14,
    color: '#888',
  },
  carousel: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  matchesScroll: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  similarList: {
    paddingHorizontal: 16,
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
    backgroundColor: '#1f0b1e',
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
  similarName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  similarTime: {
    color: '#e6e6e6',
    fontSize: 12,
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
    backgroundColor: 'rgba(217,217,217,1)',
    marginHorizontal: 7,
  },
  dotSmall: {
    width: Math.round(width * (7 / BASE_FRAME_WIDTH)),
    height: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(217,217,217,1)',
    marginHorizontal: 7,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: CONTENT_SIDE_PADDING,
  },
  gridItem: {
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: GRID_GAP,
    marginBottom: GRID_GAP,
    backgroundColor: '#1f0b1e',
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
  gridName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  gridTime: {
    color: '#e6e6e6',
    fontSize: 10,
  },
  matchItem: {
    width: 76,
    marginRight: 12,
    alignItems: 'center',
  },
  matchAvatarWrapper: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff6cc',
  },
  matchAvatarRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    padding: 3,
    backgroundColor: '#FFCC00',
  },
  matchAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 33,
  },
  matchName: {
    marginTop: 6,
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
    maxWidth: 76,
    textAlign: 'center',
  },
  tileWrapper: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    marginRight: 12,
  },
  tile: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tileInfo: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  tileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  tileBio: {
    color: '#f0f0f0',
    fontSize: 12,
  },
  tileSafety: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
  },
  noMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noMoreIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  noMoreText: {
    fontSize: 16,
    color: '#666',
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
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  eventsButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
  },
  eventsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 