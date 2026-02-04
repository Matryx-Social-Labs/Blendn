import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import OptimizedImage from '../OptimizedImage'
import { SkeletonBlock } from '../Skeleton'
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
          <View style={styles.timeChip}>
            <Text style={styles.timeChipText}>{formatTimeAgo(attendee.last_seen)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  )
})

SimilarCard.displayName = 'SimilarCard'

const StartupItem = memo(({ attendee, onPress, isRightColumn }: { attendee: AttendeeProfile; onPress: () => void; isRightColumn?: boolean }) => {
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
      <TouchableOpacity activeOpacity={0.9} style={styles.gridTouch} onPress={onPress}>
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
          <Text style={styles.gridName} numberOfLines={1}>{attendee.name}{attendee.age ? `, ${attendee.age}` : ''}</Text>
          <View style={[styles.timeChip, styles.timeChipCompact]}>
            <Text style={styles.timeChipText}>{formatTimeAgo(attendee.last_seen)}</Text>
          </View>
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

// Content spacing + grid sizing (2 columns)
const CONTENT_SIDE_PADDING = 18
const GRID_GAP = 12
const gridContentWidth = Math.max(0, width - CONTENT_SIDE_PADDING * 2)
const GRID_ITEM_WIDTH = Math.floor((gridContentWidth - GRID_GAP) / 2)
const GRID_ITEM_HEIGHT = 160

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
  const [similarIndex, setSimilarIndex] = useState(0)
  const lastSimilarIndex = useRef(0)
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslate = useRef(new Animated.Value(8)).current
  const similarScrollX = useRef(new Animated.Value(0)).current
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
      // Use active check-ins endpoint to find current event
      const activeCheckinsResult = await apiClient.getActiveCheckins()

      if (!activeCheckinsResult.success || !activeCheckinsResult.data?.checkIns) {
        Logger.error('match', 'Error fetching active check-ins', { error: activeCheckinsResult.error })
        setEventInfo(null)
        setAttendees([])
        return
      }

      const activeUserCheckins = activeCheckinsResult.data.checkIns || []
      const latestCheckin = activeUserCheckins[0]
      const activeEventId: string | null = latestCheckin?.eventId || null
      const activeEventTitle: string | undefined = latestCheckin?.event?.title

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

      const payload: any = checkinsResult.data
      const checkins = Array.isArray(payload) ? payload : (payload.attendees || [])
      const activeAttendeeCheckins = checkins.filter((c: any) => {
        const checkinUserId = c.user_id || c.userId || c.user?.id
        const status = c.status || 'checked_in'
        return (
          checkinUserId &&
          checkinUserId !== userId &&
          status === 'checked_in' &&
          !blockedIds.has(checkinUserId)
        )
      })

      if (activeAttendeeCheckins.length === 0) {
        setAttendees([])
        return
      }

      // Build attendee profiles from check-in data
      const attendeeProfiles: AttendeeProfile[] = activeAttendeeCheckins.map((c: any) => ({
        user_id: c.user_id || c.userId || c.user?.id,
        name: c.user?.name || c.name || c.user?.profile?.name,
        age: c.user?.profile?.age || c.age,
        bio: c.user?.profile?.bio,
        interests: c.user?.profile?.interests,
        profile_photos: c.user?.profile?.photos || (c.user?.image ? [c.user.image] : undefined) || (c.image ? [c.image] : undefined),
        last_seen: c.check_in_time || c.checkInTime,
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
      <View style={styles.emptyGlyph} />
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

        <View style={styles.liveRow}>
          <View style={styles.liveTextWrap}>
            <View style={styles.liveLabelRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>Live at</Text>
            </View>
            <Text style={styles.liveTitle} numberOfLines={1}>
              {eventInfo?.title || 'Your Event'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push('/(tabs)/chat' as any)}
            activeOpacity={0.9}
          >
            <Text style={styles.chatButtonText}>Event Room</Text>
          </TouchableOpacity>
        </View>

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
            <Text style={styles.noMoreTitle}>You&apos;re early!</Text>
            <Text style={styles.noMoreText}>No other active attendees yet. Check back soon.</Text>
          </View>
            ) : (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Recommended</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{Math.min(attendees.length, 12)}</Text>
                  </View>
                </View>
                <View style={styles.sectionDivider} />
                <Animated.FlatList
                  data={attendees.slice(0, 5)}
                  keyExtractor={(a) => `similar_${a.user_id}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.similarList}
                  snapToInterval={SIMILAR_CARD_WIDTH + 16}
                  decelerationRate="fast"
                  getItemLayout={getSimilarItemLayout}
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
                  renderItem={({ item, index }) => (
                    <Animated.View style={getLiftStyle(index)}>
                      <SimilarCard
                        attendee={item}
                        onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } as any })}
                      />
                    </Animated.View>
                  )}
                />
                <View style={styles.dotsRow}>
                  <View style={[styles.dotLong, (similarIndex % 3) === 0 && styles.dotActive]} />
                  <View style={[styles.dotSmall, (similarIndex % 3) === 1 && styles.dotActive]} />
                  <View style={[styles.dotSmall, (similarIndex % 3) === 2 && styles.dotActive]} />
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Also Here</Text>
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountText}>{Math.min(attendees.length, 12)}</Text>
                  </View>
                </View>
                <View style={styles.sectionDivider} />
                <View style={styles.gridWrap}>
                  {attendees.slice(0, 12).map((attendee, index) => (
                    <StartupItem
                      key={`grid_${attendee.user_id}`}
                      attendee={attendee}
                      isRightColumn={(index + 1) % 2 === 0}
                      onPress={() => router.push({ pathname: '/user/[id]', params: { id: attendee.user_id } as any })}
                    />
                  ))}
                </View>
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
    backgroundColor: '#000000',
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
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
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
  contentReveal: {
    paddingBottom: 4,
  },
  heroGradient: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  
  liveRow: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  liveTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#2C0C22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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
    fontSize: 22,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: 0.2,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
  similarName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  similarTime: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
  },
  timeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 7,
  },
  dotSmall: {
    width: Math.round(width * (7 / BASE_FRAME_WIDTH)),
    height: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
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
  gridItem: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: GRID_GAP,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
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
  gridName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  gridTime: {
    color: 'rgba(255,255,255,0.7)',
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
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
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
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  noMoreText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  eventsButton: {
    backgroundColor: '#2C0C22',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  eventsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 
