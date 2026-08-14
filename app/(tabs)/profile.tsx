import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppHeader } from '../../components/AppHeader'
import OptimizedImage from '../../components/OptimizedImage'
import PhotoLightbox from '../../components/PhotoLightbox'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import Typography from '../../components/Typography'
import GradientButton from '../../components/ui/GradientButton'
import Pill from '../../components/ui/Pill'
import SectionHeader from '../../components/ui/SectionHeader'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import queryCache from '../../lib/queryCache'
import { useAuth } from '../../lib/useAuth'
import { APP_COLORS, APP_RADIUS, APP_SPACING } from '../../lib/theme'
const placeholderImg = require('../../assets/images/icon.png')

const { width: WINDOW_WIDTH } = Dimensions.get('window')
const HERO_WIDTH = WINDOW_WIDTH - APP_SPACING.xl
const HERO_HEIGHT = Math.round(WINDOW_WIDTH * 1.05)
const INTERSTITIAL_HEIGHT = Math.round(WINDOW_WIDTH * 1.15)
const CARD_BORDER_RADIUS = APP_RADIUS['2xl']
const PHOTO_BORDER_RADIUS = APP_RADIUS.xl
const AVATAR_SIZE = 96
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
  // TODO(figma-redesign): mocked until a real "pro"/verified backend field exists — see
  // docs/FIGMA_REDESIGN_BACKLOG.md ("Profile PRO / verified badge"). Always undefined from
  // the API today, so the badge simply never renders — no fabricated data reaches real users.
  isPro?: boolean
  stats?: {
    eventsAttended: number
    eventsFavorited: number
    eventsOrganized: number
  }
  memberSince?: string
}

export default function Profile() {
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

  const hasAbout = !!(profile?.bio || profile?.occupation || profile?.education)
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
        // Not on UserProfileData yet — see the isPro TODO above.
        isPro: (data as { isPro?: boolean }).isPro,
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
      <View style={styles.cardContainer}>
        <SkeletonBlock width={HERO_WIDTH} height={HERO_HEIGHT} borderRadius={APP_RADIUS['2xl']} />
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
      {/* Hero: editorial portfolio photo + avatar with gradient ring, overlapping bottom-left */}
      <View style={styles.heroContainer}>
        {heroPhoto ? (
          <TouchableOpacity activeOpacity={0.92} onPress={() => openLightbox(0)}>
            <OptimizedImage
              source={getOptimized(heroPhoto, HERO_WIDTH, HERO_HEIGHT) as any}
              style={styles.heroImage as any}
              contentFit="cover"
              width={HERO_WIDTH}
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
              width={HERO_WIDTH}
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
          colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.7)', 'rgba(15,14,14,0.95)']}
          locations={[0.35, 0.75, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.heroGradient}
        />
        <TouchableOpacity
          onPress={() => router.push('/edit-profile')}
          style={styles.heroEditBtn}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <Ionicons name="create-outline" size={18} color={APP_COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.heroOverlay}>
          <View style={styles.avatarWrap}>
            <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <OptimizedImage
                  source={(heroPhoto || placeholderImg) as any}
                  style={styles.avatarImage as any}
                  contentFit="cover"
                  width={AVATAR_SIZE}
                  height={AVATAR_SIZE}
                  quality={70}
                />
              </View>
            </LinearGradient>
            {!!profile?.isPro && (
              <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.proBadge}>
                <Typography variant="caption" style={styles.proBadgeText}>PRO</Typography>
              </LinearGradient>
            )}
          </View>

          <Typography variant="h2" style={styles.heroName}>
            {profile?.name || 'New User'}{profile?.age ? `, ${profile.age}` : ''}
          </Typography>
          {!!profile?.location && (
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-outline" size={14} color={APP_COLORS.textSecondary} />
              <Typography variant="body2" style={styles.heroLocationText}>
                {profile.location}
              </Typography>
            </View>
          )}
        </View>
      </View>

      {/* About: bio + occupation/education */}
      {hasAbout && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <SectionHeader icon="information-circle-outline" title="About" style={styles.cardHeader} />
            {!!profile?.bio && (
              <Typography variant="body1" style={styles.aboutText}>{profile.bio}</Typography>
            )}
            {(!!profile?.occupation || !!profile?.education) && (
              <View style={styles.aboutGrid}>
                {!!profile?.occupation && (
                  <View style={styles.aboutGridItem}>
                    <Typography variant="tiny" style={styles.aboutGridLabel}>Occupation</Typography>
                    <Typography variant="body2" style={styles.aboutGridValue}>{profile.occupation}</Typography>
                  </View>
                )}
                {!!profile?.education && (
                  <View style={styles.aboutGridItem}>
                    <Typography variant="tiny" style={styles.aboutGridLabel}>Education</Typography>
                    <Typography variant="body2" style={styles.aboutGridValue}>{profile.education}</Typography>
                  </View>
                )}
              </View>
            )}
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

      {/* Interests */}
      {profile?.interests && profile.interests.length > 0 && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <SectionHeader icon="sparkles-outline" title="Interests" style={styles.cardHeader} />
            <View style={styles.tagsRow}>
              {profile.interests.map((interest, idx) => (
                <Pill key={`${interest}-${idx}`} label={interest} variant={idx === 0 ? 'gradient' : 'glass'} style={styles.tagPill} />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Circle Presence: real activity stats, restyled to the bento aesthetic.
          TODO(figma-redesign): Figma shows individual attended-event cards (image, date,
          venue) rather than counts — that needs a "my attended events" list endpoint that
          doesn't exist yet. See docs/FIGMA_REDESIGN_BACKLOG.md ("Attended events history"). */}
      {hasStats && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <SectionHeader icon="people-outline" title="Circle Presence" style={styles.cardHeader} />
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
            <Typography variant="caption" style={styles.circlePresenceNote}>Full event gallery — coming soon</Typography>
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
            <SectionHeader icon="images-outline" title="More Photos" style={styles.cardHeader} />
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

      {/* Expand Your Circle CTA */}
      <View style={styles.ctaContainer}>
        <Typography variant="h2" style={styles.ctaHeading}>Expand Your Circle</Typography>
        <GradientButton label="Edit Profile" onPress={() => router.push('/edit-profile')} style={styles.ctaButton} />
      </View>

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

  const header = (
    <AppHeader
      title="Blend'n"
      variant="glass"
      rightIconButton={{ name: 'settings-outline', onPress: () => router.push('/settings'), accessibilityLabel: 'Open settings' }}
    />
  )

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {header}
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
      {header}
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

  // Hero — inset rounded editorial photo with overlapping avatar
  heroContainer: {
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
    marginHorizontal: APP_SPACING.md,
    marginTop: APP_SPACING.sm,
    borderRadius: APP_RADIUS['2xl'],
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    width: HERO_WIDTH,
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    width: HERO_WIDTH,
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
    height: HERO_HEIGHT * 0.65,
  },
  heroEditBtn: {
    position: 'absolute',
    top: APP_SPACING.md,
    right: APP_SPACING.md,
    width: 36,
    height: 36,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: 'rgba(15,14,14,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: APP_SPACING.md,
    right: APP_SPACING.md,
    bottom: APP_SPACING.lg,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: APP_SPACING.sm,
    width: AVATAR_SIZE + 8,
  },
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: APP_COLORS.backgroundBase,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  proBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: APP_SPACING.sm,
    paddingVertical: 2,
    borderRadius: APP_RADIUS.pill,
  },
  proBadgeText: {
    color: APP_COLORS.onAccent,
    fontWeight: '700',
    fontSize: 12,
  },
  heroName: {
    color: APP_COLORS.textPrimary,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  heroLocationText: {
    color: APP_COLORS.textSecondary,
  },

  // Cards
  cardContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  card: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: CARD_BORDER_RADIUS,
    padding: 20,
  },
  cardHeader: {
    marginBottom: APP_SPACING.md,
  },

  // About
  aboutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.lg,
    marginTop: APP_SPACING.md,
  },
  aboutGridItem: {
    minWidth: '40%',
    gap: 4,
  },
  aboutGridLabel: {
    color: APP_COLORS.accent,
  },
  aboutGridValue: {
    color: APP_COLORS.textPrimary,
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
    gap: APP_SPACING.xs,
  },
  tagPill: {},

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
  circlePresenceNote: {
    color: APP_COLORS.textTertiary,
    textAlign: 'center',
    marginTop: APP_SPACING.md,
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

  // Expand Your Circle CTA
  ctaContainer: {
    marginHorizontal: APP_SPACING.md,
    marginTop: APP_SPACING.xl,
    borderRadius: APP_RADIUS['3xl'],
    backgroundColor: '#000000',
    paddingVertical: APP_SPACING['3xl'],
    paddingHorizontal: APP_SPACING.lg,
    alignItems: 'center',
    gap: APP_SPACING.lg,
  },
  ctaHeading: {
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
  },
  ctaButton: {
    paddingHorizontal: APP_SPACING['2xl'],
  },
})
