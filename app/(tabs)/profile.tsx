import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import { apiClient } from '../../lib/apiClient'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { useAuth } from '../../lib/useAuth'
const placeholderImg = require('../../assets/images/icon.png')

// Screen metrics used in styles (must be module-level to avoid runtime ReferenceError)
const WINDOW_WIDTH = Dimensions.get('window').width
const PHOTO_HEIGHT = Math.min(420, Math.floor(WINDOW_WIDTH * 1.1))

interface UserProfileViewModel {
  id: string
  name?: string
  bio?: string
  age?: number
  location?: string
  interests?: string[]
  profile_photos?: string[]
  photos?: string[]
  goals?: string[]
  looking_for?: string[]
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfileViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setScrollProgress } = useGradientOverlay()

  useEffect(() => {
    if (!authLoading && user) {
      getUserAndProfile()
    }
  }, [user, authLoading])

  const getUserAndProfile = async () => {
    if (!user) return
    try {
      console.log('[PROFILE] Loading profile for user:', user.id);
      setLoading(true)
      setError(null)

      const result = await apiClient.getProfile(user.id)

      if (!result.success || !result.data) {
        console.error('[PROFILE] Error fetching profile:', result.error)
        setError('Failed to load profile')
        return
      }

      const data = result.data
      const profileData = data.profile || {}

      const viewModel: UserProfileViewModel = {
        id: data.id,
        name: data.name ?? profileData.name ?? undefined,
        age: profileData.age ?? undefined,
        location: profileData.location ?? undefined,
        bio: profileData.bio ?? undefined,
        interests: profileData.interests ?? undefined,
        profile_photos: (profileData.profile_photos && profileData.profile_photos.length > 0)
          ? profileData.profile_photos
          : (profileData.photos && profileData.photos.length > 0 ? profileData.photos : undefined),
        goals: profileData.goals ?? undefined,
        looking_for: profileData.looking_for ?? undefined,
      }

      console.log('[PROFILE] Profile loaded successfully')
      setProfile(viewModel)

    } catch (error) {
      console.error('[PROFILE] Unexpected error:', error)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      console.log('[PROFILE] Signing out...')
      const result = await apiClient.signOut()
      if (!result.success) {
        console.error('[PROFILE] Sign out error:', result.error)
        Alert.alert('Error', 'Failed to sign out')
      } else {
        console.log('[PROFILE] Signed out successfully')
        // Central router handles navigation
      }
    } catch (error) {
      console.error('[PROFILE] Sign out error:', error)
      Alert.alert('Error', 'Failed to sign out')
    }
  }

  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  // Using module-level WINDOW_WIDTH/PHOTO_HEIGHT for styles consistency
  const computeProfileStrength = (p: UserProfileViewModel | null): number => {
    if (!p) return 0
    const checks = [
      !!p.name,
      !!p.age,
      !!p.location,
      !!(p.profile_photos && p.profile_photos.length > 0),
      !!p.bio,
      !!(p.interests && p.interests.length > 0),
      !!(p.goals && p.goals.length > 0),
      !!(p.looking_for && p.looking_for.length > 0),
    ]
    const score = checks.reduce((acc, v) => acc + (v ? 1 : 0), 0)
    return Math.max(10, Math.min(100, Math.round((score / checks.length) * 100)))
  }

  // Show loading while auth is loading
  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
            {[...Array(2)].map((_, i) => (
              <View key={`skp_${i}`} style={styles.photoSlide}>
                <View style={styles.photoContainer}>
                  <SkeletonBlock width={WINDOW_WIDTH - 24} height={PHOTO_HEIGHT - 20} borderRadius={18} />
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
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // Show error state
  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={getUserAndProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Typography variant="h1" style={styles.headerTitle}>About me</Typography>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="settings-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/edit-profile')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 12 }}>
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollProgress(e.nativeEvent.contentOffset.y, 320)}
        scrollEventThrottle={16}
      >
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / WINDOW_WIDTH)
            setActivePhotoIndex(index)
          }}
        >
          {(profile?.profile_photos && profile.profile_photos.length > 0 ? profile.profile_photos : profile?.photos || []).map((uri, idx) => {
            const optimized = getOptimizedImageUrl(uri, { width: WINDOW_WIDTH, height: PHOTO_HEIGHT, resize: 'cover', quality: 70 })
            const finalUrl = optimized || uri
            return (
              <View key={idx} style={styles.photoSlide}>
                <View style={styles.photoContainer}>
                  <OptimizedImage
                    source={uri as any}
                    style={styles.photo as any}
                    contentFit="cover"
                    width={WINDOW_WIDTH}
                    height={PHOTO_HEIGHT}
                    quality={70}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={[ 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)' ]}
                    locations={[0.4, 0.75, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.heroGradient}
                  />
                  {/* Overlay name/subtitle and strength pill */}
                  <View style={styles.heroOverlay} pointerEvents="none">
                    <Typography variant="h1" style={styles.heroName}>
                      {(profile?.name || 'New User')}
                    </Typography>
                    <Typography variant="body2" style={styles.heroSubtitle}>Entrepreneur</Typography>
                    <View style={styles.matchPill} pointerEvents="none">
                      <View style={styles.matchPillBadge}>
                        {/* Simple filled badge for now; ring removed to avoid extra deps */}
                        <Text style={styles.matchPillPercent}>{computeProfileStrength(profile)}%</Text>
                      </View>
                      <Text style={styles.matchPillLabel}>  Profile Strength</Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.rowBetween}>
            <Typography variant="h1" style={styles.name}>
              {profile?.name || 'New User'}{profile?.age ? `, ${profile.age}` : ''}
            </Typography>
          </View>

          {/* Details list - match Figma ordering */}
          <View style={styles.detailsList}>
            {!!profile?.age && (
              <View style={styles.detailRow}>
                <Ionicons name="male" size={16} color="#fff" style={styles.detailIcon} />
                <Text style={styles.detailText}>Male, {profile.age}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Ionicons name="briefcase-outline" size={16} color="#fff" style={styles.detailIcon} />
              <Text style={styles.detailText}>CEO at Four Fold</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="school-outline" size={16} color="#fff" style={styles.detailIcon} />
              <Text style={styles.detailText}>BBA, Delhi University</Text>
            </View>
            {!!profile?.location && (
              <View style={styles.detailRow}>
                <Ionicons name="business-outline" size={16} color="#fff" style={styles.detailIcon} />
                <Text style={styles.detailText}>{profile.location}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Omit Looking for / Goals on About me screen to match Figma */}

          {!!profile?.interests?.length && (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>Interests</Typography>
              <View style={styles.tags}>
                {profile.interests.map((i, idx) => (
                  <View key={`${i}-${idx}`} style={styles.tag}><Typography variant="caption" style={styles.tagText}>{i}</Typography></View>
                ))}
              </View>
            </View>
          )}

          {!!profile?.bio && (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>About me</Typography>
              <Typography variant="body1" style={styles.aboutText}>{profile.bio}</Typography>
            </View>
          )}

          {(profile?.profile_photos && profile.profile_photos.length > 0) || (profile?.photos && profile.photos.length > 0) ? (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>Photos & Videos</Typography>
              {/* Collage layout based on Figma; horizontally scrollable */}
              {(() => {
                const list = (profile?.profile_photos && profile.profile_photos.length > 0 ? profile.profile_photos : profile?.photos || []) as string[]
                const contentWidthDesign = 460
                const designWidth = 393
                const containerWidth = WINDOW_WIDTH - 24
                const scale = containerWidth / designWidth
                const S = (n: number) => Math.round(n * scale)
                const items = [
                  { x: 0, y: 0, w: 135, h: 141, i: 0 },
                  { x: 0, y: 141, w: 135, h: 104, i: 1 },
                  { x: 143, y: 0, w: 184, h: 64, i: 2 },
                  { x: 143, y: 71, w: 222, h: 174, i: 3 },
                  { x: 335, y: 0, w: 125, h: 64, i: 4 },
                  { x: 374, y: 71, w: 86, h: 83, i: 5 },
                  { x: 374, y: 162, w: 86, h: 83, i: 6 },
                ]
                const get = (idx: number) => list[idx % list.length]
                return (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: containerWidth, height: S(245) }}>
                    <View style={{ width: S(contentWidthDesign), height: S(245) }}>
                      {items.map((it, idx) => (
                        <View key={`cv_${idx}`} style={{ position: 'absolute', left: S(it.x), top: S(it.y), width: S(it.w), height: S(it.h), borderRadius: 16, overflow: 'hidden', backgroundColor: '#1f0b1e' }}>
                          <OptimizedImage
                            source={get(idx) as any}
                            style={{ width: '100%', height: '100%' } as any}
                            contentFit="cover"
                            width={S(it.w)}
                            height={S(it.h)}
                            quality={60}
                          />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )
              })()}
            </View>
          ) : null}
        </View>
      </ScrollView>

     
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 20,
  },
  errorText: { fontSize: 16, color: '#e74c3c', textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  photoStrip: { width: WINDOW_WIDTH, height: PHOTO_HEIGHT, backgroundColor: 'transparent' },
  photoSlide: { width: WINDOW_WIDTH },
  photoContainer: { marginHorizontal: 12, marginTop: 12, marginBottom: 8, borderRadius: 18, overflow: 'hidden' },
  photo: { width: WINDOW_WIDTH - 24, height: PHOTO_HEIGHT - 20, borderRadius: 18 },

  content: { padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 24, fontWeight: '800', color: '#fff' },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  aboutText: { color: '#c796e1', fontSize: 16, lineHeight: 25 },
  tags: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: '#330826', borderWidth: 1, borderColor: '#61114a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 24, marginRight: 10, marginBottom: 10 },
  tagText: { color: '#fff', fontSize: 13, fontWeight: '400' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  galleryItem: { width: Math.floor((WINDOW_WIDTH - 16 * 2 - 4 * 2) / 3), height: Math.floor((WINDOW_WIDTH - 16 * 2 - 4 * 2) / 3), marginBottom: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1f0b1e' },
  galleryImage: { width: '100%', height: '100%' },

  actionsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 28 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  circleBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  circleInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', flex: 1, marginLeft: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },

  heroOverlay: { position: 'absolute', left: 16, right: 16, bottom: 24, alignItems: 'center' },
  heroName: { color: '#fff', fontSize: 28, fontWeight: '800' },
  heroSubtitle: { color: '#ffffffcc', marginTop: 4 },
  heroGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 18 },

  matchPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#330826', borderColor: '#61114a', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18, marginTop: 10 },
  matchPillBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3C614', marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  matchPillPercent: { color: '#000', fontWeight: '700', fontSize: 10 },
  matchPillLabel: { color: '#FFFFFF', fontWeight: '700' },

  detailsList: { marginTop: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailIcon: { marginRight: 10 },
  detailText: { color: '#fff', fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 18 },
}) 