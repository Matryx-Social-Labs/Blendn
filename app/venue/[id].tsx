import { barHeight, barTop } from '../../lib/barGeometry'
import * as Clipboard from 'expo-clipboard'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AmenityGrid } from '../../components/ds/AmenityTile'
import { GoLiveSheet, type GoLiveChoice as DialChoice } from '../../components/ds/GoLiveSheet'
import { IconButton } from '../../components/ds/IconButton'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { Sheet, type SheetAction } from '../../components/ds/Sheet'
import { SessionSheet } from '../../components/ds/SessionSheet'
import { announceOutcome, font, useBoldText } from '../../components/ds/shared'
import { useToast } from '../../components/Toast'
import { UpcomingSheet } from '../../components/venue/UpcomingSheet'
import { VenueDock } from '../../components/venue/VenueDock'
import { PAGE_WASH, PageWash } from '../../components/ui/GradientFill'
import { Material } from '../../components/ui/Material'
import { VenueHero, VENUE_HERO_HEIGHT } from '../../components/venue/VenueHero'
import { VenueRegulars } from '../../components/venue/VenueRegulars'
import {
  About,
  BoardRow,
  ClaimLine,
  EventOnCard,
  LiveCard,
  Section,
  TonightHere,
  UpcomingList,
  Where,
  WhosHere,
} from '../../components/venue/VenueSections'
import { VenueGateScreen, VenueSkeleton } from '../../components/venue/VenueStates'
import { apiClient, type VenueDetail } from '../../lib/apiClient'
import { openBlendn } from '../../lib/blendnOverlay'
import { checkOutOf, subscribeCheckInChanged } from '../../lib/checkIn'
import { claimUrlFrom } from '../../lib/claimLink'
import { COLOR, FONT_FAMILY, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { EXTEND_CHOICE, oneTapChoice, readLiveSession, venueAction, type GoLiveChoice } from '../../lib/goLive'
import { type ShowTray, type TrayButton, type TrayExtra } from '../../lib/locationFix'
import { Logger } from '../../lib/logger'
import { openInMaps } from '../../lib/openInMaps'
import { openTonight } from '../../lib/paywall'
import { guestTypeLabel, placeArea } from '../../lib/placesPane'
import { usePlusStatus } from '../../lib/plus'
import { idParam } from '../../lib/routeParams'
import { serverNow } from '../../lib/serverClock'
import { venueTarget } from '../../lib/shareEvent'
import { openShare } from '../../lib/shareTray'
import { subscribeToLiveEnded } from '../../lib/socketClient'
import { useAuth } from '../../lib/useAuth'
import { useGoLive } from '../../lib/useGoLive'
import { useLatest } from '../../lib/useLatest'
import { useSessionTime } from '../../lib/useSessionTime'
import {
  apiChoice,
  boardEventId,
  dialChoice as toDialChoice,
  dockMode,
  goodToKnow,
  liveToast,
  kmParam,
  sheetRefusal,
  type SheetRefusal,
  upcomingCount,
  upcomingRows,
  venueGate,
  venueHero,
  venueTiles,
  washColor,
  type VenueGate,
} from '../../lib/venuePage'

type SheetKind = 'dial' | 'session' | 'leave' | 'claim' | 'upcoming'
type Tray = { visible: boolean; title: string; message: string; buttons: TrayButton[]; extra?: TrayExtra }

/** The shield under the status bar and the back button fades in as the rows reach it. */
const DEFAULT_DOCK = SIZE.primary + SPACE.xxxl
/** The dial's exit is ~220 ms; if iOS never reports it gone, what waited for it starts anyway. */
const DIAL_GONE_FALLBACK_MS = 800

/**
 * A place (fullpages.js `venue`, places.js `venue`, Flow 11, Flow 13 · 13.4).
 *
 * `GET /api/mobile/venues/:venueId` decides everything here: whether going
 * live would be accepted (`live.open`), why not (`closedReason`), how many are
 * live (a bucket, never a number), and your own window (`expiresAt`, which the
 * clock counts down from, never a timer from the tap). A field the server does
 * not send yet is a tile, a section or a line that is not drawn (docs/PLACES.md).
 *
 * The hero is tonight's cover, else the type's plate. The dock holds one slot:
 * Go live (a dial, then the hold), Go live again in one tap, the live pill with
 * Open the room and Leave, the hand-off to an event's check-in, or the server's
 * sentence. The check-in area is never drawn, in any state. The room, Who's
 * here and the people are for the people live here; the claim link is the
 * server's, quiet, and leaves the app.
 */
export default function VenueRoute() {
  const params = useLocalSearchParams<{ id?: string; km?: string }>()
  const id = idParam(params.id)
  if (!id) return <MissingPlace />
  return <VenueScreen id={id} km={kmParam(params.km)} />
}

/** The platform's own back glyph, as every bar draws it (Material: the arrow; iOS: the chevron). */
const backIcon = () => (Platform.OS === 'android' ? 'arrow-left' : 'chevron-left')

const finishSetup = () => router.push('/edit-profile' as never)

function MissingPlace() {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.screen}>
      <View style={[styles.controls, { top: barTop(insets.top) }]}>
        <IconButton icon={backIcon()} tier="control" accessibilityLabel="Back" onPress={() => router.back()} testID="venue-back" />
      </View>
      <VenueGateScreen gate={{ kind: 'notFound' }} onRetry={() => {}} onBack={() => router.back()} onFinish={finishSetup} />
    </View>
  )
}

/** The session sheet, ticking on its own: the page above it does not re-render with the clock. */
function SessionHost(props: {
  live: VenueDetail['live']
  venue: string
  visible: boolean
  confirmFirst: boolean
  extended: boolean
  extending: boolean
  ending: boolean
  onClose: () => void
  onExtend: () => void
  onEnd: () => void
  onZero: () => void
}) {
  const time = useSessionTime(props.live, props.onZero)
  return (
    <SessionSheet
      visible={props.visible}
      onClose={props.onClose}
      venue={props.venue}
      time={time}
      extended={props.extended}
      extending={props.extending}
      ending={props.ending}
      onExtend={props.onExtend}
      onEnd={props.onEnd}
      startConfirming={props.confirmFirst}
    />
  )
}

function directionsTo(detail: VenueDetail) {
  openInMaps({ latitude: detail.venue.latitude, longitude: detail.venue.longitude, address: detail.venue.address, venue_name: detail.venue.name }).catch(() => {})
}

function VenueScreen({ id, km }: { id: string; km: number | null }) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const { showToast } = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { status: plus } = usePlusStatus()
  const [detail, setDetail] = useState<VenueDetail | null>(null)
  const [gate, setGate] = useState<VenueGate | null>(null)
  /** The window to repeat in one tap here, or null (`oneTapChoice`, PL-M05). */
  const [lastChoice, setLastChoice] = useState<GoLiveChoice | null>(null)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const sheetRef = useLatest(sheet)
  const [dial, setDial] = useState<DialChoice>(20)
  const [tray, setTray] = useState<Tray | null>(null)
  /** The refusal the Go Live sheet is showing in place of the dial, or null. */
  const [refusal, setRefusal] = useState<SheetRefusal | null>(null)
  /** The window Go Live was last asked for, for "Try again" on a weak fix or a lost answer. */
  const lastAsked = useRef<GoLiveChoice | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [extending, setExtending] = useState(false)
  const [extended, setExtended] = useState(false)
  const [dockHeight, setDockHeight] = useState(DEFAULT_DOCK)
  // One value for the screen's life; a lazy state, so nothing reads a ref while rendering.
  const [scrollY] = useState(() => new Animated.Value(0))
  // Whether the rows have reached the status bar: the bar's glass is mounted then, never faded (glass fades wrong, §5.2).
  const [underBar, setUnderBar] = useState(false)
  /** What waits for the dial to leave: iOS drops a Modal presented while another is still leaving. */
  const afterDial = useRef<(() => void) | null>(null)
  const dialFallback = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dialGone = useCallback(() => {
    if (dialFallback.current) clearTimeout(dialFallback.current)
    dialFallback.current = null
    const next = afterDial.current
    afterDial.current = null
    next?.()
  }, [])
  /** Closes the dial and starts `next` once it has left the screen. */
  const afterDialLeaves = useCallback(
    (next: () => void) => {
      if (dialFallback.current) clearTimeout(dialFallback.current)
      afterDial.current = next
      setSheet(null)
      dialFallback.current = setTimeout(dialGone, DIAL_GONE_FALLBACK_MS)
    },
    [dialGone]
  )
  useEffect(
    () => () => {
      if (dialFallback.current) clearTimeout(dialFallback.current)
    },
    []
  )

  /** The session sheet away, and its "Extended" line with it. */
  const closeSession = useCallback(() => {
    setSheet((s) => (s === 'session' || s === 'leave' ? null : s))
    setExtended(false)
  }, [])

  // Only the newest read is the truth: an older one that answers last is dropped (H2).
  const loadSeq = useRef(0)
  const load = useCallback(() => {
    const mine = ++loadSeq.current
    apiClient
      .getVenue(id)
      .then((res) => {
        if (mine !== loadSeq.current) return
        if (res.success && res.data) {
          setDetail(res.data)
          setGate(null)
          // The window is gone: no session sheet over a place you are no longer live at.
          if (!res.data.live.youAreLive) closeSession()
        } else {
          setGate(venueGate(res.errorCode, res.error))
        }
      })
      .catch((error) => {
        if (mine !== loadSeq.current) return
        Logger.warn('events', 'Venue screen load threw', { error: String(error) })
        setGate({ kind: 'failed' })
      })
  }, [id, closeSession])

  // On focus, so coming back to it shows the count and your window as they are now.
  useFocusEffect(load)

  // The window to repeat here, from the remembered session: it outlives this screen (PL-M05).
  const readLastChoice = useCallback(() => {
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

  // A Go Live, an extend, a check-out anywhere: the window moved.
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
  useEffect(
    () =>
      subscribeToLiveEnded((data) => {
        if (data.eventId === venueDayId) load()
      }),
    [venueDayId, load]
  )

  const closeTray = useCallback(() => setTray((t) => (t ? { ...t, visible: false } : t)), [])
  const showTray: ShowTray = useCallback(
    (title, message, buttons, extra) => {
      const next: Tray = {
        visible: true,
        title,
        message,
        buttons: buttons?.length ? buttons : [{ label: 'Close', kind: 'secondary', onPress: closeTray }],
        extra,
      }
      // The dial leaves first; the refusal comes up when it has gone.
      if (sheetRef.current === 'dial') afterDialLeaves(() => setTray(next))
      else setTray(next)
    },
    [closeTray, sheetRef, afterDialLeaves]
  )
  const closeAll = useCallback(() => {
    closeTray()
    if (sheetRef.current === 'dial') setSheet(null)
  }, [closeTray, sheetRef])

  const place = detail
    ? { id: detail.venue.id, name: detail.venue.name, latitude: detail.venue.latitude, longitude: detail.venue.longitude, address: detail.venue.address }
    : null
  const { goLive: runGoLive, busy } = useGoLive({
    place,
    showTray,
    closeTray: closeAll,
    onRefusal: (r) => {
      // Drawn by the dial's own sheet, in place of the dial; with no dial open (a one-tap Go live again) it opens to it.
      setRefusal(sheetRefusal(r))
      setSheet('dial')
    },
    onLive: (result) => {
      if (sheetRef.current === 'dial') setSheet(null)
      showToast(liveToast(result), 'success')
      load()
    },
  })
  const goLive = (choice: GoLiveChoice) => {
    lastAsked.current = choice
    return runGoLive(choice)
  }

  const openDial = () => {
    setDial(lastChoice ? toDialChoice(lastChoice) : 20)
    setRefusal(null)
    setSheet('dial')
  }
  /** The refusal's way on: where the design sends each one. */
  const refusalAction = () => {
    const r = refusal
    if (!r || !detail) return
    if (r.kind === 'notHere') {
      setSheet(null)
      directionsTo(detail)
    } else if (r.kind === 'eventOn' && r.eventId) {
      setSheet(null)
      openEvent(r.eventId)
    } else if (r.kind === 'age') {
      setSheet(null)
      router.push('/edit-profile' as never)
    } else if (r.kind === 'gps' || r.kind === 'timeout') {
      // Try again: the same window, asked once more.
      setRefusal(null)
      if (lastAsked.current) void goLive(lastAsked.current)
    } else if (r.kind === 'stay') {
      // Pick a time: back to the dial, on the first window.
      setRefusal(null)
      setDial(20)
    } else if (r.kind === 'notFound') {
      setSheet(null)
      router.back()
    }
  }
  /** A tap on something that says Blendn+: the Tonight sheet for the Stay tap, once the dial has left. The free hour and a bought Stay both go live here. */
  const stayLocked = () =>
    afterDialLeaves(
      () =>
        void openTonight(
          {
            trigger: 'stay',
            venue: detail?.venue.name ?? '',
            onFree: () => void goLive({ minutes: 60 }),
            onUnlocked: () => void goLive({ stay: true }),
          },
          { userInitiated: true }
        )
    )
  const refusalAlt = stayLocked

  const extend = async () => {
    setExtending(true)
    try {
      if (await goLive(EXTEND_CHOICE)) setExtended(true)
    } finally {
      setExtending(false)
    }
  }

  const stopLive = async () => {
    if (!venueDayId || leaving) return
    setLeaving(true)
    try {
      const res = await checkOutOf(venueDayId)
      if (!res.success) {
        showToast(res.error || "Couldn’t stop. Try again.", 'error', { haptic: 'error' })
      } else {
        closeSession()
      }
    } catch (error) {
      Logger.warn('events', 'stop live failed', { error: String(error) })
      showToast("Couldn’t stop. Try again.", 'error', { haptic: 'error' })
    } finally {
      setLeaving(false)
      load()
    }
  }

  const openRoom = () => {
    if (!detail || !live?.chatGroupId) return
    router.push({
      pathname: '/chat/[id]',
      params: { id: live.chatGroupId, roomName: detail.venue.name, eventTitle: detail.venue.name, venueId: detail.venue.id },
    } as never)
  }

  // The Blend'n room is hosted by the tab layout: from a pushed screen it would open underneath (H3).
  const seeWhoIsHere = () => {
    router.dismissTo('/(tabs)/events' as never)
    openBlendn()
  }

  const openEvent = (eventId: string) => router.push(`/event/${eventId}` as never)
  const share = () => {
    if (detail) void openShare(venueTarget(detail.venue))
  }
  const directions = () => {
    if (detail) directionsTo(detail)
  }
  const copyAddress = () => {
    const address = detail?.venue.address
    if (!address) return
    Clipboard.setStringAsync(address)
      .then(() => {
        showToast('Address copied', 'info')
        announceOutcome('Address copied')
      })
      .catch(() => showToast("Couldn’t copy. Try again.", 'error'))
  }
  const claimUrl = detail && !detail.venue.claimed ? claimUrlFrom(detail.claim) : null
  const openClaim = () => {
    if (!claimUrl) return
    Linking.openURL(claimUrl).catch(() => showToast("That page didn’t open. Try again.", 'error'))
  }

  const shieldHeight = barHeight(insets.top, Platform.OS === 'android')
  const controls = (
    <View style={[styles.controls, { top: barTop(insets.top) }]} pointerEvents="box-none">
      <IconButton icon={backIcon()} tier={detail ? 'media' : 'control'} accessibilityLabel="Back" onPress={() => router.back()} testID="venue-back" />
      {detail ? <IconButton icon="share" tier="media" accessibilityLabel="Share" onPress={share} testID="venue-share" /> : null}
    </View>
  )

  if (!detail || !live) {
    return (
      <View style={styles.screen}>
        {controls}
        {gate ? <VenueGateScreen gate={gate} onRetry={load} onBack={() => router.back()} onFinish={finishSetup} /> : <VenueSkeleton />}
      </View>
    )
  }

  const { venue } = detail
  const action = venueAction(live)
  const mode = dockMode(action, lastChoice)
  const tonight = detail.tonight
  const handoffTitle = action.kind === 'handoff' && tonight?.id === action.eventId ? tonight.title : null
  const now = serverNow()
  const tiles = venueTiles(detail, now).map((t) => ({ label: t.label, value: t.value, mono: t.mono }))
  const known = goodToKnow(venue.amenities)
  const upcoming = upcomingRows(venue.upcoming)
  const upcomingTotal = upcomingCount(venue, upcoming.length)
  const boardId = boardEventId(tonight, now)

  const trayActions: SheetAction[] = (tray?.buttons ?? []).map((b) => ({
    label: b.label,
    onPress: b.onPress,
    loading: b.loading,
    disabled: b.disabled,
    kind: b.kind ?? (b.variant === 'primary' ? 'primary' : b.variant === 'destructive' ? 'destructive' : 'secondary'),
  }))

  return (
    <View style={styles.screen}>
      {controls}
      <Animated.ScrollView
        testID="venue-scroll"
        contentContainerStyle={{ paddingBottom: dockHeight + SPACE.xl }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => setUnderBar(event.nativeEvent.contentOffset.y >= VENUE_HERO_HEIGHT - shieldHeight),
        })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <VenueHero
          hero={venueHero(detail)}
          name={venue.name}
          typeLabel={guestTypeLabel(venue)}
          area={placeArea(venue)}
          km={km}
          live={live}
          onZero={load}
          scrollY={scrollY}
        />
        <PageWash color={washColor(venueHero(detail))} pointerEvents="none" style={styles.wash} />
        <View style={styles.body}>
          {action.kind === 'handoff' ? (
            <EventOnCard tonight={tonight?.id === action.eventId ? tonight : null} now={now} onPress={() => openEvent(action.eventId)} />
          ) : action.kind === 'live' ? (
            <LiveCard live={live} name={venue.name} onZero={load} />
          ) : tiles.length ? (
            <AmenityGrid tiles={tiles} testID="venue-tiles" />
          ) : null}

          {action.kind === 'handoff' ? null : <TonightHere tonight={tonight} venue={venue.name} km={km} now={now} onOpen={openEvent} />}
          {upcoming.length ? <UpcomingList rows={upcoming} total={upcomingTotal} onOpen={openEvent} onSeeAll={() => setSheet('upcoming')} /> : null}
          <WhosHere live={live} onSeeWho={seeWhoIsHere} />
          {/* Only where somebody runs the place on Blendn: there is nobody to tell at an unclaimed one (step 12). */}
          {venue.claimed ? <VenueRegulars venueId={venue.id} venueName={venue.name} /> : null}
          {boardId && tonight ? <BoardRow title={tonight.title} onPress={() => router.push(`/board/${boardId}` as never)} /> : null}
          {venue.description?.trim() ? <About text={venue.description.trim()} /> : null}
          {known.length ? (
            <Section>
              <SectionHeader title="Good to know" />
              <AmenityGrid tiles={known} testID="venue-good-to-know" />
            </Section>
          ) : null}
          <Where venue={venue} km={km} onDirections={directions} onCopy={copyAddress} />
          {/* Leaves the app on purpose: the app refuses venue accounts, the claim page needs none (§7). */}
          {claimUrl ? <ClaimLine onPress={() => setSheet('claim')} /> : null}
        </View>
      </Animated.ScrollView>

      {/*
       * The status bar's and the back button's bar: nothing over the hero (the design draws the cover under the clock, behind its
       * head scrim), the bar's glass once the rows reach it. Glass is mounted, not faded, and an ink band is not what the frame draws.
       */}
      {underBar ? (
        <View pointerEvents="none" testID="venue-status-shield" style={[styles.shield, { height: shieldHeight }]}>
          <Material role="bar" testID="venue-status-material" style={StyleSheet.absoluteFill} />
        </View>
      ) : null}

      <VenueDock
        mode={mode}
        name={venue.name}
        live={live}
        eventTitle={handoffTitle}
        busy={busy}
        onHeight={setDockHeight}
        onGoLive={() => (mode.kind === 'goLive' && mode.again ? void goLive(mode.again) : openDial())}
        onPickAnother={openDial}
        onOpenRoom={openRoom}
        onPill={() => setSheet('session')}
        onLeave={() => setSheet('leave')}
        onEvent={() => action.kind === 'handoff' && openEvent(action.eventId)}
        onZero={load}
      />

      <GoLiveSheet
        visible={sheet === 'dial'}
        onClose={() => setSheet(null)}
        onDismissed={dialGone}
        venue={venue.name}
        pseudonym="your nickname for today"
        choice={dial}
        onChoice={setDial}
        stay={plus?.gated && !plus.active ? 'locked' : 'free'}
        onStayLocked={stayLocked}
        onGoLive={() => void goLive(apiChoice(dial))}
        busy={busy}
        refusal={refusal?.kind ?? null}
        refusalMessage={refusal?.message}
        refusalTitle={refusal?.title}
        event={refusal?.eventId && tonight?.id === refusal.eventId ? tonight.title : ''}
        onRefusalAction={refusalAction}
        onRefusalAlt={refusalAlt}
        testID="venue-dial"
      />
      <SessionHost
        live={live}
        venue={venue.name}
        visible={sheet === 'session' || sheet === 'leave'}
        confirmFirst={sheet === 'leave'}
        extended={extended}
        extending={extending}
        ending={leaving}
        onClose={closeSession}
        onExtend={() => void extend()}
        onEnd={() => void stopLive()}
        onZero={load}
      />
      <UpcomingSheet
        visible={sheet === 'upcoming'}
        onClose={() => setSheet(null)}
        venueId={venue.id}
        first={upcoming}
        firstCursor={venue.upcomingNextCursor ?? null}
        total={upcomingTotal}
        onOpen={openEvent}
      />
      <Sheet
        visible={sheet === 'claim'}
        onClose={() => setSheet(null)}
        icon="arrow-up-right"
        title="Own this place?"
        body={`This opens blendn.app in your browser, where you can claim ${venue.name}. A person reviews every claim; filing one grants nothing yet.`}
        actions={[
          {
            label: 'Open blendn.app',
            kind: 'lit',
            icon: 'external-link',
            onPress: () => {
              setSheet(null)
              openClaim()
            },
          },
          { label: 'Not now', kind: 'tertiary', onPress: () => setSheet(null) },
        ]}
        testID="venue-claim-sheet"
      />
      <Sheet
        visible={tray?.visible === true}
        onClose={closeTray}
        title={tray?.title}
        body={tray?.message}
        icon={tray?.extra?.icon}
        actions={trayActions}
        testID="venue-tray"
      >
        {tray?.extra?.detail ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary]}>{tray.extra.detail}</Text> : null}
      </Sheet>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  body: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.sectionGap },
  controls: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, zIndex: 2, flexDirection: 'row', justifyContent: 'space-between' },
  wash: { position: 'absolute', left: 0, right: 0, top: VENUE_HERO_HEIGHT - 1, height: PAGE_WASH.height },
  shield: { position: 'absolute', left: 0, right: 0, top: 0 },
  secondary: { color: COLOR.textSecondary },
})
