import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Avatar from '../../components/ui/Avatar'
import GlassSurface from '../../components/ui/GlassSurface'
import OptimizedImage from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { apiClient, VenueDetail, VenueEventItem } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../../lib/theme'

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }
const BUCKET_COLORS = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]

function formatEventTime(startTime: string): string {
  const date = new Date(startTime)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<VenueEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewModalVisible, setReviewModalVisible] = useState(false)

  const load = useCallback(async (force = false) => {
    if (!id) return
    if (force) setLoading(true)
    try {
      const [venueResult, eventsResult] = await Promise.all([
        apiClient.getVenue(id, { force }),
        apiClient.getVenueEvents(id, { force }),
      ])
      if (venueResult.success && venueResult.data) {
        setVenue(venueResult.data)
      }
      if (eventsResult.success && eventsResult.data) {
        setUpcomingEvents(eventsResult.data.events)
      }
    } catch (e) {
      Logger.error('events', 'Failed to load venue', { error: e })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleReviewSubmitted = useCallback((review: { rating: number | null; review: string }) => {
    setVenue((prev) => prev ? {
      ...prev,
      reviewCount: prev.reviewCount + 1,
      recentReviews: [
        { id: `local-${Date.now()}`, rating: review.rating, review: review.review, createdAt: new Date().toISOString(), user: { id: 'me', name: 'You', image: null } },
        ...prev.recentReviews,
      ].slice(0, 5),
    } : prev)
    setReviewModalVisible(false)
    showToast('Review posted', 'success')
  }, [showToast])

  const nextEvent = upcomingEvents[0]

  const handleDiscoverCrowd = () => {
    if (nextEvent) {
      router.push({ pathname: '/event/[id]', params: { id: nextEvent.id } as any })
    } else {
      showToast('No upcoming events at this venue yet', 'info')
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <SkeletonBlock width="100%" height={320} borderRadius={0} />
        <View style={styles.skeletonBody}>
          <SkeletonLine width="60%" style={{ marginBottom: 12 }} />
          <SkeletonLine width="90%" style={{ marginBottom: 6 }} />
          <SkeletonLine width="70%" />
        </View>
      </SafeAreaView>
    )
  }

  if (!venue) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Text style={styles.notFoundText}>Venue not found</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" backgroundColor={APP_COLORS.backgroundBase} />

      <GlassSurface intensity={20} tint="rgba(15,14,14,0.8)" borderRadius={0} bordered={false} style={styles.headerWrap}>
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={APP_COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{venue.name}</Text>
            {venue.activeCount > 0 && (
              <View style={styles.activeRow}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{venue.activeCount} active here</Text>
              </View>
            )}
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </GlassSurface>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.hero}>
          {venue.coverImageUrl ? (
            <OptimizedImage source={venue.coverImageUrl} style={styles.heroImage as any} contentFit="cover" width={390} height={320} quality={70} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="business" size={40} color={APP_COLORS.textTertiary} />
            </View>
          )}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(15,14,14,0)', APP_COLORS.backgroundBase]}
            locations={[0.4, 1]}
            style={styles.heroGradient}
          />
          <Text style={styles.heroName}>{venue.name}</Text>
        </View>

        {!!venue.description && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="sparkles" size={14} color={APP_COLORS.accent} />
              <Text style={styles.sectionHeading}>The Crowd Spirit</Text>
            </View>
            <Text style={styles.bioText}>&quot;{venue.description}&quot;</Text>
          </View>
        )}

        {venue.crowdComposition.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PROFESSIONAL PULSE</Text>
            <View style={styles.pulseList}>
              {venue.crowdComposition.map((bucket, idx) => (
                <View key={bucket.label} style={styles.pulseRow}>
                  <View style={[styles.pulseIconWrap, { backgroundColor: `${BUCKET_COLORS[idx % BUCKET_COLORS.length]}33` }]}>
                    <Ionicons name="person" size={20} color={BUCKET_COLORS[idx % BUCKET_COLORS.length]} />
                  </View>
                  <View style={styles.pulseTextWrap}>
                    <Text style={styles.pulseLabel}>{bucket.label}</Text>
                    <Text style={styles.pulseSubtext}>{bucket.count} {bucket.count === 1 ? 'person' : 'people'}</Text>
                  </View>
                  <Text style={[styles.pulsePercentage, { color: BUCKET_COLORS[idx % BUCKET_COLORS.length] }]}>{bucket.percentage}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>WHISPERS FROM THE VENUE</Text>
            <TouchableOpacity onPress={() => setReviewModalVisible(true)} hitSlop={HIT_SLOP}>
              <Text style={styles.addReviewLink}>Add yours</Text>
            </TouchableOpacity>
          </View>
          {venue.recentReviews.length === 0 ? (
            <Text style={styles.emptyReviews}>No reviews yet — be the first to share what this place is like.</Text>
          ) : (
            <View style={styles.reviewsList}>
              {venue.recentReviews.map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <Text style={styles.reviewText}>&quot;{review.review}&quot;</Text>
                  <View style={styles.reviewAuthorRow}>
                    <Avatar source={review.user.image || undefined} size={32} />
                    <Text style={styles.reviewAuthor}>{review.user.name || 'Someone'}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>UPCOMING AT THIS VENUE</Text>
            <View style={styles.eventsList}>
              {upcomingEvents.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.eventRow}
                  onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } as any })}
                  activeOpacity={0.85}
                >
                  {item.coverImageUrl ? (
                    <OptimizedImage source={item.coverImageUrl} style={styles.eventThumb as any} contentFit="cover" width={56} height={56} quality={60} />
                  ) : (
                    <View style={[styles.eventThumb, styles.eventThumbPlaceholder]}>
                      <Ionicons name="calendar-outline" size={20} color={APP_COLORS.textTertiary} />
                    </View>
                  )}
                  <View style={styles.eventTextWrap}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.eventTime}>{formatEventTime(item.startTime)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={APP_COLORS.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleDiscoverCrowd}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Discover the crowd"
      >
        <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fabGradient}>
          <Ionicons name="radio" size={18} color={APP_COLORS.onAccent} />
          <Text style={styles.fabText}>{nextEvent ? 'Discover the Crowd' : 'No events yet'}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <ReviewModal
        visible={reviewModalVisible}
        venueId={venue.id}
        onClose={() => setReviewModalVisible(false)}
        onSubmitted={handleReviewSubmitted}
      />
    </SafeAreaView>
  )
}

function ReviewModal({
  visible,
  venueId,
  onClose,
  onSubmitted,
}: {
  visible: boolean
  venueId: string
  onClose: () => void
  onSubmitted: (review: { rating: number | null; review: string }) => void
}) {
  const { showToast } = useToast()
  const [rating, setRating] = useState<number>(0)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible) {
      setRating(0)
      setText('')
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const result = await apiClient.submitVenueReview(venueId, {
        rating: rating > 0 ? rating : undefined,
        review: text.trim(),
      })
      if (result.success) {
        onSubmitted({ rating: rating > 0 ? rating : null, review: text.trim() })
      } else {
        showToast(result.error || 'Failed to submit review', 'error')
      }
    } catch {
      showToast('Something went wrong', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalFullscreen}>
        <Pressable style={styles.modalBackdrop} onPress={sending ? undefined : onClose} />
        <GlassSurface intensity={20} tint="rgba(15,14,14,0.4)" borderRadius={APP_RADIUS['3xl']} style={styles.modalPanel}>
          <Text style={styles.modalTitle}>Leave a Review</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} hitSlop={HIT_SLOP}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={28}
                  color={star <= rating ? APP_COLORS.accent : APP_COLORS.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.modalTextarea}
            value={text}
            onChangeText={setText}
            placeholder="What's the vibe here?"
            placeholderTextColor={APP_COLORS.textTertiary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity onPress={handleSubmit} disabled={sending || !text.trim()} activeOpacity={0.9}>
            <LinearGradient colors={APP_COLORS.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalSubmit}>
              {sending ? <ActivityIndicator color={APP_COLORS.onAccent} /> : <Text style={styles.modalSubmitText}>Post Review</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </GlassSurface>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: APP_COLORS.backgroundBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: APP_COLORS.textSecondary },
  skeletonBody: { padding: APP_SPACING.xl },

  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: APP_SPACING.md,
    paddingBottom: APP_SPACING.sm,
    gap: APP_SPACING.sm,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: 18,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  headerSpacer: { width: 20 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: APP_COLORS.success },
  activeText: { fontFamily: APP_FONTS.body, fontSize: 12, color: APP_COLORS.textSecondary },

  hero: { height: 320, position: 'relative' },
  heroImage: { width: '100%', height: 320 },
  heroPlaceholder: { width: '100%', height: 320, backgroundColor: APP_COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  heroName: {
    position: 'absolute',
    left: APP_SPACING.xl,
    bottom: APP_SPACING.lg,
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 32,
    fontWeight: '800',
    color: APP_COLORS.textPrimary,
    letterSpacing: -1,
  },

  section: { paddingHorizontal: APP_SPACING.xl, paddingTop: APP_SPACING.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: APP_SPACING.xs, marginBottom: APP_SPACING.md },
  sectionHeading: { fontFamily: APP_FONTS.heading, fontSize: 18, fontWeight: '700', color: APP_COLORS.accent },
  sectionLabel: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: APP_COLORS.textSecondary,
  },
  bioText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 26,
    color: APP_COLORS.textPrimary,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
  },

  pulseList: { gap: APP_SPACING.md },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
    backgroundColor: APP_COLORS.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
  },
  pulseIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pulseTextWrap: { flex: 1 },
  pulseLabel: { fontFamily: APP_FONTS.bodyBold, fontSize: 16, fontWeight: '700', color: APP_COLORS.textPrimary },
  pulseSubtext: { fontFamily: APP_FONTS.body, fontSize: 12, color: APP_COLORS.textSecondary },
  pulsePercentage: { fontFamily: APP_FONTS.heading, fontSize: 22, fontWeight: '700' },

  addReviewLink: { fontFamily: APP_FONTS.bodyBold, fontSize: 13, fontWeight: '700', color: APP_COLORS.accent },
  emptyReviews: { fontFamily: APP_FONTS.body, fontSize: 14, color: APP_COLORS.textTertiary, lineHeight: 20 },
  reviewsList: { gap: APP_SPACING.md },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 4,
    borderLeftColor: APP_COLORS.accent,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.lg,
    gap: APP_SPACING.md,
  },
  reviewText: { fontFamily: APP_FONTS.bodyMedium, fontSize: 16, lineHeight: 23, color: APP_COLORS.textPrimary },
  reviewAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: APP_SPACING.sm },
  reviewAuthor: { fontFamily: APP_FONTS.body, fontSize: 13, color: APP_COLORS.textSecondary },

  eventsList: { gap: APP_SPACING.sm },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
    backgroundColor: APP_COLORS.backgroundCard,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
  },
  eventThumb: { width: 56, height: 56, borderRadius: APP_RADIUS.lg },
  eventThumbPlaceholder: { backgroundColor: APP_COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  eventTextWrap: { flex: 1 },
  eventTitle: { fontFamily: APP_FONTS.bodyBold, fontSize: 15, fontWeight: '700', color: APP_COLORS.textPrimary },
  eventTime: { fontFamily: APP_FONTS.body, fontSize: 12, color: APP_COLORS.textSecondary, marginTop: 2 },

  fab: {
    position: 'absolute',
    left: APP_SPACING.xl,
    right: APP_SPACING.xl,
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: APP_SPACING.sm,
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
  },
  fabText: { fontFamily: APP_FONTS.bodyBold, fontSize: 16, fontWeight: '700', color: APP_COLORS.onAccent },

  modalFullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: APP_SPACING.xl },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalPanel: { width: '100%', maxWidth: 420, padding: APP_SPACING.xl, gap: APP_SPACING.lg },
  modalTitle: { fontFamily: APP_FONTS.heading, fontSize: 20, fontWeight: '700', color: APP_COLORS.textPrimary },
  starsRow: { flexDirection: 'row', gap: APP_SPACING.sm },
  modalTextarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
    minHeight: 100,
    color: APP_COLORS.textPrimary,
    fontSize: 15,
    fontFamily: APP_FONTS.body,
    backgroundColor: APP_COLORS.backgroundInput,
    textAlignVertical: 'top',
  },
  modalSubmit: { minHeight: 52, borderRadius: APP_RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  modalSubmitText: { fontFamily: APP_FONTS.bodyBold, color: APP_COLORS.onAccent, fontSize: 16, fontWeight: '700' },
})
