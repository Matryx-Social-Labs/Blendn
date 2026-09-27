import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { OptimizedImage } from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { queryCache } from '../../lib/queryCache'
import { useAuth } from '../../lib/useAuth'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

/** One number and what it counts. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    // One element, read as "3 Attended" rather than "3" and then "Attended".
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="title" maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text variant="label" maxFontSizeMultiplier={1.3}>{label.toUpperCase()}</Text>
    </View>
  )
}

/** A destination. Icon, label, chevron -- nothing that changes state in place. */
function PanelRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Without this the row's name is the two icon glyphs around the label —
      // "\ueb94 Edit profile \ueb3c" in the accessibility tree.
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={ICON.md} color={EMBER.textPrimary} />
      <Text variant="bodyStrong" style={styles.rowLabel} maxFontSizeMultiplier={1.4}>{label}</Text>
      <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
    </Pressable>
  )
}

const { width: WINDOW_WIDTH } = Dimensions.get('window')
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
      setError(null)
      queryCache.set(cacheKey, viewModel, PROFILE_CACHE_TTL)

    } catch (error) {
      Logger.error('profile', 'Unexpected error loading profile', { error })
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [user])

  /*
   * On FOCUS, not on mount. A tab stays mounted, so a mount-only effect ran
   * once per session: change the primary photo in Edit profile, come back,
   * and this screen still showed the old one — the report that found it.
   * Cheap when nothing changed: `getUserAndProfile` serves the cached view
   * model, and every profile writer (`updateProfile`, `reorderPhotos`)
   * invalidates that cache, so a real change is the only time this fetches.
   */
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && user) {
        getUserAndProfile()
      }
    }, [user, authLoading, getUserAndProfile])
  )

  /*
   * The Me tab is a control panel, not a showcase.
   *
   * It was briefly the editorial frame `1141:5633` -- and that was a second
   * copy of a screen that already existed. `app/user/[id].tsx` has a `'self'`
   * mode: point it at your own id and it renders exactly that page, Connect
   * suppressed, CTA reading "You".
   *
   * Two reasons that belongs there and not here:
   *
   *   - **It cannot drift.** Preview *is* the attendee screen, so "how others
   *     see me" is guaranteed honest, gating included, rather than a second
   *     implementation that agrees with the first until somebody edits one.
   *   - **A tab is somewhere you go to do something.** Settings, sign out, fix
   *     your photos. The frame has a single action and a 751pt hero; opening it
   *     to change a notification toggle meant scrolling past a portrait of
   *     yourself first.
   */
  const renderSkeleton = () => (
    <View style={styles.panel}>
      <View style={styles.identity}>
        <SkeletonBlock width={72} height={72} borderRadius={9999} />
        <View style={styles.identityText}>
          <SkeletonLine width={'70%'} style={{ marginBottom: SPACE.sm }} />
          <SkeletonLine width={'45%'} />
        </View>
      </View>
      <View style={styles.rows}>
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={`skr_${i}`} width={WINDOW_WIDTH - GUTTER * 2} height={CONTROL.lg} borderRadius={EMBER_RADIUS.md} />
        ))}
      </View>
    </View>
  )

  const mark = pseudonymAvatar(profile?.id || user?.id || 'you')
  const avatar = photoList[0] || null
  const stats = profile?.stats

  const renderContent = () => (
    <View style={styles.panel}>
      {/*
        The whole card is the way through to Preview, rather than a small
        "view as" link beside it. Tapping your own face to see your own page is
        the gesture people already expect, and it makes the one screen that
        motivates filling a profile in the easiest thing on the tab to reach.
      */}
      <Pressable
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: profile?.id || user?.id || '' } })}
        accessibilityRole="button"
        accessibilityLabel="Preview your profile as others see it"
        style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
      >
        {avatar ? (
          <OptimizedImage
            source={avatar}
            recyclingKey={avatar}
            style={styles.avatar as never}
            width={72}
            height={72}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: mark.colors[0] }]}>
            <Text style={styles.avatarGlyph} maxFontSizeMultiplier={1}>
              {mark.character}
            </Text>
          </View>
        )}

        <View style={styles.identityText}>
          <Text variant="title" numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {profile?.name || 'You'}
            {profile?.age ? `, ${profile.age}` : ''}
          </Text>
          <Text variant="meta" numberOfLines={1} maxFontSizeMultiplier={1.3}>
            See your profile as others do
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
      </Pressable>

      {/*
        Counts, not a gallery. `stats` is three numbers and there is no endpoint
        that returns the events behind them -- the frame's `CIRCLE PRESENCE`
        cards need an API before they need a component. Three honest numbers
        beat three invented cards.

        `eventsOrganized` is hidden at zero because almost nobody organises, and
        a permanent "0 Hosted" reads as a thing you failed to do rather than a
        role you do not have.
      */}
      {stats ? (
        <View style={styles.stats}>
          <Stat value={stats.eventsAttended} label="Attended" />
          <Stat value={stats.eventsFavorited} label="Saved" />
          {stats.eventsOrganized > 0 ? (
            <Stat value={stats.eventsOrganized} label="Hosted" />
          ) : null}
        </View>
      ) : null}

      <View style={styles.rows}>
        {/*
          Only while there is no photo. Revealing yourself in a room shows your
          name and photo and nothing else, so without one there is nothing to
          reveal. A row, not a badge or a completeness meter: staying without a
          photo is a legitimate choice (see `event-preferences`).
        */}
        {photoList.length === 0 ? (
          <PanelRow
            icon="camera-outline"
            label="Add a photo"
            onPress={() => router.push('/edit-profile')}
          />
        ) : null}
        <PanelRow
          icon="create-outline"
          label="Edit profile"
          onPress={() => router.push('/edit-profile')}
        />
        <PanelRow
          icon="settings-outline"
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </View>
    </View>
  )

  // Only before there is something to show: a background refresh of a loaded
  // profile updates it in place rather than flashing the skeleton.
  if ((authLoading || loading) && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderSkeleton()}
        </ScrollView>
      </SafeAreaView>
    )
  }

  // A failed refresh of a profile already on screen keeps it there.
  if (error && !profile) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => getUserAndProfile(true)}
          accessibilityRole="button"
          accessibilityLabel="Retry loading your profile"
        >
          <Text variant="button" color={EMBER.onGradient}>Retry</Text>
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

  /* The screen gutter, and 24 between blocks. */
  panel: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xl },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.card,
    backgroundColor: EMBER.surfaceMedia,
  },
  avatar: { width: 72, height: 72, borderRadius: EMBER_RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { ...TYPE.display },
  identityText: { flex: 1, gap: SPACE.xxs },

  stats: { flexDirection: 'row', gap: SPACE.md },
  stat: {
    flex: 1,
    gap: SPACE.xxs,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
  },

  rows: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    /* 56 tall: comfortably over the 44pt touch minimum without feeling like a form. */
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  rowLabel: { flex: 1 },
  pressed: { opacity: 0.7 },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: EMBER.bg,
    padding: GUTTER,
  },
  errorText: { color: EMBER.destructive, textAlign: 'center', marginBottom: SPACE.xl },
  retryButton: { backgroundColor: EMBER.accent, paddingHorizontal: SPACE.xl, minHeight: CONTROL.md, justifyContent: 'center', borderRadius: EMBER_RADIUS.pill },
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
