import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ScalePress from '../../components/motion/ScalePress'
import { OptimizedImage } from '../../components/OptimizedImage'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { ProfileHeading, ProfileInterests } from '../../components/profile/ProfileSections'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { UpcomingCard } from '../../components/pulse/UpcomingCard'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { identityMeta, profileGaps } from '../../lib/meProfile'
import { featuredDateLabel, placeLabel } from '../../lib/pulse'
import { queryCache } from '../../lib/queryCache'
import { pastEventRows, type PastEventRow } from '../../lib/savedEvents'
import { useAuth } from '../../lib/useAuth'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'

/** The avatar beside your name. */
const AVATAR = 72
/** How many past events the Recent list shows before SEE ALL. */
const RECENT_COUNT = 3

/** One number and what it counts, optionally a way through to the list behind it. */
function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const body = (
    <>
      <Text variant="title" maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text variant="label" maxFontSizeMultiplier={1.3}>{label.toUpperCase()}</Text>
    </>
  )
  // One element, read as "3 Attended" rather than "3" and then "Attended".
  return onPress ? (
    <ScalePress
      onPress={onPress}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      accessibilityHint="Opens Going"
      style={styles.stat}
    >
      {body}
    </ScalePress>
  ) : (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      {body}
    </View>
  )
}

/** A destination. Icon, label, chevron -- nothing that changes state in place. */
function PanelRow({
  icon,
  iconColor = EMBER.textPrimary,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  label: string
  onPress: () => void
}) {
  /*
   * A full-width row shrinks less than a button (0.98): at 0.97 its edges pull
   * visibly off the panel. No haptic: these are navigation, not a state change.
   */
  return (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      // Without this the row's name is the two icon glyphs around the label —
      // " Edit profile " in the accessibility tree.
      accessibilityLabel={label}
      style={styles.row}
    >
      <Ionicons name={icon} size={ICON.md} color={iconColor} />
      <Text variant="bodyStrong" style={styles.rowLabel} maxFontSizeMultiplier={1.4}>{label}</Text>
      <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
    </ScalePress>
  )
}

const GAP_ICON = {
  photo: 'camera-outline',
  photos: 'images-outline',
  bio: 'document-text-outline',
  interests: 'sparkles-outline',
} as const

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
  // Empty until it loads, and on failure: Recent is left out rather than erroring.
  const [recent, setRecent] = useState<PastEventRow[]>([])
  const lastBackgroundRefreshRef = React.useRef(0)

  const photoList = useMemo(() => {
    const raw = profile?.photos || []
    return raw.filter((url): url is string => !!url && url.trim() !== '')
  }, [profile?.photos])

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
   * The events behind "Attended", from the same `/me/attendance` the Going
   * tab's Past section reads, through the same `pastEventRows` — so the two
   * can never disagree about what counts as past. Its own request, never
   * awaited by the profile: the header does not wait on it, and a failure only
   * leaves Recent out.
   */
  const loadRecent = useCallback(async () => {
    if (!user) return
    try {
      const result = await apiClient.getMyAttendance()
      if (result.success && result.data) {
        setRecent(pastEventRows(result.data.events).slice(0, RECENT_COUNT))
      } else {
        Logger.debug('profile', 'Failed to load attendance', { error: result.error })
      }
    } catch (error) {
      Logger.debug('profile', 'Failed to load attendance', { error })
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
        loadRecent()
      }
    }, [user, authLoading, getUserAndProfile, loadRecent])
  )

  /*
   * The Me tab is a control panel, not a showcase.
   *
   * It was briefly the editorial frame `1141:5633` -- and that was a second
   * copy of a screen that already existed. `app/user/[id].tsx` has a `'self'`
   * mode: point it at your own id and it renders exactly that page, Connect
   * suppressed, CTA reading "You". Preview goes there, so "how others see me"
   * cannot drift from how they actually see you, gating included.
   *
   * What stays here is what is yours to act on: who you are at a glance, what
   * is missing, what you have done, and where to change it.
   */
  const renderSkeleton = () => (
    <View style={styles.panel}>
      <View style={styles.headerBlock}>
        <View style={styles.identity}>
          <View style={styles.identityText}>
            <SkeletonBlock width={'70%'} height={TYPE.display.lineHeight} />
            <SkeletonLine width={'50%'} />
          </View>
          <SkeletonBlock width={AVATAR} height={AVATAR} borderRadius={EMBER_RADIUS.pill} />
        </View>
        <View style={styles.buttons}>
          <SkeletonBlock height={CONTROL.md} borderRadius={EMBER_RADIUS.pill} style={styles.flex} />
          <SkeletonBlock height={CONTROL.md} borderRadius={EMBER_RADIUS.pill} style={styles.flex} />
        </View>
      </View>
      <SkeletonBlock height={CONTROL.lg + SPACE.lg * 2} borderRadius={EMBER_RADIUS.lg} />
    </View>
  )

  const mark = pseudonymAvatar(profile?.id || user?.id || 'you')
  const avatar = photoList[0] || null
  const stats = profile?.stats
  const meta = identityMeta(profile?.location, profile?.memberSince)
  const gaps = profile
    ? profileGaps({ photos: photoList, bio: profile.bio, interests: profile.interests })
    : []
  const interests = profile?.interests ?? []

  const openPreview = () =>
    router.push({ pathname: '/user/[id]', params: { id: profile?.id || user?.id || '' } })
  // `navigate`, not `push`: Going is a tab, and pushing it would stack a second copy.
  const openGoing = () => router.navigate('/going')

  const renderContent = () => (
    <View style={styles.panel}>
      {/* Flat on the page: the name is the screen's one display line. */}
      <View style={styles.headerBlock}>
        <View style={styles.identity}>
          <View style={styles.identityText}>
            <Text variant="display" numberOfLines={1} maxFontSizeMultiplier={1.2} accessibilityRole="header">
              {profile?.name || 'You'}
              {profile?.age ? `, ${profile.age}` : ''}
            </Text>
            {meta ? (
              <Text variant="meta" numberOfLines={1} maxFontSizeMultiplier={1.3}>{meta}</Text>
            ) : null}
            {profile?.occupation ? (
              <Text variant="body" color={EMBER.textSecondary} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                {profile.occupation}
              </Text>
            ) : null}
          </View>

          {/* Tapping your own face to see your own page is the gesture people expect. */}
          <ScalePress
            onPress={openPreview}
            haptic={false}
            accessibilityRole="imagebutton"
            accessibilityLabel="Preview your profile as others see it"
          >
            {avatar ? (
              <OptimizedImage
                source={avatar}
                recyclingKey={avatar}
                style={styles.avatar as never}
                width={AVATAR}
                height={AVATAR}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: mark.colors[0] }]}>
                <Text style={styles.avatarGlyph} maxFontSizeMultiplier={1}>
                  {mark.character}
                </Text>
              </View>
            )}
          </ScalePress>
        </View>

        {/* Two equal choices, so one height and one fill -- no accent. */}
        <View style={styles.buttons}>
          <ScalePress
            onPress={() => router.push('/edit-profile')}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            style={styles.button}
          >
            <Text variant="button" color={EMBER.textPrimary} maxFontSizeMultiplier={1.3}>Edit profile</Text>
          </ScalePress>
          <ScalePress
            onPress={openPreview}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel="Preview your profile as others see it"
            style={styles.button}
          >
            <Text variant="button" color={EMBER.textPrimary} maxFontSizeMultiplier={1.3}>Preview</Text>
          </ScalePress>
        </View>
      </View>

      {/*
        What is missing, as rows -- never a completeness meter: staying without
        a photo is a legitimate choice (see `event-preferences`). The "Add a
        photo" icon is the screen's one accent while it shows, because without a
        photo revealing yourself in a room has nothing to reveal.
      */}
      {gaps.length > 0 ? (
        <View style={styles.section}>
          <ProfileHeading title="Finish your profile" />
          <View style={styles.rows}>
            {gaps.map((gap) => (
              <PanelRow
                key={gap.key}
                icon={GAP_ICON[gap.key]}
                iconColor={gap.key === 'photo' ? EMBER.accent : EMBER.textPrimary}
                label={gap.label}
                onPress={() => router.push('/edit-profile')}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/*
        `eventsOrganized` is hidden at zero because almost nobody organises, and
        a permanent "0 Hosted" reads as a thing you failed to do rather than a
        role you do not have.
      */}
      {stats ? (
        <View style={styles.section}>
          <ProfileHeading title="Stats" />
          <View style={styles.stats}>
            <Stat value={stats.eventsAttended} label="Attended" onPress={openGoing} />
            <View style={styles.statRule} />
            <Stat value={stats.eventsFavorited} label="Saved" onPress={openGoing} />
            {stats.eventsOrganized > 0 ? (
              <>
                <View style={styles.statRule} />
                <Stat value={stats.eventsOrganized} label="Hosted" />
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Your own chips, so nothing is "shared" -- plain chips only. */}
      {interests.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Interests" actionLabel="EDIT" onAction={() => router.push('/edit-profile')} />
          <ProfileInterests interests={interests} />
        </View>
      ) : null}

      {recent.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Recent" actionLabel="SEE ALL" onAction={openGoing} />
          <View style={styles.recent}>
            {recent.map((row) => (
              <UpcomingCard
                key={row.id}
                title={row.title}
                imageUrl={row.cover_image_url}
                timeLabel={featuredDateLabel(row.start_time)}
                placeLabel={placeLabel(row)}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.id } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <PanelRow
        icon="settings-outline"
        label="Settings"
        onPress={() => router.push('/settings')}
      />
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
  flex: { flex: 1 },

  /* The screen gutter, and 32 between sections. */
  panel: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  section: { gap: SPACE.md },

  headerBlock: { gap: SPACE.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  identityText: { flex: 1, gap: SPACE.xs },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { ...TYPE.display },

  buttons: { flexDirection: 'row', gap: SPACE.md },
  button: {
    flex: 1,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },

  /* One container, the columns split by hairlines rather than three cards. */
  stats: {
    flexDirection: 'row',
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.lg,
    backgroundColor: EMBER.surfaceSunken,
  },
  stat: { flex: 1, gap: SPACE.xxs, paddingHorizontal: SPACE.md },
  statRule: { width: StyleSheet.hairlineWidth, backgroundColor: EMBER.separator },

  recent: { gap: SPACE.md },

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

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: EMBER.bg,
    padding: GUTTER,
  },
  errorText: { color: EMBER.destructive, textAlign: 'center', marginBottom: SPACE.xl },
  retryButton: { backgroundColor: EMBER.accent, paddingHorizontal: SPACE.xl, height: CONTROL.lg, justifyContent: 'center', borderRadius: EMBER_RADIUS.pill },
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
