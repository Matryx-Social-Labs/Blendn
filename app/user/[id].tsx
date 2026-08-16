import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { ConnectSheet } from '../../components/grid/ConnectSheet'
import {
  PROFILE_GUTTER,
  PROFILE_SECTION_GAP,
  ProfileActions,
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileHero,
  ProfileInterests,
} from '../../components/profile/ProfileSections'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { EMBER, EMBER_FONTS } from '../../lib/theme'
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
   * Drives the frame's one gradient chip. On the artboard that accent is
   * decoration; here it marks the reason you might talk to them, which is the
   * most useful thing on the screen.
   */
  sharedInterests?: string[]
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
  /*
   * `eventId` arrives from the Grid, and only from there.
   *
   * `event_likes` is keyed on an event, so a like has to know which room you
   * met in. Opened from a notification, the Banter or a deep link there is no
   * such context — and rather than guess at one, the Like button is simply
   * absent. Connect still works: a message request is gated on
   * `haveSharedAnEvent`, which the server resolves itself.
   */
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>()
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const [profile, setProfile] = useState<UserProfileView | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [ctaMode, setCtaMode] = useState<ProfileCtaMode>('connect')
  const [ctaMessage, setCtaMessage] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectSending, setConnectSending] = useState(false)

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
      Logger.error('profile', 'Connect request error', { error: e })
      setCtaMessage('Something went wrong. Try again.')
    } finally {
      setActionLoading(false)
    }
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
        return
      }
      if (result.data?.mutual && result.data.conversationId) {
        setConversationId(result.data.conversationId)
        setCtaMode('message')
        setCtaMessage('You are connected. Open the chat.')
      }
    } catch (e) {
      setLiked(false)
      Logger.error('profile', 'like failed', { error: e })
    } finally {
      setLikeBusy(false)
    }
  }, [eventId, profile, liked, likeBusy])

  /* Sending reveals you. `ConnectSheet` says so before anything is typed. */
  const sendConnect = useCallback(async (message: string) => {
    if (!profile) return
    setConnectSending(true)
    try {
      const result = await apiClient.createMessageRequest(profile.user_id, message)
      if (!result.success) {
        Logger.warn('profile', 'connect request failed', { error: result.error })
      }
      /*
       * Never rolled back: one request per pair for all time, so a failure can
       * mean one already exists and re-offering would invite an attempt that
       * can never succeed.
       */
      setCtaMode('requested')
      setCtaMessage('Request pending. You can chat after acceptance.')
    } catch (e) {
      Logger.error('profile', 'connect request error', { error: e })
      setCtaMode('requested')
    } finally {
      setConnectSending(false)
      setConnectOpen(false)
    }
  }, [profile])

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

  if (!loading && !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Profile not found</Text>
      </View>
    )
  }

  const photos = (profile?.photos ?? []).filter((u): u is string => !!u && u.trim() !== '')

  /*
   * Revealed, inferred from what actually arrived rather than from a flag.
   *
   * `profiles/[userId]` withholds `bio`, `occupation`, `education` and `photos`
   * behind `maySeeIdentity` and returns the literal name "Attendee" otherwise.
   * There is no `revealed` boolean in the payload, and adding one would be a
   * second source of truth for a rule that already has exactly one.
   *
   * A photo is the honest test: it is the field that cannot be absent for an
   * innocent reason once someone has revealed, because `User.image` mirrors the
   * primary and the gate is the only thing that empties it.
   */
  const revealed = photos.length > 0 || !!profile?.bio || !!profile?.occupation

  /*
   * One still, blurred, when they have not revealed.
   *
   * `blurPhoto` arrives instead of `photos`, so this branch has a picture and
   * the revealed branch has the real ones — they are never both present. Falls
   * through to the generated mark when there is no derivative, which is every
   * profile until people re-upload.
   */
  const blurHero = !revealed && profile?.blurPhoto ? [profile.blurPhoto] : []

  const heroTitle = revealed
    ? [profile?.name, profile?.age].filter(Boolean).join(', ') || 'Someone'
    : profile?.name || 'Attendee'

  /*
   * The frame's accent line is "PRO MEMBER • @blendn_julia". Neither exists --
   * there is no membership tier and no username column -- so it carries what is
   * real and, in an unrevealed profile, is the whole point of `work_field`
   * living outside the identity gate: an attribute rather than an address.
   */
  const heroSubtitle = [profile?.workField, profile?.location].filter(Boolean).join(' • ') || null

  const columnWidth = (WINDOW_WIDTH - PROFILE_GUTTER * 2 - 16) / 2

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
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
              pseudonym={profile?.name || 'Attendee'}
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
                  <ProfileGallery photos={photos.slice(1)} columnWidth={columnWidth} />
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
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={EMBER.textPrimary} />
        </Pressable>
        {ctaMode !== 'self' ? (
          <Pressable
            onPress={openSafety}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
            hitSlop={12}
            style={({ pressed }) => [styles.barButton, pressed && styles.pressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={EMBER.textPrimary} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER.bg },
  muted: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
  },
  scroll: { backgroundColor: EMBER.bg },
  // Frame `1141:5177`: `px-[12px]`, `gap-[64px]`, 32 clear of the hero.
  canvas: { paddingHorizontal: PROFILE_GUTTER, paddingTop: 32, gap: PROFILE_SECTION_GAP },
  // Frame `1141:5178`: heading and body are 24 apart, not 64.
  section: { gap: 24 },
  // Frame `1141:5198`: the two blocks are 48 apart.
  details: { gap: 48 },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,14,14,0.55)',
  },
  pressed: { opacity: 0.6 },
})
