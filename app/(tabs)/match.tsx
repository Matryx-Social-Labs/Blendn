import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { getBlockedUsers, showUserSafetyActions } from '../../lib/safetyUtils'
import { AuthHelper, supabase } from '../../lib/supabase'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')
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
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [eventInfo, setEventInfo] = useState<{ id: string; title?: string } | null>(null)
  const [attendees, setAttendees] = useState<AttendeeProfile[]>([])
  const [matches, setMatches] = useState<MatchPreview[]>([])
  const [error, setError] = useState<string | null>(null)

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
        router.replace('/(tabs)/events')
        return
      }
      setCurrentUser(user)

      // Load active event and attendees
      await loadActiveEventAndAttendees(user.id)
      await loadMatches(user.id)
    } catch (e) {
      console.error('💥 [MATCH_INIT] Unexpected error:', e)
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
        console.error('❌ [MATCHES] Error fetching conversations:', convError)
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
      console.error('💥 [MATCHES] Failed to load matches:', e)
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
        console.error('❌ [MATCH] Error fetching user check-ins:', checkinsError)
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
        console.warn('⚠️ [MATCH] Failed to load blocked users:', blockErr)
      }

      // Prefer SECURITY DEFINER RPC to bypass RLS for attendee listing
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('get_event_attendees', { p_event_id: activeEventId })

      if (rpcError) {
        console.warn('⚠️ [MATCH] get_event_attendees RPC failed, falling back to direct selects:', rpcError.message)
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
        console.error('❌ [MATCH] Fallback attendees select failed:', attendeesError)
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
      console.error('💥 [MATCH] Failed to load event attendees:', e)
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

      const result = data[0]
      if (result.success) {
        router.push({
          pathname: '/private-chat/[conversationId]' as any,
          params: {
            conversationId: result.conversation_id,
            otherUserName: candidate.name,
            otherUserId: candidate.user_id
          }
        })
      } else {
        Alert.alert('Error', result.message)
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
          onPress={() => router.push({ pathname: '/user/[id]' as any, params: { id: attendee.user_id } })}
        >
          {optimized ? (
            <Image
              source={{ uri: optimized }}
              placeholder={placeholderImg}
              style={styles.tileImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          ) : (
            <Image
              source={placeholderImg}
              style={styles.tileImage}
              contentFit="cover"
            />
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>People</Text>
        {eventInfo ? (
          <Text style={styles.headerSubtitle}>
            Active at {eventInfo.title ? `“${eventInfo.title}”` : 'your event'}
          </Text>
        ) : (
          <Text style={styles.headerSubtitle}>Connect with people at your events</Text>
        )}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => currentUser && loadActiveEventAndAttendees(currentUser.id)}>
          <Ionicons name="refresh" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {matches.length > 0 && (
        <View style={styles.matchesContainer}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>Your matches</Text>
            <Text style={styles.rowCount}>{matches.length}</Text>
          </View>
          <FlatList
            data={matches}
            keyExtractor={(m) => m.conversation_id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchesScroll}
            initialNumToRender={8}
            windowSize={5}
            maxToRenderPerBatch={8}
            renderItem={({ item: m }) => {
              const optimized = m.photo_url
                ? getOptimizedImageUrl(m.photo_url, { width: 66, height: 66, resize: 'cover', quality: 60 })
                : undefined
              const sources = optimized ? [{ uri: optimized }, { uri: m.photo_url! }] : undefined
              return (
                <View style={styles.matchItem}>
                  <TouchableOpacity
                    style={styles.matchAvatarWrapper}
                    onPress={() => router.push(`/private-chat/${m.conversation_id}`)}
                  >
                    <View style={styles.matchAvatarRing}>
                      {sources ? (
                        <Image source={sources as any} placeholder={placeholderImg} style={styles.matchAvatar} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Image source={placeholderImg} style={styles.matchAvatar} contentFit="cover" />
                      )}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.matchName} numberOfLines={1}>{m.other_user_name || 'User'}</Text>
                </View>
              )
            }}
          />
        </View>
      )}

      {!eventInfo ? (
        renderEmptyState()
      ) : attendees.length === 0 ? (
        <View style={styles.noMoreContainer}>
          <Text style={styles.noMoreIcon}>👋</Text>
          <Text style={styles.noMoreTitle}>You're early!</Text>
          <Text style={styles.noMoreText}>No other active attendees yet. Check back soon.</Text>
        </View>
      ) : (
        <View style={styles.carouselContainer}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>Active attendees</Text>
            <Text style={styles.rowCount}>{attendees.length}</Text>
          </View>
          <FlatList
            data={attendees}
            keyExtractor={(a) => a.user_id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            renderItem={({ item }) => renderAttendeeTile(item)}
            initialNumToRender={6}
            windowSize={7}
            maxToRenderPerBatch={6}
            getItemLayout={(data, index) => ({ length: TILE_WIDTH + 12, offset: (TILE_WIDTH + 12) * index, index })}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    right: 20,
    top: 16,
    padding: 8,
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