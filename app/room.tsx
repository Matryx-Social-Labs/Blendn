import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import GroupChat from './chat/[id]'
import MatchScreen from '../components/screens/MatchScreen'
import { RoomVisibilityBanner } from '../components/RoomVisibilityBanner'
import { apiClient } from '../lib/apiClient'
import { Logger } from '../lib/logger'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../lib/theme'

type Segment = 'grid' | 'chat'

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
export default function Room() {
  const [segment, setSegment] = useState<Segment>('grid')
  const [chat, setChat] = useState<{
    id: string
    name?: string
    eventTitle?: string
  } | null>(null)
  const [chatState, setChatState] = useState<'idle' | 'loading' | 'missing'>('idle')
  const [eventId, setEventId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [revealBusy, setRevealBusy] = useState(false)

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
      .getActiveCheckins({ force: true })
      .then((r) => {
        if (cancelled) return
        const active = r.success ? r.data?.checkIns?.[0] : null
        setEventId(active?.eventId ?? null)
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
  const openChat = useCallback(async () => {
    setSegment('chat')
    if (chat || chatState === 'loading' || !eventId) return
    setChatState('loading')
    try {
      const result = await apiClient.getEventChat(eventId)
      const id = result.data?.chatGroupId ?? result.data?.id
      if (result.success && id) {
        setChat({
          id: String(id),
          name: result.data?.chatGroupName ?? result.data?.name,
          eventTitle: result.data?.chatGroupName ?? result.data?.name,
        })
        setChatState('idle')
      } else {
        setChatState('missing')
      }
    } catch (e) {
      Logger.error('match', 'chat group lookup failed', { error: e })
      setChatState('missing')
    }
  }, [chat, chatState, eventId])

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close the room"
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="chevron-down" size={24} color={EMBER.textPrimary} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          The <Text style={styles.titleAccent}>Grid</Text>
        </Text>
        {/* Balances the chevron so the title sits centred without measuring. */}
        <View style={styles.headerSpacer} />
      </View>

      {eventId ? (
        <RoomVisibilityBanner
          revealed={revealed}
          onToggle={() => void toggleReveal()}
          busy={revealBusy}
        />
      ) : null}

      <View style={styles.segments} accessibilityRole="tablist">
        <SegmentButton
          label="Grid"
          selected={segment === 'grid'}
          onPress={() => setSegment('grid')}
        />
        <SegmentButton
          label="Join Chat"
          selected={segment === 'chat'}
          onPress={() => void openChat()}
        />
      </View>

      <View style={styles.body}>
        {/*
          Both segments stay mounted, and only one is shown.

          Unmounting the Grid on every toggle would re-request the roster and
          replay its entry animation, and unmounting the chat would drop the
          socket and lose the draft in the composer. A room is one place you are
          standing in; switching what you are looking at should not reload it.
        */}
        <View style={[styles.pane, segment !== 'grid' && styles.paneHidden]} pointerEvents={segment === 'grid' ? 'auto' : 'none'}>
          <MatchScreen />
        </View>

        <View style={[styles.pane, segment !== 'chat' && styles.paneHidden]} pointerEvents={segment === 'chat' ? 'auto' : 'none'}>
          {chat ? (
            <GroupChat
              chatRoomId={chat.id}
              roomName={chat.name}
              eventTitle={chat.eventTitle}
              embedded
            />
          ) : chatState === 'loading' ? (
            <View style={styles.centred}>
              <ActivityIndicator color={EMBER.accent} />
            </View>
          ) : chatState === 'missing' ? (
            <View style={styles.centred}>
              <Text style={styles.emptyTitle}>No chat for this room</Text>
              <Text style={styles.emptyBody}>
                {eventId
                  ? 'The organiser has not opened a chat for this event.'
                  : 'Check in to an event to join its chat.'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

function SegmentButton({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.segmentOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{label}</Text>
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

  segments: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    // Carried in both states so selecting one does not change its width and
    // re-lay the row — the same rule the onboarding chips learned.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segmentOn: { backgroundColor: EMBER.surface, borderColor: EMBER.accent },
  segmentText: { ...EMBER_TYPE.chip, color: EMBER.textSecondary },
  segmentTextOn: { color: EMBER.textPrimary },

  body: { flex: 1 },
  // Absolute rather than `display: none`, so the hidden pane keeps its layout
  // and the visible one does not re-measure on every toggle.
  pane: { ...StyleSheet.absoluteFillObject },
  paneHidden: { opacity: 0, zIndex: -1 },

  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { ...EMBER_TYPE.cardTitle, fontSize: 18, textAlign: 'center' },
  emptyBody: { ...EMBER_TYPE.meta, textAlign: 'center' },

  pressed: { opacity: 0.6 },
})
