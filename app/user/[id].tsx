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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import GlassSurface from '../../components/ui/GlassSurface'
import OptimizedImage from '../../components/OptimizedImage'
import SendRequestModal from '../../components/SendRequestModal'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import Typography from '../../components/Typography'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
const placeholderImg = require('../../assets/images/icon.png')

const { width: WINDOW_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = Math.round(WINDOW_WIDTH * 1.92)
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

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

// Figma highlights one interest pill with the accent gradient among otherwise-glass pills —
// pick a stable, deterministic index rather than always the first for a bit of visual variety.
function pickHighlightIndex(count: number): number {
  if (count === 0) return -1
  return Math.min(2, count - 1)
}

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<UserProfileView | null>(null)
  const [loading, setLoading] = useState(true)
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
      Logger.error('profile', 'User profile load failed', { error: e })
      Alert.alert('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [id, hydrateCtaState])

  useEffect(() => {
    load()
  }, [load])

  const [sendRequestModalVisible, setSendRequestModalVisible] = useState(false)

  const handleConnect = () => {
    if (!authUser || !profile) return
    if (ctaMode === 'self') return

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

    if (ctaMode === 'requested') return

    setSendRequestModalVisible(true)
  }

  const submitConnectRequest = async (note: string) => {
    if (!profile) return
    try {
      const result = await apiClient.createMessageRequest(profile.user_id, note || undefined)
      if (result.success) {
        setCtaMode('requested')
        setCtaMessage(`Request sent to ${profile.name || 'this user'}.`)
        setSendRequestModalVisible(false)
      } else {
        const err = String(result.error || '').toLowerCase()
        if (err.includes('already have') || err.includes('conversation already exists')) {
          await hydrateCtaState(profile.user_id)
        } else if (err.includes('already sent') || err.includes('pending')) {
          setCtaMode('requested')
          setCtaMessage('Request pending. You can chat after acceptance.')
        } else {
          showToast(result.error || 'Failed to send connection request.', 'error')
          return
        }
        setSendRequestModalVisible(false)
      }
    } catch (e) {
      Logger.error('profile', 'Connect request error', { error: e })
      showToast('Something went wrong. Try again.', 'error')
    }
  }

  const openSafety = () => {
    if (!profile) return
    showUserSafetyActions(profile.name || 'User', profile.user_id)
  }

  // No "Appreciate"/like-a-profile endpoint exists in the API — stub, consistent with other
  // undefined-behavior CTAs elsewhere in the redesign (hamburger/bell/FAB stubs).
  const handleAppreciate = useCallback(() => showToast('Coming soon', 'info'), [showToast])

  const isLoading = loading
  const ctaLabel = useMemo(() => {
    if (ctaMode === 'self') return 'You'
    if (ctaMode === 'requested') return 'Requested'
    if (ctaMode === 'message') return 'Message'
    return 'Connect'
  }, [ctaMode])
  const ctaDisabled = ctaMode === 'self' || ctaMode === 'requested'

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

  const heroPhoto = photoList[0] || null
  // Every photo beyond the hero goes into the Gallery grid — Figma shows extra photos as a
  // compact grid section, not full-bleed interstitials, so fold them in here instead.
  const galleryPhotos = photoList.slice(1)

  const hasOccupation = !!profile?.occupation
  const hasEducation = !!profile?.education
  const hasStats = !!(profile?.stats && (profile.stats.eventsAttended > 0 || profile.stats.eventsFavorited > 0 || profile.stats.eventsOrganized > 0))
  const highlightInterestIdx = pickHighlightIndex(profile?.interests?.length || 0)

  const getOptimized = (uri: string, w: number, h: number) => {
    const optimized = getOptimizedImageUrl(uri, { width: w, height: h, resize: 'cover', quality: 70 })
    return optimized || uri
  }

  const renderSkeleton = () => (
    <>
      <SkeletonBlock width={WINDOW_WIDTH} height={HERO_HEIGHT} borderRadius={0} />
      <View style={styles.sectionContainer}>
        <SkeletonLine width={'20%'} style={{ marginBottom: 12 }} />
        <SkeletonLine width={'90%'} style={{ marginBottom: 6 }} />
        <SkeletonLine width={'70%'} />
      </View>
      <View style={styles.sectionContainer}>
        <SkeletonLine width={'25%'} style={{ marginBottom: 12 }} />
        <View style={styles.interestsWrap}>
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={`skt_${i}`} width={90} height={44} borderRadius={22} style={{ marginRight: 8, marginBottom: 8 }} />
          ))}
        </View>
      </View>
      <View style={styles.sectionContainer}>
        <SkeletonBlock width="100%" height={152} borderRadius={APP_RADIUS['2xl']} style={{ marginBottom: 12 }} />
        <SkeletonBlock width="100%" height={152} borderRadius={APP_RADIUS['2xl']} />
      </View>
    </>
  )

  const renderContent = () => (
    <>
      {/* Hero */}
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
          <OptimizedImage
            source={placeholderImg as any}
            style={styles.heroImage as any}
            contentFit="cover"
            width={WINDOW_WIDTH}
            height={HERO_HEIGHT}
            quality={60}
          />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.85)', APP_COLORS.backgroundBase]}
          locations={[0.35, 0.8, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.heroGradient}
        />
        <View style={styles.heroOverlay}>
          <Typography variant="display" style={styles.heroName}>
            {profile?.name}{profile?.age ? `, ${profile.age}` : ''}
          </Typography>
          {!!profile?.location && (
            <View style={styles.heroLocationRow}>
              <Ionicons name="location-outline" size={16} color={APP_COLORS.textSecondary} />
              <Typography variant="body2" style={styles.heroLocationText}>
                {profile.location}
              </Typography>
            </View>
          )}
        </View>
      </View>

      {/* Bio */}
      {!!profile?.bio && (
        <View style={styles.sectionContainer}>
          <Typography variant="h4" style={styles.sectionTitle}>Bio</Typography>
          <Typography variant="body2" style={styles.bioText}>{profile.bio}</Typography>
        </View>
      )}

      {/* Interests */}
      {profile?.interests && profile.interests.length > 0 && (
        <View style={styles.sectionContainer}>
          <Typography variant="h4" style={styles.sectionTitle}>Interests</Typography>
          <View style={styles.interestsWrap}>
            {profile.interests.map((interest, idx) => {
              const isHighlight = idx === highlightInterestIdx
              if (isHighlight) {
                return (
                  <LinearGradient
                    key={`${interest}-${idx}`}
                    colors={APP_COLORS.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.interestPillHighlight}
                  >
                    <Typography variant="body2" style={styles.interestPillHighlightText}>{interest}</Typography>
                  </LinearGradient>
                )
              }
              return (
                <View key={`${interest}-${idx}`} style={styles.interestPill}>
                  <Typography variant="body2" style={styles.interestPillText}>{interest}</Typography>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* Occupation & Education */}
      {(hasOccupation || hasEducation) && (
        <View style={styles.sectionContainer}>
          {hasOccupation && (
            <View style={styles.bentoCard}>
              <Typography variant="tiny" style={styles.bentoLabel}>OCCUPATION</Typography>
              <Typography variant="h4" style={styles.bentoTitle}>{profile!.occupation}</Typography>
            </View>
          )}
          {hasEducation && (
            <View style={[styles.bentoBordered, hasOccupation && { marginTop: APP_SPACING.xl }]}>
              <Typography variant="tiny" style={styles.bentoLabel}>EDUCATION</Typography>
              <Typography variant="h4" style={styles.bentoTitle}>{profile!.education}</Typography>
            </View>
          )}
        </View>
      )}

      {/* Gallery */}
      {galleryPhotos.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.galleryHeader}>
            <Typography variant="h4" style={styles.sectionTitle}>Gallery</Typography>
            <Typography variant="caption" style={styles.galleryCount}>
              {galleryPhotos.length} {galleryPhotos.length === 1 ? 'Photo' : 'Photos'}
            </Typography>
          </View>
          <View style={styles.galleryGrid}>
            {galleryPhotos.map((uri, idx) => {
              const itemSize = Math.floor((WINDOW_WIDTH - APP_SPACING.xl * 2 - APP_SPACING.md) / 2)
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
      )}

      {/* Activity — real data, not in Figma's mock but valuable, so kept (same precedent as
          message requests on the chat list / segmented-tab data on other redesigned screens). */}
      {hasStats && (
        <View style={styles.sectionContainer}>
          <View style={styles.bentoCard}>
            <Typography variant="tiny" style={styles.bentoLabel}>ACTIVITY</Typography>
            <View style={styles.statsRow}>
              {(profile?.stats?.eventsAttended ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsAttended}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Attended</Typography>
                </View>
              )}
              {(profile?.stats?.eventsFavorited ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsFavorited}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Favorited</Typography>
                </View>
              )}
              {(profile?.stats?.eventsOrganized ?? 0) > 0 && (
                <View style={styles.statItem}>
                  <Typography variant="h3" style={styles.statNumber}>{profile!.stats!.eventsOrganized}</Typography>
                  <Typography variant="caption" style={styles.statLabel}>Organized</Typography>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      <View style={{ height: 140 }} />
    </>
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false} style={styles.headerWrap}>
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]} accessibilityRole="header">
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={20} color={APP_COLORS.textPrimary} />
            </TouchableOpacity>
            <Typography variant="h4" style={styles.headerWordmark}>Blend&apos;n</Typography>
          </View>
          <TouchableOpacity onPress={openSafety} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="More options">
            <Ionicons name="ellipsis-vertical" size={20} color={APP_COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </GlassSurface>

      <ScrollView showsVerticalScrollIndicator={false}>
        {isLoading ? renderSkeleton() : renderContent()}
      </ScrollView>

      {!isLoading && (
        <View style={[styles.ctaBar, { bottom: insets.bottom + 24 }]} pointerEvents="box-none">
          <GlassSurface intensity={10} tint="rgba(45,44,44,0.4)" borderRadius={APP_RADIUS.pill} style={styles.ctaGlass}>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={ctaDisabled}
              onPress={handleConnect}
              accessibilityRole="button"
              accessibilityLabel={ctaMode === 'message' ? 'Open chat' : 'Send connection request'}
              style={[styles.ctaPrimaryWrap, ctaDisabled && styles.ctaDisabled]}
            >
              <LinearGradient
                colors={ctaMode === 'requested' ? [APP_COLORS.backgroundInput, APP_COLORS.backgroundInput] : APP_COLORS.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaPrimary}
              >
                <Ionicons
                  name={ctaMode === 'message' ? 'chatbubble-ellipses' : 'person-add'}
                  size={16}
                  color={ctaMode === 'requested' ? APP_COLORS.textPrimary : APP_COLORS.onAccent}
                />
                <Typography
                  variant="h4"
                  style={{ color: ctaMode === 'requested' ? APP_COLORS.textPrimary : APP_COLORS.onAccent }}
                >
                  {ctaLabel}
                </Typography>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleAppreciate}
              accessibilityRole="button"
              accessibilityLabel="Appreciate this profile"
              style={styles.ctaSecondary}
            >
              <Ionicons name="heart-outline" size={18} color={APP_COLORS.textPrimary} />
              <Typography variant="h4" style={styles.ctaSecondaryText}>Appreciate</Typography>
            </TouchableOpacity>
          </GlassSurface>
          {!!ctaMessage && (
            <Typography variant="caption" style={styles.ctaHintText}>{ctaMessage}</Typography>
          )}
        </View>
      )}

      <SendRequestModal
        visible={sendRequestModalVisible}
        recipientName={profile?.name || 'this user'}
        recipientAvatar={photoList[0]}
        onClose={() => setSendRequestModalVisible(false)}
        onSend={submitConnectRequest}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { marginTop: 8, color: APP_COLORS.textSecondary },

  // Header
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerWordmark: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.accent,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.8,
  },

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
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.55,
  },
  heroOverlay: {
    position: 'absolute',
    left: APP_SPACING.xl,
    right: APP_SPACING.xl,
    bottom: APP_SPACING.lg,
    gap: APP_SPACING.xs,
  },
  heroName: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.6,
    fontWeight: '700',
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.textPrimary,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLocationText: {
    color: APP_COLORS.textSecondary,
  },

  // Sections
  sectionContainer: {
    paddingHorizontal: APP_SPACING.xl,
    paddingTop: APP_SPACING['2xl'],
  },
  sectionTitle: {
    color: APP_COLORS.textPrimary,
    marginBottom: APP_SPACING.md,
    letterSpacing: -0.4,
  },
  bioText: {
    color: APP_COLORS.textSecondary,
    lineHeight: 26,
  },

  // Interests
  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.sm,
  },
  interestPill: {
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.lg,
    paddingVertical: APP_SPACING.sm,
  },
  interestPillText: {
    color: APP_COLORS.textPrimary,
  },
  interestPillHighlight: {
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.lg,
    paddingVertical: APP_SPACING.sm,
  },
  interestPillHighlightText: {
    color: APP_COLORS.onAccent,
    fontWeight: '700',
  },

  // Occupation / Education bento
  bentoCard: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING['2xl'],
    gap: APP_SPACING.sm,
  },
  bentoBordered: {
    borderLeftWidth: 1,
    borderLeftColor: APP_COLORS.separator,
    paddingLeft: APP_SPACING.xl,
    gap: APP_SPACING.sm,
  },
  bentoLabel: {
    color: APP_COLORS.accent,
  },
  bentoTitle: {
    color: APP_COLORS.textPrimary,
  },

  // Gallery
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: APP_SPACING.lg,
  },
  galleryCount: {
    color: APP_COLORS.textSecondary,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.md,
  },
  galleryItem: {
    borderRadius: APP_RADIUS['2xl'],
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
    color: APP_COLORS.textPrimary,
  },
  statLabel: {
    color: APP_COLORS.textSecondary,
  },

  // Floating CTA bar
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ctaGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: APP_SPACING.xs,
    gap: APP_SPACING.sm,
  },
  ctaPrimaryWrap: {
    borderRadius: APP_RADIUS.pill,
    overflow: 'hidden',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.xs,
    paddingHorizontal: APP_SPACING.xl,
    paddingVertical: APP_SPACING.md,
    borderRadius: APP_RADIUS.pill,
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.xs,
    paddingHorizontal: APP_SPACING.xl,
    paddingVertical: APP_SPACING.md,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: 'rgba(45,44,44,0.8)',
  },
  ctaSecondaryText: {
    color: APP_COLORS.textPrimary,
  },
  ctaHintText: {
    marginTop: APP_SPACING.sm,
    textAlign: 'center',
    color: APP_COLORS.textSecondary,
  },
})
