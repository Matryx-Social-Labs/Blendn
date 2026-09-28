import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useScrollToTop } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { LoadError } from '../../components/LoadError'
import FadeInUp from '../../components/motion/FadeInUp'
import ScalePress from '../../components/motion/ScalePress'
import { MemoryTile } from '../../components/profile/MemoryTile'
import { NightsOut } from '../../components/profile/NightsOut'
import { PhotoStack } from '../../components/profile/PhotoStack'
import { RollingNumber } from '../../components/profile/RollingNumber'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import PhotoLightbox from '../../components/PhotoLightbox'
import {
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileInterests,
} from '../../components/profile/ProfileSections'
import { SectionHeader } from '../../components/pulse/SectionHeader'
import { Text } from '../../components/ui/Text'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { agoLabel, identityMeta, profileGaps } from '../../lib/meProfile'
import { MOTION_DURATION, MOTION_EASING } from '../../lib/motion'
import { queryCache } from '../../lib/queryCache'
import { pastEventRows, type PastEventRow } from '../../lib/savedEvents'
import { useAuth } from '../../lib/useAuth'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../../lib/theme'
import { TAB_BAR_CLEARANCE } from './_layout'

/** The photo pile beside your name, for the skeleton's stand-in. */
const STACK = { width: 120, height: 120 }
/** How many past events the Recent rail shows before SEE ALL. */
const RECENT_COUNT = 8
/**
 * Enough attended events to cover Nights out's twelve weeks for anyone short
 * of going out every night. The route caps `limit` server-side anyway.
 */
const ATTENDANCE_LIMIT = 50
/** How long a loaded attendance list is shown while a fresh one loads. */
const ATTENDANCE_CACHE_TTL = 10 * 60 * 1000
/** The wait before the one retry of a failed attendance request. */
const ATTENDANCE_RETRY_MS = 1500

/**
 * Sections arrive one beat apart, top to bottom, the first time the page
 * shows: 520ms each on a soft ease-out, 70ms apart, rising 16pt. Seen once per
 * load, so it's allowed to be seen -- at 220ms on a strong ease-out it read
 * as a snap.
 */
const enter = (i: number) => i * 70
const ENTER = { duration: MOTION_DURATION.relaxed, easing: MOTION_EASING.gentle, distance: 16 } as const

/** One number and what it counts, optionally a way through to the list behind it. */
function Stat({
  value,
  label,
  onPress,
  hint = 'Opens Going',
}: {
  value: number
  label: string
  onPress?: () => void
  /** Where the tap goes, spoken. Most stats open Going; Friends opens the list. */
  hint?: string
}) {
  const body = (
    <>
      <RollingNumber value={value} />
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
      accessibilityHint={hint}
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
  // Empty until it loads, and on failure: Recent and Nights out are left out rather than erroring.
  const [attended, setAttended] = useState<PastEventRow[]>([])
  const [refreshing, setRefreshing] = useState(false)
  // Null until it loads, and on failure: the stat is left out rather than showing a wrong 0.
  const [friendsCount, setFriendsCount] = useState<number | null>(null)
  // Requests waiting on you. Zero until it loads, and on failure: the row is simply not drawn.
  const [requestCount, setRequestCount] = useState(0)
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const { width: windowWidth } = useWindowDimensions()
  const lastBackgroundRefreshRef = React.useRef(0)
  // Tapping Me while already on it goes back to the top (the bar emits `tabPress`).
  const scrollRef = React.useRef<ScrollView>(null)
  useScrollToTop(scrollRef)

  const photoList = useMemo(() => {
    const raw = profile?.photos || []
    return raw.filter((url): url is string => !!url && url.trim() !== '')
  }, [profile?.photos])

  const getUserAndProfile = useCallback(async function load(force = false) {
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
              load(true)
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
    const cacheKey = `attendance_${user.id}`
    /*
     * Last good list first. Nights out and Recent hang off this one request,
     * and a single failed fetch (a cold start racing the token, a 429) used
     * to leave both sections missing until you left the tab and came back.
     */
    const cached = queryCache.get<PastEventRow[]>(cacheKey)
    if (cached) setAttended(cached)

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await apiClient.getMyAttendance(ATTENDANCE_LIMIT)
        if (result.success && result.data) {
          const rows = pastEventRows(result.data.events)
          setAttended(rows)
          queryCache.set(cacheKey, rows, ATTENDANCE_CACHE_TTL)
          return
        }
        Logger.debug('profile', 'Failed to load attendance', { error: result.error, attempt })
      } catch (error) {
        Logger.debug('profile', 'Failed to load attendance', { error, attempt })
      }
      // One retry, a beat later. A failure keeps whatever is already on screen.
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, ATTENDANCE_RETRY_MS))
    }
  }, [user])

  /*
   * How many friends, for the stat. Its own request like attendance, never
   * awaited by the profile; on focus, so accepting someone on Add friends
   * shows here when you come back.
   */
  const loadFriendsCount = useCallback(() => {
    void apiClient.getFriends().then((result) => {
      if (result.success && result.data) setFriendsCount(result.data.count)
    })
    // Its own request, so a slow one never holds up the friend count.
    void apiClient.getFriendRequests().then((result) => {
      if (result.success && result.data) setRequestCount(result.data.incoming.length)
    })
  }, [])

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
        loadFriendsCount()
      }
    }, [user, authLoading, getUserAndProfile, loadRecent, loadFriendsCount])
  )

  /*
   * The Me tab is your profile: what others see (photos, bio, interests,
   * work, gallery) and what is yours alone (what is missing, your stats,
   * your nights out, settings) on one page.
   *
   * It used to be a control panel with a Preview button that opened
   * `app/user/[id].tsx` in its `'self'` mode. Two screens for one person was
   * one too many, so the parts only Preview had now live here, rendered with
   * the same `ProfileSections` pieces that screen uses so the two still look
   * alike.
   */
  const renderSkeleton = () => (
    <View style={styles.panel}>
      <View style={styles.headerBlock}>
        <View style={styles.identity}>
          <View style={styles.identityText}>
            <SkeletonBlock width={'70%'} height={TYPE.display.lineHeight} />
            <SkeletonLine width={'50%'} />
            <SkeletonBlock width={128} height={CONTROL.sm} borderRadius={EMBER_RADIUS.pill} />
          </View>
          <SkeletonBlock width={STACK.width} height={STACK.height} borderRadius={EMBER_RADIUS.md} />
        </View>
      </View>
      <SkeletonBlock height={CONTROL.lg + SPACE.lg * 2} borderRadius={EMBER_RADIUS.lg} />
    </View>
  )

  /*
   * The mark behind your photo pile when you have none. Seeded on 'you', not
   * your account id: lib/pseudonymAvatar.ts forbids a user id as a seed, and
   * nobody else ever sees this one, so it has nothing to be stable against.
   */
  const mark = pseudonymAvatar('you')
  const stats = profile?.stats
  const meta = identityMeta(profile?.location, profile?.memberSince)
  const gaps = profile
    ? profileGaps({ photos: photoList, bio: profile.bio, interests: profile.interests })
    : []
  const interests = profile?.interests ?? []
  const recent = attended.slice(0, RECENT_COUNT)
  const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } })

  /*
   * Pull to refresh: skips the cache. The spinner waits on the profile only;
   * attendance refreshes alongside and, as on focus, is never awaited.
   */
  const onRefresh = async () => {
    setRefreshing(true)
    loadRecent()
    loadFriendsCount()
    try {
      await getUserAndProfile(true)
    } finally {
      setRefreshing(false)
    }
  }

  // Your photos, full screen, from whichever one you tapped. With none, tapping your mark goes to add one.
  const openPhoto = (index: number) => {
    if (!photoList.length) {
      router.push('/edit-profile')
      return
    }
    setLightboxIndex(index)
    setLightboxVisible(true)
  }
  // `navigate`, not `push`: Going is a tab, and pushing it would stack a second copy.
  const openGoing = () => router.navigate('/going')
  const openFriends = () => router.push('/friends')

  const renderContent = () => (
    <View style={styles.panel}>
      {/* Flat on the page: the name is the screen's one display line. */}
      <FadeInUp {...ENTER} style={styles.headerBlock}>
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
            {/*
              The page's one way into Edit profile: sections carry no EDIT
              links of their own, since every one of them opened the same
              screen. Small and beside your name, like the edit pill on
              any profile you own -- a tool, not the page's headline. No accent.
            */}
            <View style={styles.buttons}>
              <ScalePress
                onPress={() => router.push('/edit-profile')}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                hitSlop={SPACE.sm}
                style={styles.button}
              >
                <Ionicons name="pencil" size={ICON.sm} color={EMBER.textPrimary} />
                <Text variant="bodyStrong" color={EMBER.textPrimary} maxFontSizeMultiplier={1.3}>Edit profile</Text>
              </ScalePress>
              {/*
                Beside Edit, the same quiet pill. There is no search on
                Blend'n, so this — your link — is how anybody you know gets in.
              */}
              <ScalePress
                onPress={() => router.push('/friends/add')}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel="Add friends"
                hitSlop={SPACE.sm}
                style={styles.button}
              >
                <Ionicons name="person-add" size={ICON.sm} color={EMBER.textPrimary} />
                <Text variant="bodyStrong" color={EMBER.textPrimary} maxFontSizeMultiplier={1.3}>Add friends</Text>
              </ScalePress>
            </View>
          </View>

          {/* Tap opens the photo on top; a sideways flick shuffles the pile. See PhotoStack. */}
          <PhotoStack photos={photoList} fallback={mark} onPress={openPhoto} />
        </View>

      </FadeInUp>

      {/*
        Somebody is waiting on an answer. Above "Finish your profile": it is
        about another person, and the only thing on this page with a clock on it.
      */}
      {requestCount > 0 ? (
        <FadeInUp {...ENTER} delay={enter(1)}>
          <RequestsRow count={requestCount} />
        </FadeInUp>
      ) : null}

      {/*
        What is missing, as rows -- never a meter: staying without a photo is
        a legitimate choice (see `event-preferences`). The "Add a photo" icon
        is the screen's one accent while it shows, because without a photo
        revealing yourself in a room has nothing to reveal.
      */}
      {gaps.length > 0 ? (
        <FadeInUp {...ENTER} delay={enter(1)} style={styles.section}>
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
        </FadeInUp>
      ) : null}

      {/*
        `eventsOrganized` is hidden at zero because almost nobody organises, and
        a permanent "0 Hosted" reads as a thing you failed to do rather than a
        role you do not have. The numbers roll up when they first arrive.
      */}
      {stats ? (
        <FadeInUp {...ENTER} delay={enter(2)} style={styles.section}>
          <ProfileHeading title="Stats" />
          <View style={styles.stats}>
            <Stat value={stats.eventsAttended} label="Attended" onPress={openGoing} />
            <View style={styles.statRule} />
            <Stat value={stats.eventsFavorited} label="Saved" onPress={openGoing} />
            {friendsCount !== null ? (
              <>
                <View style={styles.statRule} />
                <Stat value={friendsCount} label="Friends" onPress={openFriends} hint="Opens your friends" />
              </>
            ) : null}
            {stats.eventsOrganized > 0 ? (
              <>
                <View style={styles.statRule} />
                <Stat value={stats.eventsOrganized} label="Hosted" />
              </>
            ) : null}
          </View>
        </FadeInUp>
      ) : null}

      {/*
        The nights behind "Attended", as twelve weeks of dots. Left out
        entirely when none fall in the window -- see NightsOut.
      */}
      {attended.length > 0 ? (
        <FadeInUp {...ENTER} delay={enter(3)} style={styles.section}>
          <ProfileHeading title="Nights out" />
          <NightsOut events={attended} onOpenEvent={openEvent} />
        </FadeInUp>
      ) : null}

      {/*
        From here down to the gallery is what others see on your page, in
        the order `app/user/[id].tsx` shows it.
      */}
      {profile?.bio ? (
        <FadeInUp {...ENTER} delay={enter(4)} style={styles.section}>
          <ProfileHeading title="Bio" />
          <ProfileBio text={profile.bio} />
        </FadeInUp>
      ) : null}

      {/* Your own chips, so nothing is "shared" -- plain chips only. */}
      {interests.length > 0 ? (
        <FadeInUp {...ENTER} delay={enter(5)} style={styles.section}>
          <ProfileHeading title="Interests" />
          <ProfileInterests interests={interests} />
        </FadeInUp>
      ) : null}

      {/* A filled card and a ruled block, as on the attendee page. */}
      {profile?.occupation || profile?.education ? (
        <FadeInUp {...ENTER} delay={enter(6)} style={styles.details}>
          {profile.occupation ? <ProfileDetail label="OCCUPATION" value={profile.occupation} /> : null}
          {profile.education ? (
            <ProfileDetail label="EDUCATION" value={profile.education} variant="ruled" />
          ) : null}
        </FadeInUp>
      ) : null}

      {/*
        Every photo, the first included: the stack above shows at most three,
        fanned and half covered.
      */}
      {photoList.length > 0 ? (
        <FadeInUp {...ENTER} delay={enter(7)} style={styles.section}>
          <ProfileHeading
            title="Gallery"
            trailing={`${photoList.length} photo${photoList.length === 1 ? '' : 's'}`}
          />
          <ProfileGallery
            photos={photoList}
            columnWidth={(windowWidth - GUTTER * 2 - SPACE.lg) / 2}
            onPressPhoto={openPhoto}
          />
        </FadeInUp>
      ) : null}

      {/*
        A rail of photo tiles rather than rows: these are memories, and the
        cover is what you remember. It bleeds to the screen edge and starts
        its first tile at the gutter, like every carousel in the app.
      */}
      {recent.length > 0 ? (
        <FadeInUp {...ENTER} delay={enter(8)} style={styles.section}>
          <SectionHeader title="Recent" actionLabel="SEE ALL" onAction={openGoing} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rail}
            contentContainerStyle={styles.railContent}
          >
            {recent.map((row) => (
              <MemoryTile
                key={row.id}
                title={row.title}
                imageUrl={row.cover_image_url}
                ago={agoLabel(row.start_time)}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.id } })}
              />
            ))}
          </ScrollView>
        </FadeInUp>
      ) : null}

      <FadeInUp {...ENTER} delay={enter(9)}>
        <PanelRow
          icon="settings-outline"
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </FadeInUp>
    </View>
  )

  // Only before there is something to show: a background refresh of a loaded
  // profile updates it in place rather than flashing the skeleton.
  if ((authLoading || loading) && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}>
          {renderSkeleton()}
        </ScrollView>
      </SafeAreaView>
    )
  }

  // A failed refresh of a profile already on screen keeps it there.
  if (error && !profile) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        {/* The app's one failed state, not a red sentence over a pill. */}
        <LoadError title="Your profile didn't load" onRetry={() => void getUserAndProfile(true)} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        // The tab bar floats over the page's foot: Settings sat under it.
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />
        }
      >
        {renderContent()}
      </ScrollView>
      <PhotoLightbox
        photos={photoList}
        initialIndex={lightboxIndex}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },

  /* The screen gutter, and 32 between sections. */
  panel: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  // Heading → its content is 16 (docs/DESIGN_SYSTEM.md), as on every profile screen.
  section: { gap: SPACE.lg },
  details: { gap: SPACE.xl },

  headerBlock: { gap: SPACE.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  identityText: { flex: 1, gap: SPACE.xs },

  /* The two pills, side by side, 8 under the details above them. */
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  /* A compact pill: `CONTROL.sm` tall, as wide as its words. */
  button: {
    height: CONTROL.sm,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
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

  /* Out to the screen edge, first tile back at the gutter. */
  rail: { marginHorizontal: -GUTTER },
  railContent: { paddingHorizontal: GUTTER, gap: SPACE.md },

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
