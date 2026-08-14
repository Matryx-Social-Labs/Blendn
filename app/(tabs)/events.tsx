import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import GradientText from '../../components/GradientText'
import OptimizedImage, { preloadImages } from '../../components/OptimizedImage'
import RealtimeStatusBanner from '../../components/RealtimeStatusBanner'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { VirtualizedList } from '../../components/VirtualizedList'
import Avatar from '../../components/ui/Avatar'
import GlassSurface from '../../components/ui/GlassSurface'
import GlassTopBar from '../../components/GlassTopBar'
import { useToast } from '../../components/Toast'
import { getEvents as fetchEventsApi } from '../../lib/api'
import { apiClient, ProfileCache } from '../../lib/apiClient'
import { scheduleEventReminder, cancelEventReminder } from '../../lib/notifications'
import { useGradientOverlay } from '../../lib/gradientOverlay'
import { Logger } from '../../lib/logger'
import { getOptimizedImageUrl } from '../../lib/photoUtils'
import { formatTimeRange as fmtRange } from '../../lib/time'
import { useInteractionFeedback } from '../../lib/useInteractionFeedback'
import { useLiveSync } from '../../lib/useLiveSync'
import { useMinimumVisible } from '../../lib/useMinimumVisible'
import { useAuth } from '../../lib/useAuth'
import type { TraySize } from '../../lib/uxStandards'
import { APP_COLORS, APP_FONTS, APP_RADIUS } from '../../lib/theme'

// Helper to calculate distance between two coordinates in km
const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

interface Event {
  id: string
  title: string
  description: string
  short_description: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  timezone?: string
  price_cents: number
  max_capacity: number
  current_capacity: number
  cover_image_url: string | null
  category: string
  city?: string
  check_in_radius: number
  latitude: number
  longitude: number
  is_favorited?: boolean
  favorite_count?: number
  user_checkin?: { status: string; checkInId?: string; checkInTime?: string | null } | null
  interested_preview?: string[]
  display_city?: string
}

type EventsTrayState = {
  visible: boolean
  title: string
  message?: string
  buttons: ActionTrayButton[]
  size?: TraySize
  dismissible?: boolean
}

const COORDINATE_PATTERN = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/
const PAGE_SIZE = 20
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CAROUSEL_CARD_WIDTH = Math.max(260, SCREEN_WIDTH - 62)
const CAROUSEL_CARD_HEIGHT = Math.round(CAROUSEL_CARD_WIDTH * 1.55)
const CAROUSEL_ITEM_SPACING = 14
const CAROUSEL_ITEM_FULL = CAROUSEL_CARD_WIDTH + CAROUSEL_ITEM_SPACING
const FEATURED_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.85)
const FEATURED_CARD_HEIGHT = Math.round(FEATURED_CARD_WIDTH * (450 / 331.5))
const FEATURED_ITEM_SPACING = 16
const TYPE_HEADER_SIZE = 22
const TYPE_HEADER_LINE = 28
const TYPE_CARD_TITLE_SIZE = 20
const TYPE_CARD_TITLE_LINE = 26
const TYPE_BODY_SIZE = 14
const TYPE_META_SIZE = 13
const TYPE_CAPTION_SIZE = 12
const SECTION_MOTION_BASE_DELAY = 34
const SECTION_MOTION_STAGGER = 44

const formatCarouselCardDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'Date TBA'
  }
}

const isCoordinateLike = (value?: string | null) => {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (COORDINATE_PATTERN.test(trimmed)) return true
  return /^-?\d+(\.\d+)?$/.test(trimmed)
}

const resolveDisplayCity = (event: Event): string => {
  const cityRaw = event.city?.trim() || ''
  if (cityRaw && !isCoordinateLike(cityRaw)) return cityRaw

  const addressRaw = event.address?.trim() || ''
  if (!addressRaw || isCoordinateLike(addressRaw)) return 'Location TBA'

  const parts = addressRaw.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const likelyCity = parts[parts.length - 2]
    if (!isCoordinateLike(likelyCity)) return likelyCity
  }

  return 'Location TBA'
}

const normalizeEvent = (event: Event): Event => ({
  ...event,
  display_city: resolveDisplayCity(event),
})

const getFirstName = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] || null
}

// Memoized carousel card component to prevent re-renders
const CarouselCard = memo(({
  event,
  onPress,
  onLongPress,
  onToggleInterest,
  isInterested,
  interestLoading,
  statusLabel,
  showCheckout,
  onCheckout,
  checkoutLoading,
}: {
  event: Event
  onPress: () => void
  onLongPress?: () => void
  onToggleInterest?: () => void
  isInterested?: boolean
  interestLoading?: boolean
  statusLabel?: string
  showCheckout?: boolean
  onCheckout?: () => void
  checkoutLoading?: boolean
}) => {
  if (!event.cover_image_url) return null

  return (
    <TouchableOpacity style={styles.carouselCard} onPress={onPress} onLongPress={onLongPress} delayLongPress={320}>
      <View style={styles.carouselImage}>
        <OptimizedImage
          source={event.cover_image_url}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          width={260}
          height={120}
          quality={60}
          cachePolicy="memory-disk"
          priority="high"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.5, 1]}
          style={styles.carouselGradient}
        />
        {statusLabel ? (
          <View style={styles.carouselStatusPill}>
            <View style={styles.carouselStatusDot} />
            <Text style={styles.carouselStatusText}>{statusLabel}</Text>
          </View>
        ) : null}
        <View style={styles.carouselContentOverlay}>
          <Text style={styles.carouselEventTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.carouselTime}>{formatCarouselCardDate(event.start_time)}</Text>
          <Text style={styles.carouselVenue} numberOfLines={1}>{event.venue_name || event.display_city || 'Location TBA'}</Text>
          {showCheckout && onCheckout && (
            <TouchableOpacity
              onPress={onCheckout}
              disabled={checkoutLoading}
              style={styles.carouselCheckoutPill}
            >
              {checkoutLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.carouselCheckoutText}>Check out</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      {onToggleInterest && (
        <TouchableOpacity
          onPress={onToggleInterest}
          style={styles.carouselHeartButton}
          disabled={interestLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isInterested ? 'Remove from interested events' : 'Mark as interested'}
        >
          {interestLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name={isInterested ? 'heart' : 'heart-outline'} size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
})

CarouselCard.displayName = 'CarouselCard'

const formatFeaturedCardDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return 'Date TBA'
  }
}

// Large hero card for the "Featured" carousel — matches Figma's Featured Events Carousel section.
const FeaturedCard = memo(({ event, onPress, onLongPress }: { event: Event; onPress: () => void; onLongPress?: () => void }) => {
  if (!event.cover_image_url) return null
  return (
    <TouchableOpacity style={styles.featuredCard} onPress={onPress} onLongPress={onLongPress} delayLongPress={320} activeOpacity={0.92}>
      <OptimizedImage
        source={event.cover_image_url}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        width={FEATURED_CARD_WIDTH}
        height={FEATURED_CARD_HEIGHT}
        quality={70}
        cachePolicy="memory-disk"
        priority="high"
      />
      <LinearGradient
        colors={[APP_COLORS.backgroundBase, 'rgba(15,14,14,0.2)', 'rgba(15,14,14,0)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.featuredCardContent}>
        <View style={styles.featuredTag}>
          <Text style={styles.featuredTagText} numberOfLines={1}>
            {(event.category || 'Featured').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.featuredCardTitle} numberOfLines={3}>{event.title}</Text>
        <View style={styles.featuredMetaRow}>
          <View style={styles.featuredMetaItem}>
            <Ionicons name="calendar-outline" size={14} color={APP_COLORS.textSecondary} />
            <Text style={styles.featuredMetaText}>{formatFeaturedCardDate(event.start_time)}</Text>
          </View>
          <View style={styles.featuredMetaItem}>
            <Ionicons name="location-outline" size={14} color={APP_COLORS.textSecondary} />
            <Text style={styles.featuredMetaText} numberOfLines={1}>
              {event.venue_name || event.display_city || 'Location TBA'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
})
FeaturedCard.displayName = 'FeaturedCard'

// Vertical bento card for the "Upcoming" section — matches Figma's Upcoming Events Bento.
const UpcomingBentoCard = memo(({
  event,
  distanceKm,
  joinedCount,
  onPress,
  onLongPress,
}: {
  event: Event
  distanceKm?: number
  joinedCount?: number
  onPress: () => void
  onLongPress?: () => void
}) => {
  const dayOfMonth = useMemo(() => {
    try { return String(new Date(event.start_time).getDate()) } catch { return '' }
  }, [event.start_time])
  const distanceLabel = typeof distanceKm === 'number' && Number.isFinite(distanceKm)
    ? (distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} mi`)
    : null

  return (
    <View style={styles.upcomingBentoCard}>
      <TouchableOpacity activeOpacity={0.92} onPress={onPress} onLongPress={onLongPress} delayLongPress={320}>
        <View style={styles.upcomingBentoImageWrap}>
          {event.cover_image_url ? (
            <OptimizedImage
              source={event.cover_image_url}
              style={styles.upcomingBentoImage}
              contentFit="cover"
              width={CAROUSEL_CARD_WIDTH}
              height={166}
              quality={60}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.upcomingBentoImage, { backgroundColor: APP_COLORS.backgroundCard }]} />
          )}
          <View style={styles.upcomingBentoTag}>
            <Text style={styles.upcomingBentoTagText} numberOfLines={1}>{event.category || 'Event'}</Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.upcomingBentoBody}>
        <View style={styles.upcomingBentoTitleRow}>
          <Text style={styles.upcomingBentoTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.upcomingBentoDay}>{dayOfMonth}</Text>
        </View>
        <View style={styles.upcomingBentoMetaRow}>
          {typeof joinedCount === 'number' && joinedCount > 0 && (
            <View style={styles.upcomingBentoMetaItem}>
              <Ionicons name="people-outline" size={13} color={APP_COLORS.textSecondary} />
              <Text style={styles.upcomingBentoMetaText}>{joinedCount} Joined</Text>
            </View>
          )}
          {distanceLabel && (
            <View style={styles.upcomingBentoMetaItem}>
              <Ionicons name="navigate-outline" size={13} color={APP_COLORS.textSecondary} />
              <Text style={styles.upcomingBentoMetaText}>{distanceLabel}</Text>
            </View>
          )}
        </View>
        <Text style={styles.upcomingBentoDescription} numberOfLines={2}>
          {event.short_description || event.description}
        </Text>
        <ScalePress style={styles.upcomingBentoButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={`View details for ${event.title}`}>
          <Text style={styles.upcomingBentoButtonText}>Details</Text>
        </ScalePress>
      </View>
    </View>
  )
})
UpcomingBentoCard.displayName = 'UpcomingBentoCard'

export default function Events() {
  const { user, loading: authLoading } = useAuth()
  const feedback = useInteractionFeedback()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const comingSoon = useCallback(() => showToast('Coming soon', 'info'), [showToast])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityData, setProximityData] = useState<{ [eventId: string]: any }>({})
  const [checkinStatuses, setCheckinStatuses] = useState<{ [eventId: string]: any }>({})
  const [checkedInEvents, setCheckedInEvents] = useState<Event[]>([])
  const [interestStatuses, setInterestStatuses] = useState<{ [eventId: string]: boolean }>({})
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>({})
  const [interestPending, setInterestPending] = useState<Record<string, boolean>>({})
  const [checkInPending, setCheckInPending] = useState<Record<string, boolean>>({})
  const [checkOutPending, setCheckOutPending] = useState<Record<string, boolean>>({})
  const [userCity, setUserCity] = useState<string | null>(null)
  const [userFirstName, setUserFirstName] = useState<string | null>(getFirstName(user?.name))
  const [showPreviewHint, setShowPreviewHint] = useState(false)
  const { setScrollProgress } = useGradientOverlay()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState(false)
  const listRef = useRef<any>(null)
  const scrollY = useRef(new RNAnimated.Value(0)).current
  const upcomingListRef = useRef<FlatList>(null)
  const upcomingScrollOffsetRef = useRef(0)
  const [netError, setNetError] = useState<string | null>(null)
  const [trayState, setTrayState] = useState<EventsTrayState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    size: 'default',
    dismissible: true,
  })
  // Location permission status: 'checking' | 'granted' | 'denied' | 'undetermined'
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied' | 'undetermined'>('checking')
  const locationRequestInFlight = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const locationRequestedRef = useRef(false)
  const interestInFlightRef = useRef<Set<string>>(new Set())
  const checkInFlightRef = useRef<Set<string>>(new Set())
  const checkOutInFlightRef = useRef<Set<string>>(new Set())
  const lastFetchLocationRef = useRef<string>('none')
  const initialLoadedRef = useRef(false)
  const previewHintSeenRef = useRef(false)

  const closeTray = useCallback(() => {
    setTrayState((prev) => ({ ...prev, visible: false }))
  }, [])

  const showTray = useCallback((next: Omit<EventsTrayState, 'visible'>) => {
    setTrayState({
      visible: true,
      title: next.title,
      message: next.message,
      buttons: next.buttons,
      size: next.size || 'default',
      dismissible: next.dismissible ?? true,
    })
  }, [])

  const previewHintKey = useMemo(
    () => (user?.id ? `events_preview_hint_seen_${user.id}` : null),
    [user?.id]
  )

  const markPreviewHintSeen = useCallback(() => {
    if (previewHintSeenRef.current) return
    previewHintSeenRef.current = true
    setShowPreviewHint(false)
    if (!previewHintKey) return
    AsyncStorage.setItem(previewHintKey, '1').catch(() => {})
  }, [previewHintKey])

  useEffect(() => {
    let mounted = true
    const hydratePreviewHint = async () => {
      if (!previewHintKey) {
        previewHintSeenRef.current = true
        if (mounted) setShowPreviewHint(false)
        return
      }
      try {
        const seen = await AsyncStorage.getItem(previewHintKey)
        const hasSeen = seen === '1'
        previewHintSeenRef.current = hasSeen
        if (mounted) setShowPreviewHint(!hasSeen)
      } catch {
        previewHintSeenRef.current = false
        if (mounted) setShowPreviewHint(true)
      }
    }
    hydratePreviewHint()
    return () => {
      mounted = false
    }
  }, [previewHintKey])

  // Memoized callbacks to prevent re-creation
  const handleEventPress = useCallback((event: Event) => {
    // Warm the event detail cache before navigation (fire-and-forget)
    apiClient.getEvent(event.id, {
      include: 'interestedUsers',
      interestedLimit: 6,
      lat: userLocation?.latitude,
      lon: userLocation?.longitude,
    }).catch(() => {})

    if (event.cover_image_url) {
      const hero = getOptimizedImageUrl(event.cover_image_url, {
        width: 1080,
        height: 520,
        resize: 'cover',
        quality: 70,
        format: 'webp',
      })
      if (hero) {
        preloadImages([hero], 'high').catch(() => {})
      }
    }

    router.push({
      pathname: '/event/[id]',
      params: {
        id: event.id,
        title: event.title,
        cover: event.cover_image_url || '',
        venue: event.venue_name,
        city: event.display_city || event.city || '',
        start: event.start_time,
        end: event.end_time,
        category: event.category || '',
        description: event.description || '',
        interestCount: String(interestCounts[event.id] ?? event.favorite_count ?? 0),
        interested: event.interested_preview && event.interested_preview.length > 0
          ? JSON.stringify(event.interested_preview)
          : '',
      } as any,
    })
  }, [userLocation, interestCounts])

  const handleCheckIn = useCallback(async (event: Event) => {
    if (checkInFlightRef.current.has(event.id)) return
    let previousStatus: any = undefined
    let hadCheckedInEvent = false
    try {
      Logger.journey('checkin', 'start', { eventId: event.id })
      if (!user) {
        Logger.journey('auth', 'blocked:notSignedIn')
        showTray({
          title: 'Sign in required',
          message: 'Please sign in to check in to events.',
          buttons: [
            { label: 'Not now', onPress: closeTray },
            { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
          ],
        })
        return
      }
      if (!userLocation) {
        showTray({
          title: 'Location required',
          message: 'Enable location to verify proximity and check in.',
          buttons: [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                try { (Linking as any)?.openSettings?.() } catch {}
              }
            },
          ],
        })
        return
      }

      checkInFlightRef.current.add(event.id)
      setCheckInPending((prev) => ({ ...prev, [event.id]: true }))
      feedback.tap()
      previousStatus = checkinStatuses[event.id]
      hadCheckedInEvent = checkedInEvents.some((e) => e.id === event.id)

      // Optimistic UI update
      setCheckinStatuses((prev) => ({
        ...prev,
        [event.id]: {
          status: 'checked_in',
          checkInTime: new Date().toISOString(),
        },
      }))
      if (!hadCheckedInEvent) {
        setCheckedInEvents((prev) => [event, ...prev])
      }
      
      // Call standardized production check-in RPC
      Logger.journey('checkin', 'api:checkIn:call', { eventId: event.id })
      const result = await apiClient.checkIn(event.id, {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        deviceInfo: { gpsAccuracy: 50 },
      })

      if (!result.success) {
        // Rollback optimistic update
        setCheckinStatuses((prev) => {
          const next = { ...prev }
          if (previousStatus) next[event.id] = previousStatus
          else delete next[event.id]
          return next
        })
        if (!hadCheckedInEvent) {
          setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))
        }
        Logger.error('events', 'Check-in error', { error: result.error })
        feedback.error()
        showTray({
          title: 'Check-in failed',
          message: result.error || 'Unknown error',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        })
        return
      }

      Logger.journey('checkin', 'success', { eventId: event.id })
      feedback.success()
      // Get event chat and offer navigation
      const chatResult = await apiClient.getEventChat(event.id)
      if (chatResult.success && chatResult.data?.id) {
        showTray({
          title: 'Checked in',
          message: 'You have been checked in and added to the event chat.',
          buttons: [
            {
              label: 'Go to Chat',
              variant: 'primary',
              onPress: () => {
                closeTray()
                router.push({
                  pathname: '/chat/[id]',
                  params: {
                    id: chatResult.data.id,
                    roomName: chatResult.data.name || 'Event Chat',
                    eventTitle: event.title,
                  } as any,
                })
              },
            },
            { label: 'Stay here', onPress: closeTray },
          ],
        })
      } else {
        showTray({
          title: 'Checked in',
          message: 'You have been checked in.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        })
      }

      // Refresh the checkin status for this event
      loadCheckinStatusesBatch()
      loadCheckedInEvents()
    } catch (error) {
      setCheckinStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[event.id] = previousStatus
        else delete next[event.id]
        return next
      })
      if (!hadCheckedInEvent) {
        setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))
      }
      Logger.error('events', 'Unexpected error', { error: error as any })
      feedback.error()
      showTray({
        title: 'Check-in failed',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
      })
    } finally {
      checkInFlightRef.current.delete(event.id)
      setCheckInPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [user, userLocation, checkinStatuses, checkedInEvents, feedback, showTray, closeTray])

  const toggleInterest = useCallback(async (event: Event) => {
    if (interestInFlightRef.current.has(event.id)) return
    let prevInterested = false
    let prevCount = 0
    try {
      if (!user) {
        showTray({
          title: 'Sign in required',
          message: 'Please sign in to save events.',
          buttons: [
            { label: 'Not now', onPress: closeTray },
            { label: 'Sign in', variant: 'primary', onPress: () => { closeTray(); router.replace('/' as any) } },
          ],
          size: 'compact',
        })
        return
      }
      interestInFlightRef.current.add(event.id)
      setInterestPending((prev) => ({ ...prev, [event.id]: true }))
      feedback.tap()
      prevInterested = !!interestStatuses[event.id]
      prevCount = interestCounts[event.id] ?? event.favorite_count ?? 0
      const optimisticCount = Math.max(0, prevInterested ? prevCount - 1 : prevCount + 1)
      // Optimistic update
      setInterestStatuses(prev => ({ ...prev, [event.id]: !prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: optimisticCount }))

      const result = await apiClient.toggleInterest(event.id)
      if (!result.success || !result.data) {
        // rollback
        setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
        setInterestCounts(prev => ({ ...prev, [event.id]: prevCount }))
        feedback.error()
        showTray({
          title: 'Update failed',
          message: 'Failed to update interest.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
        return
      }
      setInterestStatuses(prev => ({ ...prev, [event.id]: result.data!.interested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: result.data!.interestCount }))
      feedback.tap()
      Logger.journey('events', result.data!.interested ? 'interest:mark' : 'interest:unmark', { eventId: event.id })
      // Schedule / cancel event reminder based on interest state
      if (result.data!.interested) {
        scheduleEventReminder({
          id: event.id,
          title: event.title,
          start_time: event.start_time,
          venue_name: event.venue_name,
        }).catch(() => {})
      } else {
        cancelEventReminder(event.id).catch(() => {})
      }
    } catch {
      setInterestStatuses(prev => ({ ...prev, [event.id]: prevInterested }))
      setInterestCounts(prev => ({ ...prev, [event.id]: prevCount }))
      feedback.error()
      showTray({
        title: 'Update failed',
        message: 'Failed to update interest.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    } finally {
      interestInFlightRef.current.delete(event.id)
      setInterestPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [user, interestStatuses, interestCounts, feedback, showTray, closeTray])

  const handleEventPreview = useCallback((event: Event) => {
    markPreviewHintSeen()
    const checkinStatus = checkinStatuses[event.id]
    const proximity = proximityData[event.id]
    const isCheckedIn = checkinStatus?.status === 'checked_in'
    const canCheckIn = !!proximity?.within_radius && !isCheckedIn
    const interested = !!interestStatuses[event.id]
    const summary = [
      formatCarouselCardDate(event.start_time),
      event.venue_name || event.display_city || 'Location TBA',
      (event.short_description || event.description || '').trim(),
      'Tip: long-press cards for quick actions.',
    ].filter(Boolean).join('\n')

    const buttons: ActionTrayButton[] = [
      {
        label: interested ? 'Remove Interest' : 'Mark Interested',
        onPress: () => {
          closeTray()
          toggleInterest(event)
        },
      },
      {
        label: 'View Details',
        variant: 'primary',
        onPress: () => {
          closeTray()
          handleEventPress(event)
        },
      },
    ]

    if (canCheckIn) {
      buttons.unshift({
        label: 'Check In',
        variant: 'primary',
        onPress: () => {
          closeTray()
          handleCheckIn(event)
        },
      })
    }

    showTray({
      title: event.title,
      message: summary,
      buttons,
      size: 'expanded',
    })
  }, [checkinStatuses, proximityData, interestStatuses, closeTray, toggleInterest, handleEventPress, handleCheckIn, showTray, markPreviewHintSeen])

  const handleCheckOut = useCallback(async (event: Event) => {
    if (checkOutInFlightRef.current.has(event.id)) return
    checkOutInFlightRef.current.add(event.id)
    setCheckOutPending((prev) => ({ ...prev, [event.id]: true }))
    feedback.tap()

    const previousStatus = checkinStatuses[event.id]
    const previousCheckedInEvents = checkedInEvents

    // Optimistic removal from checked-in state
    setCheckinStatuses((prev) => ({ ...prev, [event.id]: { status: 'not_checked_in' } }))
    setCheckedInEvents((prev) => prev.filter((e) => e.id !== event.id))

    try {
      const result = await apiClient.checkOut(String(event.id))
      if (result.success) {
        feedback.success()
        showTray({
          title: 'Checked out',
          message: 'You have been checked out of this event.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
        loadCheckedInEvents()
        loadCheckinStatusesBatch()
      } else {
        // Rollback on failure
        setCheckinStatuses((prev) => {
          const next = { ...prev }
          if (previousStatus) next[event.id] = previousStatus
          else delete next[event.id]
          return next
        })
        setCheckedInEvents(previousCheckedInEvents)
        feedback.error()
        showTray({
          title: 'Checkout failed',
          message: result.error || 'Please try again.',
          buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
          size: 'compact',
        })
      }
    } catch {
      setCheckinStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[event.id] = previousStatus
        else delete next[event.id]
        return next
      })
      setCheckedInEvents(previousCheckedInEvents)
      feedback.error()
      showTray({
        title: 'Checkout failed',
        message: 'Please try again.',
        buttons: [{ label: 'Done', variant: 'primary', onPress: closeTray }],
        size: 'compact',
      })
    } finally {
      checkOutInFlightRef.current.delete(event.id)
      setCheckOutPending((prev) => ({ ...prev, [event.id]: false }))
    }
  }, [checkinStatuses, checkedInEvents, feedback, showTray, closeTray])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchEvents({ silent: true, force: true })
    setRefreshing(false)
  }, [])

  const requestLocationIfNeeded = useCallback((force = false) => {
    if (userLocation) return
    if (locationRequestInFlight.current) return
    if (locationStatus === 'denied' && !force) return
    locationRequestInFlight.current = true
    locationRequestedRef.current = true
    getCurrentLocationQuietly()
      .finally(() => {
        locationRequestInFlight.current = false
      })
  }, [userLocation, locationStatus])

  const onScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y
    scrollY.setValue(y)
    setScrollProgress(y, 320)
    if (!locationRequestedRef.current && y > 180) {
      requestLocationIfNeeded(false)
    }
  }, [setScrollProgress, requestLocationIfNeeded, scrollY])

  // Single profile fetch for avatar and city - uses cached profile if available
  const loadUserProfile = useCallback(async () => {
    if (!user) return
    try {
      const authFirstName = getFirstName(user.name)
      if (authFirstName) setUserFirstName(authFirstName)

      // Check cache first (populated by _layout.tsx during onboarding check)
      const cached = ProfileCache.get(user.id)
      const data = cached || (await apiClient.getProfile(user.id).then(r => r.success ? r.data : null))

      if (data) {
        const dataFirstName = getFirstName(data.profile?.name) || getFirstName(data.name)
        if (dataFirstName) setUserFirstName(dataFirstName)

        const profile = data.profile
        if (profile) {
          // Only use URLs that are valid and not empty
          const primary = (Array.isArray(profile.profile_photos) && profile.profile_photos[0]) ||
                         (Array.isArray(profile.photos) && profile.photos[0]) ||
                         null // Don't use data.image (Google avatar) as it often fails
          if (primary && primary.length > 0) {
            setAvatarUrl(primary)
          }
          // Set city
          if (profile.location) {
            const firstPart = String(profile.location).split(',')[0]?.trim()
            if (firstPart) setUserCity(firstPart)
          }
        }
      }
    } catch {}
  }, [user])

  // Check location permission status on mount (without requesting)
  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          // Permission already granted - mark as granted immediately (before fetching coords)
          setLocationStatus('granted')
          try {
            const lastKnown = await Location.getLastKnownPositionAsync()
            if (lastKnown?.coords) {
              setUserLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude })
            }
          } catch {}
          // Defer live GPS to avoid blocking startup render
          setTimeout(async () => {
            try {
              const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
            } catch {
              // Position fetch failed but permission is still granted - don't show prompt
            }
          }, 600)
        } else if (status === 'denied') {
          setLocationStatus('denied')
        } else {
          // 'undetermined' - permission not yet requested
          setLocationStatus('undetermined')
        }
      } catch {
        // On error, assume undetermined
        setLocationStatus('undetermined')
      }
    }
    checkLocationPermission()
  }, [])

  useEffect(() => {
    if (!authLoading && user) {
      Logger.journey('events', 'mount:authorized', { userId: user.id })
      fetchEvents()
    }
  }, [user, authLoading])

  useEffect(() => {
    const authFirstName = getFirstName(user?.name)
    if (authFirstName) {
      setUserFirstName(authFirstName)
    }
  }, [user?.name])

  // Preload images - use a ref to track already preloaded URLs and avoid redundant work
  const preloadedUrlsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (events.length === 0) return
    const urls = events
      .filter((event) => !!event.cover_image_url)
      .slice(0, 8)
      .map((event) =>
        getOptimizedImageUrl(event.cover_image_url as string, {
          width: 520,
          height: 240,
          resize: 'cover',
          quality: 60,
          format: 'webp',
        })
      )
      .filter(url => !preloadedUrlsRef.current.has(url))

    if (urls.length > 0) {
      urls.forEach(url => preloadedUrlsRef.current.add(url))
      preloadImages(urls, 'normal').catch(() => {})
    }
  }, [events])

  const loadCheckedInEvents = async () => {
    if (!user) return
    try {
      Logger.journey('checkin', 'loadActiveCheckins:start', { userId: user.id })
      const result = await apiClient.getActiveCheckins()
      if (result.success && result.data?.checkIns) {
        // Transform check-in data to Event format
        const activeEvents: Event[] = result.data.checkIns
          .filter((c: any) => c.event)
          .map((c: any) => ({
            id: c.event.id,
            title: c.event.title,
            description: c.event.description || '',
            short_description: c.event.shortDescription || '',
            venue_name: c.event.venueName || '',
            address: c.event.address || '',
            start_time: c.event.startTime,
            end_time: c.event.endTime,
            price_cents: c.event.priceCents || 0,
            max_capacity: c.event.maxCapacity || 0,
            current_capacity: c.event.currentCapacity || 0,
            cover_image_url: c.event.coverImageUrl || null,
            category: c.event.category || '',
            city: c.event.city,
            check_in_radius: c.event.checkInRadius || 100,
            latitude: c.event.latitude,
            longitude: c.event.longitude,
          }))
          .map(normalizeEvent)
        setCheckedInEvents(activeEvents)
        Logger.journey('checkin', 'loadActiveCheckins:done', { count: activeEvents.length })
      } else {
        setCheckedInEvents([])
        Logger.journey('checkin', 'loadActiveCheckins:done', { count: 0 })
      }
    } catch (e) {
      Logger.error('events', 'Unexpected error', { error: e as any })
      setCheckedInEvents([])
    }
  }

  const getCarouselItemLayout = useCallback((_: any, index: number) => ({
    length: CAROUSEL_ITEM_FULL,
    offset: CAROUSEL_ITEM_FULL * index,
    index,
  }), [])

  const renderCheckedInCarousel = () => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>You&apos;re checked in</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        data={checkedInEvents.filter((item, idx) => !!item.cover_image_url && idx < 10)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            statusLabel="Going"
            showCheckout
            onCheckout={() => handleCheckOut(item)}
            checkoutLoading={!!checkOutPending[item.id]}
          />
        )}
      />
    </View>
  )


  useEffect(() => {
    if (userLocation && events.length > 0) {
      checkEventProximity()
    }
  }, [userLocation, events])

  const loadCheckinStatusesBatch = async () => {
    if (!user || events.length === 0) return

    try {
      Logger.journey('checkin', 'statusBatch:start', { eventCount: events.length })
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchCheckinStatuses(eventIds)

      if (result.success && result.data?.statuses) {
        const statusMap: { [eventId: string]: any } = {}
        Object.entries(result.data.statuses).forEach(([eventId, statusData]: [string, any]) => {
          statusMap[eventId] = {
            status: statusData.status === 'checked_in' ? 'checked_in' : 'not_checked_in',
            checkInId: statusData.checkInId,
            checkInTime: statusData.checkInTime,
          }
        })
        setCheckinStatuses(statusMap)
        Logger.journey('checkin', 'statusBatch:done', { count: Object.keys(statusMap).length })
      } else {
        // Fallback: set all as not checked in
        const statusMap: { [eventId: string]: any } = {}
        events.forEach((ev) => {
          statusMap[ev.id] = { status: 'not_checked_in' }
        })
        setCheckinStatuses(statusMap)
      }
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      setCheckinStatuses({})
    }
  }

  const getCurrentLocationQuietly = async () => {
    try {
      // Best-effort permission request with quick timeout; fallback if denied/unavailable
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setUserLocation(null)
        setLocationStatus(status === 'denied' ? 'denied' : 'undetermined')
        Logger.warn('events', 'permission:notGranted', {})
        showTray({
          title: 'Turn on location',
          message: 'We need your location to show nearby events and enable check-in.',
          buttons: [
            { label: 'Cancel', onPress: closeTray },
            {
              label: 'Open Settings',
              variant: 'primary',
              onPress: () => {
                closeTray()
                try { (Linking as any)?.openSettings?.() } catch {}
              }
            },
          ],
        })
        return
      }
      setLocationStatus('granted')
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setUserLocation(coords)
      Logger.journey('proximity', 'quietLocation:resolved', coords)
    } catch (error) {
      // Keep status as granted if permission was granted but position fetch failed
      Logger.warn('events', 'quietLocation:error', { error: error as any })
    }
  }

  const checkEventProximity = async () => {
    if (!userLocation || !user) return

    try {
      Logger.journey('proximity', 'checkAll:start', { lat: userLocation.latitude, lon: userLocation.longitude })
      
      // Use the actual function that exists: check_user_proximity_status
      // TODO: Add API endpoint for proximity check
      // For now, calculate distance client-side
      const proximityResults = events.map(event => {
        if (!event.latitude || !event.longitude) return null
        const distance = getDistanceKm(userLocation.latitude, userLocation.longitude, event.latitude, event.longitude)
        const checkInRadius = event.check_in_radius || 0.5 // default 500m
        return {
          event_id: event.id,
          within_radius: distance <= checkInRadius,
          distance_km: distance,
          can_check_in: distance <= checkInRadius
        }
      }).filter(Boolean)

      const proximityData = { nearby_events: proximityResults }
      const error = null

      if (error) {
        Logger.error('events', 'Error checking proximity', { error })
        return
      }

      // Transform the response to match our expected format
      const proximityMap: { [eventId: string]: any } = {}
      
      if (proximityData?.nearby_events) {
        proximityData.nearby_events.forEach((event: any) => {
          proximityMap[event.event_id] = {
            within_radius: event.within_radius,
            distance_km: event.distance_km,
            can_check_in: event.can_check_in
          }
        })
      }

      setProximityData(proximityMap)
      Logger.journey('proximity', 'checkAll:success', { eventsEvaluated: events.length, nearbyCount: proximityData?.nearby_events?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Proximity check failed', { error: error as any })
    }
  }

  // fetchUserCity removed - now handled in loadUserProfile

  // Removed city override feature

  const fetchEvents = async (options?: { silent?: boolean; force?: boolean }) => {
    try {
      const isInitial = !initialLoadedRef.current
      const shouldShowLoading = isInitial || !options?.silent
      if (shouldShowLoading) {
        setLoading(true)
      }
      setNetError(null)
      Logger.journey('events', 'fetch:start')

      // Use the API helper which handles Supabase vs admin backend switching
      const lat = userLocation?.latitude
      const lon = userLocation?.longitude
      const { data: eventsData, meta, error } = await fetchEventsApi({
        page: 0,
        limit: PAGE_SIZE,
        lat,
        lon,
        include: 'checkins,activeCheckins,profile,interestedPreview',
        interestedPreviewLimit: 3,
      }, { force: !!options?.force })

      if (error) {
        Logger.error('events', 'Error fetching events', { error })
        setNetError('Failed to load events')
        return
      }

      setEvents((eventsData || []).map(normalizeEvent))
      lastFetchLocationRef.current = lat && lon ? `${lat},${lon}` : 'none'
      initialLoadedRef.current = true
      if (eventsData) {
        const interestMap: { [eventId: string]: boolean } = {}
        const countMap: Record<string, number> = {}
        const checkinMap: { [eventId: string]: any } = {}
        eventsData.forEach((event) => {
          interestMap[event.id] = !!event.is_favorited
          countMap[event.id] = event.favorite_count || 0
          if (event.user_checkin) {
            checkinMap[event.id] = {
              status: event.user_checkin.status === 'checked_in' ? 'checked_in' : event.user_checkin.status,
              checkInId: event.user_checkin.checkInId,
              checkInTime: event.user_checkin.checkInTime,
            }
          }
        })
        setInterestStatuses(interestMap)
        setInterestCounts(countMap)
        setCheckinStatuses(checkinMap)
      }
      if (meta?.activeCheckins?.length) {
        const activeEvents: Event[] = meta.activeCheckins
          .filter((c: any) => c.event)
          .map((c: any) => ({
            id: c.event.id,
            title: c.event.title,
            description: '',
            short_description: '',
            venue_name: c.event.venueName || '',
            address: c.event.address || '',
            start_time: c.event.startTime,
            end_time: c.event.endTime,
            price_cents: 0,
            max_capacity: 0,
            current_capacity: 0,
            cover_image_url: c.event.coverImageUrl || null,
            category: '',
            city: c.event.city,
            check_in_radius: 0,
            latitude: 0,
            longitude: 0,
          }))
          .map(normalizeEvent)
        setCheckedInEvents(activeEvents)
      } else {
        setCheckedInEvents([])
      }
      if (meta?.profile?.profile) {
        const profile = meta.profile.profile
        const profileFirstName = getFirstName(profile.name)
        if (profileFirstName) {
          setUserFirstName(profileFirstName)
        }
        const primary = (Array.isArray(profile.profile_photos) && profile.profile_photos[0]) ||
          (Array.isArray(profile.photos) && profile.photos[0]) ||
          null
        if (primary && primary.length > 0) {
          setAvatarUrl(primary)
        }
        if (profile.location) {
          const firstPart = String(profile.location).split(',')[0]?.trim()
          if (firstPart) setUserCity(firstPart)
        }
      }
      // Image preloading is handled by useEffect when events change
      Logger.journey('events', 'fetch:success', { count: eventsData?.length || 0 })
    } catch (error) {
      Logger.error('events', 'Unexpected error', { error: error as any })
      setNetError('Failed to load events')
    } finally {
      if (!options?.silent || !initialLoadedRef.current) {
        setLoading(false)
      }
    }
  }

  const socketStatus = useLiveSync({
    enabled: !!user && !authLoading,
    onSync: () => fetchEvents({ silent: true, force: true }),
    domains: ['events'],
    connectedIntervalMs: 30000,
    disconnectedIntervalMs: 12000,
    maxDisconnectedIntervalMs: 45000,
  })

  // If location becomes available after initial load, refetch with coordinates
  useEffect(() => {
    if (!user || authLoading) return
    if (!userLocation) return
    if (loading) return
    const key = `${userLocation.latitude},${userLocation.longitude}`
    if (lastFetchLocationRef.current !== key) {
      fetchEvents({ silent: true, force: true })
    }
  }, [user, authLoading, userLocation, loading])

  const loadInterestData = async () => {
    try {
      if (!user || events.length === 0) return
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchInterestStatuses(eventIds)

      if (result.success && result.data?.interests) {
        setInterestStatuses(result.data.interests)
        Logger.info('events', 'loadInterestData: batch interest loaded', { count: Object.keys(result.data.interests).length })
      }
    } catch (e) {
      Logger.warn('events', 'loadInterestData failed', { error: e })
      setInterestStatuses({})
    }
  }

  const loadInterestCounts = async () => {
    try {
      if (events.length === 0) return
      const eventIds = events.map(e => e.id)
      const result = await apiClient.getBatchInterestCounts(eventIds)

      if (result.success && result.data?.counts) {
        setInterestCounts(result.data.counts)
        Logger.info('events', 'loadInterestCounts: batch counts loaded', { count: Object.keys(result.data.counts).length })
      }
    } catch (e) {
      Logger.warn('events', 'loadInterestCounts failed', { error: e })
      setInterestCounts({})
    }
  }

  

  // Memoized keyExtractor
  const keyExtractor = useCallback((item: Event) => item.id, [])

  const renderCarouselWithTitle = (title: string, items: Event[]) => (
    <View style={styles.carouselContainer}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselList}
        data={items.filter((item, idx) => !!item.cover_image_url && idx < 10)}
        keyExtractor={keyExtractor}
        getItemLayout={getCarouselItemLayout}
        renderItem={({ item }) => (
          <CarouselCard
            event={item}
            onPress={() => handleEventPress(item)}
            onLongPress={() => handleEventPreview(item)}
            onToggleInterest={() => toggleInterest(item)}
            isInterested={!!interestStatuses[item.id]}
            interestLoading={!!interestPending[item.id]}
            statusLabel={checkinStatuses[item.id]?.status === 'checked_in' ? 'Going' : undefined}
          />
        )}
      />
    </View>
  )

  const UPCOMING_ITEM_WIDTH = CAROUSEL_CARD_WIDTH
  const UPCOMING_ITEM_HEIGHT = CAROUSEL_CARD_HEIGHT
  const UPCOMING_ITEM_FULL = CAROUSEL_ITEM_FULL
  // Compensate item spacing so the snapped card centers visually.
  const UPCOMING_SIDE_PADDING = ((SCREEN_WIDTH - UPCOMING_ITEM_WIDTH) / 2) - (CAROUSEL_ITEM_SPACING / 2)

  const renderHeaderAndSearch = () => (
    <View style={styles.pulseHeaderSection}>
      <GradientText style={styles.pulseHeading}>The Pulse</GradientText>
      <View style={styles.searchInputWrap}>
        <Ionicons name="search" size={18} color={APP_COLORS.textTertiary} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search experiences..."
          placeholderTextColor={APP_COLORS.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search experiences"
        />
      </View>
    </View>
  )

  const renderFeaturedCarousel = (items: Event[]) => {
    const withImages = items.filter(e => !!e.cover_image_url).slice(0, 10)
    if (withImages.length === 0) return null
    return (
      <View style={styles.carouselContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Featured</Text>
          <TouchableOpacity onPress={() => router.push('/nearby-events' as any)} accessibilityRole="button" accessibilityLabel="View all featured events">
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredList}
          data={withImages}
          keyExtractor={(item) => `featured-${item.id}`}
          snapToInterval={FEATURED_CARD_WIDTH + FEATURED_ITEM_SPACING}
          decelerationRate="fast"
          renderItem={({ item }) => (
            <FeaturedCard
              event={item}
              onPress={() => handleEventPress(item)}
              onLongPress={() => handleEventPreview(item)}
            />
          )}
        />
      </View>
    )
  }

  const scrollUpcoming = (direction: 1 | -1) => {
    const nextOffset = Math.max(0, upcomingScrollOffsetRef.current + direction * UPCOMING_ITEM_FULL)
    upcomingListRef.current?.scrollToOffset({ offset: nextOffset, animated: true })
    upcomingScrollOffsetRef.current = nextOffset
  }

  const renderUpcomingBento = (items: Event[]) => {
    if (items.length === 0) return null
    return (
      <View style={styles.carouselContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          <View style={styles.upcomingNavRow}>
            <TouchableOpacity
              style={styles.upcomingNavButton}
              onPress={() => scrollUpcoming(-1)}
              accessibilityRole="button"
              accessibilityLabel="Scroll upcoming events left"
            >
              <Ionicons name="chevron-back" size={16} color={APP_COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.upcomingNavButton}
              onPress={() => scrollUpcoming(1)}
              accessibilityRole="button"
              accessibilityLabel="Scroll upcoming events right"
            >
              <Ionicons name="chevron-forward" size={16} color={APP_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          ref={upcomingListRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.upcomingBentoStack}
          data={items}
          keyExtractor={keyExtractor}
          getItemLayout={(_, index) => ({ length: UPCOMING_ITEM_FULL, offset: UPCOMING_ITEM_FULL * index, index })}
          onScroll={(e) => { upcomingScrollOffsetRef.current = e.nativeEvent.contentOffset.x }}
          scrollEventThrottle={32}
          renderItem={({ item: ev }) => (
            <UpcomingBentoCard
              event={ev}
              distanceKm={distanceMap[ev.id]}
              joinedCount={interestCounts[ev.id] ?? ev.favorite_count}
              onPress={() => handleEventPress(ev)}
              onLongPress={() => handleEventPreview(ev)}
            />
          )}
        />
      </View>
    )
  }

  const renderNearbyExperiences = (spotlight?: Event) => {
    if (!spotlight) return null
    const friendAvatars = (spotlight.interested_preview || []).slice(0, 3)
    const friendOverflow = Math.max(0, (interestCounts[spotlight.id] ?? 0) - friendAvatars.length)
    return (
      <View style={styles.carouselContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Nearby Experiences</Text>
        </View>
        <View style={{ gap: 20 }}>
          <TouchableOpacity
            style={styles.nearbySpotlightCard}
            activeOpacity={0.92}
            onPress={() => handleEventPress(spotlight)}
            onLongPress={() => handleEventPreview(spotlight)}
          >
            {spotlight.cover_image_url ? (
              <OptimizedImage
                source={spotlight.cover_image_url}
                style={styles.nearbySpotlightImage}
                contentFit="cover"
                width={CAROUSEL_CARD_WIDTH}
                height={200}
                quality={65}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.nearbySpotlightImage, { backgroundColor: APP_COLORS.backgroundCard }]} />
            )}
            <View style={styles.nearbySpotlightBody}>
              <Text style={styles.nearbySpotlightTag} numberOfLines={1}>
                {(spotlight.category || 'Nearby').toUpperCase()}
              </Text>
              <Text style={styles.nearbySpotlightTitle} numberOfLines={2}>{spotlight.title}</Text>
              <Text style={styles.nearbySpotlightDescription} numberOfLines={3}>
                {spotlight.short_description || spotlight.description}
              </Text>
              {friendAvatars.length > 0 && (
                <View style={styles.nearbySpotlightFriendsRow}>
                  <View style={styles.friendAvatarStack}>
                    {friendAvatars.map((uri, idx) => (
                      <Avatar
                        key={`${spotlight.id}-friend-${idx}`}
                        source={uri}
                        size={32}
                        style={[styles.friendAvatarItem, { marginLeft: idx === 0 ? 0 : -10, zIndex: friendAvatars.length - idx }]}
                      />
                    ))}
                    {friendOverflow > 0 && (
                      <View style={[styles.friendAvatarOverflow, { marginLeft: -10 }]}>
                        <Text style={styles.friendAvatarOverflowText}>+{friendOverflow}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.nearbySpotlightFriendsText}>Friends are here</Text>
                </View>
              )}
              <ScalePress
                style={styles.nearbySpotlightButtonWrap}
                onPress={() => handleEventPress(spotlight)}
                accessibilityRole="button"
                accessibilityLabel={`Reserve table for ${spotlight.title}`}
              >
                <LinearGradient
                  colors={APP_COLORS.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.nearbySpotlightButton}
                >
                  <Text style={styles.nearbySpotlightButtonText}>Reserve Table</Text>
                </LinearGradient>
              </ScalePress>
            </View>
          </TouchableOpacity>
          <ScalePress
            style={styles.exploreGridCard}
            onPress={() => router.push('/nearby-events' as any)}
            accessibilityRole="button"
            accessibilityLabel="Explore the grid"
          >
            <View style={styles.exploreGridIconTile}>
              <Ionicons name="grid-outline" size={26} color={APP_COLORS.accent} />
            </View>
            <Text style={styles.exploreGridTitle}>Explore the Grid</Text>
            <Text style={styles.exploreGridDescription}>
              Discover {nearbyItems.length || 'more'} experiences within reach of your current location.
            </Text>
            <View style={styles.exploreGridLinkRow}>
              <Text style={styles.exploreGridLinkText}>Launch Map</Text>
              <Ionicons name="arrow-forward" size={14} color={APP_COLORS.accent} />
            </View>
          </ScalePress>
        </View>
      </View>
    )
  }

  // Compute all distances once and cache - avoids O(n^2) recalculations
  const distanceMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (!userLocation) return map
    for (const ev of events) {
      // Use proximity data if available, otherwise calculate
      const prox = proximityData[ev.id]
      if (prox && typeof prox.distance_km === 'number') {
        map[ev.id] = prox.distance_km
      } else if (ev.latitude && ev.longitude) {
        map[ev.id] = getDistanceKm(userLocation.latitude, userLocation.longitude, ev.latitude, ev.longitude)
      } else {
        map[ev.id] = Number.POSITIVE_INFINITY
      }
    }
    return map
  }, [events, userLocation, proximityData])

  const upcomingItems = useMemo(() => {
    const now = Date.now()
    return events
      .filter(e => new Date(e.start_time).getTime() >= now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events])

  const nearbyItems = useMemo(() => {
    if (!userLocation) return [] as Event[]
    return events
      .filter(e => Number.isFinite(e.latitude) && Number.isFinite(e.longitude))
      .map(e => ({ e, d: distanceMap[e.id] ?? Number.POSITIVE_INFINITY }))
      .filter(x => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d)
      .map(x => x.e)
  }, [events, userLocation, distanceMap])

  const cityTopItems = useMemo(() => {
    if (!userCity) return [] as Event[]
    const lc = userCity.toLowerCase()
    const inCity = events.filter(e => {
      const city = (e.display_city || e.city || '') as string
      const address = (e.address || '') as string
      return city.toLowerCase() === lc || address.toLowerCase().includes(lc)
    })
    return inCity
      .slice()
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, userCity, interestCounts])

  const bestPartiesItems = useMemo(() => {
    const isPartyLike = (cat?: string) => {
      if (!cat) return false
      const c = cat.toLowerCase()
      return c.includes('party') || c.includes('night') || c.includes('club') || c.includes('music')
    }
    const partyEvents = events.filter(e => isPartyLike(e.category))
    if (partyEvents.length > 0) {
      return partyEvents
        .slice()
        .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    }
    // Fallback: overall top by interest
    return events
      .slice()
      .sort((a, b) => (interestCounts[b.id] || 0) - (interestCounts[a.id] || 0) ||
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [events, interestCounts])

  const pulseNearbySpotlight = useMemo(
    () => [...nearbyItems, ...bestPartiesItems, ...cityTopItems].find(e => !!e.cover_image_url),
    [nearbyItems, bestPartiesItems, cityTopItems]
  )

  const formatTimeRange = (startIso: string, endIso: string, opts?: { timezone?: string }) => fmtRange(startIso, endIso, { includeDate: true, timezone: opts?.timezone })

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return events.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.venue_name || '').toLowerCase().includes(q) ||
      (e.display_city || e.city || '').toLowerCase().includes(q)
    )
  }, [searchQuery, events])

  const isLoading = authLoading || loading
  const showLoadingSkeleton = useMinimumVisible(isLoading, 720)

  const stickyBarHeight = insets.top + 8 + 12 + 36
  const sectionBgTop = stickyBarHeight + 12
  const topBarTranslateY = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -7],
    extrapolate: 'clamp',
  })
  const topBarScale = scrollY.interpolate({
    inputRange: [0, 240],
    outputRange: [1, 0.98],
    extrapolate: 'clamp',
  })
  const topBarOpacity = scrollY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0.93],
    extrapolate: 'clamp',
  })
  const heroParallaxY = scrollY.interpolate({
    inputRange: [0, 360],
    outputRange: [0, -18],
    extrapolate: 'clamp',
  })
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 340],
    outputRange: [1, 0.89],
    extrapolate: 'clamp',
  })
  const sectionLiftY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -8],
    extrapolate: 'clamp',
  })
  const sectionOpacity = scrollY.interpolate({
    inputRange: [0, 320],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  })

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Background image tint to match Figma */}
      {/* Image moved to global background in RootLayout */}
      {/* Sticky top bar — matches Figma's generic "Header - TopAppBar" (hamburger/wordmark/bell).
          Hamburger and bell have no built feature behind them yet, so both stub to a toast. */}
      <RNAnimated.View
        style={[
          styles.topBarWrapper,
          { transform: [{ translateY: topBarTranslateY }, { scale: topBarScale }], opacity: topBarOpacity },
        ]}
      >
        <GlassTopBar onMenuPress={comingSoon} onBellPress={comingSoon} wordmarkSize={16} topInset={insets.top} />
      </RNAnimated.View>
      {/* Scrollable content clipped inside rounded section background */}
      <View style={[styles.sectionBg, { top: sectionBgTop }]}> 
        <LinearGradient
          colors={['#111214', APP_COLORS.backgroundBase]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Banners */}
        <View style={styles.filtersBar}>
          {showPreviewHint && (
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerText}>
                Tip: Long-press any event card for quick actions.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Dismiss quick actions tip"
                onPress={markPreviewHintSeen}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Got it</Text>
              </TouchableOpacity>
            </View>
          )}
          <RealtimeStatusBanner status={socketStatus} style={styles.bannerWarn} />
          {locationStatus === 'denied' && (
            <View style={styles.bannerWarn}>
              <Text style={styles.bannerText}>
                Enable Location to show nearby events and check-in.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open settings to enable location"
                onPress={() => { try { (Linking as any)?.openSettings?.() } catch {} }}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Enable</Text>
              </TouchableOpacity>
            </View>
          )}
          {!!netError && (
            <View style={styles.bannerError}>
              <Text style={styles.bannerText}>{netError}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry loading events"
                onPress={() => fetchEvents({ force: true })}
                style={styles.bannerCta}
              >
                <Text style={styles.bannerCtaText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <VirtualizedList
          forwardedRef={listRef as any}
          data={[]}
          renderItem={() => null}
          keyExtractor={keyExtractor}
          estimatedItemSize={200}
          refreshControl={
            <RefreshControl refreshing={refreshing && !isLoading} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          enableVirtualization={false}
          ListHeaderComponent={(
            showLoadingSkeleton ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={160} />
                  <SkeletonLine width={80} />
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselList}
                  data={[...Array(5)].map((_, i) => i)}
                  keyExtractor={(item) => `s-int-${item}`}
                  getItemLayout={getCarouselItemLayout}
                  renderItem={() => (
                    <SkeletonBlock width={260} height={120} borderRadius={12} style={{ marginHorizontal: 4 }} />
                  )}
                />
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={200} />
                </View>
                <View style={{ paddingVertical: 12, height: UPCOMING_ITEM_HEIGHT + 24 }}>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: UPCOMING_SIDE_PADDING }}
                    data={[...Array(3)].map((_, i) => i)}
                    keyExtractor={(item) => `s-up-${item}`}
                    getItemLayout={(_, index) => ({
                      length: UPCOMING_ITEM_FULL,
                      offset: UPCOMING_ITEM_FULL * index,
                      index,
                    })}
                    renderItem={() => (
                      <SkeletonBlock width={UPCOMING_ITEM_WIDTH} height={UPCOMING_ITEM_HEIGHT} borderRadius={24} style={{ marginRight: CAROUSEL_ITEM_SPACING }} />
                    )}
                  />
                </View>
                <View style={styles.sectionHeaderRow}>
                  <SkeletonLine width={180} />
                </View>
                {[...Array(4)].map((_, i) => (
                  <SkeletonBlock key={`s-near-${i}`} width={'96%'} height={249} borderRadius={23} style={{ alignSelf: 'center', marginBottom: 16 }} />
                ))}
                <View style={{ paddingHorizontal: 23, paddingTop: 8 }}>
                  <SkeletonBlock width={'100%'} height={474} borderRadius={20} />
                </View>
                {[...Array(6)].map((_, i) => (
                  <View key={`s-card-${i}`} style={{ paddingHorizontal: 8, marginTop: 16 }}>
                    <SkeletonBlock width={'100%'} height={200} borderRadius={12} />
                    <View style={{ marginTop: 10, paddingHorizontal: 6 }}>
                      <SkeletonLine width={'60%'} />
                      <SkeletonLine width={'40%'} style={{ marginTop: 6 }} />
                    </View>
                  </View>
                ))}
                <View style={{ height: 8 }} />
              </View>
            ) : (
              <View>
                {renderHeaderAndSearch()}

                {searchResults !== null ? (
                  <View style={styles.searchResultsWrap}>
                    <Text style={styles.sectionSubTitle}>
                      {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for &ldquo;{searchQuery.trim()}&rdquo;
                    </Text>
                    {searchResults.map((ev) => (
                      <TouchableOpacity
                        key={ev.id}
                        style={styles.searchResultRow}
                        onPress={() => handleEventPress(ev)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${ev.title}`}
                      >
                        <Text style={styles.searchResultTitle} numberOfLines={1}>{ev.title}</Text>
                        <Text style={styles.searchResultMeta} numberOfLines={1}>
                          {ev.venue_name || ev.display_city || ev.city || ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {searchResults.length === 0 && (
                      <Text style={styles.searchResultMeta}>No experiences match your search.</Text>
                    )}
                  </View>
                ) : (
                  <>
                    {/* Friendly empty state when there's nothing to show in any Pulse section */}
                    {events.length === 0 || (upcomingItems.length === 0 && bestPartiesItems.length === 0 && !pulseNearbySpotlight) ? (
                      <FadeInUp delay={SECTION_MOTION_BASE_DELAY} distance={10}>
                        <View style={styles.emptyState}>
                          <View style={styles.emptyGlyph}>
                            <Ionicons name="calendar-outline" size={36} color={APP_COLORS.textTertiary} />
                          </View>
                          <Text style={styles.emptyTitle}>No experiences nearby yet</Text>
                          <Text style={styles.emptySub}>Check back soon, or try refreshing.</Text>
                          <ScalePress
                            style={styles.ctaGhost}
                            onPress={() => fetchEvents({ force: true })}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh events"
                          >
                            <Text style={styles.ctaGhostText}>Refresh</Text>
                          </ScalePress>
                        </View>
                      </FadeInUp>
                    ) : (
                      <>
                        <RNAnimated.View style={{ transform: [{ translateY: heroParallaxY }], opacity: heroOpacity }}>
                          <FadeInUp delay={SECTION_MOTION_BASE_DELAY + SECTION_MOTION_STAGGER} distance={10}>
                            {renderFeaturedCarousel(bestPartiesItems.length > 0 ? bestPartiesItems : upcomingItems)}
                          </FadeInUp>
                        </RNAnimated.View>

                        {upcomingItems.length > 0 ? (
                          <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                            <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 2)} distance={8}>
                              {renderUpcomingBento(upcomingItems.slice(0, 6))}
                            </FadeInUp>
                          </RNAnimated.View>
                        ) : null}

                        <RNAnimated.View style={{ transform: [{ translateY: sectionLiftY }], opacity: sectionOpacity }}>
                          <FadeInUp delay={SECTION_MOTION_BASE_DELAY + (SECTION_MOTION_STAGGER * 3)} distance={8}>
                            {renderNearbyExperiences(pulseNearbySpotlight)}
                          </FadeInUp>
                        </RNAnimated.View>
                      </>
                    )}

                    <View style={{ height: 8 }} />
                  </>
                )}
              </View>
            )
          )}
        />
      </View>

      {/* Distinct icon + generous clearance from the nav bar's raised "+" button below it —
          both being circular "+" buttons stacked closely read as a confusing duplicate. */}
      <GlassSurface intensity={20} tint="rgba(45,44,44,0.8)" borderRadius={28} style={[styles.fab, { bottom: insets.bottom + 136 }]}>
        <TouchableOpacity
          style={styles.fabButton}
          onPress={comingSoon}
          accessibilityRole="button"
          accessibilityLabel="Quick action"
        >
          <Ionicons name="options-outline" size={22} color={APP_COLORS.textPrimary} />
        </TouchableOpacity>
      </GlassSurface>

      <ActionTray
        visible={trayState.visible}
        title={trayState.title}
        message={trayState.message}
        buttons={trayState.buttons}
        onClose={closeTray}
        size={trayState.size}
        dismissible={trayState.dismissible}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_COLORS.backgroundBase,
    
  },
  sectionBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 120,
    bottom: 0,
    borderTopLeftRadius: APP_RADIUS['3xl'],
    borderTopRightRadius: APP_RADIUS['3xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.58,
  },
  bgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundBase,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: APP_COLORS.textPrimary,
  },
  listContainer: {
    paddingHorizontal: 1,
    paddingTop: 14,
    paddingBottom: 24,
    
   
   
  },
  carouselContainer: {
    paddingTop: 16,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingNavRow: {
    flexDirection: 'row',
    gap: 8,
  },
  upcomingNavButton: {
    width: 40,
    height: 40,
    borderRadius: APP_RADIUS.pill,
    backgroundColor: APP_COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: APP_FONTS.heading,
    fontSize: TYPE_HEADER_SIZE,
    lineHeight: TYPE_HEADER_LINE,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
  },
  sectionSubTitle: {
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    color: APP_COLORS.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  viewAllText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.accent,
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  carouselList: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  gradientFull: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  upTextOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
  },
  upCategoryTag: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  upTitleLarge: {
    color: '#FFFFFF',
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    marginBottom: 8,
  },
  upVenueLarge: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: TYPE_META_SIZE,
  },
  carouselCard: {
    width: CAROUSEL_CARD_WIDTH,
    borderRadius: APP_RADIUS['2xl'],
    backgroundColor: APP_COLORS.backgroundCard,
    marginHorizontal: CAROUSEL_ITEM_SPACING / 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  carouselImage: {
    width: '100%',
    height: CAROUSEL_CARD_HEIGHT,
  },
  carouselGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CAROUSEL_CARD_HEIGHT,
  },
  carouselStatusPill: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45,44,44,0.75)',
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,144,109,0.3)',
  },
  carouselStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#46D27B',
  },
  carouselStatusText: {
    color: '#FFFFFF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '700',
  },
  carouselHeartButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    backgroundColor: 'rgba(15,35,54,0.62)',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  carouselHeartText: {
    fontSize: 16,
    color: APP_COLORS.accentSecondary,
    fontWeight: '800',
  },
  carouselContent: {
    padding: 12,
  },
  carouselContentOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 20,
    alignItems: 'center',
  },
  carouselEventTitle: {
    fontSize: TYPE_CARD_TITLE_SIZE,
    lineHeight: TYPE_CARD_TITLE_LINE,
    fontWeight: '700',
    color: APP_COLORS.textPrimary,
    textAlign: 'center',
  },
  carouselVenue: {
    fontSize: TYPE_META_SIZE,
    color: 'rgba(230,248,255,0.8)',
    marginTop: 4,
  },
  carouselTime: {
    fontSize: TYPE_META_SIZE,
    color: '#AEE5F5',
    marginTop: 8,
  },
  carouselCheckoutPill: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(16,31,48,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  carouselCheckoutText: {
    color: '#FFFFFF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '700',
  },
  eventCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 200,
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 12,
    lineHeight: 20,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTime: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  eventPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: APP_COLORS.accent,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  checkinButton: {
    backgroundColor: APP_COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checkinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  interestButton: {
    backgroundColor: '#fde7ef',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  interestButtonActive: {
    backgroundColor: '#f8cfe0',
  },
  interestButtonText: {
    color: '#D81B60',
    fontSize: 14,
    fontWeight: '600',
  },
  nearbyImage: {
    width: '96%',
    aspectRatio: 363 / 249,
    maxWidth: 420,
    alignSelf: 'center',
  },
  nearbyImageRadius: {
    borderRadius: 23,
  },
  nearbyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 23,
    borderBottomRightRadius: 23,
  },
  nearbyInfoBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  nearbyGlass: {
    position: 'absolute',
    left: 5,
    right: 6,
    top: 161,
    bottom: 7,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  nearbyGlassSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.45,
  },
  // removed nearbyGlassInsetTop
  nearbyGlassRim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  nearbyGlassInnerShadowBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    opacity: 0.4,
  },
  nearbyGlassTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  nearbyGlassRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nearbyMetaTextLight: {
    color: APP_COLORS.textPrimary,
    fontSize: 12,
  },
 
  nearbyTitle: {
    color: APP_COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  nearbyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearbyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '48%',
  },
  nearbyMetaText: {
    color: APP_COLORS.textSecondary,
    fontSize: 11,
  },
  // "The Pulse" header + search — Figma "Section - Header & Search"
  pulseHeaderSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 20,
  },
  pulseHeading: {
    fontFamily: APP_FONTS.headingExtraBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.6,
    color: APP_COLORS.textPrimary,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: APP_COLORS.backgroundInput,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 18,
    height: 52,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: APP_FONTS.body,
    fontSize: 16,
    color: APP_COLORS.textPrimary,
    height: '100%',
  },
  // "Featured" carousel — Figma "Section - Featured Events Carousel"
  featuredList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: FEATURED_ITEM_SPACING,
  },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: FEATURED_CARD_HEIGHT,
    borderRadius: APP_RADIUS['2xl'],
    overflow: 'hidden',
    backgroundColor: APP_COLORS.backgroundCard,
  },
  featuredCardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
    gap: 12,
  },
  featuredTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,144,109,0.3)',
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  featuredTagText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  featuredCardTitle: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  featuredMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  featuredMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featuredMetaText: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
  },
  // "Upcoming" bento — Figma "Section - Upcoming Events Bento"
  upcomingBentoStack: {
    paddingHorizontal: 16,
    gap: 20,
  },
  upcomingBentoCard: {
    width: CAROUSEL_CARD_WIDTH,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: 16,
    gap: 16,
  },
  upcomingBentoImageWrap: {
    borderRadius: APP_RADIUS['2xl'],
    overflow: 'hidden',
  },
  upcomingBentoImage: {
    width: '100%',
    height: 166,
  },
  upcomingBentoTag: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(39,37,37,0.6)',
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  upcomingBentoTagText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  upcomingBentoBody: {
    gap: 12,
  },
  upcomingBentoTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  upcomingBentoTitle: {
    flex: 1,
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.textPrimary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  upcomingBentoDay: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.accent,
    fontSize: 16,
  },
  upcomingBentoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  upcomingBentoMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingBentoMetaText: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 13,
  },
  upcomingBentoDescription: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  upcomingBentoButton: {
    backgroundColor: APP_COLORS.backgroundInput,
    borderRadius: APP_RADIUS.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  upcomingBentoButtonText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  // "Nearby Experiences" bento — Figma "Section - Nearby Experiences"
  nearbySpotlightCard: {
    marginHorizontal: 16,
    borderRadius: APP_RADIUS['2xl'],
    overflow: 'hidden',
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  nearbySpotlightImage: {
    width: '100%',
    height: 200,
  },
  nearbySpotlightBody: {
    padding: 24,
    gap: 10,
  },
  nearbySpotlightTag: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  nearbySpotlightTitle: {
    fontFamily: APP_FONTS.headingExtraBold,
    color: APP_COLORS.textPrimary,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  nearbySpotlightDescription: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  nearbySpotlightFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nearbySpotlightFriendsText: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
  },
  friendAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendAvatarItem: {
    borderWidth: 2,
    borderColor: APP_COLORS.backgroundBase,
    borderRadius: 999,
  },
  friendAvatarOverflow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: APP_COLORS.backgroundBase,
    backgroundColor: APP_COLORS.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarOverflowText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  nearbySpotlightButtonWrap: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: APP_RADIUS.pill,
    overflow: 'hidden',
  },
  nearbySpotlightButton: {
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  nearbySpotlightButtonText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  exploreGridCard: {
    marginHorizontal: 16,
    backgroundColor: APP_COLORS.backgroundCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: 24,
    gap: 12,
  },
  exploreGridIconTile: {
    width: 56,
    height: 56,
    borderRadius: APP_RADIUS.lg,
    backgroundColor: 'rgba(255,144,109,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreGridTitle: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  exploreGridDescription: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  exploreGridLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  exploreGridLinkText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  topBar: {
    paddingHorizontal: 14,
   
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
  },
  filtersBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,144,109,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,144,109,0.45)',
  },
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  bannerText: {
    color: APP_COLORS.textPrimary,
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    flex: 1,
    marginRight: 12,
  },
  bannerCta: {
    backgroundColor: APP_COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: APP_RADIUS.pill,
  },
  bannerCtaText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.onAccent,
    fontWeight: '700',
    fontSize: TYPE_CAPTION_SIZE,
  },
  emptyState: {
    paddingHorizontal: 32,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyGlyph: {
    width: 80,
    height: 80,
    borderRadius: APP_RADIUS.xl,
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: APP_COLORS.separator,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: APP_FONTS.heading,
    color: APP_COLORS.textPrimary,
    fontSize: TYPE_CARD_TITLE_SIZE,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: TYPE_BODY_SIZE,
    lineHeight: 20,
    textAlign: 'center',
  },
  ctaGhost: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ctaGhostText: {
    fontFamily: APP_FONTS.bodyBold,
    color: APP_COLORS.textPrimary,
    fontWeight: '700',
  },
  searchResultsWrap: {
    paddingHorizontal: 16,
    gap: 4,
  },
  searchResultRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: APP_COLORS.separator,
  },
  searchResultTitle: {
    fontFamily: APP_FONTS.bodySemiBold,
    color: APP_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  searchResultMeta: {
    fontFamily: APP_FONTS.body,
    color: APP_COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 24,
    zIndex: 4,
    width: 56,
    height: 56,
    overflow: 'hidden',
  },
  fabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  cityPillText: {
    color: '#FFFFFF',
    fontSize: TYPE_CAPTION_SIZE,
    fontWeight: '600',
  },
}) 
