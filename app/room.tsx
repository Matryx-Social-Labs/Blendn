import { ScreenProfiler } from '../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, useReducedMotion, withTiming } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import MatchScreen from '../components/screens/MatchScreen'
import { fadeInFast } from '../components/motion/presence'
import { NotificationBell } from '../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../components/pulse/PulseTopBar'
import { RoomVisibilityBanner } from '../components/RoomVisibilityBanner'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { checkOutOf } from '../lib/checkIn'
import { revealReadiness } from '../lib/reveal'
import { useAuth } from '../lib/useAuth'
import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'

const REVEAL_FAILED = "Couldn't change who can see you. Nothing has changed."

/*
 * What arrives once the room is known.
 *
 * The title paints at once; the banner, the count line and the bar's two
 * controls wait on the check-in lookup and the roster. They used to appear in
 * one frame a beat later, which reads as the screen jumping. Now they fade in
 * rising 8pt (220ms, strong ease-out), and the two bar controls just fade, as
 * the small-control preset does everywhere else.
 *
 * No haptic. Opening the room is not the moment you arrived: checking in is,
 * and that happens on the Pulse. A tick here would fire on every open.
 *
 * Reduce Motion: fade only.
 */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const arriveFade = FadeIn.duration(220).easing(EASE_OUT)
const arrive = () => {
  'worklet'
  const t = { duration: 220, easing: EASE_OUT }
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: {
      opacity: withTiming(1, t),
      transform: [{ translateY: withTiming(0, t) }],
    },
  }
}


/**
 * The Room — what the Blend'n button in the middle of the bar opens.
 *
 * Frame `1141:4951` draws a `Grid | Join Chat` toggle at the top of this screen,
 * and that toggle is the whole architecture: one destination, two views of the
 * same room. Who is here, and what they are saying.
 *
 * ## Why this is a screen and not a tab
 *
 * `MatchScreen` used to sit behind a permanent **Match** tab, where it rendered
 * "Not Checked In Yet" almost every time anyone looked at it — a quarter of the
 * navigation spent on a screen that says *come back when you are somewhere
 * else*. The room is a mode, not a place, so it hangs off a control that knows
 * whether the mode is active. See `docs/NAVIGATION.md`.
 *
 * ## Matchmaking is not a third segment
 *
 * It **is** the Grid. The ranking, the shared-interest chips and the "both open
 * to dating" tag are matchmaking output, computed server-side and already
 * rendered on the cards — along with the like button, which is the mechanic
 * itself.
 *
 * ## The banner is not optional
 *
 * `RoomVisibilityBanner` says whether you are in this room under your own name
 * or a pseudonym, for as long as you are in it. It is one of the three
 * safeguards that make offering the named option safe at all, and until now it
 * was built and rendered nowhere. It sits above the toggle so it is on screen in
 * both segments: being named in the chat is the same exposure as being named in
 * the Grid.
 */
function RoomInner() {
  const [chatState, setChatState] = useState<'idle' | 'loading' | 'missing'>('idle')
  const [eventId, setEventId] = useState<string | null>(null)
  const [eventTitle, setEventTitle] = useState<string | null>(null)
  const [rosterCount, setRosterCount] = useState(0)

  /*
   * Is there anything to reveal?
   *
   * `User.image` mirrors `photos[0]` and is written only by the profile PUT, so
   * it is the same photo a reveal would show — the argument `events.tsx` already
   * makes where it feeds the check-in warning. Without this the banner offered a
   * switch that changed nothing anybody could see.
   */
  const { user } = useAuth()
  const readiness = revealReadiness({
    name: user?.name,
    // `image` is what /auth/session and (now) sign-in return; the stored copy
    // from an older sign-in has only `profile.photos`. Either is the photo a
    // reveal would show. Driven: a person with a photo was told to add one.
    photos: user?.image ? [user.image] : user?.profile?.photos ?? [],
  })
  const [revealed, setRevealed] = useState(false)
  const [revealBusy, setRevealBusy] = useState(false)
  /*
   * "Show online status" off means counted and not listed (SCRUM-141) — the
   * roster and the grid leave you out. Read from the profile, which returns
   * the setting to its owner only, so the banner can say so rather than
   * leaving someone to wonder why nobody likes them.
   */
  const [listed, setListed] = useState(true)
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    apiClient
      .getProfile(user.id)
      .then((r) => {
        if (!cancelled && r.success) setListed(r.data?.profile?.show_online !== false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.id])
  const [checkOutBusy, setCheckOutBusy] = useState(false)
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  const entering = reduceMotion ? arriveFade : arrive

  /*
   * Which room, from the server rather than from navigation.
   *
   * The button that opens this screen knows the event id, but it is not passed
   * as a param on purpose: someone can be checked out from another device, or
   * by the presence monitor, between the tap and this mount. Asking makes the
   * screen right rather than consistent with a stale tap.
   */
  useEffect(() => {
    let cancelled = false
    apiClient
      /*
       * Cached. `MatchScreen` mounts in the same pass and asks for the same
       * thing, so `queuedRequest`'s in-flight dedupe collapses the two into one
       * request -- but forcing made that one request bypass a live SWR cache,
       * which is a round trip before the room can name itself.
       */
      .getActiveCheckins()
      .then((r) => {
        if (cancelled) return
        const active = r.success ? r.data?.checkIns?.[0] : null
        setEventId(active?.eventId ?? null)
        setEventTitle(active?.event?.title ?? null)
        setRevealed(active?.revealed === true)
      })
      .catch((e) => Logger.warn('match', 'active check-in lookup failed', { error: e }))
    return () => {
      cancelled = true
    }
  }, [])

  /*
   * The chat group, resolved once and only when the chat segment is first
   * opened.
   *
   * Lazily because most visits to this screen are to look at who is here. The
   * Grid is the landing segment, and fetching a chat group nobody asked for
   * would put a request on the wire at the busiest moment of the night.
   */
  /*
   * Join Chat goes to the room, rather than swapping a pane underneath.
   *
   * This screen used to hold both views mounted and hide one. The reasoning was
   * that a room is one place you are standing in — but it meant the event chat
   * existed twice: once embedded here and once at `app/chat/[id]`, with one
   * socket subscription, one moderation path and one composer duplicated across
   * both. Two mounts of a live room is where subscription leaks live.
   *
   * So the toggle is a door. The Grid keeps its state because it is still
   * mounted underneath; the chat is the screen that already exists.
   */
  const openChat = useCallback(async () => {
    if (chatState === 'loading' || !eventId) return
    setChatState('loading')
    try {
      const result = await apiClient.getEventChat(eventId)
      const id = result.data?.chatGroupId ?? result.data?.id
      if (result.success && id) {
        setChatState('idle')
        /*
         * `replace`, not `push`. This screen is presented as a modal, and on
         * iOS a card pushed after a modal goes onto the stack *underneath* it:
         * the chat mounted, fetched its history, and stayed hidden behind the
         * Grid, so Join Chat read as a dead button and closing the room then
         * took two taps. Driven 2026-09-13. Replacing dismisses the room and
         * shows the chat; the room is one tap away on the centre button.
         */
        router.replace({
          pathname: '/chat/[id]',
          params: {
            id: String(id),
            roomName: result.data?.chatGroupName ?? result.data?.name ?? 'Event chat',
            eventTitle: result.data?.chatGroupName ?? result.data?.name ?? '',
          } as never,
        })
      } else {
        setChatState('missing')
      }
    } catch (e) {
      Logger.error('match', 'chat group lookup failed', { error: e })
      setChatState('missing')
    }
  }, [chatState, eventId])

  /*
   * Flipping your visibility, from inside the room it applies to.
   *
   * Optimistic, and rolled back on failure. The banner is the only always-on
   * statement of which state you are in, so it must never show one thing while
   * the server holds the other — being told you are anonymous when you are named
   * is the one failure this whole safeguard exists to prevent.
   *
   * `rememberReveal` is deliberately absent. This is a decision about *this*
   * room; the profile default is a separate question asked on a settings screen,
   * and quietly writing it from here would make one tap at one event change how
   * somebody enters every future one.
   */
  const toggleReveal = useCallback(async () => {
    if (!eventId || revealBusy) return
    const next = !revealed
    setRevealBusy(true)
    setRevealed(next)
    try {
      const result = await apiClient.setMatchPreferences(eventId, { revealed: next })
      if (!result.success) {
        setRevealed(!next)
        Logger.warn('match', 'reveal toggle refused', { error: result.error })
        showToast(result.error || REVEAL_FAILED, 'error')
      } else if (typeof result.data?.revealed === 'boolean') {
        // The server's answer wins over the optimistic one.
        setRevealed(result.data.revealed)
      }
    } catch (e) {
      setRevealed(!next)
      Logger.error('match', 'reveal toggle failed', { error: e })
      showToast(REVEAL_FAILED, 'error')
    } finally {
      setRevealBusy(false)
    }
  }, [eventId, revealed, revealBusy, showToast])

  /*
   * Leaving the room.
   *
   * This lives here because the Pulse's "You're checked in" strip — which
   * carried the only one-tap check out — is gone, replaced by the ring on the
   * Blend'n button. The strip cost a third of the first screen to say one thing;
   * the ring says it for free. But the check out inside it was real, so it
   * moved rather than vanished, and this is the screen that button now opens.
   *
   * No confirmation. Checking out ends your *presence* — it drops you off the
   * Grid and out of the headcount — and presence is reversible: walk back in and
   * check in again. It does not touch attendance, so the event chat you have
   * already joined stays writable either way (`mayWriteToRoom` on the server is
   * deliberately keyed on membership, not on being inside the fence).
   *
   * `router.back()` only on success. Closing the screen first would be a lie
   * about a request that might still fail, and the failure worth catching is the
   * one where somebody believes they left a roster they are still on.
   */
  const checkOut = useCallback(async () => {
    if (!eventId || checkOutBusy) return
    setCheckOutBusy(true)
    try {
      // `checkOutOf` also forgets the roster: leaving the venue ends your claim
      // on it, so reopening must not repaint the room you just left.
      const result = await checkOutOf(eventId)
      if (result.success) {
        router.back()
      } else {
        Logger.warn('presence', 'check out refused', { error: result.error })
        showToast(result.error || "Couldn't check you out. You're still in this room.", 'error')
      }
    } catch (e) {
      Logger.error('presence', 'check out failed', { error: e })
      showToast("Couldn't check you out. You're still in this room.", 'error')
    } finally {
      setCheckOutBusy(false)
    }
  }, [eventId, checkOutBusy, showToast])

  return (
    /*
      `edges` drops 'top' because `PulseTopBar` is an *overlay*: it draws over
      the content at absolute position, the way it does on the Pulse and the
      Scene. Letting the safe area inset the whole screen as well would push
      everything down twice, and offsetting the content below is what the bar
      expects -- without it the page heading renders underneath the bar.
    */
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/*
        The same bar as the Pulse, the Scene and the Banter — frame `1141:5129`
        is that component, and it carries the wordmark rather than a screen name.
        The dismiss lives in the leading slot because this is presented as a
        sheet.

        The frame sets the wordmark at 24/32; the shared bar is 16/24. The bar
        wins: the whole point of it being shared is that it does not vary per
        screen, and one frame drawing it larger is a variance to raise with the
        designer, not to fork the component over.
      */}
      <PulseTopBar
        /*
          Zero, because this screen is a `presentation: 'modal'` sheet: iOS has
          already dropped it below the notch, and the shared inset would be a
          second one. See `topInset` on the bar.
        */
        topInset={0}
        leading={
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close the room"
            hitSlop={12}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="chevron-down" size={ICON.lg} color={EMBER.textPrimary} />
          </Pressable>
        }
        actions={
          <>
            {/*
              Only once the room is known. Before the check-in lookup lands
              there is nothing to check out *of*, and a live-looking control
              that no-ops is worse than one that arrives a moment late.
            */}
            {eventId ? (
              <Animated.View entering={fadeInFast}>
                <Pressable
                  onPress={() => void checkOut()}
                  disabled={checkOutBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Check out of this event"
                  accessibilityHint="Removes you from the Grid. You can check in again while you are here."
                  accessibilityState={{ disabled: checkOutBusy }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.checkOut, pressed && styles.pressed]}
                >
                  {checkOutBusy ? (
                    <ActivityIndicator size="small" color={EMBER.textSecondary} />
                  ) : (
                    <Text style={styles.checkOutText} maxFontSizeMultiplier={1.2}>
                      Check out
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            ) : null}
            {/*
              The room's own settings. `NAVIGATION.md` calls
              `event-preferences/[eventId]` "the room's own settings, reachable
              from the Grid", and it has been reachable from nothing since it
              was written — `DESIGN_HANDOFF.md` calls it "the single most
              important new screen".

              Here rather than on the banner below, deliberately. The banner's
              rule is that "the action is the opposite state, not a settings
              link"; hanging a second target off it would both break that and
              put two controls for one concept in one row. A settings affordance
              in the bar is the thing the banner is not.
            */}
            {eventId ? (
              <Animated.View entering={fadeInFast}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/event-preferences/[eventId]',
                      params: { eventId } as any,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Settings for this room"
                  accessibilityHint="Set why you are here tonight, and whether people can see your name"
                  hitSlop={12}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Ionicons name="options-outline" size={ICON.lg} color={EMBER.textPrimary} />
                </Pressable>
              </Animated.View>
            ) : null}
            <NotificationBell />
          </>
        }
      />

      {/*
        Frame `1141:4954`: the display title over a body line that names the
        count and the event — the count is the
        reason to look, and the event name is set in primary because that is the
        part that changes. The Room's one accent is the Like on every card.
      */}
      <View style={[styles.pageHead, { paddingTop: TOP_BAR_HEIGHT + SPACE.sm }]}>
        <Text style={styles.pageTitle} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          The Grid
        </Text>
        {/*
          Only once both halves are real. "0 people at undefined" is worse than
          no subtitle, and the count arrives a moment after the title does.
        */}
        {eventTitle && rosterCount > 0 ? (
          <Animated.Text style={styles.pageSubtitle} maxFontSizeMultiplier={1.3} entering={entering}>
            {`${rosterCount} ${rosterCount === 1 ? 'person' : 'people'} at `}
            <Text style={styles.pageSubtitleEvent}>{eventTitle}</Text>
          </Animated.Text>
        ) : null}
      </View>

      {eventId ? (
        <Animated.View style={styles.banner} entering={entering}>
          <RoomVisibilityBanner
            revealed={revealed}
            onToggle={() => void toggleReveal()}
            busy={revealBusy}
            canReveal={readiness.ok}
            missing={readiness.missing}
            listed={listed}
            onUnhide={() => router.push('/settings')}
          />
        </Animated.View>
      ) : null}

      <View style={styles.segments}>
        <View style={styles.segmentTrack} accessibilityRole="tablist">
        {/*
          Grid is where you are; Join Chat is a door. Kept as a segmented pair
          because the frame draws it that way and the two are the room's two
          halves — but only one of them is a place this screen renders.
        */}
        <SegmentButton label="Grid" selected onPress={() => {}} />
        <SegmentButton
          label="Join Chat"
          selected={false}
          busy={chatState === 'loading'}
          onPress={() => void openChat()}
        />
        </View>
      </View>

      {/*
        The lookup failed, so the door did not open.
        
        Rendered rather than swallowed: without it the toggle is a control that
        sometimes does nothing, which reads as the app being broken rather than
        as the room not being ready. The chat is created on first check-in, so
        the honest cause is almost always "nobody has opened it yet".
      */}
      {chatState === 'missing' ? (
        <Text style={styles.chatMissing} maxFontSizeMultiplier={1.4}>
          The chat for this event is not open yet.
        </Text>
      ) : null}

      <View style={styles.body}>
        <MatchScreen onRosterCount={setRosterCount} />

      </View>
    </SafeAreaView>
  )
}

function SegmentButton({
  label,
  selected,
  busy,
  onPress,
}: {
  label: string
  selected: boolean
  /** Resolving the chat group before navigating. */
  busy?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      /*
       * `tab` even though Join Chat navigates: it reads as a tab, it is drawn as
       * a tab, and telling a screen reader it is a button would describe the
       * pixels rather than the control. The label carries the consequence.
       */
      accessibilityRole="tab"
      accessibilityState={{ selected, busy }}
      accessibilityLabel={selected ? label : `${label}. Opens the event chat`}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentOn,
        (pressed || busy) && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={EMBER.textSecondary} />
      ) : (
        <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },

  /*
   * Frame `1141:4959`: the pair is a pill, centred, not two full-width segments.
   *
   * `surfaceSunken` around the buttons and `surface` on the selected one — so
   * the unselected side is a hole in the track rather than a second button,
   * and the selected one stands out by fill alone, no shadow. Content-width, because two 32pt-padded
   * labels are narrower than the screen and stretching them would make the
   * track read as a tab bar.
   */
  segments: { alignItems: 'center', paddingVertical: SPACE.md },
  segmentTrack: {
    flexDirection: 'row',
    padding: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  // Frame `1141:4961`: `px-32`; its `#2d2c2c` snaps to `surface`.
  segment: {
    minHeight: CONTROL.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xxl,
    paddingVertical: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
  },
  // The design system's selected segment: a `textPrimary` fill with `bg` text.
  segmentOn: {
    backgroundColor: EMBER.textPrimary,
  },
  // Secondary when not selected; the filled pill carries the state.
  segmentText: { ...TYPE.bodyStrong, color: EMBER.textSecondary },
  segmentTextOn: { color: EMBER.bg },

  /*
   * Quiet, and next to the bell rather than in the page.
   *
   * A `surface` pill with secondary text, not an accent one: leaving is the
   * least interesting thing you can do in a room you just walked into, and the
   * Room's one accent is spent on the Like on every card.
   */
  checkOut: {
    minHeight: CONTROL.sm,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  checkOutText: { ...TYPE.button, color: EMBER.textSecondary },

  body: { flex: 1 },


  // The heading block sits on the gutter.
  // `paddingTop` is applied inline — it depends on the notch and the overlay bar.
  pageHead: { paddingHorizontal: GUTTER, paddingBottom: SPACE.lg, gap: SPACE.sm },
  pageTitle: { ...TYPE.display },
  // The banner is a card, so it sits inside the gutter like the heading above it.
  banner: { marginHorizontal: GUTTER },
  // The event name steps up to primary; the Room's one accent is the Like on every card.
  pageSubtitle: { ...TYPE.body, color: EMBER.textSecondary },
  pageSubtitleEvent: { color: EMBER.textPrimary },
  chatMissing: {
    ...TYPE.meta,
    paddingHorizontal: GUTTER,
    paddingBottom: SPACE.sm,
    color: EMBER.textTertiary,
  },
  pressed: { opacity: 0.6 },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function Room() {
  return (
    <ScreenProfiler id="room-grid">
      <RoomInner />
    </ScreenProfiler>
  )
}
