import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { getBlockedUsers, showUserSafetyActions } from '../../lib/safetyUtils'
import { AuthHelper, supabase } from '../../lib/supabase'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')
const TILE_WIDTH = Math.min(160, Math.max(130, Math.floor(width * 0.4)))
const TILE_HEIGHT = TILE_WIDTH * 1.35
const SIMILAR_CARD_WIDTH = Math.floor(width * 0.72)
const SIMILAR_CARD_HEIGHT = Math.floor(SIMILAR_CARD_WIDTH * 1.1)

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
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [eventInfo, setEventInfo] = useState<{ id: string; title?: string } | null>(null)
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([])
  const [matches, setMatches] = useState<MatchPreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const { setScrollProgress } = useGradientOverlay()
  const [activeSegment, setActiveSegment] = useState<'matching' | 'chat'>('matching')
  const [similarIndex, setSimilarIndex] = useState(0)

  useEffect(() => {
    loadInitialData()
  }, [])

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        loadActiveEventAndAttendees(currentUser.id)
        loadMatches(currentUser.id)
      }
    }, [currentUser])
  )

  // Realtime: refresh when this user's check-in status changes
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel(`match_checkins_${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_checkins', filter: `user_id=eq.${currentUser.id}` },
        () => {
          loadActiveEventAndAttendees(currentUser.id)
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [currentUser])

  const loadInitialData = async () => {
    try {
      setError(null)
      // Auth
      const { data: { user }, error } = await AuthHelper.getUserWithFallback(3000)
      if (error || !user) {
        return
      }
      setCurrentUser(user)

      // Load active event and attendees
      await loadActiveEventAndAttendees(user.id)
      await loadMatches(user.id)
    } catch (e) {
      Logger.error('match', 'Unexpected error during initialization', { error: e })
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadMatches = async (userId: string) => {
    try {
      const { data: conversations, error: convError } = await supabase
        .from('private_conversations')
        .select(`
          id,
          match_id,
          last_message_at,
          matches!inner (
            user1_id,
            user2_id
          )
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`, { foreignTable: 'matches' })
        .order('last_message_at', { ascending: false })

      if (convError) {
        Logger.error('match', 'Error fetching conversations', { error: convError })
        setMatches([])
        return
      }

      const convs = (conversations || []) as any[]
      if (convs.length === 0) {
        setMatches([])
        return
      }

      const otherUserIdsSet = new Set<string>()
      const otherIdByConversation: Record<string, string> = {}
      for (const c of convs) {
        const m = Array.isArray(c.matches) ? c.matches[0] : c.matches
        if (!m) continue
        const otherId = m.user1_id === userId ? m.user2_id : m.user1_id
        if (otherId) {
          otherUserIdsSet.add(otherId)
          otherIdByConversation[c.id] = otherId
        }
      }

      const otherUserIds = Array.from(otherUserIdsSet)
      let profilesById: Record<string, { name?: string; photo?: string }> = {}

      if (otherUserIds.length > 0) {
        const [userProfilesRes, profilesRes] = await Promise.all([
          supabase.from('user_profiles').select('user_id, display_name, profile_photos, photos').in('user_id', otherUserIds),
          supabase.from('profiles').select('id, name').in('id', otherUserIds)
        ])

        const userProfiles = (userProfilesRes.data || []) as Array<{ user_id: string; display_name?: string; profile_photos?: string[]; photos?: string[] }>
        const basicProfiles = (profilesRes.data || []) as Array<{ id: string; name?: string }>

        const basicMap = new Map(basicProfiles.map(p => [p.id, p]))
        for (const up of userProfiles) {
          const bestPhoto = (up.profile_photos && up.profile_photos[0]) || (up.photos && up.photos[0])
          profilesById[up.user_id] = {
            name: up.display_name || basicMap.get(up.user_id)?.name,
            photo: bestPhoto,
          }
        }
        for (const p of basicProfiles) {
          if (!profilesById[p.id]) profilesById[p.id] = { name: p.name, photo: undefined }
        }
      }

      const matched: MatchPreview[] = convs.map(c => {
        const otherId = otherIdByConversation[c.id]
        const prof = otherId ? profilesById[otherId] : undefined
        return {
          conversation_id: c.id,
          other_user_id: otherId,
          other_user_name: prof?.name || 'User',
          photo_url: prof?.photo,
        }
      }).filter(m => !!m.other_user_id)

      setMatches(matched)
    } catch (e) {
      Logger.error('match', 'Failed to load matches', { error: e })
      setMatches([])
    }
  }

  const loadActiveEventAndAttendees = async (userId: string) => {
    try {
      // Find active event for current user
      const { data: checkins, error: checkinsError } = await supabase
        .from('event_checkins')
        .select('event_id, checked_in_at')
        .eq('user_id', userId)
        .is('checked_out_at', null)
        .order('checked_in_at', { ascending: false })
        .limit(1)

      if (checkinsError) {
        Logger.error('match', 'Error fetching user check-ins', { error: checkinsError })
        setEventInfo(null)
        setAttendees([])
        return
      }

      const activeEventId = checkins && checkins.length > 0 ? checkins[0].event_id as string : null
      if (!activeEventId) {
        setEventInfo(null)
        setAttendees([])
        return
      }

      // Optionally fetch event title
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, title')
        .eq('id', activeEventId)
        .single()
      if (!eventError && event) {
        setEventInfo({ id: event.id, title: event.title })
      } else {
        setEventInfo({ id: activeEventId })
      }

      // Get blocked users to filter out
      let blockedIds = new Set<string>()
      try {
        const blocked = await getBlockedUsers()
        blockedIds = new Set(blocked.map(b => b.blocked_id))
      } catch (blockErr) {
        Logger.warn('match', 'Failed to load blocked users', { error: blockErr })
      }

      // Prefer SECURITY DEFINER RPC to bypass RLS for attendee listing
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('get_event_attendees', { p_event_id: activeEventId })

      if (rpcError) {
        Logger.warn('match', 'get_event_attendees RPC failed, falling back to direct selects', { error: rpcError.message })
      }

      if (rpcRows && Array.isArray(rpcRows)) {
        const filtered = rpcRows.filter((r: any) => r.user_id !== userId && !blockedIds.has(r.user_id))
        const attendeeProfiles: AttendeeProfile[] = filtered.map((r: any) => ({
          user_id: r.user_id,
          name: r.display_name,
          age: r.age ?? undefined,
          bio: r.bio ?? undefined,
          interests: r.interests ?? undefined,
          profile_photos: (r.photos && r.photos.length > 0) ? r.photos : undefined,
          last_seen: r.checked_in_at ?? undefined,
        }))
        attendeeProfiles.sort((a, b) => {
          const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0
          const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0
          return tb - ta
        })
        setAttendees(attendeeProfiles)
        return
      }

      // Fallback path (may be limited by RLS):
      const { data: attendeeCheckins, error: attendeesError } = await supabase
        .from('event_checkins')
        .select('user_id, checked_in_at, checked_out_at')
        .eq('event_id', activeEventId)
        .is('checked_out_at', null)

      if (attendeesError || !attendeeCheckins) {
        Logger.error('match', 'Fallback attendees select failed', { error: attendeesError })
        setAttendees([])
        return
      }

      const uniqueUserIds = Array.from(
        new Set(
          attendeeCheckins
            .map(a => a.user_id as string)
            .filter(uid => uid && uid !== userId && !blockedIds.has(uid))
        )
      )

      if (uniqueUserIds.length === 0) {
        setAttendees([])
        return
      }

      const [profilesRes, userProfilesRes] = await Promise.all([
        supabase.from('profiles').select('id, name, age').in('id', uniqueUserIds),
        supabase.from('user_profiles').select('user_id, display_name, bio, profile_photos, photos, interests').in('user_id', uniqueUserIds),
      ])

      const profiles = (profilesRes.data || []) as Array<{ id: string; name?: string; age?: number }>
      const userProfiles = (userProfilesRes.data || []) as Array<{ user_id: string; display_name?: string; bio?: string; profile_photos?: string[]; photos?: string[]; interests?: string[] }>

      const userIdToProfile = new Map(profiles.map(p => [p.id, p]))
      const userIdToUserProfile = new Map(userProfiles.map(up => [up.user_id, up]))
      const checkinMap = new Map<string, string>(attendeeCheckins.map(a => [a.user_id as string, a.checked_in_at as string]))

      const attendeeProfiles: AttendeeProfile[] = uniqueUserIds.map(uid => {
        const p = userIdToProfile.get(uid)
        const up = userIdToUserProfile.get(uid)
        const photos = (up?.profile_photos && up.profile_photos.length > 0)
          ? up.profile_photos
          : (up?.photos && up.photos.length > 0 ? up.photos : [])
        return {
          user_id: uid,
          name: p?.name || up?.display_name,
          age: p?.age,
          bio: up?.bio,
          interests: up?.interests,
          profile_photos: photos,
          last_seen: checkinMap.get(uid),
        }
      })

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
      const { data, error } = await supabase.rpc('get_or_create_private_conversation', {
        p_user1_id: currentUser.id,
        p_user2_id: candidate.user_id
      })

      if (error) {
        console.error('Error creating conversation:', error)
        Alert.alert('Error', 'Failed to start conversation')
        return
      }
      const result: any = Array.isArray(data) ? data[0] : data
      if (result?.success) {
        router.push({
          pathname: '/private-chat/[conversationId]' as any,
          params: {
            conversationId: result.conversation_id,
            otherUserName: candidate.name,
            otherUserId: candidate.user_id
          }
        })
      } else {
        Alert.alert('Error', result?.message || 'Failed to start conversation')
      }
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
          <Image
            source={optimized ? ({ uri: optimized } as any) : placeholderImg}
            placeholder={placeholderImg}
            style={styles.tileImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
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

  const renderSimilarCard = (attendee: AttendeeProfile) => {
    const rawUrl = attendee.profile_photos && attendee.profile_photos.length > 0
      ? attendee.profile_photos[0]
      : ''
    const optimized = rawUrl
      ? getOptimizedImageUrl(rawUrl, { width: SIMILAR_CARD_WIDTH, height: SIMILAR_CARD_HEIGHT, resize: 'cover', quality: 70, format: 'webp' })
      : undefined

    return (
      <View key={`similar_${attendee.user_id}`} style={styles.similarCardWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.similarCard}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: attendee.user_id } as any })}
        >
          <Image
            source={optimized ? ({ uri: optimized } as any) : placeholderImg}
            placeholder={placeholderImg}
            style={styles.similarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <LinearGradient
            colors={[ 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)' ]}
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
  }

  const renderStartupItem = (attendee: AttendeeProfile) => {
    const rawUrl = attendee.profile_photos && attendee.profile_photos.length > 0 ? attendee.profile_photos[0] : ''
    const gridWidth = Math.floor((width - 32 - 12 * 2) / 3)
    const gridHeight = Math.floor(gridWidth * 1.05)
    const optimized = rawUrl
      ? getOptimizedImageUrl(rawUrl, { width: gridWidth, height: gridHeight, resize: 'cover', quality: 60, format: 'webp' })
      : undefined

    return (
      <View key={`grid_${attendee.user_id}`} style={[styles.gridItem, { width: gridWidth, height: gridHeight }]}> 
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.gridTouch}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: attendee.user_id } as any })}
        >
          <Image
            source={optimized ? ({ uri: optimized } as any) : placeholderImg}
            placeholder={placeholderImg}
            style={styles.gridImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <LinearGradient colors={[ 'transparent', 'rgba(0,0,0,0.55)' ]} style={styles.gridGradient} />
          <View style={styles.gridInfo}>
            <Text style={styles.gridName} numberOfLines={1}>{attendee.name}{attendee.age ? `, ${attendee.age}` : ''}</Text>
            <Text style={styles.gridTime}>{formatTimeAgo(attendee.last_seen)}</Text>
          </View>
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

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading attendees...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
        <LinearGradient colors={[ '#480D37', '#000000' ]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.heroGradient}>
          <AppHeader
            title="The Grid"
            variant="darkTransparent"
            showBottomBorder={false}
            rightIconButton={{ name: 'refresh', onPress: () => currentUser && loadActiveEventAndAttendees(currentUser.id), accessibilityLabel: 'Refresh' }}
          />

          <View style={styles.segmentContainer}>
            <View style={styles.segmentPill}>
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
        </LinearGradient>

        {!eventInfo ? (
          renderEmptyState()
        ) : attendees.length === 0 ? (
          <View style={styles.noMoreContainer}>
            <Text style={styles.noMoreIcon}>👋</Text>
            <Text style={styles.noMoreTitle}>You're early!</Text>
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
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x
                const idx = Math.round(x / (SIMILAR_CARD_WIDTH + 16))
                setSimilarIndex(Math.max(0, idx))
              }}
              scrollEventThrottle={16}
              renderItem={({ item }) => renderSimilarCard(item)}
            />
            <View style={styles.dotsRow}>
              {new Array(Math.min(4, Math.max(1, attendees.length))).fill(0).map((_, i) => (
                <View key={`dot_${i}`} style={[styles.dot, i === (similarIndex % 4) && styles.dotActive]} />
              ))}
            </View>

            <Text style={styles.sectionTitle}>People Nearby</Text>
            <View style={styles.gridWrap}>
              {attendees.slice(0, 12).map(renderStartupItem)}
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
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  
  segmentContainer: {
    paddingTop: 14,
  },
  segmentPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 28,
    padding: 6,
    flexDirection: 'row',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  segmentText: {
    color: '#ffffffbb',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
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
    borderRadius: 18,
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
  dot: {
    width: 26,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 2,
  },
  gridItem: {
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    marginBottom: 12,
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