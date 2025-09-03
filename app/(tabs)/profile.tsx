import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { supabase } from '../../lib/supabase'
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
    try {
      console.log('🔍 [PROFILE] Loading profile for user:', user?.id);
      setLoading(true)
      setError(null)

      // Load core profile
      const { data: baseProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, age, location')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('❌ [PROFILE] Error fetching profile:', profileError)
        setError('Failed to load profile')
        return
      }
      
      if (!baseProfile) {
        console.log('⚠️ [PROFILE] No profile found')
        setError('Profile not found')
        return
      }
      
      // Load extended onboarding details
      const { data: userProfile, error: userProfileError } = await supabase
        .from('user_profiles')
        .select('bio, interests, profile_photos, photos, goals, looking_for')
        .eq('user_id', user.id)
        .single()

      if (userProfileError) {
        console.warn('⚠️ [PROFILE] user_profiles fetch warning:', userProfileError.message)
      }

      const viewModel: UserProfileViewModel = {
        id: baseProfile.id,
        name: baseProfile.name ?? undefined,
        age: baseProfile.age ?? undefined,
        location: (baseProfile as any)?.location ?? undefined,
        bio: userProfile?.bio ?? undefined,
        interests: userProfile?.interests ?? undefined,
        profile_photos: (userProfile?.profile_photos && userProfile.profile_photos.length > 0)
          ? userProfile.profile_photos
          : (userProfile?.photos && userProfile.photos.length > 0 ? userProfile.photos : undefined),
        goals: userProfile?.goals ?? undefined,
        looking_for: userProfile?.looking_for ?? undefined,
      }

      console.log('✅ [PROFILE] Profile loaded successfully')
      setProfile(viewModel)

    } catch (error) {
      console.error('💥 [PROFILE] Unexpected error:', error)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      console.log('🔐 [PROFILE] Signing out...')
              const { error } = await supabase.auth.signOut()
              if (error) {
        console.error('❌ [PROFILE] Sign out error:', error)
                Alert.alert('Error', 'Failed to sign out')
      } else {
        console.log('✅ [PROFILE] Signed out successfully')
        // Central router handles navigation
      }
    } catch (error) {
      console.error('💥 [PROFILE] Sign out error:', error)
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
        {((profile?.profile_photos && profile.profile_photos.length > 0) || (profile?.photos && profile.photos.length > 0)) && (
          <Image
            source={{ uri: (profile?.profile_photos || profile?.photos || [])[0] as any }}
            style={styles.headerAvatar}
            contentFit="cover"
          />
        )}
        <Typography variant="h1" style={styles.headerTitle}>About me</Typography>
        <TouchableOpacity onPress={() => router.push('/edit-profile')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="create-outline" size={20} color="#fff" />
        </TouchableOpacity>
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
                  <Image
                    source={{ uri: finalUrl } as any}
                    placeholder={placeholderImg}
                    style={styles.photo}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={[ 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)' ]}
                    locations={[0.4, 0.75, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.heroGradient}
                  />
                  {/* Overlay name/subtitle */}
                  <View style={styles.heroOverlay} pointerEvents="none">
                    <Typography variant="h1" style={styles.heroName}>
                      {(profile?.name || 'New User')}
                    </Typography>
                    {!!profile?.age && (
                      <Typography variant="body2" style={styles.heroSubtitle}>Age {profile.age}</Typography>
                    )}
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>

        <View style={styles.content}>
          {/* Profile Strength */}
          <View style={styles.strengthPill}>
            <View style={styles.strengthBadge} />
            <Text style={styles.strengthText}>{computeProfileStrength(profile)}%</Text>
            <Text style={styles.strengthLabel}>  Profile Strength</Text>
          </View>

          <View style={styles.rowBetween}>
            <Typography variant="h1" style={styles.name}>
              {profile?.name || 'New User'}{profile?.age ? `, ${profile.age}` : ''}
            </Typography>
          </View>

          {/* Details list */}
          <View style={styles.detailsList}>
            {/* Gender + age (gender unknown, fallback icon) */}
            {!!profile?.age && (
              <View style={styles.detailRow}>
                <Ionicons name="male" size={16} color="#fff" style={styles.detailIcon} />
                <Text style={styles.detailText}>Male, {profile.age}</Text>
              </View>
            )}
            {/* Location */}
            {!!profile?.location && (
              <View style={styles.detailRow}>
                <Ionicons name="business-outline" size={16} color="#fff" style={styles.detailIcon} />
                <Text style={styles.detailText}>{profile.location}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {!!profile?.looking_for?.length && (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>Looking for</Typography>
              <View style={styles.tags}>
                {profile.looking_for.map((g, idx) => (
                  <View key={`${g}-${idx}`} style={styles.tag}><Typography variant="caption" style={styles.tagText}>{g}</Typography></View>
                ))}
              </View>
            </View>
          )}

          {!!profile?.goals?.length && (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>Goals</Typography>
              <View style={styles.tags}>
                {profile.goals.map((g, idx) => (
                  <View key={`${g}-${idx}`} style={styles.tag}><Typography variant="caption" style={styles.tagText}>{g}</Typography></View>
                ))}
              </View>
            </View>
          )}

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
              <Typography variant="h3" style={styles.sectionTitle}>About</Typography>
              <Typography variant="body1" style={styles.aboutText}>{profile.bio}</Typography>
            </View>
          )}

          {(profile?.profile_photos && profile.profile_photos.length > 0) || (profile?.photos && profile.photos.length > 0) ? (
            <View style={styles.section}>
              <Typography variant="h3" style={styles.sectionTitle}>Gallery</Typography>
              <View style={styles.galleryGrid}>
                {(profile?.profile_photos && profile.profile_photos.length > 0 ? profile.profile_photos : profile?.photos || []).map((uri, idx) => {
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
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 8 },
  aboutText: { color: '#fff', fontSize: 14, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { backgroundColor: '#f2f2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 8, marginBottom: 8 },
  tagText: { color: '#444', fontSize: 12, fontWeight: '600' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  galleryItem: { width: Math.floor((WINDOW_WIDTH - 16 * 2 - 4 * 2) / 3), height: Math.floor((WINDOW_WIDTH - 16 * 2 - 4 * 2) / 3), marginBottom: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1f0b1e' },
  galleryImage: { width: '100%', height: '100%' },

  actionsOverlay: { position: 'absolute', left: 0, right: 0, bottom: 28 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  circleBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  circleInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', flex: 1, marginLeft: 8 },

  heroOverlay: { position: 'absolute', left: 16, right: 16, bottom: 24, alignItems: 'center' },
  heroName: { color: '#fff', fontSize: 28, fontWeight: '800' },
  heroSubtitle: { color: '#ffffffcc', marginTop: 4 },
  heroGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 18 },

  strengthPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#5b1c7f', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 18, marginTop: 8 },
  strengthBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#f3c614', marginRight: 8 },
  strengthText: { color: '#000', fontWeight: '700' },
  strengthLabel: { color: '#fff', fontWeight: '700' },

  detailsList: { marginTop: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailIcon: { marginRight: 10 },
  detailText: { color: '#fff', fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 14 },
}) 