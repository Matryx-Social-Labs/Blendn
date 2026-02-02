import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import { apiClient } from '../../lib/apiClient'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { useAuth } from '../../lib/useAuth'
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
  const { user: authUser } = useAuth()
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
      // Load public profile via API
      const result = await apiClient.getPublicProfile(id)

      if (result.success && result.data) {
        const data = result.data
        const photos = data.photos || data.profile_photos || []
        setProfile({
          user_id: id,
          name: data.name || data.display_name,
          age: data.age,
          bio: data.bio,
          interests: data.interests,
          photos,
          profile_photos: photos,
        })
      } else {
        // Fallback: try getProfile if public profile endpoint not available
        const fallbackResult = await apiClient.getProfile(id)
        if (fallbackResult.success && fallbackResult.data) {
          const data = fallbackResult.data
          const photos = data.photos || data.profile_photos || []
          setProfile({
            user_id: id,
            name: data.name,
            age: data.age,
            bio: data.bio,
            interests: data.interests,
            photos,
            profile_photos: photos,
          })
        }
      }
    } catch (e) {
      console.error('[USER_PROFILE] load failed:', e)
      Alert.alert('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!authUser || !profile) return
    if (authUser.id === profile.user_id) return
    setActionLoading(true)
    try {
      const result = await apiClient.createMessageRequest(profile.user_id)
      if (result.success) {
        Alert.alert('Request Sent', `Your connection request has been sent to ${profile.name || 'this user'}.`)
      } else {
        // Handle specific error cases
        if (result.error?.includes('already sent') || result.error?.includes('already have')) {
          Alert.alert('Already Connected', result.error)
        } else {
          Alert.alert('Error', result.error || 'Failed to send connection request')
        }
      }
    } catch (e) {
      console.error('connect error:', e)
      Alert.alert('Error', 'Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMessage = async () => {
    if (!authUser || !profile) return
    if (authUser.id === profile.user_id) return
    setActionLoading(true)
    try {
      // TODO: Add API endpoint for private conversations
      // POST /api/mobile/conversations
      Alert.alert('Coming Soon', 'Private messaging will be available soon.')
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

  const isLoading = loading

  if (!profile) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Typography variant="body2" style={styles.muted}>Profile not found</Typography>
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
        {isLoading ? (
          <>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {[...Array(2)].map((_, i) => (
                <View key={`skp_${i}`} style={styles.photoSlide}>
                  <View style={styles.photoContainer}>
                    <SkeletonBlock width={width - 24} height={PHOTO_HEIGHT - 20} borderRadius={18} />
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.content}>
              <View style={styles.rowBetween}>
                <SkeletonLine width={'50%'} />
              </View>
              <View style={styles.section}>
                <SkeletonLine width={'30%'} style={{ marginBottom: 10 }} />
                <View style={styles.tags}>
                  {[...Array(5)].map((_, i) => (
                    <SkeletonBlock key={`skt_${i}`} width={78} height={28} borderRadius={14} style={{ marginRight: 8, marginBottom: 8 }} />
                  ))}
                </View>
              </View>
              <View style={styles.section}>
                <SkeletonLine width={'25%'} style={{ marginBottom: 8 }} />
                {[...Array(3)].map((_, i) => (
                  <SkeletonLine key={`ska_${i}`} width={`${80 - i * 10}%`} style={{ marginBottom: 6 }} />
                ))}
              </View>
              <View style={styles.section}>
                <SkeletonLine width={'30%'} style={{ marginBottom: 10 }} />
                <View style={styles.galleryGrid}>
                  {[...Array(6)].map((_, i) => (
                    <SkeletonBlock key={`skg_${i}`} width={Math.floor((width - 16 * 2 - 8 * 2) / 3)} height={Math.floor((width - 16 * 2 - 8 * 2) / 3)} borderRadius={12} style={{ marginRight: 8, marginBottom: 8 }} />
                  ))}
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.photoStrip}
            >
              {photoList.map((uri, idx) => (
                <View key={idx} style={styles.photoSlide}>
                  <View style={styles.photoContainer}>
                    <OptimizedImage
                      source={uri as any}
                      style={styles.photo as any}
                      contentFit="cover"
                      width={width}
                      height={PHOTO_HEIGHT}
                      quality={70}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.content}>
              <View style={styles.rowBetween}>
                <Typography variant="h1" style={styles.name}>
                  {profile.name}{profile.age ? `, ${profile.age}` : ''}
                </Typography>
              </View>

              {profile.interests && profile.interests.length > 0 && (
                <View style={styles.section}>
                  <Typography variant="h3" style={styles.sectionTitle}>Interests</Typography>
                  <View style={styles.tags}>
                    {profile.interests.map((i, idx) => (
                      <View key={`${i}-${idx}`} style={styles.tag}><Typography variant="caption" style={styles.tagText}>{i}</Typography></View>
                    ))}
                  </View>
                </View>
              )}

              {!!profile.bio && (
                <View style={styles.section}>
                  <Typography variant="h3" style={styles.sectionTitle}>About</Typography>
                  <Typography variant="body1" style={styles.aboutText}>{profile.bio}</Typography>
                </View>
              )}

              {(profile.profile_photos && profile.profile_photos.length > 0) || (profile.photos && profile.photos.length > 0) ? (
                <View style={styles.section}>
                  <Typography variant="h3" style={styles.sectionTitle}>Gallery</Typography>
                  <View style={styles.galleryGrid}>
                    {(profile.profile_photos && profile.profile_photos.length > 0 ? profile.profile_photos : profile.photos || []).map((uri, idx) => (
                      <View key={`gal_${idx}`} style={styles.galleryItem}>
                        <OptimizedImage
                          source={uri as any}
                          style={styles.galleryImage as any}
                          contentFit="cover"
                          width={120}
                          height={120}
                          quality={60}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {!isLoading && (
        <View style={styles.actionsOverlay} pointerEvents="box-none">
          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.circleBtn]}
              onPress={async () => {
                // TODO: Add swipe/pass API endpoint if needed
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
              disabled={actionLoading || authUser?.id === profile.user_id}
              onPress={handleConnect}
            >
              <View style={styles.circleInner}>
                <Ionicons name="heart" size={26} color="#E23B3B" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}
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


