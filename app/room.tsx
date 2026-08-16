import { ScreenProfiler } from '../lib/perf'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import MatchScreen from '../components/screens/MatchScreen'
import { NotificationBell } from '../components/pulse/NotificationBell'
import { PulseTopBar, TOP_BAR_HEIGHT } from '../components/pulse/PulseTopBar'
import { RoomVisibilityBanner } from '../components/RoomVisibilityBanner'
import { apiClient } from '../lib/apiClient'
import { forgetRoster } from '../lib/rosterMemory'
import { Logger } from '../lib/logger'
import { EMBER, EMBER_FONTS, EMBER_RADIUS, EMBER_TYPE } from '../lib/theme'


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
  const [revealed, setRevealed] = useState(false)
  const [revealBusy, setRevealBusy] = useState(false)
  const [checkOutBusy, setCheckOutBusy] = useState(false)

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
        router.push({
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
      } else if (typeof result.data?.revealed === 'boolean') {
        // The server's answer wins over the optimistic one.
        setRevealed(result.data.revealed)
      }
    } catch (e) {
      setRevealed(!next)
      Logger.error('match', 'reveal toggle failed', { error: e })
    } finally {
      setRevealBusy(false)
    }
  }, [eventId, revealed, revealBusy])

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
      const result = await apiClient.checkOut(eventId)
      if (result.success) {
        // Leaving the venue ends your claim on the roster, so the memory of it
        // goes too -- otherwise reopening would repaint the room you just left.
        forgetRoster(eventId)
        router.back()
      }
      else Logger.warn('presence', 'check out refused', { error: result.error })
    } catch (e) {
      Logger.error('presence', 'check out failed', { error: e })
    } finally {
      setCheckOutBusy(false)
    }
  }, [eventId, checkOutBusy])

  return (
    /*
      `edges` drops 'top' because `PulseTopBar` is an *overlay*: it draws over
      the content at absolute position, the way it does on the Pulse and the
      Scene. Letting the safe area inset the whole screen as well would push
      everything down twice, and offsetting the content below is what the bar
      expects -- without it the page heading renders behind the blur.
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
            <Ionicons name="chevron-down" size={20} color={EMBER.textPrimary} />
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
            ) : null}
            <NotificationBell />
          </>
        }
      />

      {/*
        Frame `1141:4954`: Plus Jakarta ExtraBold 36/40 tracking -1.8, over a
        Manrope 18/28 line that names the count and the event — the count is the
        reason to look, and the accent falls on the event because that is the
        part that changes.
      */}
      <View style={[styles.pageHead, { paddingTop: TOP_BAR_HEIGHT + 8 }]}>
        <Text style={styles.pageTitle} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          The Grid
        </Text>
        {/*
          Only once both halves are real. "0 people at undefined" is worse than
          no subtitle, and the count arrives a moment after the title does.
        */}
        {eventTitle && rosterCount > 0 ? (
          <Text style={styles.pageSubtitle} maxFontSizeMultiplier={1.3}>
            {`${rosterCount} ${rosterCount === 1 ? 'person' : 'people'} at `}
            <Text style={styles.pageSubtitleAccent}>{eventTitle}</Text>
          </Text>
        ) : null}
      </View>

      {eventId ? (
        <RoomVisibilityBanner
          revealed={revealed}
          onToggle={() => void toggleReveal()}
          busy={revealBusy}
        />
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
        <ActivityIndicator size="small" color={EMBER.accent} />
      ) : (
        <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { ...EMBER_TYPE.cardTitle, fontSize: 22 },
  titleAccent: { color: EMBER.accent },
  headerSpacer: { width: 24 },

  /*
   * Frame `1141:4959`: the pair is a pill, centred, not two full-width segments.
   *
   * `#211F1F` at `p-6` around the buttons, with an inset shadow — so the
   * unselected side is a hole in the track rather than a second button, and
   * only the selected one is raised. Content-width, because two 32pt-padded
   * labels are narrower than the screen and stretching them would make the
   * track read as a tab bar.
   */
  segments: { alignItems: 'center', paddingVertical: 12 },
  segmentTrack: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  // Frame `1141:4961`: `px-32 py-8`, `#2d2c2c`, raised.
  segment: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 8,
    borderRadius: EMBER_RADIUS.pill,
  },
  segmentOn: {
    backgroundColor: '#2D2C2C',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  // Frame `1141:4963`: Manrope Bold 14/20, accent when selected, `#AEAAAA` when not.
  segmentText: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },
  segmentTextOn: { color: EMBER.accent },

  /*
   * Quiet, and next to the bell rather than in the page.
   *
   * A secondary-coloured pill on the surface, not an accent one: leaving is the
   * least interesting thing you can do in a room you just walked into, and the
   * warm palette is spent on the reveal toggle and the segments, which are the
   * two decisions worth making here.
   */
  checkOut: {
    minHeight: 32,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
  },
  checkOutText: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: EMBER.textSecondary,
  },

  body: { flex: 1 },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { ...EMBER_TYPE.cardTitle, fontSize: 18, textAlign: 'center' },
  emptyBody: { ...EMBER_TYPE.meta, textAlign: 'center' },

  // Frame `1141:4953`: the heading block sits 12 in from the page edge.
  // `paddingTop` is applied inline — it depends on the notch and the overlay bar.
  pageHead: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  // Frame `1141:4956`: Plus Jakarta ExtraBold 36/40, tracking -1.8.
  pageTitle: {
    fontFamily: EMBER_FONTS.displayExtraBold,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.8,
    color: EMBER.textPrimary,
  },
  // Frame `1141:4958`: Manrope Regular 18/28, the event in `#FF6D8D`.
  pageSubtitle: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 18,
    lineHeight: 28,
    color: EMBER.textSecondary,
  },
  pageSubtitleAccent: { color: EMBER.gradientTo },
  chatMissing: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
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
