import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { APP_COLORS } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
const placeholderImg = require('../../assets/images/icon.png')

const { width: WINDOW_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = Math.round(WINDOW_WIDTH * 1.25)
const INTERSTITIAL_HEIGHT = Math.round(WINDOW_WIDTH * 1.15)
const CARD_BORDER_RADIUS = 16
const PHOTO_BORDER_RADIUS = 20

interface UserProfileView {
  user_id: string
  name?: string
  age?: number
  bio?: string
  location?: string
  occupation?: string
  education?: string
  interests?: string[]
  photos?: string[]
  stats?: {
    eventsAttended: number
    eventsFavorited: number
    eventsOrganized: number
  }
  memberSince?: string
}

type ProfileCtaMode = 'self' | 'connect' | 'requested' | 'message'

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user: authUser } = useAuth()
  const [profile, setProfile] = useState<UserProfileView | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [ctaMode, setCtaMode] = useState<ProfileCtaMode>('connect')
  const [ctaMessage, setCtaMessage] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)

  const hydrateCtaState = useCallback(async (targetUserId: string) => {
    if (!authUser) {
      setCtaMode('connect')
      setCtaMessage('Sign in to connect.')
      setConversationId(null)
      return
    }
    if (authUser.id === targetUserId) {
      setCtaMode('self')
      setCtaMessage('This is your profile.')
      setConversationId(null)
      return
    }

    try {
      const convResult = await apiClient.getConversations({ force: true })
      if (convResult.success && convResult.data) {
        const found = convResult.data.find((conv: any) => {
          const otherUser = conv.otherUser || conv.other_user || {}
          const otherUserId = String(otherUser.id || otherUser.user_id || '').trim()
          return otherUserId === targetUserId
        })
        const convId = String(found?.id || found?.conversation_id || '').trim()
        if (convId) {
          setConversationId(convId)
          setCtaMode('message')
          setCtaMessage('You are connected. Open the chat.')
          return
        }
      }

      const requestResult = await apiClient.getMessageRequests({ status: 'pending' }, { force: true })
      if (requestResult.success && requestResult.data?.requests) {
        const requests = requestResult.data.requests
        const hasPending = requests.some((request: any) => {
          const senderId = String(request.senderId || request.sender_id || request.sender?.id || '').trim()
          const recipientId = String(request.recipientId || request.recipient_id || request.recipient?.id || '').trim()
          const status = String(request.status || 'pending').toLowerCase()
          return status === 'pending'
            && ((senderId === authUser.id && recipientId === targetUserId)
              || (senderId === targetUserId && (!recipientId || recipientId === authUser.id)))
        })
        if (hasPending) {
          setConversationId(null)
          setCtaMode('requested')
          setCtaMessage('Request pending. You can chat after acceptance.')
          return
        }
      }
    } catch {}

    setConversationId(null)
    setCtaMode('connect')
    setCtaMessage('Send a request to start chatting.')
  }, [authUser])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      let nextProfile: UserProfileView | null = null

      const result = await apiClient.getPublicProfile(id)
      if (result.success && result.data) {
        const data = result.data
        const photos = data.photos || data.profile_photos || []
        // Map interests: API returns objects {id, name, slug, icon} — extract names
        const interests = Array.isArray(data.interests)
          ? data.interests.map((i: any) => (typeof i === 'string' ? i : i?.name || ''))
              .filter((n: string) => n)
          : []
        nextProfile = {
          user_id: id,
          name: data.name || data.display_name,
          age: data.age,
          bio: data.bio,
          location: data.location,
          occupation: data.occupation,
          education: data.education,
          interests,
          photos,
          stats: data.stats,
          memberSince: data.memberSince,
        }
      } else {
        const fallbackResult = await apiClient.getProfile(id)
        if (fallbackResult.success && fallbackResult.data) {
          const data = fallbackResult.data
          const photos = data.photos || data.profile_photos || []
          const interests = Array.isArray(data.interests)
            ? data.interests.map((i: any) => (typeof i === 'string' ? i : i?.name || ''))
                .filter((n: string) => n)
            : []
          nextProfile = {
            user_id: id,
            name: data.name,
            age: data.age,
            bio: data.bio,
            location: data.location,
            occupation: data.occupation,
            education: data.education,
            interests,
            photos,
          }
        }
      }

      setProfile(nextProfile)
      if (nextProfile?.user_id) {
        await hydrateCtaState(nextProfile.user_id)
      }
    } catch (e) {
      console.error('[USER_PROFILE] load failed:', e)
      Alert.alert('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [id, hydrateCtaState])

  useEffect(() => {
    load()
  }, [load])

  const handleConnect = async () => {
    if (!authUser || !profile) return
    if (ctaMode === 'self') return
    setActionLoading(true)
    try {
      if (ctaMode === 'message') {
        if (conversationId) {
          router.push({
            pathname: '/private-chat/[conversationId]',
            params: {
              conversationId,
              otherUserName: profile.name || 'User',
              otherUserId: profile.user_id,
            } as any,
          })
        }
        return
      }

      if (ctaMode === 'requested') {
        return
      }

      const result = await apiClient.createMessageRequest(profile.user_id)
      if (result.success) {
        setCtaMode('requested')
        setCtaMessage(`Request sent to ${profile.name || 'this user'}.`)
      } else {
        const err = String(result.error || '').toLowerCase()
        if (err.includes('already have') || err.includes('conversation already exists')) {
          await hydrateCtaState(profile.user_id)
        } else if (err.includes('already sent') || err.includes('pending')) {
          setCtaMode('requested')
          setCtaMessage('Request pending. You can chat after acceptance.')
        } else {
          setCtaMessage(result.error || 'Failed to send connection request.')
        }
      }
    } catch (e) {
      console.error('connect error:', e)
      setCtaMessage('Something went wrong. Try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const openSafety = () => {
    if (!profile) return
    showUserSafetyActions(profile.name || 'User', profile.user_id)
  }

  const isLoading = loading
  const ctaLabel = useMemo(() => {
    if (actionLoading) return 'Working...'
    if (ctaMode === 'self') return 'You'
    if (ctaMode === 'requested') return 'Requested'
    if (ctaMode === 'message') return 'Message'
    return 'Connect'
  }, [ctaMode, actionLoading])
  const ctaDisabled = actionLoading || ctaMode === 'self' || ctaMode === 'requested'
  const ctaButtonStyle = [
    styles.connectCta,
    ctaMode === 'message' && styles.connectCtaMessage,
    ctaMode === 'requested' && styles.connectCtaRequested,
    ctaDisabled && styles.connectCtaDisabled,
  ]

  if (!loading && !profile) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Typography variant="body2" style={styles.muted}>Profile not found</Typography>
      </SafeAreaView>
    )
  }

  const photoList = (profile?.photos && profile.photos.length > 0)
    ? profile.photos.filter((url): url is string => !!url && url.trim() !== '')
    : []

  // Split photos: hero = first, interstitials = [1] and [2], gallery = [3+]
  const heroPhoto = photoList[0] || null
  const interstitialPhoto1 = photoList[1] || null
  const interstitialPhoto2 = photoList[2] || null
  const galleryPhotos = photoList.slice(3)

  const hasDetails = !!(profile?.age || profile?.occupation || profile?.education || profile?.location)
  const hasStats = !!(profile?.stats && (profile.stats.eventsAttended > 0 || profile.stats.eventsFavorited > 0 || profile.stats.eventsOrganized > 0))

  const getOptimized = (uri: string, w: number, h: number) => {
    const optimized = getOptimizedImageUrl(uri, { width: w, height: h, resize: 'cover', quality: 70 })
    return optimized || uri
  }

  const renderSkeleton = () => (
    <>
      {/* Hero skeleton */}
      <SkeletonBlock width={WINDOW_WIDTH} height={HERO_HEIGHT} borderRadius={0} />
      {/* Card skeletons */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'60%'} style={{ marginBottom: 12 }} />
          <SkeletonLine width={'40%'} style={{ marginBottom: 8 }} />
          <SkeletonLine width={'50%'} style={{ marginBottom: 8 }} />
          <SkeletonLine width={'35%'} />
        </View>
      </View>
      <View style={styles.cardContainer}>
        <SkeletonBlock width={WINDOW_WIDTH - 32} height={INTERSTITIAL_HEIGHT * 0.5} borderRadius={PHOTO_BORDER_RADIUS} />
      </View>
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <SkeletonLine width={'25%'} style={{ marginBottom: 10 }} />
          <SkeletonLine width={'90%'} style={{ marginBottom: 6 }} />
          <SkeletonLine width={'70%'} />
        </View>
      </View>
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
    </>
  )

  const renderContent = () => (
    <>
      {/* Hero Photo */}
      <View style={styles.heroContainer}>
        {heroPhoto ? (
          <OptimizedImage
            source={getOptimized(heroPhoto, WINDOW_WIDTH, HERO_HEIGHT) as any}
            style={styles.heroImage as any}
            contentFit="cover"
            width={WINDOW_WIDTH}
            height={HERO_HEIGHT}
            quality={70}
          />
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
            {profile?.name}{profile?.age ? `, ${profile.age}` : ''}
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

      {/* Interstitial Photo 2 */}
      {interstitialPhoto1 && (
        <View style={styles.interstitialContainer}>
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

      {/* Interstitial Photo 3 */}
      {interstitialPhoto2 && (
        <View style={styles.interstitialContainer}>
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

      {/* Gallery — photos 4+ in 2-column grid */}
      {galleryPhotos.length > 0 && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Typography variant="h3" style={styles.cardTitle}>More Photos</Typography>
            <View style={styles.galleryGrid}>
              {galleryPhotos.map((uri, idx) => {
                const itemSize = Math.floor((WINDOW_WIDTH - 32 - 24 - 8) / 2)
                return (
                  <View key={`gal_${idx}`} style={[styles.galleryItem, { width: itemSize, height: itemSize }]}>
                    <OptimizedImage
                      source={getOptimized(uri, itemSize, itemSize) as any}
                      style={styles.galleryImage as any}
                      contentFit="cover"
                      width={itemSize}
                      height={itemSize}
                      quality={60}
                    />
                  </View>
                )
              })}
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

      {/* Bottom spacer for CTA clearance */}
      <View style={{ height: 100 }} />
    </>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader
        title="Profile"
        onBack={() => router.back()}
        rightIconButton={{ name: 'ellipsis-vertical', onPress: openSafety, accessibilityLabel: 'More options' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {isLoading ? renderSkeleton() : renderContent()}
      </ScrollView>

      {!isLoading && (
        <View style={styles.ctaBar} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.92}
            style={ctaButtonStyle}
            disabled={ctaDisabled}
            onPress={handleConnect}
            accessibilityRole="button"
            accessibilityLabel={ctaMode === 'message' ? 'Open chat' : 'Send connection request'}
          >
            <Typography variant="button" style={styles.connectCtaText}>
              {ctaLabel}
            </Typography>
          </TouchableOpacity>
          {!!ctaMessage && (
            <Typography variant="caption" style={styles.ctaHintText}>{ctaMessage}</Typography>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { marginTop: 8, color: APP_COLORS.textSecondary },

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

  // CTA bar (preserved from original)
  ctaBar: { position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 16 },
  connectCta: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.accent,
  },
  connectCtaMessage: {
    backgroundColor: APP_COLORS.success,
  },
  connectCtaRequested: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  connectCtaDisabled: {
    opacity: 0.55,
  },
  connectCtaText: {
    color: APP_COLORS.textPrimary,
    fontWeight: '700',
  },
  ctaHintText: {
    marginTop: 8,
    textAlign: 'center',
    color: APP_COLORS.textSecondary,
  },
})
