import { ScreenProfiler } from '../../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { MatchMoment } from '../../components/blendn/MatchMoment'
import { LoadError, LoadState } from '../../components/LoadError'
import { useToast } from '../../components/Toast'
import { ConnectSheet } from '../../components/grid/ConnectSheet'
import {
  ProfileActions,
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileHero,
  ProfileInterests,
} from '../../components/profile/ProfileSections'
import PhotoLightbox from '../../components/PhotoLightbox'
import { apiClient, type UserProfileData } from '../../lib/apiClient'
import { likeRefusal } from '../../lib/likeRefusal'
import { profileIdentity, withheldUnlessVisible } from '../../lib/profileIdentity'
import { isGone } from '../../lib/loadFailure'
import { Logger } from '../../lib/logger'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
const { width: WINDOW_WIDTH } = Dimensions.get('window')

interface UserProfileView {
  user_id: string
  name?: string
  age?: number
  bio?: string
  location?: string
  occupation?: string
  education?: string
  interests?: string[]
  /** Coarse, and outside the identity gate on purpose. See the hero subtitle. */
  workField?: string
  /**
   * The 40px derivative of their main photo, sent only when they have NOT
   * revealed — the blurred half of "pseudonyms + blurred photos".
   *
   * Arrives *instead of* `photos`, never alongside it. That is the whole
   * security property: there is no real URL on the device to un-blur.
   */
  blurPhoto?: string | null
  /**
   * The subset you both picked, already intersected by the server.
   *
   * Drives the outlined chips. They mark the reason you might talk to them,
   * which is the most useful thing on the screen.
   */
  sharedInterests?: string[]
  photos?: string[]
  stats?: {
    eventsAttended: number
    eventsFavorited: number
    eventsOrganized: number
  }
  memberSince?: string
  /** The server's `identityVisible`, or your own profile. Nothing else sets it. */
  identityVisible: boolean
}

type ProfileCtaMode = 'self' | 'connect' | 'requested' | 'message'

/** The line under the action, said the way a person would. */
const CTA_HINT = {
  connect: 'Send a request to start chatting.',
  requested: 'Request sent — you can chat once they accept.',
  message: 'You can message each other.',
} as const
type ProfileConnection = NonNullable<UserProfileData['connection']>

function UserProfileInner() {
  /*
   * `eventId` arrives from the Grid, and only from there.
   *
   * `event_likes` is keyed on an event, so a like has to know which room you
   * met in. Opened from a notification, the Banter or a deep link there is no
   * such context — and rather than guess at one, the Like button is simply
   * absent. Connect still works: a message request is gated on
   * `haveSharedAnEvent`, which the server resolves itself.
   */
  /*
   * `pseudonym` and `roomSeed` arrive from a room — Room info's member list,
   * and the Room grid once it passes them (see `docs/PROFILE.md`). The server
   * has no event context and names anyone you may not identify "Attendee";
   * the room already knows what this person is called *there*, and the page
   * should call them the same, with the same creature.
   */
  const { id, eventId, pseudonym, roomSeed } = useLocalSearchParams<{
    id: string
    eventId?: string
    pseudonym?: string
    roomSeed?: string
  }>()
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<UserProfileView | null>(null)
  const [loading, setLoading] = useState(true)
  /*
   * Why there is no profile: `gone` is the server's 404, `failed` is anything
   * else. The screen used to raise a native "Error" alert over "Profile not
   * found" for both, with the top bar hidden, so a dropped connection read as
   * a deleted person and the only way out was the edge swipe.
   */
  const [loadError, setLoadError] = useState<'gone' | 'failed' | null>(null)
  /* A mutual like made here, for the match moment. */
  const [match, setMatch] = useState<{ conversationId: string; you: string | null } | null>(null)
  const [ctaMode, setCtaMode] = useState<ProfileCtaMode>('connect')
  const [ctaMessage, setCtaMessage] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxVisible, setLightboxVisible] = useState(false)
  const [connectSending, setConnectSending] = useState(false)
  // Who this is, as far as the server lets this screen say (`lib/profileIdentity`).
  const identity = profileIdentity(profile, { pseudonym, roomSeed })

  const hydrateCtaState = useCallback(async (targetUserId: string, connection?: ProfileConnection) => {
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

    /*
     * The server's answer, when it gave one (SCRUM-371).
     *
     * Opened from a room, `targetUserId` is an `rh_` handle, and the lists
     * below carry real ids — so matching against them misses an existing
     * conversation and offers Connect, which the server then refuses. Only
     * the server can join a handle to a person, so it says where you stand.
     * An incoming request reads as "Requested", as the lists always did.
     */
    if (connection) {
      if (connection.conversationId) {
        setConversationId(connection.conversationId)
        setCtaMode('message')
        setCtaMessage(CTA_HINT.message)
      } else if (connection.request) {
        setConversationId(null)
        setCtaMode('requested')
        setCtaMessage(CTA_HINT.requested)
      } else {
        setConversationId(null)
        setCtaMode('connect')
        setCtaMessage(CTA_HINT.connect)
      }
      return
    }

    // An older server, or a profile still anonymous to you: the lists.
    try {
      // Cached: this runs on mount, and the conversation list changes far more
      // slowly than the screen is opened.
      const convResult = await apiClient.getConversations()
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
          setCtaMessage(CTA_HINT.message)
          return
        }
      }

      const requestResult = await apiClient.getMessageRequests({ status: 'pending' })
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
          setCtaMessage(CTA_HINT.requested)
          return
        }
      }
    } catch {}

    setConversationId(null)
    setCtaMode('connect')
    setCtaMessage(CTA_HINT.connect)
  }, [authUser])

  // State is set only in the callbacks, once the requests have settled; the
  // spinner for a reload is switched on in render, below.
  const load = useCallback(() => {
    if (!id) return
    return apiClient.getPublicProfile(id)
      .then(async (result) => {
        let nextProfile: UserProfileView | null = null
        let connection: ProfileConnection | undefined
        let gone = isGone(result)

        if (result.success && result.data) {
          const data = result.data
          connection = data.connection
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
            /*
             * Both are optional on the payload and typed loosely upstream, so they
             * are read defensively rather than asserted -- an older server build
             * simply yields no shared chips and no subtitle, which degrades to the
             * plain design rather than to a crash.
             */
            workField: (data as { work_field?: string }).work_field,
            blurPhoto: (data as { blurPhoto?: string | null }).blurPhoto ?? null,
            sharedInterests: Array.isArray((data as { sharedInterests?: string[] }).sharedInterests)
              ? (data as { sharedInterests?: string[] }).sharedInterests
              : [],
            stats: data.stats,
            memberSince: data.memberSince,
            identityVisible: data.identityVisible === true || data.isOwnProfile === true,
          }
        } else {
          const fallbackResult = await apiClient.getProfile(id)
          // Gone only if the fallback agrees: it exists for older servers.
          gone = gone && isGone(fallbackResult)
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
              // An older route with no `identityVisible`: fail closed.
              identityVisible: false,
            }
          }
        }

        // Fail closed: no identity field survives unless the server said you may see it.
        setProfile(nextProfile ? withheldUnlessVisible(nextProfile) : null)
        setLoadError(nextProfile ? null : gone ? 'gone' : 'failed')
        if (nextProfile?.user_id) {
          await hydrateCtaState(nextProfile.user_id, connection)
        }
      })
      .catch((e) => {
        Logger.error('profile', 'User profile load failed', { error: e })
        setLoadError('failed')
      })
      .finally(() => setLoading(false))
  }, [id, hydrateCtaState])

  // A new `load` is a new profile to fetch, and it shows as loading from this
  // render rather than one commit later. The first `load` rides on the
  // initial `loading: true`.
  const [loadingFor, setLoadingFor] = useState(() => load)
  if (loadingFor !== load) {
    setLoadingFor(() => load)
    if (id) setLoading(true)
  }

  const retryLoad = () => {
    setLoading(true)
    void load()
  }

  useEffect(() => {
    load()
  }, [load])

  /*
   * Message only. Connect opens `ConnectSheet` (`sendConnect` below), and
   * Requested is disabled — so this never sends a request itself.
   */
  const handleConnect = () => {
    if (!profile || ctaMode !== 'message' || !conversationId) return
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: {
        conversationId,
        /*
         * A first paint only — the thread asks the server who they are. Never
         * the server's flat "Attendee", which would flash as their name.
         */
        ...(identity.revealed || pseudonym ? { otherUserName: identity.title } : {}),
        // May be a room handle. The thread compares nothing with it, and
        // its only use — block or report — takes a handle as readily as an id.
        otherUserId: profile.user_id,
      } as any,
    })
  }

  /*
   * The like, with the same meaning it has on the Grid: private until it is
   * mutual, and the conversation it opens stays pseudonymous.
   *
   * Optimistic, and rolled back on failure — unlike Connect, a like that did not
   * land can simply be sent again, so re-offering the button is the right
   * answer rather than a trap.
   */
  const handleLike = useCallback(async () => {
    if (!eventId || !profile || liked || likeBusy) return
    setLikeBusy(true)
    setLiked(true)
    try {
      const result = await apiClient.likeAtEvent(String(eventId), profile.user_id)
      if (!result.success) {
        setLiked(false)
        // Said, the way the room says it: about the room or the network, never about them.
        const refusal = likeRefusal(result.errorCode, result.error)
        showToast(refusal.message, refusal.variant)
        return
      }
      if (result.data?.mutual && result.data.conversationId) {
        setConversationId(result.data.conversationId)
        setCtaMode('message')
        setCtaMessage(CTA_HINT.message)
        // The moment the room gives a mutual like, rather than a button quietly changing.
        setMatch({ conversationId: result.data.conversationId, you: result.data.pseudonyms?.you ?? null })
      }
    } catch (e) {
      setLiked(false)
      Logger.error('profile', 'like failed', { error: e })
      showToast("That didn't go through. Try again.", 'error')
    } finally {
      setLikeBusy(false)
    }
  }, [eventId, profile, liked, likeBusy, showToast])

  /* Sending reveals you. `ConnectSheet` says so before anything is typed. */
  const sendConnect = useCallback(async (message: string) => {
    if (!profile) return
    setConnectSending(true)
    try {
      const result = await apiClient.createMessageRequest(profile.user_id, message)
      /*
       * "Requested" only when a request exists: this one was sent, or the
       * server's 409 says one already does (one per pair, for all time, so
       * re-offering Connect then would invite an attempt that can never land).
       *
       * Every other failure — offline, a timeout, a refusal — used to flip to
       * "Requested" too, promising a request nobody received. It says so now,
       * and the sheet stays open with the message still in it.
       */
      if (result.success || result.errorCode === 'CONFLICT') {
        if (result.success) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        setCtaMode('requested')
        setCtaMessage(CTA_HINT.requested)
        setConnectOpen(false)
      } else {
        Logger.warn('profile', 'connect request failed', { error: result.error })
        showToast("Your request didn't send. Try again.", 'error')
      }
    } catch (e) {
      Logger.error('profile', 'connect request error', { error: e })
      showToast("Your request didn't send. Try again.", 'error')
    } finally {
      setConnectSending(false)
    }
  }, [profile, showToast])

  const openSafety = () => {
    if (!profile) return
    // Blocked: there is nothing left to look at here.
    showUserSafetyActions(identity.title, profile.user_id, () => router.back())
  }

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
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        {loadError === 'gone' ? (
          /*
           * One "gone" state, the same shape as every other: deleted, blocked
           * either way, or never there — the server answers all of them alike
           * and so does this.
           */
          <LoadState
            icon="person-outline"
            title="This profile isn't available."
            message="It may have been removed."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        ) : (
          <LoadError title="This profile didn't load" onRetry={retryLoad} />
        )}
        <View style={[styles.topBar, { paddingTop: insets.top + SPACE.md }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        </View>
      </View>
    )
  }

  const photos = (profile?.photos ?? []).filter((u): u is string => !!u && u.trim() !== '')

  /*
   * Revealed is the server's `identityVisible`, never inferred from what
   * arrived — see `lib/profileIdentity.ts`. By here an unrevealed profile has
   * no photos, bio, occupation or education left to draw.
   */
  const revealed = identity.revealed

  /*
   * One still, blurred, when they have not revealed.
   *
   * `blurPhoto` arrives instead of `photos`, so this branch has a picture and
   * the revealed branch has the real ones — they are never both present. Falls
   * through to the generated mark when there is no derivative, which is every
   * profile until people re-upload.
   */
  const blurHero = !revealed && profile?.blurPhoto ? [profile.blurPhoto] : []

  const heroTitle = identity.title

  /*
   * The frame's line under the name is "PRO MEMBER • @blendn_julia". Neither exists --
   * there is no membership tier and no username column -- so it carries what is
   * real and, in an unrevealed profile, is the whole point of `work_field`
   * living outside the identity gate: an attribute rather than an address.
   */
  const heroSubtitle = [profile?.workField, profile?.location].filter(Boolean).join(' • ') || null

  const columnWidth = (WINDOW_WIDTH - GUTTER * 2 - SPACE.lg) / 2

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + SPACE.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ProfileSkeleton width={WINDOW_WIDTH} />
        ) : (
          <>
            <ProfileHero
              width={WINDOW_WIDTH}
              photos={revealed ? photos : blurHero}
              blurred={!revealed}
              title={heroTitle}
              subtitle={heroSubtitle}
              // The room's seed rule (`markSeed`), never a user id or "Attendee".
              pseudonym={identity.seed}
            />

            <View style={styles.canvas}>
              {profile?.bio ? (
                <View style={styles.section}>
                  <ProfileHeading title="Bio" />
                  <ProfileBio text={profile.bio} />
                </View>
              ) : null}

              {profile?.interests && profile.interests.length > 0 ? (
                <View style={styles.section}>
                  <ProfileHeading title="Interests" />
                  <ProfileInterests
                    interests={profile.interests}
                    sharedInterests={profile.sharedInterests}
                  />
                </View>
              ) : null}

              {/*
                Occupation and education. Asymmetric by design -- a filled card
                and a ruled block -- which is what stops two adjacent facts
                reading as a table. Either can be absent; both are behind the
                identity gate.
              */}
              {profile?.occupation || profile?.education ? (
                <View style={styles.details}>
                  {profile.occupation ? (
                    <ProfileDetail label="OCCUPATION" value={profile.occupation} />
                  ) : null}
                  {profile.education ? (
                    <ProfileDetail label="EDUCATION" value={profile.education} variant="ruled" />
                  ) : null}
                </View>
              ) : null}

              {/*
                The gallery is the photos beyond the hero's. The hero already
                cycles all of them, so repeating the first here would show the
                same picture twice on one screen.
              */}
              {photos.length > 1 ? (
                <View style={styles.section}>
                  <ProfileHeading
                    title="Gallery"
                    trailing={`${photos.length} photo${photos.length === 1 ? '' : 's'}`}
                  />
                  <ProfileGallery
                    photos={photos.slice(1)}
                    columnWidth={columnWidth}
                    /*
                     * `+1` because the gallery is `photos.slice(1)` -- the hero
                     * already cycles the first one. Without the offset every
                     * tap opened the photo before the one you touched.
                     */
                    onPressPhoto={(i) => {
                      setLightboxIndex(i + 1)
                      setLightboxVisible(true)
                    }}
                  />
                </View>
              ) : null}

              {!isLoading && profile && ctaMode !== 'self' ? (
                <ProfileActions
                  name={heroTitle}
                  label={ctaLabel}
                  onPress={ctaMode === 'connect' ? () => setConnectOpen(true) : handleConnect}
                  disabled={ctaDisabled}
                  hint={ctaMessage || null}
                  liked={liked}
                  likeBusy={likeBusy}
                  /* Absent without an event — see the param comment above. */
                  onLike={eventId ? handleLike : undefined}
                />
              ) : null}

              {!revealed ? (
                <View style={styles.section}>
                  {/*
                    Said plainly rather than left as a screen that looks
                    half-loaded. The absence IS the product working, and a person
                    who does not know that reads it as a bug.
                  */}
                  <ProfileHeading title="Still anonymous" />
                  <ProfileBio
                    text={`${heroTitle} has not revealed who they are yet. Connect, talk, and either of you can reveal when you want to.`}
                  />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/*
        `displayName` is whatever the screen calls them — the pseudonym until
        they reveal — because the sheet's disclosure names them, and naming an
        unrevealed person with a real name is the identity gate's mistake made
        in prose.
      */}
      <ConnectSheet
        visible={connectOpen}
        displayName={heroTitle}
        theyAreRevealed={revealed}
        sending={connectSending}
        onSend={sendConnect}
        onDismiss={() => setConnectOpen(false)}
      />

      {/* Frame `1141:5228`. Back, and the safety menu the frame draws at the right. */}
      {/*
        `ProfileGallery` has always wrapped each tile in a `Pressable` and this
        screen never passed `onPressPhoto`, so every tap on somebody's photos
        did nothing at all -- a tap target that looks live and is not.
      */}
      <PhotoLightbox
        photos={photos}
        initialIndex={lightboxIndex}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />

      {/*
        A mutual like made from here. Your side is your pseudonym in that room,
        as the room's own moment draws it; theirs is what this page shows.
      */}
      <MatchMoment
        visible={match !== null}
        me={{ name: match?.you ?? 'You', photo: null }}
        them={{ name: heroTitle, photo: revealed ? photos[0] ?? null : null }}
        onClose={() => setMatch(null)}
        onSayHi={() => {
          setMatch(null)
          handleConnect()
        }}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + SPACE.md }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={ICON.lg} color={EMBER.textPrimary} />
        </Pressable>
        {ctaMode !== 'self' ? (
          <Pressable
            onPress={openSafety}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
            hitSlop={12}
            style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/** The frame's shape while it loads, so the page does not jump when it lands. */
function ProfileSkeleton({ width }: { width: number }) {
  return (
    <View>
      <SkeletonBlock width={width} height={Math.round(width * 1.925)} borderRadius={0} />
      <View style={styles.canvas}>
        <View style={styles.section}>
          <SkeletonLine width="30%" />
          <SkeletonLine width="90%" />
          <SkeletonLine width="75%" />
        </View>
        <View style={styles.section}>
          <SkeletonLine width="40%" />
          <SkeletonLine width="60%" />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER, backgroundColor: EMBER.bg },
  scroll: { backgroundColor: EMBER.bg },
  // The screen gutter, 32 clear of the hero and between sections.
  canvas: { paddingHorizontal: GUTTER, paddingTop: SPACE.xxl, gap: SPACE.xxl },
  // Heading to its content.
  section: { gap: SPACE.lg },
  details: { gap: SPACE.xl },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: GUTTER,
    paddingBottom: SPACE.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barButton: {
    width: CONTROL.md,
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMBER.scrim,
  },
  pressed: { opacity: 0.6 },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function UserProfile() {
  return (
    <ScreenProfiler id="attendee">
      <UserProfileInner />
    </ScreenProfiler>
  )
}
