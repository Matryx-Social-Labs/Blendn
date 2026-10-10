import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import ActionTray, { type ActionTrayButton } from '../../components/ActionTray'
import { AppHeader } from '../../components/AppHeader'
import ScalePress from '../../components/motion/ScalePress'
import { useToast } from '../../components/Toast'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient, type VenueDetail } from '../../lib/apiClient'
import { openBlendn } from '../../lib/blendnOverlay'
import { checkOutOf, subscribeCheckInChanged } from '../../lib/checkIn'
import { claimUrlFrom } from '../../lib/claimLink'
import {
  choiceLabel,
  countdownLabel,
  countdownSpoken,
  GO_LIVE_CHOICES,
  liveCountLine,
  oneTapChoice,
  readLiveSession,
  remainingMs,
  venueAction,
  type GoLiveChoice,
} from '../../lib/goLive'
import { tonightLine } from '../../lib/home'
import { Logger } from '../../lib/logger'
import { subscribeToLiveEnded } from '../../lib/socketClient'
import { useGoLive } from '../../lib/useGoLive'
import { serverNow } from '../../lib/serverClock'
import { useAuth } from '../../lib/useAuth'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, OPACITY, SPACE, tint } from '../../lib/theme'

/** Refusals of the page itself that no retry fixes: not onboarded, no known adult age. */
const FINAL_REFUSALS = new Set(['FORBIDDEN', 'AGE_RESTRICTED', 'NOT_FOUND'])

/**
 * A place — PLACEHOLDER DESIGN (plan v2 step 5; docs/PLACEHOLDER_SCREENS.md §10).
 *
 * `GET /api/mobile/venues/:venueId` decides everything here: whether going
 * live would be accepted (`live.open`), why not (`closedReason`), how many are
 * live (a bucket, never a number), and your own window (`expiresAt`, which the
 * countdown reads — never a timer from the tap). Go Live, the hand-off when an
 * event has the place, the room (locked until you are live), and "Own this
 * place? Claim it".
 */
export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [detail, setDetail] = useState<VenueDetail | null>(null)
  const [failed, setFailed] = useState<{ message: string; final: boolean } | null>(null)
  /** The window to repeat in one tap here, or null (`oneTapChoice`, PL-M05). */
  const [lastChoice, setLastChoice] = useState<GoLiveChoice | null>(null)
  const [leaving, setLeaving] = useState(false)

  const [tray, setTray] = useState<{ title: string; message: string; buttons: ActionTrayButton[]; stack?: boolean } | null>(null)
  const closeTray = useCallback(() => setTray(null), [])
  const showTray = useCallback(
    (title: string, message: string, buttons?: ActionTrayButton[]) =>
      setTray({ title, message, buttons: buttons?.length ? buttons : [{ label: 'Done', variant: 'primary', onPress: () => setTray(null) }] }),
    []
  )

  // Only the newest read is the truth: an older one that answers last is dropped (H2).
  const loadSeq = useRef(0)
  const load = useCallback(() => {
    if (!id) return
    const mine = ++loadSeq.current
    apiClient
      .getVenue(id)
      .then((res) => {
        if (mine !== loadSeq.current) return
        if (res.success && res.data) {
          setDetail(res.data)
          setFailed(null)
        } else {
          setFailed({ message: res.error || "This place didn't load.", final: FINAL_REFUSALS.has(res.errorCode ?? '') })
        }
      })
      .catch((error) => {
        if (mine !== loadSeq.current) return
        Logger.warn('events', 'Venue screen load threw', { error: String(error) })
        setFailed({ message: "This place didn't load.", final: false })
      })
  }, [id])

  // On focus, so coming back to it shows the count and your window as they are now.
  useFocusEffect(load)

  // The window to repeat here, from the remembered session: it outlives this screen (PL-M05).
  const readLastChoice = useCallback(() => {
    if (!id) return
    readLiveSession(userId)
      .then((session) => setLastChoice(oneTapChoice(session, id, serverNow())))
      .catch(() => {})
  }, [id, userId])
  useFocusEffect(readLastChoice)

  // Back from the background: the server's window, not a timer iOS suspended (PL-CU02).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load()
    })
    return () => sub.remove()
  }, [load])

  // A Go Live, an extend from the expiry prompt, a check-out anywhere: the window moved.
  useEffect(
    () =>
      subscribeCheckInChanged(() => {
        load()
        readLastChoice()
      }),
    [load, readLastChoice]
  )

  const live = detail?.live
  const venueDayId = live?.venueDayId ?? null
  // Your window ended here — expiry, an event starting, a switch: the server says so.
  useEffect(() => subscribeToLiveEnded((data) => {
    if (data.eventId === venueDayId) load()
  }), [venueDayId, load])

  const place = detail
    ? { id: detail.venue.id, name: detail.venue.name, latitude: detail.venue.latitude, longitude: detail.venue.longitude, address: detail.venue.address }
    : null
  const { goLive, busy } = useGoLive({
    place,
    showTray,
    closeTray,
    onLive: (result) => {
      showToast(`You're live until ${new Date(result.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'success')
      load()
    },
  })

  const choose = (choice: GoLiveChoice) => {
    closeTray()
    void goLive(choice)
  }

  const openSheet = () =>
    setTray({
      title: `Go live at ${detail?.venue.name ?? 'this place'}`,
      message: "While you're live you can see who else is here and join today's room — and they can see you, by your room name. It ends when your time is up.",
      buttons: [
        ...GO_LIVE_CHOICES.map(({ choice, label }) => ({ label, onPress: () => choose(choice) })),
        { label: 'Cancel', onPress: closeTray },
      ],
      stack: true,
    })

  const openRoom = () => {
    if (!detail || !live?.chatGroupId) return
    router.push({
      pathname: '/chat/[id]',
      params: { id: live.chatGroupId, roomName: detail.venue.name, eventTitle: detail.venue.name, venueId: detail.venue.id },
    } as never)
  }

  const stopLive = async () => {
    if (!venueDayId || leaving) return
    setLeaving(true)
    try {
      const res = await checkOutOf(venueDayId)
      if (!res.success) showToast(res.error || "Couldn't stop. Try again.", 'error')
    } catch (error) {
      Logger.warn('events', 'stop live failed', { error: String(error) })
      showToast("Couldn't stop. Try again.", 'error')
    } finally {
      setLeaving(false)
      load()
    }
  }

  // The Blend'n room is hosted by the tab layout: from a pushed screen it would open underneath (H3).
  const seeWhoIsHere = () => {
    router.dismissTo('/(tabs)/events' as never)
    openBlendn()
  }

  const action = live ? venueAction(live) : null
  const countLine = live ? liveCountLine(live.liveNow, live.youAreLive) : null
  const claimUrl = detail && !detail.venue.claimed ? claimUrlFrom(detail.claim) : null
  const tonightEvent = detail?.tonight ?? null
  const tonight = tonightEvent ? tonightLine(tonightEvent) : null
  const handoffTitle = action?.kind === 'handoff' && tonightEvent?.id === action.eventId ? tonightEvent.title : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title={detail?.venue.name ?? 'Place'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <PlaceholderBanner />
        {detail && live && action ? (
          <View style={styles.body}>
            <Text variant="title" accessibilityRole="header">
              {detail.venue.name}
            </Text>
            <Text variant="meta">
              {[detail.venue.venueTypeLabel, detail.venue.address ?? detail.venue.city].filter(Boolean).join(' · ')}
            </Text>

            {action.kind === 'live' ? <LiveCountdown expiresAt={live.expiresAt ?? null} stay={live.stay === true} onZero={load} /> : null}
            {countLine ? <Text variant="bodyStrong">{countLine}</Text> : null}

            {action.kind === 'goLive' ? (
              <ScalePress
                style={styles.primary}
                onPress={lastChoice ? () => choose(lastChoice) : openSheet}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={lastChoice ? `Go live again, ${choiceLabel(lastChoice)}` : 'Go Live'}
                accessibilityState={{ busy, disabled: busy }}
              >
                {busy ? (
                  <ActivityIndicator color={EMBER.onGradient} />
                ) : (
                  <Text variant="button" color={EMBER.onGradient}>
                    {lastChoice ? `Go live again · ${choiceLabel(lastChoice)}` : 'Go Live'}
                  </Text>
                )}
              </ScalePress>
            ) : null}
            {action.kind === 'goLive' && lastChoice ? (
              <Pressable
                onPress={openSheet}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={[styles.quiet, busy && styles.dimmed]}
              >
                <Text variant="meta">Pick another time</Text>
              </Pressable>
            ) : null}

            {action.kind === 'handoff' ? (
              <View style={styles.panel}>
                <Text variant="bodyStrong">{handoffTitle ? `${handoffTitle} has this place now` : 'An event has this place now'}</Text>
                <Text variant="meta">{"Check in to the event to join its room. You can go live here again once it's over."}</Text>
                <ScalePress
                  style={styles.primary}
                  onPress={() => router.push(`/event/${action.eventId}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel="Go to the event"
                >
                  <Text variant="button" color={EMBER.onGradient}>
                    Go to the event
                  </Text>
                </ScalePress>
              </View>
            ) : null}

            {action.kind === 'closed' ? <Text variant="meta">{action.message}</Text> : null}

            <View style={styles.panel}>
              <View style={styles.row}>
                <Ionicons name={action.kind === 'live' ? 'chatbubbles-outline' : 'lock-closed-outline'} size={ICON.md} color={EMBER.textSecondary} />
                <Text variant="bodyStrong">{"Today's room"}</Text>
              </View>
              {action.kind === 'live' ? (
                <>
                  <Text variant="meta">Everyone live here, by their room names. It starts fresh every morning.</Text>
                  <View style={styles.row}>
                    {live.chatGroupId ? (
                      <ScalePress style={styles.secondary} onPress={openRoom} accessibilityRole="button" accessibilityLabel="Open the room">
                        <Text variant="button">Open the room</Text>
                      </ScalePress>
                    ) : null}
                    <ScalePress style={styles.secondary} onPress={seeWhoIsHere} accessibilityRole="button" accessibilityLabel="See who's here">
                      <Text variant="button">{"See who's here"}</Text>
                    </ScalePress>
                  </View>
                  <Pressable onPress={stopLive} disabled={leaving} accessibilityRole="button" style={styles.quiet}>
                    <Text variant="meta">{leaving ? 'Stopping…' : 'Stop being live'}</Text>
                  </Pressable>
                </>
              ) : (
                <Text variant="meta">{"Only people live here can see who's here and join the chat. Go live to get in."}</Text>
              )}
            </View>

            {tonight && tonightEvent ? (
              <ScalePress
                style={styles.panel}
                onPress={() => router.push(`/event/${tonightEvent.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={tonight}
              >
                <Text variant="bodyStrong">{tonight}</Text>
              </ScalePress>
            ) : null}

            {/* Leaves the app on purpose: the app refuses venue accounts, the claim page needs none (§7). */}
            {claimUrl ? (
              <Pressable
                testID="claim-venue-link"
                onPress={() => Linking.openURL(claimUrl).catch(() => showToast("That page didn't open. Try again.", 'error'))}
                accessibilityRole="link"
                accessibilityLabel="Own this place? Claim it"
                accessibilityHint="Opens the Blend'n dashboard in your browser"
                style={styles.claimRow}
              >
                <Text variant="meta">
                  Own this place? <Text variant="meta" color={EMBER.textPrimary} style={styles.underline}>Claim it</Text>
                </Text>
                <Ionicons name="open-outline" size={ICON.sm} color={EMBER.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ) : failed ? (
          <View style={styles.body} accessibilityLiveRegion="polite">
            <Text variant="heading">{failed.message}</Text>
            {failed.final ? null : (
              <ScalePress style={styles.panel} onPress={load} accessibilityRole="button" accessibilityLabel="Try again">
                <Text variant="bodyStrong">Try again</Text>
              </ScalePress>
            )}
          </View>
        ) : (
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading the place" />
        )}
      </ScrollView>
      <ActionTray
        visible={tray !== null}
        title={tray?.title ?? ''}
        message={tray?.message}
        buttons={tray?.buttons ?? []}
        onClose={closeTray}
        layout={tray?.stack ? 'stack' : 'row'}
        // Four windows and Cancel: at the default height Cancel sat below the fold (drive, 2026-10-09).
        size={tray?.stack ? 'expanded' : 'default'}
      />
    </SafeAreaView>
  )
}

/** At zero with the server still saying live, ask again this often (M10). */
const ZERO_RETRY_MS = 3_000

/**
 * The pill and its countdown, a leaf: it ticks itself, once a second and only
 * while the screen is focused, so the place screen above it does not re-render
 * every second (L1). The clock is the server's (`serverNow`, M10); at zero it
 * asks the server (`onZero`) every few seconds until the window is gone.
 */
function LiveCountdown({ expiresAt, stay, onZero }: { expiresAt: string | null; stay: boolean; onZero: () => void }) {
  const focused = useIsFocused()
  const [now, setNow] = useState(serverNow)
  const left = remainingMs(expiresAt, now) ?? 0
  useEffect(() => {
    if (!focused || stay) return
    const timer = setTimeout(() => {
      if (left === 0) onZero()
      setNow(serverNow())
    }, left === 0 ? ZERO_RETRY_MS : 1000)
    return () => clearTimeout(timer)
  }, [focused, stay, left, now, onZero])

  return (
    <View
      style={styles.livePill}
      accessible
      accessibilityRole="text"
      accessibilityLabel={stay ? 'Live here, staying' : `Live here. ${countdownSpoken(left)}`}
    >
      <View style={styles.liveDot} />
      <Text variant="label" color={EMBER.onGradient}>
        {stay ? 'LIVE · STAYING' : `LIVE · ${countdownLabel(left)} left`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xl },
  body: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md,
    minHeight: CONTROL.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  liveDot: { width: SPACE.sm, height: SPACE.sm, borderRadius: EMBER_RADIUS.pill, backgroundColor: EMBER.onGradient },
  primary: {
    minHeight: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
  },
  secondary: {
    minHeight: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: tint(EMBER.textPrimary, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  quiet: { minHeight: CONTROL.md, justifyContent: 'center', alignSelf: 'flex-start' },
  dimmed: { opacity: OPACITY.disabled },
  panel: {
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: EMBER.surfaceSunken,
  },
  claimRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, alignSelf: 'flex-start', minHeight: CONTROL.md },
  underline: { textDecorationLine: 'underline' },
})
