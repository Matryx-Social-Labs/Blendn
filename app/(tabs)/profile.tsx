import { playsArrival } from '../../lib/backFromBackground'
import { barCircleBottom } from '../../lib/barGeometry'
import { ScreenProfiler } from '../../lib/perf'
import { router, useFocusEffect, useScrollToTop } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Button } from '../../components/ds/Button'
import { Grain } from '../../components/ds/Grain'
import { PresenceDot } from '../../components/ds/MonoFamily'
import { CONTROL_FONT_CAP, font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import FadeInUp from '../../components/motion/FadeInUp'
import { Banner } from '../../components/ds/Banner'
import { MeBadges } from '../../components/profile/MeBadges'
import { MePlusRow } from '../../components/profile/MePlusRow'
import { aboutYouFrom } from '../../lib/aboutYou'
import { MeIdentity, MeSkeleton, StatsCard } from '../../components/profile/MeSections'
import { NightsOut } from '../../components/profile/NightsOut'
import { OfflineStrip, useOffline } from '../../components/profile/OfflineStrip'
import { PhotoViewer } from '../../components/profile/PhotoViewer'
import { ProfileBar } from '../../components/profile/ProfileBar'
import { RequestsRow } from '../../components/friends/RequestsRow'
import { SettingsGroup, SettingsRow } from '../../components/ds/SettingsRow'
import { ProfileBio, ProfileDetail, ProfileInterests, ProfileSection, SECTION_GAP } from '../../components/profile/ProfileSections'
import { CrewEmblem } from '../../components/ds/CrewEmblem'
import type { Rect } from '../../components/ds/chatShared'
import { apiClient } from '../../lib/apiClient'
import { requestsPageFrom } from '../../lib/friendsPaging'
import { crewsApi } from '../../lib/crewsApi'
import type { Crew } from '../../lib/crews'
import { COLOR, SPACE, STAGGER } from '../../lib/design/tokens'
import type { Badge } from '../../lib/aboutYou'
import { Logger } from '../../lib/logger'
import { interestNames, nightsCounts, profileGaps, type NightsCounts, type NightsStatus } from '../../lib/meProfile'
import { openTonight } from '../../lib/paywall'
import { mainWasPulled, pulledPhotos, type PulledPhoto } from '../../lib/photoStates'
import { parseBadges } from '../../lib/profileBadges'
import { unseenPulled } from '../../lib/pulledNotices'
import { queryCache } from '../../lib/queryCache'
import { pastEventRows, type PastEventRow } from '../../lib/savedEvents'
import { useAuth } from '../../lib/useAuth'
import { usePullToRefresh } from '../../lib/usePullToRefresh'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * Enough attended events to cover Nights out's twelve weeks for anyone short
 * of going out every night. The route caps `limit` server-side anyway.
 */
const ATTENDANCE_LIMIT = 50
/** How long a loaded attendance list is shown while a fresh one loads. */
const ATTENDANCE_CACHE_TTL = 10 * 60 * 1000
/** The wait before the one retry of a failed attendance request. */
const ATTENDANCE_RETRY_MS = 1500
const PROFILE_CACHE_TTL = 2 * 60 * 1000

/** Your first two crews' emblems stand at the row's left, 24 pt, overlapping by 6 (Flow 6 `me` R4.1). */
const CREW_EMBLEM = 24
const CREW_OVERLAP = 6
/** The Crews row says its count in words for a screen reader. */
const crewsLabel = (count: number, invites: number) => {
  const parts = [count ? `Crews, ${count}` : 'Crews', invites ? `${invites} invite${invites === 1 ? '' : 's'} waiting` : null]
  return parts.filter(Boolean).join(', ')
}

/**
 * Sections arrive one beat apart the first time the page shows (DS #16: a base-length fade and an 8 pt rise, 28 ms apart,
 * the window capped at 200 ms). Seen once per load, on a tab root seen dozens of times a day, so it is short.
 */
const enterAt = (i: number) => Math.min(i * STAGGER.base, STAGGER.windowMax)

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
    /** SV-7: the Saved list's own count (upcoming, not deleted); absent from an older server, which only sends the lifetime `eventsFavorited`. */
    savedCount?: number
    eventsOrganized: number
  }
  memberSince?: string
}

function ProfileInner() {
  const { user, loading: authLoading } = useAuth()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const offline = useOffline()
  const [profile, setProfile] = useState<UserProfileViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Empty until it loads; a failure keeps what was last good (Nights out says so, with Try again).
  const [attended, setAttended] = useState<PastEventRow[]>([])
  // The nights behind the list: locked with Blend'n+ and the true total (D-H1). Null total until `/me/attendance` answers.
  const [nightCounts, setNightCounts] = useState<NightsCounts>({ locked: 0, total: null, running: 0 })
  const [nightsStatus, setNightsStatus] = useState<NightsStatus>('loading')
  const [nightsRetrying, setNightsRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Null until it loads, and on failure: the stat is left out rather than showing a wrong 0.
  const [friendsCount, setFriendsCount] = useState<number | null>(null)
  // Requests waiting on you. Zero until it loads, and on failure: the row is simply not drawn.
  const [requestCount, setRequestCount] = useState(0)
  // Your crews and the invites waiting, for the Crews row; empty until they load, and on failure.
  const [crews, setCrews] = useState<Crew[]>([])
  const [crewInvites, setCrewInvites] = useState(0)
  const [viewer, setViewer] = useState<{ index: number; from: Rect | null } | null>(null)
  // What `GET /profiles/:you` adds (blendn-admin #716): your badges (null: none sent) and the photos moderation took down. Empty until it loads.
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [pulled, setPulled] = useState<PulledPhoto[]>([])
  // The "Shows up" opt-in on the badges card; null until the profile says (then the card draws no switch).
  const [showsUp, setShowsUp] = useState<boolean | null>(null)
  // "Show my badges": null until the profile says (then the card draws no master switch).
  const [showBadges, setShowBadges] = useState<boolean | null>(null)
  const lastBackgroundRefreshRef = React.useRef(0)
  // Tapping Me while already on it goes back to the top (the bar emits `tabPress`).
  const scrollRef = React.useRef<Animated.ScrollView>(null)
  useScrollToTop(scrollRef)

  // The page's scroll offset, written on the UI thread: the bar's glass and small title (DS #30) read it, React never renders for it.
  const scrollY = useSharedValue(0)

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
      const interests = interestNames(data.interests)

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
   * puts a notice on Nights out.
   */
  const loadRecent = useCallback(async () => {
    if (!user) return
    const cacheKey = `attendance_${user.id}`
    /*
     * Last good list first. Nights out hangs off this one request, and a
     * single failed fetch (a cold start racing the token, a 429) used to
     * leave the section missing until you left the tab and came back.
     */
    const cached = queryCache.get<{ rows: PastEventRow[]; counts: NightsCounts }>(cacheKey)
    if (cached) {
      setAttended(cached.rows)
      setNightCounts(cached.counts)
      setNightsStatus('ready')
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await apiClient.getMyAttendance(ATTENDANCE_LIMIT)
        if (result.success && result.data) {
          const rows = pastEventRows(result.data.events)
          const counts = nightsCounts(result.data)
          setAttended(rows)
          setNightCounts(counts)
          setNightsStatus('ready')
          queryCache.set(cacheKey, { rows, counts }, ATTENDANCE_CACHE_TTL)
          return
        }
        Logger.debug('profile', 'Failed to load attendance', { error: result.error, attempt })
      } catch (error) {
        Logger.debug('profile', 'Failed to load attendance', { error, attempt })
      }
      // One retry, a beat later. A failure keeps whatever is already on screen.
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, ATTENDANCE_RETRY_MS))
    }
    setNightsStatus('failed')
  }, [user])

  // The nights kept behind Blend'n+: the same Tonight sheet Going's locked row opens (trigger `recap`); bought, they're read again.
  const unlockNights = () => void openTonight({ trigger: 'night', venue: '', onUnlocked: () => void loadRecent() }, { userInitiated: true })

  const retryNights = () => {
    setNightsRetrying(true)
    void loadRecent().finally(() => setNightsRetrying(false))
  }

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
      // The server's count of everyone waiting, not the length of the first page of them.
      if (result.success && result.data) setRequestCount(requestsPageFrom(result.data, 'incoming')?.total ?? 0)
    })
    // Your crews, and the invites waiting: the Crews row's count and dot.
    void crewsApi.myCrews().then((result) => {
      if (!result.success || !result.data) return
      setCrews(result.data.crews)
      // The server's count of the invites listed, not the length of the first page of them.
      setCrewInvites(result.data.invitesPagination?.totalCount ?? result.data.invites.length)
    })
  }, [])

  /*
   * Your badges and the photos moderation pulled: only `/profiles/:id` carries them, so its own request, never awaited by the
   * profile and never a reason for the page to fail. Nothing sent (an older server, a failed read) is no card and no notice.
   */
  const loadOwnStates = useCallback(async () => {
    if (!user) return
    try {
      const result = await apiClient.getProfile(user.id)
      const own = result.success ? result.data?.profile : undefined
      // `badges` is absent when they are off; SV-8's `earned_badges` is what you hold either way, so Me keeps the card and its switch.
      const ownRecord = own as Record<string, unknown> | undefined
      setBadges(parseBadges(own?.badges) ?? parseBadges(ownRecord?.earned_badges))
      setShowBadges(typeof ownRecord?.show_badges === 'boolean' ? ownRecord.show_badges : null)
      // Only a server that sends the field has the switch to show: an older one sends none, and the row is not drawn.
      const sent = (own as Record<string, unknown> | undefined)?.shows_up_badge
      setShowsUp(typeof sent === 'boolean' ? aboutYouFrom(own as Record<string, unknown>).showsUpBadge : null)
      setPulled(await unseenPulled(user.id, pulledPhotos(own?.photo_states)))
    } catch (error) {
      Logger.debug('profile', 'Failed to load badges and photo states', { error })
    }
  }, [user])

  /** The "Show my badges" switch on the badges card: written at once; true when the server kept it. A turn-on reads the shown badges again. */
  const saveShowBadges = useCallback(
    async (next: boolean) => {
      if (!user) return false
      const result = await apiClient.updateProfile(user.id, { show_badges: next })
      if (!result.success) return false
      setShowBadges(next)
      queryCache.invalidate(`profile_${user.id}`)
      return true
    },
    [user]
  )

  /** The "Shows up" switch on the badges card: written at once; true when the server kept it. */
  const saveShowsUp = useCallback(
    async (next: boolean) => {
      if (!user) return false
      const result = await apiClient.updateProfile(user.id, { shows_up_badge: next })
      if (!result.success) return false
      setShowsUp(next)
      // The profile read for this screen is cached: a changed switch must not read back as the old one.
      queryCache.invalidate(`profile_${user.id}`)
      return true
    },
    [user]
  )

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
        void loadOwnStates()
      }
    }, [user, authLoading, getUserAndProfile, loadRecent, loadFriendsCount, loadOwnStates])
  )

  const stats = profile?.stats
  const gaps = profile ? profileGaps({ photos: photoList, bio: profile.bio, interests: profile.interests }) : []
  const interests = profile?.interests ?? []
  const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } })
  const openEdit = () => router.push('/edit-profile')

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
  const openPhoto = (index: number, from: Rect | null) => {
    if (!photoList.length) {
      openEdit()
      return
    }
    setViewer({ index, from })
  }
  // `navigate`, not `push`: Going is a tab, and pushing it would stack a second copy.
  const openGoing = () => router.navigate('/going')
  const openFriends = () => router.push('/friends')
  const openWhatsOn = () => router.navigate('/(tabs)/events' as never)

  // The bar's circles start just under the inset and end `circle` below it; the page begins 18 pt under them (Flow 6 `me`: circles at 62, the column at 124).
  const barBottom = barCircleBottom(insets.top, Platform.OS === 'android')
  // The branded pull (motion #18), its monogram under the floating bar; Android keeps the platform's control, offset the same.
  const pull = usePullToRefresh({ refreshing, onRefresh: () => void onRefresh(), indicatorTop: barBottom })
  const { onOffset: pullAt, wantsOffset: pullWants } = pull
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
    // Only above the top, or while the monogram is still up: the rest of the scroll never crosses to JS.
    if (pullWants(e.contentOffset.y)) scheduleOnRN(pullAt, e.contentOffset.y)
  })
  const chrome = (
    <ProfileBar
      testID="me-bar"
      scrollY={scrollY}
      actions={[
        { icon: 'user-plus', label: 'Add friends', onPress: () => router.push('/friends/add') },
        { icon: 'settings', label: 'Settings', onPress: () => router.push('/settings') },
      ]}
    />
  )

  const content = () => {
    // A section's place in the entrance, counted over what is actually drawn. In the catch-up after a long absence a section
    // that arrives is simply there (motion #49: missed arrivals are not replayed).
    let slot = 0
    const arrive = playsArrival()
    const next = () => (arrive ? { delay: enterAt(slot++) } : { delay: 0, duration: 0 })
    const photoGap = gaps.some((g) => g.key === 'photo')
    const otherGaps = gaps.filter((g) => g.key !== 'photo')
    const crewStack = crews.slice(0, 2)

    return (
      <>
        <OfflineStrip offline={offline} />
        {/* A photo moderation took down (blendn-admin `photo_states`, kept 7 days): said once, with the way to replace it. */}
        {pulled.length > 0 ? (
          <FadeInUp {...next()}>
            <Banner
              kind="info"
              icon="shield-alert"
              text={
                mainWasPulled(pulled)
                  ? photoList.length > 0
                    ? 'Your main photo was removed. The next one is your main photo now.'
                    : 'Your main photo was removed. Add a different one.'
                  : 'A photo of yours was removed. It didn’t meet the photo rules.'
              }
              action={{ label: 'Add a different photo', onPress: openEdit, icon: 'camera' }}
              testID="me-photo-pulled"
            />
          </FadeInUp>
        ) : null}
        <FadeInUp {...next()}>
          <MeIdentity
            name={profile?.name || 'You'}
            age={profile?.age}
            location={profile?.location}
            memberSince={profile?.memberSince}
            occupation={profile?.occupation}
            photos={photoList}
            onEdit={openEdit}
            onPhotos={openPhoto}
          />
        </FadeInUp>

        {/*
          Somebody is waiting on an answer: about another person, and the only thing here with a clock on it. Then your crews: made
          from your friends, so beside the way to add them; the dot is an invite waiting.
        */}
        <FadeInUp {...next()}>
          <SettingsGroup>
            {requestCount > 0 ? <RequestsRow count={requestCount} /> : null}
            <SettingsRow
              testID="crews-row"
              icon={crewStack.length ? undefined : 'users'}
              leading={
                crewStack.length ? (
                  <View style={styles.emblems}>
                    {crewStack.map((c, i) => (
                      <View key={c.crewId} style={i > 0 ? styles.emblemOver : undefined}>
                        <CrewEmblem seed={c.emblemSeed} size={CREW_EMBLEM} />
                      </View>
                    ))}
                  </View>
                ) : undefined
              }
              title="Crews"
              label={crewsLabel(crews.length, crewInvites)}
              accessory={
                <>
                  {crews.length > 0 ? (
                    <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, 'GeistMono_500Medium'), styles.count]}>
                      {crews.length}
                    </Text>
                  ) : null}
                  {crewInvites > 0 ? <PresenceDot kind="unread" testID="crews-invite-dot" /> : null}
                </>
              }
              trail="chevron"
              onPress={() => router.push('/crews')}
            />
          </SettingsGroup>
        </FadeInUp>

        {/*
          What is missing, as rows -- never a meter: staying without a photo is a legitimate choice (see `event-preferences`).
          "Add a photo" is the screen's one gradient primary while it shows, because without a photo revealing yourself in a
          room has nothing to reveal.
        */}
        {gaps.length > 0 ? (
          <FadeInUp {...next()}>
            <ProfileSection title="Finish your profile" testID="finish-profile">
              {photoGap ? <Button kind="primary" icon="camera" label="Add a photo" onPress={openEdit} /> : null}
              {otherGaps.length > 0 ? (
                <SettingsGroup>
                  {otherGaps.map((gap) => (
                    <SettingsRow key={gap.key} icon={GAP_ICON[gap.key]} title={gap.label} trail="chevron" onPress={openEdit} />
                  ))}
                </SettingsGroup>
              ) : null}
            </ProfileSection>
          </FadeInUp>
        ) : null}

        {/*
          `eventsOrganized` is hidden at zero because almost nobody organises, and a permanent "0 Hosted" reads as a thing you
          failed to do rather than a role you do not have.
        */}
        {stats ? (
          <FadeInUp {...next()}>
            <StatsCard
              attended={nightCounts.total ?? stats.eventsAttended}
              saved={stats.savedCount ?? stats.eventsFavorited}
              friends={friendsCount}
              hosted={stats.eventsOrganized}
              onGoing={openGoing}
              onFriends={openFriends}
            />
          </FadeInUp>
        ) : null}

        {/* Where you stand with Blend'n+ above Nights out, and your badges under it (Flow 14 R4.1 · Me 01 to 03). No badges card at all when the server sent none. */}
        <FadeInUp {...next()}>
          <MePlusRow />
        </FadeInUp>

        <FadeInUp {...next()}>
          <NightsOut
            status={nightsStatus}
            events={attended}
            onOpenEvent={openEvent}
            onSeeAll={openGoing}
            onRetry={retryNights}
            retrying={nightsRetrying}
            onFirstNight={openWhatsOn}
            lockedCount={nightCounts.locked}
            total={nightCounts.total}
            runningCount={nightCounts.running ?? 0}
            onUnlock={unlockNights}
          />
        </FadeInUp>

        {badges !== null ? (
          <FadeInUp {...next()}>
            <MeBadges badges={badges} showBadges={showBadges === null ? undefined : { value: showBadges, onChange: saveShowBadges }} showsUp={showsUp === null ? undefined : { value: showsUp, onChange: saveShowsUp }} />
          </FadeInUp>
        ) : null}

        {profile?.bio || interests.length > 0 || profile?.education ? (
          <FadeInUp {...next()}>
            <ProfileSection title="About" testID="about">
              {profile?.bio ? <ProfileBio text={profile.bio} /> : null}
              {/* Your own chips, so nothing is "shared" -- plain chips only. */}
              {interests.length > 0 ? <ProfileInterests interests={interests} /> : null}
              {/* Not in the frame, but entered by you and shown to others: it stays visible on your own page, under About (owner decides). */}
              {profile?.education ? <ProfileDetail label="EDUCATION" value={profile.education} variant="ruled" /> : null}
            </ProfileSection>
          </FadeInUp>
        ) : null}
      </>
    )
  }

  // Only before there is something to show: a background refresh of a loaded
  // profile updates it in place rather than flashing the skeleton.
  const waiting = (authLoading || loading) && !profile
  // A failed refresh of a profile already on screen keeps it there.
  const failed = !!error && !profile

  return (
    <View style={styles.screen}>
      <Grain />
      {/* First in the tree for the focus order; it draws over the scroll by zIndex. */}
      {chrome}
      <Animated.ScrollView
        ref={scrollRef}
        testID="me-scroll"
        {...pull.listProps}
        // After the spread: the page's own worklet handler, which hands the pull its offset (`onOffset`).
        onScroll={onScroll}
        showsVerticalScrollIndicator={false}
        // The tab bar floats over the page's foot: the last section sat under it.
        contentContainerStyle={[styles.content, { paddingTop: barBottom + SPACE.lg + SPACE.xxs, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SPACE.xl }]}
      >
        {waiting ? (
          <MeSkeleton />
        ) : failed ? (
          <StateScreen
            icon="user"
            title="Your profile didn’t load"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', onPress: () => void getUserAndProfile(true) }]}
            testID="me-failed"
          />
        ) : (
          content()
        )}
      </Animated.ScrollView>
      {pull.indicator}
      <PhotoViewer
        photos={photoList}
        initialIndex={viewer?.index ?? 0}
        from={viewer?.from}
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        testID="me-viewer"
      />
    </View>
  )
}

const GAP_ICON = {
  photo: 'camera',
  photos: 'images',
  bio: 'pen-line',
  interests: 'sparkles',
} as const

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  // The screen gutter, with the frame's 28 between sections.
  content: { paddingHorizontal: SPACE.gutter, gap: SECTION_GAP },
  emblems: { flexDirection: 'row', alignItems: 'center' },
  emblemOver: { marginLeft: -CREW_OVERLAP },
  count: { color: COLOR.textSecondary },
})

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
function ProfileContent() {
  return (
    <ScreenProfiler id="me">
      <ProfileInner />
    </ScreenProfiler>
  )
}

/** Violet world: one hue on this screen (`HueProvider`). */
export default function Profile() {
  return (
    <HueProvider value="violet">
      <ProfileContent />
    </HueProvider>
  )
}
