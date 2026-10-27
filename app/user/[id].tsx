import { H } from '../../lib/haptics'
import { ScreenProfiler } from '../../lib/perf'
import { router, useLocalSearchParams } from 'expo-router'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SkeletonBlock, SkeletonLine } from '../../components/Skeleton'
import { MomentMatch } from '../../components/ds/MomentMatch'
import { Button } from '../../components/ds/Button'
import type { Rect } from '../../components/ds/chatShared'
import { font, HueProvider, useBoldText, useSelection, type Hue } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { useToast } from '../../components/Toast'
import { ConnectSheet } from '../../components/grid/ConnectSheet'
import { MessageRequestPrompt } from '../../components/profile/MessageRequestPrompt'
import { PhotoViewer } from '../../components/profile/PhotoViewer'
import { ProfileBar } from '../../components/profile/ProfileBar'
import { DOCK_FADE, dockClearance, ProfileDock } from '../../components/profile/ProfileDock'
import { heroHeightFor, ProfileHeroStage } from '../../components/profile/ProfileHeroStage'
import { BadgeRow } from '../../components/profile/MeBadges'
import { FoldBlock, PROFILE_EMPTY, ProfileBody, SECTION_GAP } from '../../components/profile/ProfileSections'
import { Glyph } from '../../components/ui/Glyph'
import { Icon } from '../../components/ui/Icon'
import { apiClient, type UserProfileData } from '../../lib/apiClient'
import { COLOR, ICON, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { likeRefusal } from '../../lib/likeRefusal'
import { heroFoldHeight } from '../../lib/profileFold'
import { interestNames } from '../../lib/meProfile'
import { useWorkFields } from '../../components/profile/useWorkFields'
import { profileIdentity, withheldUnlessVisible, workFieldLabel } from '../../lib/profileIdentity'
import { aboutLine, type Badge } from '../../lib/aboutYou'
import { FRIEND_COPY, friendAction, isHandle, parseFriendOffer, type FriendOffer } from '../../lib/friendOffer'
import { parseBadges } from '../../lib/profileBadges'
import { incomingRequestFrom } from '../../lib/friends'
import { isGone } from '../../lib/loadFailure'
import { Logger } from '../../lib/logger'
import { requestTextRefusal } from '../../lib/requestRefusal'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { useAuth } from '../../lib/useAuth'
import { useFriendAsk } from '../../lib/useFriendAsk'
import { askPushInContext } from '../../lib/pushAsk'


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
  /**
   * "Speaks Malayalam · From Kerala · Leo ♌" (matching v2). The server sends
   * languages, home state and sign only when you may see who this is — they
   * are origin-like, so before a reveal a card shows at most one of them.
   */
  about?: string | null
  /** The server's `identityVisible`, or your own profile. Nothing else sets it. */
  identityVisible: boolean
}

/**
 * Whether this screen may ask about a friend offer at all: never for yourself, and never for a room handle, which is not the
 * real id `POST /friends/requests` needs. The offer itself is the server's, and only for somebody you may see.
 */
const mayOfferFriend = (viewerId: string | undefined, ref: string) => !!viewerId && viewerId !== ref && !isHandle(ref)

type ProfileCtaMode = 'self' | 'connect' | 'requested' | 'message' | 'declined'
const CTA_LABEL: Record<ProfileCtaMode, string> = {
  self: 'You',
  requested: 'Requested',
  message: 'Message',
  connect: 'Connect',
  declined: 'Declined',
}

/** The line under the action, said the way a person would. */
const CTA_HINT = {
  connect: 'Connect sends a request and reveals your name and photo.',
  requested: 'Request sent. You can chat once they accept.',
  message: 'You can message each other.',
  declined: 'You declined this request.',
} as const
type ProfileConnection = NonNullable<UserProfileData['connection']>

function UserProfileInner() {
  const sel = useSelection()
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
   * `pseudonym` and `roomSeed` arrive from a room — Room info's member list
   * and the Room grid (see `docs/PROFILE.md`). Asked by a room handle, the
   * server now answers in that room's terms: somebody still anonymous to you
   * comes back as their pseudonym there, with no `connection` (admin #498).
   * The params still title the page, so the name and the creature match the
   * card that opened it from the first paint, before the server answers, and
   * nothing here trusts a `name` for somebody `identityVisible` withholds.
   * Asked by a real id with no room, the server still says "Attendee", which
   * this page never shows (`lib/profileIdentity.ts`).
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
  // Their badges, from `GET /users/:id` (the server gives them to whoever may see who they are); none until it answers.
  const [badgesOf, setBadgesOf] = useState<{ for: string; list: Badge[] } | null>(null)
  // `work_field` arrives as a stored code ("data_ai"); the hero line says its label.
  const workFields = useWorkFields()
  const badges = badgesOf?.for === id ? badgesOf.list : []
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
  const markSelf = useContext(MarkSelf)
  useEffect(() => markSelf(ctaMode === 'self'), [ctaMode, markSelf])
  const [ctaMessage, setCtaMessage] = useState<string>('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [viewer, setViewer] = useState<{ index: number; from: Rect | null } | null>(null)
  const { width: windowWidth } = useWindowDimensions()
  const bold = useBoldText()
  const [dockHeight, setDockHeight] = useState(0)
  // The first view's fold (r7 M2): the page's height and each section's top in the canvas, so the hero can land the fold on one.
  const [viewport, setViewport] = useState(0)
  const [blockTops, setBlockTops] = useState<Record<string, number>>({})
  const onBlockTop = useCallback((id: string, top: number | null) => {
    setBlockTops((prev) => {
      if (top === null) {
        if (!(id in prev)) return prev
        const { [id]: _gone, ...rest } = prev
        return rest
      }
      return prev[id] === top ? prev : { ...prev, [id]: top }
    })
  }, [])
  // The page's scroll offset, written on the UI thread: the bar and the hero's stretch read it, React never renders for it.
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y)
  })
  const [connectSending, setConnectSending] = useState(false)
  const [connectError, setConnectError] = useState<string | undefined>()
  // A request they sent you, found in your pending ones: their note, and the answer in flight (R4.1 6.2).
  const [incoming, setIncoming] = useState<{ id: string; note: string | null } | null>(null)
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null)
  // Who this is, as far as the server lets this screen say (`lib/profileIdentity`).
  const identity = profileIdentity(profile, { pseudonym, roomSeed })
  // Whether to offer "Add friend" (SCRUM-750): the server's `friend` from `GET /profiles/:id`, for somebody you may see.
  const [friend, setFriend] = useState<FriendOffer | null>(null)
  const friendAsk = useFriendAsk(identity.title)

  const hydrateCtaState = useCallback(async (targetUserId: string, connection?: ProfileConnection) => {
    if (!authUser) {
      setCtaMode('connect')
      setCtaMessage('Sign in to connect.')
      return
    }
    if (authUser.id === targetUserId) {
      setCtaMode('self')
      setCtaMessage('This is your profile.')
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
     *
     * It says so only to somebody allowed to know who this is. For a person
     * still anonymous to you there is no `connection` (saying "you have a
     * conversation" would name the pseudonym), so a request you already sent
     * shows Connect until you try again; the server's 409 then turns it into
     * "Requested" (`sendConnect`).
     */
    if (connection) {
      if (connection.conversationId) {
        setConversationId(connection.conversationId)
        setCtaMode('message')
        setCtaMessage(CTA_HINT.message)
      } else if (connection.request) {
        setCtaMode('requested')
        setCtaMessage(CTA_HINT.requested)
        // One they sent you: their note, and the answer, here (R4.1 6.2). Not found (a room handle): it stays "Requested".
        if (connection.request === 'received') {
          const pending = await apiClient.getMessageRequests({ status: 'pending' }).catch(() => null)
          if (pending?.success && pending.data?.requests) setIncoming(incomingRequestFrom(pending.data.requests, targetUserId))
        }
      } else {
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
          setIncoming(incomingRequestFrom(requests, targetUserId))
          setCtaMode('requested')
          setCtaMessage(CTA_HINT.requested)
          return
        }
      }
    } catch {}
    setCtaMode('connect')
    setCtaMessage(CTA_HINT.connect)
  }, [authUser])


  // State is set only in the callbacks, once the requests have settled; the
  // spinner for a reload is switched on in render, below.
  // `isCurrent` is false once the page has moved on (another person, or closed): that load's answer, landing late, offers nothing.
  const load = useCallback((isCurrent: () => boolean = () => true) => {
    if (!id) return
    /*
     * ONE request: `GET /users/:id` carries `friend` (the offer, read by `parseFriendOffer`) and `badges` top-level beside the
     * profile (blendn-admin #716 follow-up), so the dock and the badges draw with the page and nothing else is asked.
     */
    return apiClient
      .getPublicProfile(id)
      .then(async (result) => {
        let offer: FriendOffer | null = null
        let badges: Badge[] | null = null
        let nextProfile: UserProfileView | null = null
        let connection: ProfileConnection | undefined
        let gone = isGone(result)

        if (result.success && result.data) {
          const data = result.data
          connection = data.connection
          offer = parseFriendOffer(data.friend)
          badges = parseBadges(data.badges)
          const photos = data.photos || data.profile_photos || []
          const interests = interestNames(data.interests)
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
            about: aboutLine(data as { languages?: string[]; homeState?: string | null; sign?: string | null }),
            identityVisible: data.identityVisible === true || data.isOwnProfile === true,
          }
        } else {
          const fallbackResult = await apiClient.getProfile(id)
          // Gone only if the fallback agrees: it exists for older servers.
          gone = gone && isGone(fallbackResult)
          if (fallbackResult.success && fallbackResult.data) {
            const data = fallbackResult.data
            // `/profiles/:id` nests the profile: the photos are `profile.photos`, not top-level (YOU-13).
            const photos = data.profile?.photos ?? []
            const interests = interestNames(data.interests)
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
        // Only for somebody you may see (`identityVisible`), and with the same render as the profile: the dock never pops in.
        if (isCurrent()) setFriend(nextProfile?.identityVisible && mayOfferFriend(authUser?.id, id) ? offer : null)
        setLoadError(nextProfile ? null : gone ? 'gone' : 'failed')
        // Badges are an identity field: only for somebody you may see, and none (not drawn) when the server sent none.
        setBadgesOf({ for: id, list: nextProfile?.identityVisible ? (badges ?? []) : [] })
        if (nextProfile?.user_id) {
          await hydrateCtaState(nextProfile.user_id, connection)
        }

      })
      .catch((e) => {
        Logger.error('profile', 'User profile load failed', { error: e })
        setLoadError('failed')
      })
      .finally(() => setLoading(false))
  }, [id, hydrateCtaState, authUser])

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
    let current = true
    load(() => current)
    return () => {
      current = false
    }
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
        if (refusal.variant === 'error') showToast(refusal.message, 'error', { haptic: 'error' })
        else showToast(refusal.message, refusal.variant)
        return
      }
      if (result.data?.mutual && result.data.conversationId) {
        setConversationId(result.data.conversationId)
        setCtaMode('message')
        setCtaMessage(CTA_HINT.message)
        // The moment the room gives a mutual like, rather than a button quietly changing.
        setMatch({ conversationId: result.data.conversationId, you: result.data.pseudonyms?.you ?? null })
      } else {
        // Not mutual yet: the moment a push about it pays off (Flow 9 · 9.7), the first time only.
        void askPushInContext('like')
      }
    } catch (e) {
      setLiked(false)
      Logger.error('profile', 'like failed', { error: e })
      showToast("That didn’t go through. Try again.", 'error', { haptic: 'error' })
    } finally {
      setLikeBusy(false)
    }
  }, [eventId, profile, liked, likeBusy, showToast])

  /* Sending reveals you. `ConnectSheet` says so before anything is typed. */
  const sendConnect = useCallback(async (message: string) => {
    if (!profile) return
    setConnectSending(true)
    setConnectError(undefined)
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
        if (result.success) H.success()
        setCtaMode('requested')
        setCtaMessage(CTA_HINT.requested)
        setConnectOpen(false)
      } else {
        Logger.warn('profile', 'connect request failed', { error: result.error })
        // In the sheet, under the note: the sheet's scrim dims a toast behind it.
        setConnectError(requestTextRefusal(result) ?? "Your request didn’t send. Try again.")
        H.error()
      }
    } catch (e) {
      Logger.error('profile', 'connect request error', { error: e })
      setConnectError("Your request didn’t send. Try again.")
      H.error()
    } finally {
      setConnectSending(false)
    }
  }, [profile, showToast])

  /*
   * Their request, answered from their profile (R4.1 6.2). Accept is the server's yes and then the chat; Decline tells them nothing
   * and, since a pair has one request for all time, leaves nothing to offer here. A refusal says so and leaves the prompt as it was.
   */
  const answerRequest = async (action: 'accept' | 'decline') => {
    if (!incoming || answering) return
    setAnswering(action)
    try {
      const result = await apiClient.respondToMessageRequest(incoming.id, action)
      if (!result.success) {
        Logger.warn('profile', 'message request answer failed', { error: result.error })
        showToast(`Couldn’t ${action} that request. Try again.`, 'error', { haptic: 'error' })
        return
      }
      setIncoming(null)
      if (action === 'decline') {
        setCtaMode('declined')
        setCtaMessage(CTA_HINT.declined)
        return
      }
      H.success()
      const next = result.data?.conversationId ?? null
      setConversationId(next)
      setCtaMode('message')
      setCtaMessage(CTA_HINT.message)
      if (next) {
        router.push({ pathname: '/private-chat/[conversationId]', params: { conversationId: next, otherUserId: profile?.user_id ?? '' } as any })
      }
    } catch (e) {
      Logger.error('profile', 'message request answer error', { error: e })
      showToast(`Couldn’t ${action} that request. Try again.`, 'error', { haptic: 'error' })
    } finally {
      setAnswering(null)
    }
  }

  const openSafety = () => {
    if (!profile) return
    // Blocked: there is nothing left to look at here.
    showUserSafetyActions(identity.title, profile.user_id, () => router.back())
  }

  const addFriend = async () => {
    const result = await friendAsk.ask(profile?.user_id)
    if (result.ok) setFriend(result.offer)
  }
  // The dock has room for one lit action: Add friend / Accept while the server offers it (Message steps down to secondary), and
  // after an ask a note (which says more than the generic hint, and the hint is always set by the time the dock draws), not a disabled
  // button. Friends already: nothing, as in the DM.
  const friendNow = friendAction(friend)
  const friendLead = friendNow?.lit ? friendNow : null
  const friendRequested = friendNow?.kind === 'requested'

  const ctaDisabled = ctaMode === 'self' || ctaMode === 'requested' || ctaMode === 'declined'
  // Connect and Message are the live actions, lit in the screen's rose, unless Add friend is lit above them; Requested and Declined are states and stay quiet.
  const ctaLit = (ctaMode === 'connect' || ctaMode === 'message') && !friendLead

  const back = () => router.back()

  if (!loading && !profile) {
    return (
      <View style={styles.container}>
        <ProfileBar testID="profile-bar" scrollY={scrollY} onBack={back} />
        <View style={[styles.center, { paddingTop: insets.top }]}>
          {loadError === 'gone' ? (
            /*
             * One "gone" state, the same shape as every other: deleted, blocked
             * either way, or never there — the server answers all of them alike
             * and so does this.
             */
            <StateScreen
              icon="user"
              title="This profile isn’t available."
              body="It may have been removed."
              actions={[{ label: 'Go back', onPress: back, kind: 'secondary' }]}
              testID="profile-gone"
            />
          ) : (
            <StateScreen
              icon="user"
              title="This profile didn’t load"
              body="Check your connection and try again."
              actions={[{ label: 'Try again', onPress: retryLoad }]}
              testID="profile-failed"
            />
          )}
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
   * through to the generated creature when there is no derivative, which is every
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
  const heroSubtitle = [workFieldLabel(profile?.workField, workFields), profile?.location].filter(Boolean).join(' · ') || null

  const columnWidth = Math.floor((windowWidth - SPACE.gutter * 2 - SPACE.sm) / 2)
  const showDock = !loading && !!profile && ctaMode !== 'self'
  const heroHeight = heroFoldHeight({
    width: windowWidth,
    design: heroHeightFor(windowWidth),
    // The dock's real height, measured: Add friend over Connect makes it taller than any guess.
    dockTop: showDock && dockHeight > 0 && viewport > 0 ? viewport - dockHeight : 0,
    fade: DOCK_FADE,
    // The first block is the one the first view always shows; the fold can only land on one after it.
    tops: Object.values(blockTops).sort((a, b) => a - b).slice(1),
  })

  return (
    <View style={styles.container}>
      {/* First in the tree for the focus order; it draws over the scroll by zIndex. */}
      <ProfileBar
        testID="profile-bar"
        scrollY={scrollY}
        title={loading ? undefined : identity.name}
        overPhoto
        onBack={back}
        actions={ctaMode !== 'self' && profile ? [{ icon: 'ellipsis', label: 'Report or block', onPress: openSafety }] : []}
      />
      <Animated.ScrollView
        testID="profile-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e: LayoutChangeEvent) => setViewport(e.nativeEvent.layout.height)}
        // The fade above the dock is drawn over the page, so the last section clears it too, not only the dock (r7 M2).
        contentContainerStyle={{ paddingBottom: (dockHeight || dockClearance(insets.bottom)) + DOCK_FADE + SPACE.xl }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ProfileSkeleton width={windowWidth} />
        ) : (
          <>
            <ProfileHeroStage
              testID="profile-hero"
              width={windowWidth}
              height={heroHeight}
              scrollY={scrollY}
              photos={revealed ? photos : []}
              blurredUri={blurHero[0] ?? null}
              name={identity.name}
              age={identity.age}
              subtitle={heroSubtitle}
              // The room's seed rule (`markSeed`), never a user id or "Attendee".
              seed={identity.seed}
              anonymous={!revealed}
              onPressPhoto={(i, from) => setViewer({ index: i, from })}
            />

            <View style={styles.canvas}>
              {ctaMode === 'self' ? (
                // D-LM4: your own page, said so, with the way to change it (it read as a stranger's).
                <FoldBlock id="self" onTop={onBlockTop}>
                  <View testID="profile-self" style={styles.self}>
                    <Text style={[font('meta', bold), styles.selfText]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
                      {SELF_PREVIEW}
                    </Text>
                    <Button kind="lit" size="md" icon="pen-line" label="Edit" onPress={() => router.push('/edit-profile')} testID="profile-self-edit" />
                  </View>
                </FoldBlock>
              ) : null}
              {!revealed ? (
                /*
                 * Said plainly rather than left as a screen that looks half-loaded. The absence IS the product working, and a
                 * person who does not know that reads it as a bug.
                 */
                <FoldBlock id="note" onTop={onBlockTop}>
                  <View accessible accessibilityLabel={stillAnonymous(identity.name)} style={styles.note}>
                    <Icon name="eye-off" size={ICON.control} color={COLOR.textPrimary} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noteText]}>{stillAnonymous(identity.name)}</Text>
                  </View>
                </FoldBlock>
              ) : null}

              <ProfileBody
                facts={{
                  bio: profile?.bio,
                  interests: profile?.interests,
                  sharedInterests: profile?.sharedInterests,
                  about: profile?.about,
                  occupation: profile?.occupation,
                  education: profile?.education,
                  photos,
                }}
                badges={badges.length > 0 ? <BadgeRow badges={badges} /> : null}
                columnWidth={columnWidth}
                onPressPhoto={(i, from) => setViewer({ index: i, from })}
                onBlockTop={onBlockTop}
                // Unrevealed, the note above already says why there is little here.
                empty={revealed ? PROFILE_EMPTY : null}
              />
            </View>
          </>
        )}
      </Animated.ScrollView>

      {/* The tray stays put while the bio, interests and gallery scroll beneath it: Like and Connect are in the thumb's reach on any phone. */}
      {showDock ? (
        <ProfileDock
          testID="profile-dock"
          note={incoming ? null : friendRequested ? FRIEND_COPY.requestSentNote : ctaMessage || null}
          onHeight={setDockHeight}
          lead={
            friendLead ? (
              <Button
                kind="lit"
                size="md"
                icon={friendLead.icon}
                label={friendLead.label}
                accessibilityLabel={friendLead.kind === 'add' ? `Add ${heroTitle} as a friend` : `Accept ${heroTitle}’s friend request`}
                // Accepting answers a person who asked you: the press is felt, as a screen's primary is. `H.success` follows on the answer.
                pressHaptic={friendLead.kind === 'accept' ? () => H.primary() : false}
                loading={friendAsk.busy}
                onPress={() => void addFriend()}
                testID="profile-friend"
              />
            ) : null
          }
        >
          {incoming ? (
            <MessageRequestPrompt
              name={heroTitle}
              note={incoming.note}
              answering={answering}
              onAccept={() => void answerRequest('accept')}
              onDecline={() => void answerRequest('decline')}
            />
          ) : (
            <>
            {eventId ? (
              <Button
                kind={liked ? 'lit' : 'primary'}
                // Both dock buttons are 48: a lit action is never 56, and the pair stands level.
                size="md"
                label={liked ? 'Liked' : 'Like'}
                accessibilityLabel={liked ? `Liked ${heroTitle}. You liked them` : `Like ${heroTitle}. They are only told if they like you back`}
                leading={<Glyph name="heart" size={ICON.control} color={liked ? sel.glyph : COLOR.textOnGradient} active={liked} play={liked} />}
                pressHaptic={liked ? false : H.like}
                loading={likeBusy && !liked}
                onPress={handleLike}
                style={styles.flex}
                testID="profile-like"
              />
            ) : null}
            <Button
              kind={ctaLit ? 'lit' : 'secondary'}
              size="md"
              icon={ctaMode === 'connect' ? 'user-plus' : ctaMode === 'message' ? 'message-circle' : undefined}
              label={CTA_LABEL[ctaMode]}
              accessibilityLabel={ctaMode === 'connect' ? `Connect with ${heroTitle}. Sends a message and shows them your name and photo` : undefined}
              disabled={ctaDisabled}
              onPress={ctaMode === 'connect' ? () => setConnectOpen(true) : handleConnect}
              style={styles.flex}
              testID="profile-cta"
            />
            </>
          )}
        </ProfileDock>
      ) : null}

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
        error={connectError}
        onSend={sendConnect}
        onDismiss={() => {
          setConnectOpen(false)
          setConnectError(undefined)
        }}
      />

      <PhotoViewer
        photos={photos}
        initialIndex={viewer?.index ?? 0}
        from={viewer?.from}
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        testID="profile-viewer"
      />

      {/*
        A mutual like made from here. Your side is your pseudonym in that room,
        as the room's own moment draws it; theirs is what this page shows.
      */}
      {/* The Match (D · 4.4): faces only where earned. Yours is your creature here; theirs a photo only if they revealed. */}
      {match ? (
        <MomentMatch
          you={{ kind: 'creature', pseudonym: match.you ?? 'You' }}
          them={revealed && photos[0] ? { kind: 'photo', uri: photos[0] } : { kind: 'creature', pseudonym: heroTitle }}
          name={heroTitle}
          onClose={() => setMatch(null)}
          onSayHi={() => {
            setMatch(null)
            handleConnect()
          }}
          testID="profile-match"
        />
      ) : null}
    </View>
  )
}

/** D-LM4: the line over your own profile, seen as others see it. */
export const SELF_PREVIEW = 'How others see you'

/** Flow 6 `user` 01: the note an unrevealed profile carries above its sections. */
export const stillAnonymous = (name: string) => `${name} hasn’t revealed who they are yet. Connect, talk, and either of you can reveal when you want to.`

/** The frame's shape while it loads (Flow 6 `user` 13), so the page does not jump when it lands: the hero, the name, a line. */
function ProfileSkeleton({ width }: { width: number }) {
  return (
    <View testID="profile-skeleton" accessibilityLabel="Loading profile" accessibilityState={{ busy: true }}>
      <SkeletonBlock width={width} height={heroHeightFor(width)} borderRadius={0} />
      <View style={styles.skeletonLines}>
        <SkeletonBlock width="60%" height={SKELETON_NAME} borderRadius={RADIUS.thumb} />
        <SkeletonLine width="90%" />
      </View>
    </View>
  )
}

/** Flow 6 `user` 13: the name's block is 28 tall. */
const SKELETON_NAME = 28

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  // The frame's column starts 8 under the hero and keeps 28 between sections.
  canvas: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, gap: SECTION_GAP },
  skeletonLines: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.md },
  note: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  noteText: { flex: 1, color: COLOR.textPrimary },
  self: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  selfText: { flexShrink: 1, color: COLOR.textSecondary },
  flex: { flex: 1 },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
function UserProfileContent() {
  return (
    <ScreenProfiler id="attendee">
      <UserProfileInner />
    </ScreenProfiler>
  )
}

/** Your own page tells the screen once it knows (a room handle is only resolved by the load). */
const MarkSelf = createContext<(self: boolean) => void>(() => {})

/** The world: somebody else's page is rose (people); your own is violet (you), as Me's Edit profile is (rc7 D11). */
export const profileHue = (own: boolean): Hue => (own ? 'violet' : 'rose')

/** One hue on this screen (`HueProvider`): rose, or violet when it is yours. */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { user } = useAuth()
  const [self, setSelf] = useState(false)
  // Known at once when the route has your real id; a room handle of yours is known when the load says so.
  const own = self || (!!id && !!user?.id && String(id) === String(user.id))
  return (
    <HueProvider value={profileHue(own)}>
      <MarkSelf.Provider value={setSelf}>
        <UserProfileContent />
      </MarkSelf.Provider>
    </HueProvider>
  )
}
