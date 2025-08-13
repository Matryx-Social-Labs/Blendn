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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openSafety}>
          <Ionicons name="ellipsis-vertical" size={20} color="#333" />
        </TouchableOpacity>
      </View>

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
              <Image
                key={idx}
                source={{ uri: finalUrl } as any}
                placeholder={placeholderImg}
                style={styles.photo}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
            )
          })}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.rowBetween}>
            <Text style={styles.name}>
              {profile.name}{profile.age ? `, ${profile.age}` : ''}
            </Text>
          </View>

          {!!profile.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

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
        </View>
      </ScrollView>

      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.connectBtn]}
          disabled={actionLoading || currentUserId === profile.user_id}
          onPress={handleConnect}
        >
          <Ionicons name="hand-right" size={18} color="#fff" />
          <Text style={styles.actionText}>Connect</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { marginTop: 8, color: '#666' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  backBtn: { padding: 8 },
  iconBtn: { padding: 8 },
  photoStrip: { width, height: PHOTO_HEIGHT, backgroundColor: '#eee' },
  photo: { width, height: PHOTO_HEIGHT },
  content: { padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 24, fontWeight: '800', color: '#222' },
  bio: { marginTop: 8, fontSize: 16, color: '#444', lineHeight: 22 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: '#f2f2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 8, marginBottom: 8 },
  tagText: { color: '#444', fontSize: 12, fontWeight: '600' },
  actionsBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    padding: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0', backgroundColor: '#fff'
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  connectBtn: { backgroundColor: '#4F8EF7' },
})


