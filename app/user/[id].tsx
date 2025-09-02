import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { AuthHelper, supabase } from '../../lib/supabase'
const placeholderImg = require('../../assets/images/icon.png')

const { width } = Dimensions.get('window')
const PHOTO_HEIGHT = Math.min(420, Math.floor(width * 1.1))

interface UserProfileView {
  user_id: string
  name?: string
  age?: number
  bio?: string
  interests?: string[]
  photos?: string[]
  profile_photos?: string[]
}

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfileView | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const { data: { user } } = await AuthHelper.getUserWithFallback(4000)
      setCurrentUserId(user?.id || null)

      // Try safe RPC first (security definer)
      let display: UserProfileView | null = null
      try {
        const { data: rpcData } = await supabase.rpc('get_user_profile_safe', { p_user_id: id })
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
        if (row) {
          const photos = (row.profile_photos && row.profile_photos.length > 0)
            ? row.profile_photos
            : (row.photos && row.photos.length > 0 ? row.photos : [])
          display = {
            user_id: id,
            name: row.display_name || row.name,
            age: row.age ?? undefined,
            bio: row.bio ?? undefined,
            interests: row.interests ?? undefined,
            photos,
            profile_photos: Array.isArray(row.profile_photos) ? row.profile_photos : [],
          }
        }
      } catch {}

      if (!display) {
        // Fallback to direct selects
        const [pRes, upRes] = await Promise.all([
          supabase.from('profiles').select('id, name, age').eq('id', id).single(),
          supabase.from('user_profiles').select('display_name, bio, age, interests, profile_photos, photos').eq('user_id', id).single(),
        ])
        const p = pRes.data || null
        const up = upRes.data || null
        const photos = (up?.profile_photos && up.profile_photos.length > 0)
          ? up.profile_photos
          : (up?.photos && up.photos.length > 0 ? up.photos : [])
        display = {
          user_id: id,
          name: up?.display_name || p?.name,
          age: up?.age ?? p?.age,
          bio: up?.bio,
          interests: up?.interests,
          photos,
          profile_photos: Array.isArray(up?.profile_photos) ? up?.profile_photos : [],
        }
      }

      setProfile(display)
    } catch (e) {
      console.error('[USER_PROFILE] load failed:', e)
      Alert.alert('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!currentUserId || !profile) return
    if (currentUserId === profile.user_id) return
    setActionLoading(true)
    try {
      // Send message request instead of immediate match
      const { data, error } = await supabase.rpc('send_message_request', {
        p_sender_id: currentUserId,
        p_receiver_id: profile.user_id,
        p_event_id: null,
        p_message: null,
      })
      if (error) {
        console.error('send_message_request error:', error)
        Alert.alert('Error', 'Could not send request')
        return
      }
      const result = Array.isArray(data) ? data[0] : data
      if (result?.success) {
        Alert.alert('Request sent', 'They will need to accept to start chatting.')
      } else {
        Alert.alert('Info', result?.message || 'Could not send request')
      }
    } catch (e) {
      console.error('connect error:', e)
      Alert.alert('Error', 'Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMessage = async () => {
    if (!currentUserId || !profile) return
    if (currentUserId === profile.user_id) return
    setActionLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_or_create_private_conversation', {
        p_user1_id: currentUserId,
        p_user2_id: profile.user_id,
      })
      if (error) {
        console.error('get_or_create_private_conversation error:', error)
        Alert.alert('Error', 'Could not start conversation')
        return
      }
      const result = Array.isArray(data) ? data[0] : data
      if (result?.success) {
        router.push({
          pathname: '/private-chat/[conversationId]' as any,
          params: {
            conversationId: result.conversation_id,
            otherUserName: profile.name || 'User',
            otherUserId: profile.user_id,
          },
        })
      } else {
        Alert.alert('Info', result?.message || 'Could not open chat')
      }
    } catch (e) {
      console.error('message error:', e)
      Alert.alert('Error', 'Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  const openSafety = () => {
    if (!profile) return
    showUserSafetyActions(profile.name || 'User', profile.user_id)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.muted}>Loading profile…</Text>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Text style={styles.muted}>Profile not found</Text>
      </SafeAreaView>
    )
  }

  const photoList = (profile.photos && profile.photos.length > 0)
    ? profile.photos
    : ['https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=800']

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader
        title="Profile"
        onBack={() => router.back()}
        rightIconButton={{ name: 'ellipsis-vertical', onPress: openSafety, accessibilityLabel: 'More options' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
        >
          {photoList.map((uri, idx) => {
            const optimized = getOptimizedImageUrl(uri, { width, height: PHOTO_HEIGHT, resize: 'cover', quality: 70 })
            const finalUrl = optimized || uri
            return (
              <View key={idx} style={styles.photoSlide}>
                <View style={styles.photoContainer}>
                  <Image
                    source={{ uri: finalUrl } as any}
                    placeholder={placeholderImg}
                    style={styles.photo}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                </View>
              </View>
            )
          })}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.rowBetween}>
            <Text style={styles.name}>
              {profile.name}{profile.age ? `, ${profile.age}` : ''}
            </Text>
          </View>

          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.tags}>
                {profile.interests.map((i, idx) => (
                  <View key={`${i}-${idx}`} style={styles.tag}><Text style={styles.tagText}>{i}</Text></View>
                ))}
              </View>
            </View>
          )}

          {!!profile.bio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.aboutText}>{profile.bio}</Text>
            </View>
          )}

          {(profile.profile_photos && profile.profile_photos.length > 0) || (profile.photos && profile.photos.length > 0) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gallery</Text>
              <View style={styles.galleryGrid}>
                {(profile.profile_photos && profile.profile_photos.length > 0 ? profile.profile_photos : profile.photos || []).map((uri, idx) => {
                  const optimized = getOptimizedImageUrl(uri, { width: 120, height: 120, resize: 'cover', quality: 60, format: 'webp' })
                  const finalUrl = optimized || uri
                  return (
                    <View key={`gal_${idx}`} style={styles.galleryItem}>
                      <Image
                        source={{ uri: finalUrl } as any}
                        placeholder={placeholderImg}
                        style={styles.galleryImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                      />
                    </View>
                  )
                })}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.actionsOverlay} pointerEvents="box-none">
        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn]}
            onPress={async () => {
              try {
                if (currentUserId && profile?.user_id) {
                  // Find active event for the current user so the swipe can be tied to it
                  const { data: checkins } = await supabase
                    .from('event_checkins')
                    .select('event_id, checked_in_at')
                    .eq('user_id', currentUserId)
                    .is('checked_out_at', null)
                    .order('checked_in_at', { ascending: false })
                    .limit(1)

                  const eventId = Array.isArray(checkins) && checkins.length > 0 ? (checkins[0] as any).event_id : null
                  if (eventId) {
                    await supabase.from('swipes').insert({
                      swiper_id: currentUserId,
                      swiped_id: profile.user_id,
                      event_id: eventId,
                      action: 'pass',
                    })
                  }
                }
              } catch {}
              // Navigate back to Match screen
              try { router.replace('/(tabs)/match' as any) } catch { router.back() }
            }}
          >
            <View style={styles.circleInner}>
              <Ionicons name="close" size={28} color="#7A2CF3" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn]}
            disabled={actionLoading || currentUserId === profile.user_id}
            onPress={handleConnect}
          >
            <View style={styles.circleInner}>
              <Ionicons name="heart" size={26} color="#E23B3B" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { marginTop: 8, color: '#666' },
  
  photoStrip: { width, height: PHOTO_HEIGHT, backgroundColor: 'transparent' },
  photoSlide: { width },
  photoContainer: { marginHorizontal: 12, marginTop: 12, marginBottom: 8, borderRadius: 18, overflow: 'hidden' },
  photo: { width: width - 24, height: PHOTO_HEIGHT - 20, borderRadius: 18 },
  content: { padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 24, fontWeight: '800', color: '#fff' },
  bio: { marginTop: 8, fontSize: 16, color: '#fff', lineHeight: 22 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 8 },
  aboutText: { color: '#fff', fontSize: 14, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: '#f2f2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 8, marginBottom: 8 },
  tagText: { color: '#444', fontSize: 12, fontWeight: '600' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  galleryItem: { width: Math.floor((width - 16 * 2 - 8 * 2) / 3), height: Math.floor((width - 16 * 2 - 8 * 2) / 3), marginRight: 8, marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1f0b1e' },
  galleryImage: { width: '100%', height: '100%' },
  actionsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 28 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  circleBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  circleInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
})


