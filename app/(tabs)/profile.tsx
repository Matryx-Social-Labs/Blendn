import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import PhotoLightbox from '../../components/PhotoLightbox'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import {
  PROFILE_GUTTER,
  PROFILE_SECTION_GAP,
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileHero,
  ProfileInterests,
  ProfileOwnCta,
} from '../../components/profile/ProfileSections'
import { TAB_BAR_CLEARANCE } from './_layout'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import queryCache from '../../lib/queryCache'
import { useAuth } from '../../lib/useAuth'
import { EMBER } from '../../lib/theme'

const { width: WINDOW_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = Math.round(WINDOW_WIDTH * 1.25)
const INTERSTITIAL_HEIGHT = Math.round(WINDOW_WIDTH * 1.15)
const CARD_BORDER_RADIUS = 16
const PHOTO_BORDER_RADIUS = 20
const PROFILE_CACHE_TTL = 2 * 60 * 1000

interface UserProfileViewModel {
  id: string
  name?: string
  bio?: string
  age?: number
  location?: string
  occupation?: string
  education?: string
  interests?: string[]
  photos?: string[]
  goals?: string[]
  looking_for?: string[]
  stats?: {
    eventsAttended: number
    eventsFavorited: number
    eventsOrganized: number
  }
  memberSince?: string
}

function ProfileInner() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfileViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastBackgroundRefreshRef = React.useRef(0)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxVisible, setLightboxVisible] = useState(false)

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxVisible(true)
  }, [])

  const photoList = useMemo(() => {
    const raw = profile?.photos || []
    return raw.filter((url): url is string => !!url && url.trim() !== '')
  }, [profile?.photos])

  // Split photos: hero = first, interstitials = [1] and [2], gallery = [3+]


  // Profile completion: check if bio, interests, or photos are incomplete


  const getUserAndProfile = useCallback(async (force = false) => {
    if (!user) return
    try {
      const cacheKey = `profile_${user.id}`
      if (!force) {
        const cached = queryCache.get<UserProfileViewModel>(cacheKey)
        if (cached) {
          setProfile(cached)
          setLoading(false)
          setTimeout(() => {
            const now = Date.now()
            if (user?.id && now - lastBackgroundRefreshRef.current > 15_000) {
              lastBackgroundRefreshRef.current = now
              getUserAndProfile(true)
            }
          }, 0)
          return
        }
      }

      Logger.debug('profile', 'Loading profile for user', { userId: user.id })
      setLoading(true)
      setError(null)

      const result = await apiClient.getPublicProfile(user.id)

      if (!result.success || !result.data) {
        Logger.error('profile', 'Error fetching profile', { error: result.error })
        setError('Failed to load profile')
        return
      }

      const data = result.data
      const photos = data.photos || data.profile_photos || []
      const interests = Array.isArray(data.interests)
        ? data.interests.map((i: any) => (typeof i === 'string' ? i : i?.name || ''))
            .filter((n: string) => n)
        : []

      const viewModel: UserProfileViewModel = {
        id: data.id || data.user_id || user.id,
        name: data.name || data.display_name,
        age: data.age,
        bio: data.bio,
        location: data.location,
        occupation: data.occupation,
        education: data.education,
        interests,
        photos,
        goals: data.goals,
        looking_for: data.looking_for,
        stats: data.stats,
        memberSince: data.memberSince,
      }

      Logger.debug('profile', 'Profile loaded successfully')
      setProfile(viewModel)
      queryCache.set(cacheKey, viewModel, PROFILE_CACHE_TTL)

    } catch (error) {
      Logger.error('profile', 'Unexpected error loading profile', { error })
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading && user) {
      getUserAndProfile()
    }
  }, [user, authLoading, getUserAndProfile])

  const renderSkeleton = () => (
    <>
      {/* Hero skeleton */}
      <SkeletonBlock width={WINDOW_WIDTH} height={HERO_HEIGHT} borderRadius={0} />
      {/* Quick actions skeleton */}
      <View style={styles.quickActionsRow}>
        <SkeletonBlock width={(WINDOW_WIDTH - 48) / 2} height={44} borderRadius={12} />
        <SkeletonBlock width={(WINDOW_WIDTH - 48) / 2} height={44} borderRadius={12} />
      </View>
      {/* Details card skeleton */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'60%'} style={{ marginBottom: 12 }} />
          <SkeletonLine width={'40%'} style={{ marginBottom: 8 }} />
          <SkeletonLine width={'50%'} style={{ marginBottom: 8 }} />
          <SkeletonLine width={'35%'} />
        </View>
      </View>
      {/* Interstitial skeleton */}
      <View style={styles.cardContainer}>
        <SkeletonBlock width={WINDOW_WIDTH - 32} height={INTERSTITIAL_HEIGHT * 0.5} borderRadius={PHOTO_BORDER_RADIUS} />
      </View>
      {/* About card skeleton */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'25%'} style={{ marginBottom: 10 }} />
          <SkeletonLine width={'90%'} style={{ marginBottom: 6 }} />
          <SkeletonLine width={'70%'} />
        </View>
      </View>
      {/* Interests card skeleton */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'30%'} style={{ marginBottom: 10 }} />
          <View style={styles.tagsRow}>
            {[...Array(4)].map((_, i) => (
              <SkeletonBlock key={`skt_${i}`} width={78} height={32} borderRadius={14} style={{ marginRight: 8, marginBottom: 8 }} />
            ))}
          </View>
        </View>
      </View>
      {/* Stats card skeleton */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'30%'} style={{ marginBottom: 10 }} />
          <View style={styles.statsRow}>
            {[...Array(3)].map((_, i) => (
              <View key={`sks_${i}`} style={styles.statItem}>
                <SkeletonBlock width={24} height={24} borderRadius={12} />
                <SkeletonBlock width={30} height={20} borderRadius={4} />
                <SkeletonBlock width={50} height={12} borderRadius={4} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </>
  )

  /*
   * `1141:5633` -- the same pieces `app/user/[id].tsx` draws, because it is the
   * same person seen from the other side.
   *
   * This screen was the last one still on `APP_COLORS`, and it was not for want
   * of components: `components/profile/ProfileSections.tsx` was written for
   * *both* frames -- `1141:5163` (attendee) and `1141:5633` (this one) -- and
   * only the attendee half was ever wired. The own-profile half sat built and
   * unreachable while this screen kept drawing the old hero, the old quick
   * actions and the old stat tiles.
   *
   * Three differences from the attendee view, all following from it being you:
   *
   *   - nothing is gated, so `blurred` is never set and every photo is yours
   *   - there is nobody to Connect to, so `ProfileActions` is replaced by
   *     `ProfileOwnCta` -- the only reason to look at your own profile is to
   *     change what other people see
   *   - the top bar carries Settings, which no attendee profile has
   */
  const renderContent = () => (
    <>
      <ProfileHero
        width={WINDOW_WIDTH}
        photos={photoList}
        title={`${profile?.name || 'New User'}${profile?.age ? `, ${profile.age}` : ''}`}
        subtitle={profile?.occupation || profile?.location || null}
        pseudonym={profile?.name || 'You'}
        bottomInset={TAB_BAR_CLEARANCE}
        onPressMedia={() => openLightbox(0)}
      />

      <View style={styles.canvas}>
        {profile?.bio ? (
          <View style={styles.section}>
            <ProfileHeading title="About" />
            <ProfileBio text={profile.bio} />
          </View>
        ) : null}

        {profile?.interests && profile.interests.length > 0 ? (
          <View style={styles.section}>
            <ProfileHeading title="Interests" />
            <ProfileInterests interests={profile.interests} />
          </View>
        ) : null}

        {/*
          Occupation and education, asymmetric -- a filled card and a ruled
          block. Both are real fields on the profile; the frame's `PRO` badge
          and `@handle` are not, and are recorded in `docs/PROFILE.md` rather
          than invented here.
        */}
        {profile?.occupation || profile?.education ? (
          <View style={styles.details}>
            {profile.occupation ? (
              <ProfileDetail label="OCCUPATION" value={profile.occupation} />
            ) : null}
            {profile.education ? (
              <ProfileDetail label="EDUCATION" value={profile.education} variant="ruled" />
            ) : null}
          </View>
        ) : null}

        {photoList.length > 1 ? (
          <View style={styles.section}>
            <ProfileHeading
              title="Gallery"
              trailing={`${photoList.length} photo${photoList.length === 1 ? '' : 's'}`}
            />
            <ProfileGallery
              photos={photoList.slice(1)}
              columnWidth={(WINDOW_WIDTH - PROFILE_GUTTER * 2 - 16) / 2}
              onPressPhoto={(index) => openLightbox(index + 1)}
            />
          </View>
        ) : null}

        <ProfileOwnCta onEdit={() => router.push('/edit-profile')} />
      </View>

      <PhotoLightbox
        photos={photoList}
        initialIndex={lightboxIndex}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />
    </>
  )


  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderSkeleton()}
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Typography variant="body1" style={styles.errorText}>{error}</Typography>
        <TouchableOpacity style={styles.retryButton} onPress={() => getUserAndProfile(true)}>
          <Typography variant="button" style={styles.retryButtonText}>Retry</Typography>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },

  /* The same three from `app/user/[id].tsx`, because it is the same page. */
  canvas: { paddingHorizontal: PROFILE_GUTTER, paddingTop: 32, gap: PROFILE_SECTION_GAP },
  section: { gap: 24 },
  details: { gap: 48 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: EMBER.bg,
    padding: 20,
  },
  errorText: { fontSize: 16, // EMBER has no destructive token; this surface is the only one that needs one.
    color: '#FF3B30', textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: EMBER.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#000', fontWeight: '600', fontSize: 16 },

  // Hero

  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },

  // Cards
  cardContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: EMBER.surface,
    borderRadius: CARD_BORDER_RADIUS,
    padding: 16,
  },

  // Details

  // Interstitial photos

  // About

  // Tags / Interests
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: EMBER.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(73,71,71,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },

  // Member since

  // Gallery

  // Profile Completion
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Profile() {
  return (
    <ScreenProfiler id="me">
      <ProfileInner />
    </ScreenProfiler>
  )
}
