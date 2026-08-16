import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import OptimizedImage from '../../components/OptimizedImage'
import PhotoLightbox from '../../components/PhotoLightbox'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import queryCache from '../../lib/queryCache'
import { useAuth } from '../../lib/useAuth'
import { APP_COLORS } from '../../lib/theme'
const placeholderImg = require('../../assets/images/icon.png')

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
  const heroPhoto = photoList[0] || null
  const interstitialPhoto1 = photoList[1] || null
  const interstitialPhoto2 = photoList[2] || null
  const galleryPhotos = photoList.slice(3)

  const hasDetails = !!(profile?.age || profile?.occupation || profile?.education || profile?.location)
  const hasStats = !!(profile?.stats && (profile.stats.eventsAttended > 0 || profile.stats.eventsFavorited > 0 || profile.stats.eventsOrganized > 0))

  // Profile completion: check if bio, interests, or photos are incomplete
  const isProfileIncomplete = useMemo(() => {
    if (!profile) return false
    const noBio = !profile.bio || profile.bio.trim() === ''
    const noInterests = !profile.interests || profile.interests.length === 0
    const noPhotos = photoList.length === 0
    return noBio || noInterests || noPhotos
  }, [profile, photoList])

  const getOptimized = (uri: string, w: number, h: number) => {
    const optimized = getOptimizedImageUrl(uri, { width: w, height: h, resize: 'cover', quality: 70 })
    return optimized || uri
  }

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

  const renderContent = () => (
    <>
      {/* Hero Photo */}
      <View style={styles.heroContainer}>
        {heroPhoto ? (
          <TouchableOpacity activeOpacity={0.92} onPress={() => openLightbox(0)}>
          <OptimizedImage
            source={getOptimized(heroPhoto, WINDOW_WIDTH, HERO_HEIGHT) as any}
            style={styles.heroImage as any}
            contentFit="cover"
            width={WINDOW_WIDTH}
            height={HERO_HEIGHT}
            quality={70}
          />
          </TouchableOpacity>
        ) : (
          <View style={styles.heroPlaceholder}>
            <OptimizedImage
              source={placeholderImg as any}
              style={styles.heroImage as any}
              contentFit="cover"
              width={WINDOW_WIDTH}
              height={HERO_HEIGHT}
              quality={60}
            />
            <View style={styles.heroPlaceholderOverlay}>
              <Typography variant="h3" style={styles.heroPlaceholderTitle}>Add your first photo</Typography>
              <Typography variant="body2" style={styles.heroPlaceholderSubtitle}>Profiles with photos get more matches</Typography>
              <TouchableOpacity
                onPress={() => router.push('/edit-profile')}
                style={styles.heroPlaceholderCta}
                accessibilityRole="button"
                accessibilityLabel="Add profile photo"
              >
                <Typography variant="button" style={styles.heroPlaceholderCtaText}>Add Photo</Typography>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
          locations={[0.4, 0.75, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.heroGradient}
        />
        <View style={styles.heroOverlay}>
          <Typography variant="h1" style={styles.heroName}>
            {profile?.name || 'New User'}{profile?.age ? `, ${profile.age}` : ''}
          </Typography>
          {!!profile?.location && (
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Typography variant="body2" style={styles.heroLocationText}>
                {profile.location}
              </Typography>
            </View>
          )}
        </View>
      </View>

      {/* Quick Actions Row */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <Ionicons name="create-outline" size={18} color={APP_COLORS.textPrimary} />
          <Typography variant="button" style={styles.quickActionText}>Edit Profile</Typography>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={18} color={APP_COLORS.textPrimary} />
          <Typography variant="button" style={styles.quickActionText}>Settings</Typography>
        </TouchableOpacity>
      </View>

      {/* Details Card */}
      {hasDetails && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>Details</Typography>
            <View style={styles.detailsList}>
              {!!profile?.age && (
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color={APP_COLORS.textSecondary} style={styles.detailIcon} />
                  <Typography variant="body1" style={styles.detailText}>{profile.age} years old</Typography>
                </View>
              )}
              {!!profile?.occupation && (
                <View style={styles.detailRow}>
                  <Ionicons name="briefcase-outline" size={16} color={APP_COLORS.textSecondary} style={styles.detailIcon} />
                  <Typography variant="body1" style={styles.detailText}>{profile.occupation}</Typography>
                </View>
              )}
              {!!profile?.education && (
                <View style={styles.detailRow}>
                  <Ionicons name="school-outline" size={16} color={APP_COLORS.textSecondary} style={styles.detailIcon} />
                  <Typography variant="body1" style={styles.detailText}>{profile.education}</Typography>
                </View>
              )}
              {!!profile?.location && (
                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={16} color={APP_COLORS.textSecondary} style={styles.detailIcon} />
                  <Typography variant="body1" style={styles.detailText}>{profile.location}</Typography>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Interstitial Photo 1 */}
      {interstitialPhoto1 && (
        <View style={styles.interstitialContainer}>
          <TouchableOpacity activeOpacity={0.92} onPress={() => openLightbox(1)}>
          <View style={styles.interstitialWrapper}>
            <OptimizedImage
              source={getOptimized(interstitialPhoto1, WINDOW_WIDTH - 32, INTERSTITIAL_HEIGHT) as any}
              style={styles.interstitialImage as any}
              contentFit="cover"
              width={WINDOW_WIDTH - 32}
              height={INTERSTITIAL_HEIGHT}
              quality={70}
            />
          </View>
          </TouchableOpacity>
        </View>
      )}

      {/* About Card */}
      {!!profile?.bio && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>About</Typography>
            <Typography variant="body1" style={styles.aboutText}>{profile.bio}</Typography>
          </View>
        </View>
      )}

      {/* Interstitial Photo 2 */}
      {interstitialPhoto2 && (
        <View style={styles.interstitialContainer}>
          <TouchableOpacity activeOpacity={0.92} onPress={() => openLightbox(2)}>
          <View style={styles.interstitialWrapper}>
            <OptimizedImage
              source={getOptimized(interstitialPhoto2, WINDOW_WIDTH - 32, INTERSTITIAL_HEIGHT) as any}
              style={styles.interstitialImage as any}
              contentFit="cover"
              width={WINDOW_WIDTH - 32}
              height={INTERSTITIAL_HEIGHT}
              quality={70}
            />
          </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Interests Card */}
      {profile?.interests && profile.interests.length > 0 && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>Interests</Typography>
            <View style={styles.tagsRow}>
              {profile.interests.map((interest, idx) => (
                <View key={`${interest}-${idx}`} style={styles.tag}>
                  <Typography variant="caption" style={styles.tagText}>{interest}</Typography>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Stats Card */}
      {hasStats && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>Activity</Typography>
            <View style={styles.statsRow}>
              {(profile?.stats?.eventsAttended ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={APP_COLORS.accent} />
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsAttended}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Attended</Typography>
                </View>
              )}
              {(profile?.stats?.eventsFavorited ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Ionicons name="heart-outline" size={20} color={APP_COLORS.accent} />
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsFavorited}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Favorited</Typography>
                </View>
              )}
              {(profile?.stats?.eventsOrganized ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Ionicons name="megaphone-outline" size={20} color={APP_COLORS.accent} />
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsOrganized}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Organized</Typography>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Member Since */}
      {!!profile?.memberSince && (
        <View style={styles.memberSinceContainer}>
          <Ionicons name="time-outline" size={14} color={APP_COLORS.textSecondary} />
          <Typography variant="caption" style={styles.memberSinceText}>
            Member since {new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Typography>
        </View>
      )}

      {/* Gallery — photos 4+ in 2-column grid */}
      {galleryPhotos.length > 0 && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>More Photos</Typography>
            <View style={styles.galleryGrid}>
              {galleryPhotos.map((uri, idx) => {
                const itemSize = Math.floor((WINDOW_WIDTH - 32 - 24 - 8) / 2)
                return (
                  <TouchableOpacity key={`gal_${idx}`} activeOpacity={0.85} onPress={() => openLightbox(3 + idx)}>
                  <View style={[styles.galleryItem, { width: itemSize, height: itemSize }]}>
                    <OptimizedImage
                      source={getOptimized(uri, itemSize, itemSize) as any}
                      style={styles.galleryImage as any}
                      contentFit="cover"
                      width={itemSize}
                      height={itemSize}
                      quality={60}
                    />
                  </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>
      )}

      {/* Profile Completion Card */}
      {isProfileIncomplete && (
        <View style={styles.cardContainer}>
          <View style={[styles.card, styles.completionCard]}>
            <View style={styles.completionHeader}>
              <Ionicons name="sparkles" size={20} color={APP_COLORS.accent} />
              <Typography variant="h3" style={styles.completionTitle}>Complete Your Profile</Typography>
            </View>
            <Typography variant="body2" style={styles.completionSubtitle}>
              {!photoList.length ? 'Add photos to stand out.' : !profile?.bio ? 'Write a bio so others can learn about you.' : 'Add your interests to find better matches.'}
            </Typography>
            <TouchableOpacity
              style={styles.completionCta}
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Complete your profile"
            >
              <Typography variant="button" style={styles.completionCtaText}>Complete Profile</Typography>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom spacer */}
      <View style={{ height: 40 }} />

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
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
    padding: 20,
  },
  errorText: { fontSize: 16, color: APP_COLORS.destructive, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: APP_COLORS.accent, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#000', fontWeight: '600', fontSize: 16 },

  // Hero
  heroContainer: {
    width: WINDOW_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroImage: {
    width: WINDOW_WIDTH,
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    width: WINDOW_WIDTH,
    height: HERO_HEIGHT,
    backgroundColor: APP_COLORS.backgroundCard,
  },
  heroPlaceholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroPlaceholderTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  heroPlaceholderSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center', marginBottom: 14 },
  heroPlaceholderCta: { backgroundColor: APP_COLORS.accent, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  heroPlaceholderCtaText: { color: '#000', fontWeight: '800', fontSize: 14 },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.5,
  },
  heroOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  heroLocationText: {
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 4,
    fontSize: 14,
  },

  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  quickActionText: {
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Cards
  cardContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: CARD_BORDER_RADIUS,
    padding: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: APP_COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Details
  detailsList: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: 10,
    width: 20,
  },
  detailText: {
    color: APP_COLORS.textPrimary,
    fontSize: 15,
  },

  // Interstitial photos
  interstitialContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  interstitialWrapper: {
    borderRadius: PHOTO_BORDER_RADIUS,
    overflow: 'hidden',
  },
  interstitialImage: {
    width: WINDOW_WIDTH - 32,
    height: INTERSTITIAL_HEIGHT,
  },

  // About
  aboutText: {
    color: APP_COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },

  // Tags / Interests
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: APP_COLORS.backgroundBase,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: APP_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
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
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: APP_COLORS.textSecondary,
  },

  // Member since
  memberSinceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  memberSinceText: {
    color: APP_COLORS.textSecondary,
    fontSize: 13,
  },

  // Gallery
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  galleryItem: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: APP_COLORS.backgroundCard,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },

  // Profile Completion
  completionCard: {
    borderWidth: 1,
    borderColor: APP_COLORS.accent,
    borderStyle: 'dashed',
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  completionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  completionSubtitle: {
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  completionCta: {
    backgroundColor: APP_COLORS.accent,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  completionCtaText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
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
