import { barHeight, barTop } from '../../lib/barGeometry'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { apiClient } from '../../lib/apiClient'
import { blendnClosed, isLiveHint, openPass, takePendingPerson, takeReturnTo, useDoor, usePendingPerson } from '../../lib/blendnOverlay'
import { crewsThatMayLikePeople, crewMessage, type BlendRef, type CrewsAtEvent } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { COLOR, DURATION, EASING, FONT_FAMILY, MATERIAL, PRESS, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import type { TrayButton, TrayExtra } from '../../lib/locationFix'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { overlapOf } from '../../lib/overlapLine'
import { useRoomCancelled } from '../../lib/useRoomCancelled'
import { useFriendsHere, useMessageFriend } from '../../lib/friendsHere'
import { useOffline } from '../OfflineBanner'
import { everyoneHead, meetNext, reasonLine, reasonLines } from '../../lib/roomMoments'
import { eventRoomDoor } from '../../lib/eventRoomDoor'
import { recapPeopleOpen, roomRecap, type RoomRecap as Recap } from '../../lib/roomRecap'
import { bannerState } from '../../lib/roomVisibility'
import { newestWave, useRoomWaves, wavedAtYouLabel, waveShown } from '../../lib/roomWaves'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { showSheet } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { useCheckInFlow } from '../../lib/useCheckInFlow'
import { useLatest } from '../../lib/useLatest'
import { useRoom, type RoomPerson } from '../../lib/useRoom'
import { useRoomControls } from '../../lib/useRoomControls'
import { myMainPhoto } from '../../lib/myPhoto'
import { markSeed } from '../../lib/pseudonymAvatar'
import { myRoomFace } from '../../lib/roomState'
import { useTonight, type TonightEvent } from '../../lib/useTonight'
import { isNightRated, markNightRated, useRatedNights } from '../../lib/ratedNights'
import { crewCards, openBlend, useCrewActions, useCrewsHere } from '../crews/CrewsView'
import { VisibilityBanner, type Visibility } from '../ds/Banner'
import type { Face } from '../ds/Facepile'
import { IconButton } from '../ds/IconButton'
import { MomentBlend, type BlendCrew, type BlendPerson } from '../ds/MomentBlend'
import { MomentMatch } from '../ds/MomentMatch'
import { MomentPour, ORBS_LIFT_MS, type PourFrame } from '../ds/MomentPour'
import { MomentRecap } from '../ds/MomentRecap'
import { PeopleFromTonight } from './PeopleFromTonight'
import { PersonCard, type PersonVariant } from '../ds/PersonCard'
import { Sheet } from '../ds/Sheet'
import { CONTROL_FONT_CAP, font, HueProvider, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Toast, type ToastKind } from '../ds/Toast'
import { ConnectSheet } from '../grid/ConnectSheet'
import ScalePress from '../motion/ScalePress'
import { Material } from '../ui/Material'
import { CrewsFoot, CrewsHead, PeopleCrewStrip, RoomCrewCard } from './RoomCrews'
import { faceOf, RoomSkeleton, useNow } from './RoomSections'
import { FriendsHere } from './FriendsHere'
import { RoomCancelled } from './RoomCancelled'
import { RoomStage, useStage } from './RoomStage'
import { RoomView } from './RoomView'
import { TonightView } from './TonightView'
import { WaveToast } from './WaveToast'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { parseBadges } from '../../lib/profileBadges'
import { useCoachMarkSpot } from '../ds/CoachMarkHost'

/** Under the top bar's 44 pt circles: Flow 4 sets the title 70 below the safe area (124 on a 54 pt status bar). */
const TOP_CHROME = SIZE.circleButton + SPACE.lg + SPACE.xxs
/** #9: the Room's crossfade (D.base) and its sections (+60, 28 apart, D.base each), done: nothing lands on it before. */
const ROOM_ARRIVAL_MS = DURATION.base + 60 + 2 * 28 + DURATION.base

/** How long the pour and the pass wait for the Room after a check-in before giving up on it. */
const ROOM_WAIT_MS = 4000
/** Past the crossfade's own length, Tonight goes even if its completion never came (an interrupted fade). */
const FADE_FALLBACK_SLACK_MS = 50
/** "Show more" brings at most this many (the server pages the ranking by 20). */
const MORE_STEP = 20

const gentle = Easing.bezier(...EASING.gentle)
/** Motion #9, after the pour: the Room crossfades in over D.base (200 ms under Reduce Motion). */
/**
 * B8 (Prompt 10, approved): a glass pill enters as a 16 pt rise over `base`;
 * the glass stays opaque throughout and only its contents fade. Reduce Motion:
 * it is simply there, and the contents fade.
 */
const GLASS_RISE = SPACE.lg
const glassRise = FadeInUp.duration(DURATION.base)
  .easing(Easing.bezier(...EASING.entrance))
  .withInitialValues({ opacity: 1, transform: [{ translateY: GLASS_RISE }] })
const glassContentsIn = FadeIn.duration(DURATION.base).easing(gentle)

/** A first line built from what you share — something to say that isn't "hey". */
export function openerFor(p: RoomPerson): string {
  const interest = p.interests[0]
  if (interest) return `You’re into ${interest.toLowerCase()} too — how did you get into it?`
  if (p.sharedPlans > 0) return 'Looks like we’re going to the same things — which one are you most excited about?'
  if (p.sharedWorkField && p.workField) return `Another ${p.workField} person — what are you working on?`
  return 'What brought you here tonight?'
}

/** A Blend just made (Flow 10 · 10.8): both sides, as the moment draws them, and where it opens. */
type Sides = { ours: BlendCrew; theirs: BlendCrew | BlendPerson } | { ours: BlendPerson; theirs: BlendCrew }
type MadeBlend = { sides: Sides; ref: BlendRef; title: string }

/** Ask who a like goes out as: a crew id, null for "Just me", undefined when they cancel. */
function chooseAs(crews: CrewsAtEvent['myCrews'], title: string): Promise<string | null | undefined> {
  return new Promise((resolve) =>
    showSheet({
      kind: 'actions',
      hue: 'rose',
      title,
      message: 'Your crew chat says who liked on its behalf.',
      onDismiss: () => resolve(undefined),
      actions: [
        ...crews.map((c) => ({ label: c.name, then: () => resolve(c.crewId) })),
        { label: 'Just me', then: () => resolve(null) },
        { label: 'Cancel', cancel: true as const },
      ],
    })
  )
}

type Tray = { visible: boolean; title: string; message: string; buttons: TrayButton[]; extra?: TrayExtra }
const NO_TRAY: Tray = { visible: false, title: '', message: '', buttons: [] }
/** round4/r4.js, "The Room". */
const ROOM_COACH_TEXT = 'People here can’t see your name or photo until you choose to show them. You decide, per event.'

/** A card to open: someone on the roster, or (a wave from someone it doesn't list) only their name: the thin card. */
type OpenCard = { id: string; name: string }

/**
 * The Blend'n screen — what the disc in the middle of the bar opens, always
 * (docs/NAVIGATION.md, Flow 4):
 *
 *     Tonight   what's on, nearest first; at a venue, the pass you hold to go in
 *     Room      who's here, who to meet next, and the room's chat
 *     Recap     the night is over
 *
 * Holding the pass checks you in, and the pour hands Tonight to the Room
 * without leaving the screen.
 */
export function BlendnScreen() {
  const stage = useRef<{ close(): void }>(null)
  const close = useCallback(() => stage.current?.close(), [])
  /** The content's own layer that back should close first (People from tonight over the Recap), or false. */
  const backGuardRef = useRef<(() => boolean) | null>(null)

  // Android back closes the overlay rather than leaving the tabs underneath.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backGuardRef.current?.()) return true
      close()
      return true
    })
    return () => sub.remove()
  }, [close])

  // The Room is people: the rose world, one hue for the whole screen (People | Crews, the chips, the sheets).
  return (
    <HueProvider value="rose">
      <RoomStage
        ref={stage}
        onClosed={() => {
          const back = takeReturnTo()
          blendnClosed()
          // Opened from an event page ("Blend in"): back to it, not to the Pulse it stepped through (ROOM-13).
          if (back) router.push({ pathname: '/event/[id]', params: { id: back } as never })
        }}
      >
        <BlendnContent onClose={close} backGuardRef={backGuardRef} />
      </RoomStage>
    </HueProvider>
  )
}

/**
 * Whether the page under the floating bar has scrolled off its top (Tonight's list or the Room's): the stage's own offset,
 * mirrored into state only as it crosses 0, so a scroll re-renders nothing else.
 */
function useScrolledPast(): boolean {
  const { scrollY } = useStage()
  const [scrolled, setScrolled] = useState(false)
  useAnimatedReaction(
    () => scrollY.get() > 0,
    (now, before) => {
      if (now !== before) scheduleOnRN(setScrolled, now)
    }
  )
  return scrolled
}

function BlendnContent({ onClose, backGuardRef }: { onClose: () => void; backGuardRef: MutableRefObject<(() => boolean) | null> }) {
  const insets = useSafeAreaInsets()
  const scrolled = useScrolledPast()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const room = useRoom()
  const tonight = useTonight()
  const waves = useRoomWaves()
  const { user } = useAuth()
  const now = useNow(15_000)
  // R4: the event was cancelled while you were inside; the server has checked you out.
  const { cancelled, dismiss: dismissCancelled } = useRoomCancelled(room.event)

  // --- a toast of the overlay's own (refusals off the card, crew likes) --------
  const [toast, setToast] = useState<{ key: number; kind: ToastKind; text: string } | null>(null)
  const say = useCallback((text: string, kind: ToastKind = 'info') => setToast({ key: Date.now(), kind, text }), [])

  // Friends here (plans/friends-in-room.md C1): the friends at this event who let friends see them.
  const offline = useOffline()
  const friendsHere = useFriendsHere(room.event?.id ?? null, room.status === 'ready')
  const refreshFriends = friendsHere.refresh
  const friendChat = useMessageFriend(
    useCallback(
      (text: string) => {
        say(text, 'error')
        // They may have gone (an unfriend, a block, a check-out): read again.
        void refreshFriends()
      },
      [say, refreshFriends]
    )
  )

  /*
   * The end of the night. Kept as a snapshot rather than derived: the sweeper
   * can clear the check-in while the recap is on screen, and the recap must
   * not vanish with it. "Back to tonight" dismisses it for this room; it never
   * checks you out.
   */
  const [recap, setRecap] = useState<Recap | null>(null)
  const [dismissedRecap, setDismissedRecap] = useState<string | null>(null)
  const [peopleOpen, setPeopleOpen] = useState(false)
  // Android back closes People from tonight before it closes the overlay (M5).
  useEffect(() => {
    backGuardRef.current = () => {
      if (peopleOpen) {
        setPeopleOpen(false)
        return true
      }
      return false
    }
    return () => {
      backGuardRef.current = null
    }
  }, [backGuardRef, peopleOpen])
  const endedRecap =
    room.status === 'ready' && room.event ? roomRecap({ event: room.event, checkedInAt: room.checkedInAt, people: room.people }, now) : null
  if (endedRecap && endedRecap.eventId !== dismissedRecap && recap?.eventId !== endedRecap.eventId) setRecap(endedRecap)
  const roomOver = endedRecap !== null && endedRecap.eventId === dismissedRecap
  // Recap #04: rated already, so "You rated this night. Thanks." and no primary. Unknown (a failed read) offers Rate.
  const [ratedEvent, setRatedEvent] = useState<string | null>(null)
  // Rated on the rate screen just now (pushed over the overlay): the Recap says so as you come back.
  useRatedNights()
  const recapEventId = recap?.eventId ?? null
  useEffect(() => {
    if (!recapEventId) return
    let live = true
    apiClient
      .getMyEventRating(recapEventId)
      .then((r) => {
        if (live && r.success && r.data?.ratedAt) {
          setRatedEvent(recapEventId)
          markNightRated(recapEventId)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [recapEventId])

  // --- sheets (check-in flow) -------------------------------------------------
  const [tray, setTray] = useState<Tray>(NO_TRAY)
  const closeTray = useCallback(() => setTray((t) => ({ ...t, visible: false })), [])
  const showTray = useCallback(
    (title: string, message: string, buttons?: TrayButton[], extra?: TrayExtra) =>
      setTray({
        visible: true,
        title,
        message,
        buttons: buttons?.length ? buttons : [{ label: 'Close', kind: 'secondary', onPress: closeTray }],
        extra,
      }),
    [closeTray]
  )

  /*
   * The pass Tonight docks: the event an event page's "Blend in" asked for
   * (Flow 3 #04–#06; the server is the gate, so it docks inside the fence or
   * not), else the one whose fence you're standing in. Tonight's own copy of
   * it wins when it has one: its counts are live.
   */
  const door = useDoor()
  const liveInside = (door ? (tonight.events.find((e) => e.id === door.id) ?? door) : tonight.events.find((e) => e.id === tonight.insideEventId)) ?? null
  /*
   * Tonight as it was when the hold committed, held until the check-in is done
   * (and, under a hand-off, its crossfade).
   * A check-in re-reads Tonight (`checkInChanged`), and the answer — the event
   * you just entered no longer "inside", the deck re-sorted or briefly empty —
   * landed mid-pour: the deck vanished, the pass changed under the flood and
   * the Room's "is this the one" test lost its event (PR #401 drive 2).
   */
  const [held, setHeld] = useState<{ events: TonightEvent[]; insideEvent: TonightEvent | null } | null>(null)
  const tonightEvents = held ? held.events : tonight.events
  const insideEvent = held ? held.insideEvent : liveInside
  /*
   * The Room is there to hand off to: loaded, or waited for long enough.
   * ponytail: a fixed ceiling, so a room that doesn't load straight after the
   * check-in can't hold the pass at "You're in" for good.
   */
  const [roomWaitOver, setRoomWaitOver] = useState(false)
  /** The docked pass, measured: the pour fills exactly it (Flow 4 delta R2-D1, "success"). */
  const [passFrame, setPassFrame] = useState<PourFrame | null>(null)
  /** The next Room to mount comes out of the pour, and enters as #9 draws it. */
  const [pourEntrance, setPourEntrance] = useState(false)
  /*
   * The pour's timeline, kept off the pour itself (motion #9): playing from the
   * server's yes to the hand-off; still once the flood, "You're in." and the
   * orbs' lift are done (ORBS_LIFT_MS), the one window in which mounting the
   * Room costs no visible frame. The Room is mounted there, hidden, and the
   * hand-off waits for it, so the crossfade moves opacity only.
   */
  const [pourPlaying, setPourPlaying] = useState(false)
  const [pourStill, setPourStill] = useState(false)
  const [roomPremounted, setRoomPremounted] = useState(false)
  /*
   * The pre-mounted Room has been laid out on the native side. The hand-off
   * waits for this, not for the JS commit that mounts it: on Fabric that
   * commit is mounted on the UI thread later, and a crossfade started with it
   * stalled behind the mount (drive 3: 1-8 frozen frames, then a jump).
   */
  const [roomLaidOut, setRoomLaidOut] = useState(false)
  /*
   * Tonight stays mounted under the Room until the crossfade into it has
   * finished (#9: "Tonight crossfades to the Room"), never removed at the
   * hand-off: a layout animation's exit was skipped under Reduce Motion (a
   * one-frame cut) and drawn over the Room otherwise (the ghost pass).
   */
  const [tonightHeld, setTonightHeld] = useState(false)
  const releaseTonight = useCallback(() => setTonightHeld(false), [])
  /** A check-in's Room is hidden and owes its crossfade in. */
  const fadeOwed = useRef(false)
  /** The Room's crossfade in (#9: D.base), on the UI thread; Tonight under it is 1 minus this. 1 unless a pour is handing off. */
  const roomFade = useSharedValue(1)
  const roomFadeStyle = useAnimatedStyle(() => ({ opacity: roomFade.get() }))
  /*
   * Inside more than one place (ROUND4 R15, part 8.3, #06–#07): in one room and
   * holding another event's pass. The server keeps one room at a time, so the
   * check-in is a switch: "Hold to switch", "You'll leave {room}", then "You
   * left {room}." once the new room is up. The chooser, "2 here · Switch" and
   * the disc's "Check in · 2 here" (#01–#05) are not built: they need "which
   * places am I inside" from the server (SCRUM-704).
   */
  const switchFrom = room.status === 'ready' && room.event && door && door.id !== room.event.id && !roomOver ? room.event : null
  const switchFromNow = useLatest(switchFrom)
  const insideEventNow = useLatest(insideEvent)
  /** The room a switch left, and the event it switched into: the toast is for that landing only. */
  const leftRoom = useRef<{ title: string; toId: string } | null>(null)
  const roomReady = (room.status === 'ready' && !switchFrom) || roomWaitOver
  const roomReadyNow = useLatest(roomReady)
  const roomShown = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!roomReady) return
    roomShown.current?.()
    roomShown.current = null
  }, [roomReady])
  const checkIn = useCheckInFlow({
    eventId: insideEvent?.id ?? '',
    showTray,
    closeTray,
    onCheckedIn: (outcome) => {
      if (outcome.kind !== 'checkedIn') return
      const from = switchFromNow.current
      // The server names the room it took you out of (`left`); the screen's own switch is the fallback for an older one.
      const leftTitle = outcome.left[0] ?? from?.title
      leftRoom.current = leftTitle && insideEventNow.current ? { title: leftTitle, toId: insideEventNow.current.id } : null
      setPourEntrance(true)
      setPourPlaying(true)
      setPourStill(false)
      setRoomPremounted(false)
      setRoomLaidOut(false)
      setTonightHeld(true)
      // Hidden from here, before the Room exists: it never shows a frame over Tonight.
      fadeOwed.current = true
      roomFade.set(0)
      setRoomWaitOver(false)
      setTimeout(() => setPourStill(true), ORBS_LIFT_MS)
      setTimeout(() => setRoomWaitOver(true), ROOM_WAIT_MS)
    },
    // The overlay is the room: entering it is waiting for it.
    onEnterRoom: () =>
      new Promise<void>((resolve) => {
        if (roomReadyNow.current) resolve()
        else roomShown.current = resolve
      }),
    onOpenMaps: () => insideEvent && router.push({ pathname: '/event/[id]', params: { id: insideEvent.id } as never }),
  })

  /*
   * Tonight holds while a check-in runs: through the pour and its questions
   * the pass reads "You're in", and the Room crossfades in when the flow
   * enters it. A room that failed to load leaves Tonight up, with a quiet
   * line (Room #15): an error never blocks Tonight.
   */
  const mode = recap
    ? 'ended'
    : room.status === 'ready' && !roomOver && !checkIn.checkingIn && !switchFrom
      ? 'room'
      : room.status === 'loading' && !checkIn.checkingIn && isLiveHint()
        ? 'loading'
        : 'tonight'
  const enter = pourEntrance && !reduceMotion
  // A check-out (or any way back to Tonight outside a check-in) ends the pour's claim on the next Room.
  if (pourEntrance && mode === 'tonight' && !checkIn.checkingIn && !pourPlaying) setPourEntrance(false)
  /** This check-in's Room is loaded: it can be mounted under the pour, once the pour holds still. */
  const roomIsThisOne = room.status === 'ready' && !!room.event && room.event.id === insideEvent?.id && !switchFrom
  // With its data: the count and the chat have answered too, so the Room reveals whole, never filling in after.
  const premount = pourPlaying && pourStill && !checkIn.asks && roomIsThisOne && room.settled
  // Latched: this one Room instance stays mounted from here, through the hand-off, as the Room (same slot, same key).
  if (premount && !roomPremounted) setRoomPremounted(true)
  const showRoom = !!room.event && (mode === 'room' || premount || (roomPremounted && checkIn.checkingIn))
  /** Tonight's layer: up outside the Room, and under it until the crossfade into it has finished. */
  const tonightUp = mode !== 'room' || tonightHeld
  // The snapshot of Tonight lasts the check-in and, under a hand-off, the crossfade: a re-read never lands in either.
  if (held && !checkIn.checkingIn && !(mode === 'room' && tonightHeld)) setHeld(null)
  // One value drives both layers: the Room over Tonight at `roomFade`, Tonight at the rest, while both are mounted.
  const tonightFadeStyle = useAnimatedStyle(() => ({ opacity: showRoom ? 1 - roomFade.get() : 1 }), [showRoom])
  /*
   * The hand-off: the Room crossfades in over Tonight while the pour fades
   * (#9: D.base, gentle; Reduce Motion's 200 ms, the same structure). Tonight
   * unmounts on the fade's completion, or its length plus a little if that
   * never comes.
   */
  const fadeRoomIn = useLatest(() => {
    if (!fadeOwed.current) return
    fadeOwed.current = false
    const duration = motionTokens(reduceMotion).duration.base
    roomFade.set(
      withTiming(1, { duration, easing: gentle, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) scheduleOnRN(releaseTonight)
      })
    )
    setTimeout(releaseTonight, duration + FADE_FALLBACK_SLACK_MS)
  })
  // A Room that came only after the pour had cleared (a question first, or the wait ran out) crossfades in as it turns up.
  useEffect(() => {
    if (mode === 'room') fadeRoomIn.current()
  }, [mode, fadeRoomIn])
  /** The pour may hand off: into a Room laid out under it, or (as before) one that never came or isn't this one. */
  const pourMayHandOff = roomLaidOut || roomWaitOver || checkIn.asks || (roomReady && !roomIsThisOne)
  const pourDoneNow = useLatest(checkIn.pourDone)
  // The crossfade starts at the hand-off, on the UI thread, with the pour's own fade: not a render later, when the mode turns.
  const startRoomFade = useLatest(() => {
    if (roomPremounted) fadeRoomIn.current()
  })
  const onPourDone = useCallback(() => {
    startRoomFade.current()
    setPourPlaying(false)
    pourDoneNow.current()
  }, [pourDoneNow, startRoomFade])
  // #07: the switch landed: an info toast, no haptic.
  const roomEventId = room.event?.id ?? null
  useEffect(() => {
    const left = leftRoom.current
    if (mode !== 'room' || !left) return
    if (roomEventId === left.toId) say(`You left ${left.title}.`)
    leftRoom.current = null
  }, [mode, roomEventId, say])
  // The pass moved on (another door, or none): a switch it was carrying is no longer this one.
  const doorId = door?.id ?? null
  useEffect(() => {
    if (leftRoom.current && leftRoom.current.toId !== doorId) leftRoom.current = null
  }, [doorId])

  // --- your controls in the room --------------------------------------------
  const controls = useRoomControls(room.event?.id ?? null, room.revealed)
  const [confirmingOut, setConfirmingOut] = useState(false)
  /*
   * The confirm closes first: a failure ("Couldn't check you out") is a toast,
   * and a toast under a sheet is one nobody sees. `checkOut` is single-flight
   * (`useRoomControls`); the overlay closes only once it stands.
   */
  const checkOut = useCallback(async () => {
    setConfirmingOut(false)
    if (await controls.checkOut()) onClose()
  }, [controls, onClose])

  const eventId = room.event?.id ?? null
  const eventTitle = room.event?.title ?? ''
  const chatGroupId = room.chatGroupId
  /** Your pseudonym tonight, once the server has said it (a match's answer): never guessed. */
  const myPseudonym = room.match?.you ?? room.pseudonym ?? null
  const myPhoto = myMainPhoto(user)
  const myName = user?.name?.trim() || 'You'
  /** The creature's seed while anonymous: never your real name. */
  const myMarkSeed = myPseudonym ?? markSeed('You', eventId ?? 'room')
  /** Your face as this room knows it: your photo when you are named, else your creature (once its pseudonym is known). */
  const myFace: Face = myRoomFace({ revealed: controls.revealed, photo: myPhoto, pseudonym: myPseudonym, eventId })

  // --- crews (R2-D1: People | Crews, the strip, crew cards, Liking as) ---------
  const [gridView, setGridView] = useState<'people' | 'crews'>('people')
  // Read in the Room, and on the pass once the server has said yes (its "Tell your crew" strip).
  const crews = useCrewsHere(mode === 'room' ? eventId : checkIn.youreIn ? (insideEvent?.id ?? null) : null)
  const myCrewsHere = crews.state.status === 'ready' ? crews.state.data.myCrews : []
  const soloCrews = crewsThatMayLikePeople(myCrewsHere, crews.mine ?? [])
  /*
   * Who a like goes out as. `likingAs` is the person's own choice: a crew id,
   * null for "Just me", undefined before they make one. The app never picks a
   * crew for somebody (lib/crews.ts): with one crew here that crew is the
   * answer, with several the like asks, and the answer becomes the choice.
   * Every label (the chip, "Like for {crew}", "Liked for {crew}") and every
   * request reads these same values.
   */
  const [likingAs, setLikingAs] = useState<string | null | undefined>(undefined)
  const chosen = likingAs === undefined ? undefined : likingAs === null ? null : (myCrewsHere.find((c) => c.crewId === likingAs) ?? undefined)
  /** For a crew card: a crew, null (you), or 'ask'. */
  const crewCardAs = chosen !== undefined ? chosen : myCrewsHere.length === 0 ? null : myCrewsHere.length === 1 ? myCrewsHere[0] : 'ask'
  /** For a person: the crew that may like people as it, null (you), or 'ask' (several may). */
  const personAs =
    chosen === null
      ? null
      : chosen !== undefined
        ? (soloCrews.find((c) => c.crewId === chosen.crewId) ?? null)
        : soloCrews.length === 0
          ? null
          : soloCrews.length === 1
            ? soloCrews[0]
            : 'ask'
  const emblemOf = (crewId: string) => crews.mine?.find((m) => m.crewId === crewId)?.emblemSeed ?? crewId
  const [blend, setBlend] = useState<MadeBlend | null>(null)
  const crewActions = useCrewActions(eventId, crews, {
    likeAsCrewId: crewCardAs === 'ask' ? undefined : (crewCardAs?.crewId ?? null),
    onBlend: (ref, card, asCrewId) => {
      const ours = myCrewsHere.find((c) => c.crewId === asCrewId)
      const theirs: BlendCrew = { kind: 'crew', name: card.name, emblemSeed: card.emblemSeed, count: card.presentCount }
      setBlend({
        ref,
        title: `Blend with ${card.name}`,
        sides: ours
          ? { ours: { kind: 'crew', name: ours.name, emblemSeed: emblemOf(ours.crewId), count: ours.presentCount }, theirs }
          : { ours: { kind: 'person', pseudonym: myMarkSeed }, theirs },
      })
    },
  })
  /** The chip's menu: your crews here and "Just me". Cancel changes nothing. */
  const chooseLikingAs = async (among = myCrewsHere, title = 'Liking as…') => {
    const answer = await chooseAs(among, title)
    if (answer !== undefined) setLikingAs(answer)
    return answer
  }
  const showSegments = crews.state.status === 'ready' && (crews.state.data.crews.length > 0 || myCrewsHere.length > 0 || (crews.mine?.length ?? 0) > 0)
  /** One like on a crew's behalf at a time: a fast second tap sends nothing. */
  const likingForCrew = useRef(false)

  // --- people ---------------------------------------------------------------
  const [open, setOpen] = useState<OpenCard | null>(null)
  /** The card as last opened: it keeps its person while it sinks, rather than emptying mid-exit. */
  const [shownCard, setShownCard] = useState<OpenCard | null>(null)
  if (open && open !== shownCard) setShownCard(open)
  const card = open ?? shownCard
  const [connectTo, setConnectTo] = useState<OpenCard | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | undefined>()
  // The Room's coach mark: once the pour has handed off, with nothing over the Room; never to someone already shown.
  /*
   * The Room has finished arriving (#9's crossfade and its sections), so a
   * coach mark's dim never lands on the hand-off: it dropped the frame from
   * the pour's 82 to the Room's 42 luminance in one frame (drive 2).
   */
  const [roomArrived, setRoomArrived] = useState(false)
  if (mode !== 'room' && roomArrived) setRoomArrived(false)
  useEffect(() => {
    if (mode !== 'room') return
    const timer = setTimeout(() => setRoomArrived(true), ROOM_ARRIVAL_MS)
    return () => clearTimeout(timer)
  }, [mode])
  const roomCoach = useCoachMark('room_reveal', {
    ready: mode === 'room' && roomArrived && !controls.revealed && !pourPlaying && !tray.visible && !open && !connectTo && !room.match,
  })
  // Drawn by the root's CoachMarkHost: the visibility line is the hole, the tip under it (round4/r4.js, "The Room").
  const roomCoachTarget = useRef<View>(null)
  useCoachMarkSpot(roomCoach.visible, {
    target: roomCoachTarget,
    text: ROOM_COACH_TEXT,
    place: 'below',
    radius: RADIUS.rowInCard,
    onDismiss: roomCoach.dismiss,
    onLost: roomCoach.lose,
    testID: 'room-coach-mark',
  })
  /** Waves you sent: on their way, or settled to "Waved" (a repeat inside ten minutes is "Waved" too). */
  const [sent, setSent] = useState<Record<string, 'busy' | 'waved'>>({})
  /** A like or wave the server refused, said on that person's card (R3-D4 4.3), until the next try or the card closes. */
  const [refusals, setRefusals] = useState<Record<string, { text: string; checkIn?: boolean }>>({})
  const forget = (id: string) =>
    setRefusals((r) => {
      if (!r[id]) return r
      const next = { ...r }
      delete next[id]
      return next
    })
  const cardPerson = card ? (room.people.find((p) => p.id === card.id) ?? null) : null
  /*
   * What waits for the card to have left: Block / Report, the ConnectSheet, a
   * crew chooser. iOS drops a Modal presented while another is still leaving,
   * so a safety sheet opened in the same tick could silently not appear.
   */
  const afterCard = useRef<(() => void) | null>(null)
  const closeCardThen = (next: () => void) => {
    afterCard.current = next
    setOpen(null)
  }
  const cardGone = () => {
    setShownCard(null)
    const next = afterCard.current
    afterCard.current = null
    next?.()
  }

  // A wave's banner on the tabs opens the overlay at their card: once the Room is there, during render, then cleared from the store.
  const pending = usePendingPerson()
  const [takenPending, setTakenPending] = useState<string | null>(null)
  if (!pending && takenPending) setTakenPending(null)
  if (pending && mode === 'room' && pending !== takenPending) {
    setTakenPending(pending)
    const known = room.people.find((p) => p.id === pending)
    setOpen({ id: pending, name: known?.name ?? waves.received[pending]?.fromName ?? 'Someone' })
  }
  useEffect(() => {
    if (pending && pending === takenPending) takePendingPerson()
  }, [pending, takenPending])

  const openCard = useCallback((p: OpenCard) => setOpen({ id: p.id, name: p.name }), [])
  const like = useCallback(
    async (p: RoomPerson) => {
      forget(p.id)
      const answer = await room.like(p.id)
      if (answer.kind !== 'refused') return
      // The card's one neutral line when it is open on them; a toast when the like was a double tap (R3-D4 4.3). No haptic.
      if (open?.id === p.id) setRefusals((r) => ({ ...r, [p.id]: { text: answer.refusal.message, checkIn: answer.refusal.checkIn } }))
      else say(answer.refusal.message)
    },
    [room, open?.id, say]
  )
  const wave = useCallback(
    async (id: string) => {
      if (sent[id]) return
      forget(id)
      setSent((w) => ({ ...w, [id]: 'busy' }))
      const answer = await room.sendWave(id)
      if (answer.kind === 'refused') {
        setSent((w) => {
          const next = { ...w }
          delete next[id]
          return next
        })
        setRefusals((r) => ({ ...r, [id]: { text: answer.refusal.message, checkIn: answer.refusal.checkIn } }))
        return
      }
      setSent((w) => ({ ...w, [id]: 'waved' }))
    },
    [room, sent]
  )
  const openProfile = useCallback(
    (p: OpenCard) => {
      setOpen(null)
      // The event travels with the id (the profile's Like needs the room), and the pseudonym titles it until the server says who they are.
      router.push({
        pathname: '/user/[id]',
        params: { id: p.id, ...(eventId ? { eventId, roomSeed: `${eventId}:${p.id}` } : {}), ...(p.name ? { pseudonym: p.name } : {}) } as never,
      })
    },
    [eventId]
  )
  /** Into the DM. `draft` is the opener the match moment suggested: it waits in the composer, never sent for you. */
  const sayHi = useCallback((conversationId: string, p: { id: string; name: string }, draft?: string | null) => {
    setOpen(null)
    router.push({
      pathname: '/private-chat/[conversationId]',
      params: { conversationId, otherUserName: p.name, otherUserId: p.id, ...(draft ? { draft } : {}) } as never,
    })
  }, [])
  /** Block and Report, once the card has left (`closeCardThen`). Either removes them, and their waves, from this room. */
  const safety = (p: OpenCard) => closeCardThen(() => showUserSafetyActions(p.name, p.id, () => room.remove(p.id), () => room.remove(p.id)))
  /*
   * A like on your crew's behalf. The answer is `{ liked: true }` whatever the
   * server learned about them, so all this may say is that the like went,
   * unless it made a Blend.
   */
  const likeForCrew = async (p: RoomPerson, crewId: string) => {
    if (!eventId || likingForCrew.current) return
    likingForCrew.current = true
    try {
      const result = await crewsApi.likePersonAsCrew(eventId, p.id, crewId)
      if (!result.success || !result.data) {
        say(crewMessage(result, 'card', 'Couldn’t send the like. Try again.'), 'error')
        return
      }
      const crew = myCrewsHere.find((c) => c.crewId === crewId)
      if (result.data.blend && crew) {
        setBlend({
          ref: result.data.blend,
          title: `Blend with ${p.name}`,
          sides: { ours: { kind: 'crew', name: crew.name, emblemSeed: emblemOf(crew.crewId), count: crew.presentCount }, theirs: { kind: 'person', pseudonym: p.name } },
        })
      } else say('Liked for your crew', 'success')
    } finally {
      likingForCrew.current = false
    }
  }
  /*
   * The card's crew like. A definite crew likes as it; 'ask' closes the card,
   * asks (your crews that may like people, and "Just me"), and the answer is
   * both this like and the choice from now on.
   */
  const cardCrewLike = (p: RoomPerson) => {
    if (personAs === 'ask') {
      closeCardThen(() => {
        void chooseLikingAs(soloCrews, `Like ${p.name} as…`).then((answer) => {
          if (answer === null) void like(p)
          else if (answer) void likeForCrew(p, answer)
        })
      })
      return
    }
    if (personAs) closeCardThen(() => void likeForCrew(p, personAs.crewId))
  }
  /** The grid's double tap likes as the card would; when the card would ask, a double tap just opens it. */
  const doubleTapLike = personAs === 'ask' ? null : personAs ? (p: RoomPerson) => void likeForCrew(p, personAs.crewId) : (p: RoomPerson) => void like(p)
  /*
   * "Check in" beside a lapsed check-in (R3-D4 4.3): back to the pass. This
   * room's event is docked as the door and the room re-read; once the server
   * says you're out, Tonight shows that pass to hold.
   */
  const checkInAgain = () => {
    setOpen(null)
    if (room.event) {
      openPass({
        id: room.event.id,
        title: room.event.title,
        venue: '',
        photo: null,
        startsAt: room.event.startsAt ?? '',
        endsAt: room.event.endsAt ?? '',
        distanceKm: null,
        hereCount: room.hereCount,
        capacity: null,
        going: true,
        tasteMatchCount: null,
        goingCount: null,
      })
    }
    void room.refresh()
  }

  // --- the room chat ----------------------------------------------------------
  const openChat = useCallback(async () => {
    if (!chatGroupId && eventId) {
      // Not open yet, for someone going or saved (D-7): the room's countdown, never an error (`eventRoomDoor`).
      const door = await eventRoomDoor(eventId, eventTitle)
      if (door.kind === 'say') say(door.line)
      // A push, not a replace: the room is an overlay under the stack, so the chat lands on top and Back returns here.
      else router.push({ pathname: '/chat/[id]', params: door.params } as never)
      return
    }
    if (!chatGroupId) {
      say('The chat for this event is not open yet.')
      return
    }
    router.push({ pathname: '/chat/[id]', params: { id: String(chatGroupId), roomName: eventTitle || 'Event chat', eventTitle } as never })
  }, [chatGroupId, eventId, eventTitle, say])

  // --- waves to you (SCRUM-630); a blocked or reported person's are dropped at the source (`ignoreWavesFrom`) ---
  const dockWave = newestWave(waves.received, now)
  const waveKeys = useMemo(() => Object.fromEntries(Object.values(waves.received).map((w) => [w.fromUserId, w.at])), [waves.received])

  // --- meet next, held while a card is open (#52: never reshuffle under a card) ---
  const shuffle = useMemo(() => meetNext(room.people, { now, eventId: room.event?.id ?? '' }), [room.people, now, room.event?.id])
  const [heldPicks, setHeldPicks] = useState(shuffle.picks)
  if (!open && heldPicks !== shuffle.picks) setHeldPicks(shuffle.picks)
  const head = everyoneHead(room.people, { hasMore: room.hasMore, hereCount: room.hereCount })
  const moreLeft = room.hereCount - 1 - room.people.length
  /** This session's arrivals, for #25's entrance. */
  const arrivingIds = useMemo(() => new Set(room.arrivals.map((a) => a.id)), [room.arrivals])

  const topInset = insets.top + TOP_CHROME
  const matchPerson = room.match?.person ?? null
  const visibility: Visibility = bannerState(controls.revealed, controls.listed, controls.readiness.ok)

  // --- the card's variant and state ------------------------------------------------
  const cardOverlap = cardPerson ? overlapOf(cardPerson) : null
  const cardVariant: PersonVariant = !cardPerson ? 'thin' : cardPerson.matched ? 'matched' : cardPerson.insideNow ? 'here' : 'was'
  const refusal = card ? refusals[card.id] : undefined
  /** The chip shows a definite answer only: hidden while there is nothing to choose between (solo), or a like would still ask. */
  const chipAs = crewCardAs === 'ask' || myCrewsHere.length === 0 ? undefined : crewCardAs

  return (
    <View style={styles.fill}>
      {/* Below the Room: Tonight (or the Recap, or the skeleton), held under a hand-off until its crossfade is done. */}
      {!tonightUp ? null : mode === 'ended' && recap ? (
        <Animated.View key="ended" style={styles.layer} entering={FadeIn.duration(DURATION.base)} exiting={FadeOut.duration(DURATION.quick)}>
          {/* Under People from tonight the Recap is not there for a screen reader: a swipe never walks past the deck. */}
          <View style={styles.layer} accessibilityElementsHidden={peopleOpen} importantForAccessibility={peopleOpen ? 'no-hide-descendants' : 'auto'}>
            <MomentRecap
              face={myFace}
              title={recap.title}
              venue={room.event?.venueName}
              onPeople={room.event && room.people.length > 0 && recapPeopleOpen(room.event.endsAt, now, room.chatClosesAt) ? () => setPeopleOpen(true) : undefined}
              minutes={recap.minutes}
              matches={recap.matched}
              rated={ratedEvent === recap.eventId || isNightRated(recap.eventId)}
              onRate={() => router.push({ pathname: '/rate/[eventId]', params: { eventId: recap.eventId } as never })}
              onBack={() => {
                setDismissedRecap(recap.eventId)
                setRecap(null)
              }}
              onClose={onClose}
              testID="room-recap"
            />
          </View>
          {peopleOpen ? (
            <Animated.View style={styles.layer} accessibilityViewIsModal entering={FadeIn.duration(DURATION.base)} exiting={FadeOut.duration(DURATION.quick)}>
              <PeopleFromTonight people={room.people} hasMore={room.hasMore} loadingMore={room.loadingMore} onMore={() => void room.loadMore()} onBack={() => setPeopleOpen(false)} />
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : mode === 'loading' ? (
        <RoomSkeleton topInset={topInset} />
      ) : (
        <Animated.View
          key="tonight"
          testID="tonight-layer"
          style={[styles.layer, tonightFadeStyle]}
          entering={FadeIn.duration(DURATION.base)}
          // Under a Room it is already faded out by `tonightFadeStyle`: an exit would start it again from 1, over the Room.
          exiting={showRoom ? undefined : FadeOut.duration(DURATION.base)}
          pointerEvents={mode === 'room' ? 'none' : 'auto'}
          accessibilityElementsHidden={mode === 'room' || !!cancelled}
          importantForAccessibility={mode === 'room' || cancelled ? 'no-hide-descendants' : 'auto'}
        >
          <TonightView
            events={tonightEvents}
            loading={tonight.status === 'loading'}
            error={tonight.status === 'error'}
            offline={tonight.offline}
            location={tonight.location}
            onRetry={() => void tonight.refresh()}
            insideEvent={insideEvent}
            switchFrom={switchFrom?.title}
            // Under the hand-off the check-in is over, but the pass fading out still reads "You're in", never a re-armed hold.
            checkingIn={checkIn.checkingIn || mode === 'room'}
            youreIn={checkIn.youreIn || mode === 'room'}
            onPassFrame={setPassFrame}
            onOpenEvent={(id) => router.push({ pathname: '/event/[id]', params: { id } as never })}
            onSeeAll={() => router.push('/nearby-events')}
            onBrowse={() => {
              onClose()
              router.navigate('/(tabs)/events')
            }}
            onCheckIn={() => {
              setHeld({ events: tonight.events, insideEvent: liveInside })
              void checkIn.start()
            }}
            onRoomRetry={room.status === 'error' ? room.retry : undefined}
            // Not while the pour plays: the pass growing under it moved the flood (R2-D1's row comes after).
            crewStrip={pourPlaying || mode === 'room' ? null : <PeopleCrewStrip myCrews={myCrewsHere} mine={crews.mine} eventTitle={insideEvent?.title ?? ''} actions={crewActions} inset={false} />}
            topInset={topInset}
            bottomInset={insets.bottom}
          />
        </Animated.View>
      )}
      {/* Above Tonight: pre-mounted at 0 under the pour, the one Room that stays. */}
      {showRoom && room.event ? (
        <Animated.View
          key="room"
          testID="room-stage"
          style={[styles.layer, roomFadeStyle]}
          onLayout={() => setRoomLaidOut(true)}
          // Out of a pour the crossfade is `roomFade`'s; otherwise the Room's own entrance.
          entering={pourEntrance ? undefined : reduceMotion ? FadeIn : FadeInUp.duration(DURATION.medium)}
          exiting={FadeOut.duration(DURATION.quick)}
          pointerEvents={mode === 'room' ? 'auto' : 'none'}
          // Under the cancelled card the Room is not there for a screen reader: a swipe never walks past it.
          accessibilityElementsHidden={mode !== 'room' || !!cancelled}
          importantForAccessibility={mode === 'room' && !cancelled ? 'auto' : 'no-hide-descendants'}
        >
          <RoomView
            title={room.event.title}
            hereCount={room.hereCount}
            checkedInAt={room.checkedInAt}
            me={myFace}
            people={room.people}
            arrivals={room.arrivals}
            connection={room.connection}
            visibility={
              <View ref={roomCoachTarget}>
                <VisibilityBanner
                  state={visibility}
                  name={controls.revealed ? myName : (myPseudonym ?? undefined)}
                  missing={controls.readiness.missing || undefined}
                  busy={controls.revealBusy}
                  onAction={
                    visibility === 'hidden'
                      ? () => router.push('/settings')
                      : visibility === 'blocked'
                        ? () => router.push('/edit-profile')
                        : () => {
                            markCoachUsed('room_reveal')
                            void controls.toggleReveal()
                          }
                  }
                  testID="room-visibility"
                />
              </View>
            }
            segments={showSegments}
            view={gridView}
            onView={setGridView}
            crewStrip={<PeopleCrewStrip myCrews={myCrewsHere} mine={crews.mine} eventTitle={eventTitle} actions={crewActions} />}
            friendsPresent={friendsHere.total > 0 && friendsHere.friends.length > 0}
            friendsHere={
              <FriendsHere
                friends={friendsHere.friends}
                total={friendsHere.total}
                opening={friendChat.opening}
                offline={offline}
                onMessage={(f) => void friendChat.message(f)}
                onSeeAll={() => router.push({ pathname: '/room/friends-here', params: { eventId: eventId ?? '' } } as never)}
              />
            }
            crewsHead={
              eventId ? (
                <CrewsHead
                  eventId={eventId}
                  checkInKey={room.checkedInAt ?? ''}
                  crews={crews}
                  likingAs={chipAs === undefined ? undefined : chipAs ? { name: chipAs.name, emblemSeed: emblemOf(chipAs.crewId) } : null}
                  pseudonym={myMarkSeed}
                  onLikingAs={() => void chooseLikingAs()}
                />
              ) : null
            }
            crewCards={crewCards(crews)}
            renderCrew={(crewCard, index) => (
              <RoomCrewCard card={crewCard} actions={crewActions} as={crewCardAs && crewCardAs !== 'ask' ? crewCardAs.name : null} index={index} />
            )}
            crewsFoot={<CrewsFoot crews={crews} />}
            picks={heldPicks}
            nextShuffleAt={shuffle.nextShuffleAt}
            everyoneTitle={head.title}
            everyoneCount={head.count}
            hasMore={room.hasMore}
            loadingMore={room.loadingMore}
            moreCount={moreLeft > 0 ? Math.min(MORE_STEP, moreLeft) : null}
            onMore={() => void room.loadMore()}
            arrivingIds={arrivingIds}
            waveKeys={waveKeys}
            onOpen={openCard}
            onLike={doubleTapLike}
            chatGroupId={room.chatGroupId}
            chatHistory={room.chatHistory}
            myId={user?.id}
            dockWave={dockWave ? { kind: 'wave', id: `wave-${dockWave.fromUserId}`, fromUserId: dockWave.fromUserId, fromName: dockWave.fromName, at: dockWave.at } : null}
            onOpenChat={() => void openChat()}
            onOpenPerson={(id) => openCard({ id, name: waves.received[id]?.fromName ?? 'Someone' })}
            enter={enter}
            hidden={mode !== 'room'}
            topInset={topInset}
            bottomInset={insets.bottom}
          />
        </Animated.View>
      ) : null}

      {/* The bar floats over every mode, so closing is always in the same place (the Recap draws its own). */}
      {/*
       * Scrolled, the bar glass sits behind the floating chrome from the screen's top, as TopBar's `scrolled` does (TG-01):
       * without it, the faces and the hero ran under the close, Check out and the status bar. Mounted, not faded: glass
       * never fades (§5.2 rule 6), so Reduce Motion has nothing to change. Increase Contrast adds the hairline.
       */}
      {mode === 'ended' || !scrolled ? null : (
        <View testID="blendn-bar" pointerEvents="none" style={[styles.barGlass, { height: barHeight(insets.top, Platform.OS === 'android') }]}>
          <Material role="bar" style={StyleSheet.absoluteFill} />
          {contrast ? <View testID="blendn-bar-contrast" style={styles.contrast} /> : null}
        </View>
      )}
      {mode === 'ended' ? null : (
        <View style={[styles.topBar, { top: barTop(insets.top) }]} pointerEvents="box-none">
          <IconButton icon="chevron-down" accessibilityLabel="Close Blend’n" onPress={onClose} testID="blendn-close" />
          {mode === 'room' && room.event ? (
            <Animated.View entering={reduceMotion ? undefined : glassRise} style={styles.topActions}>
              <ScalePress
                onPress={() => setConfirmingOut(true)}
                pressedScale={PRESS.scale}
                hitSlop={(minTarget() - SIZE.tag) / 2}
                accessibilityRole="button"
                accessibilityLabel="Check out"
                accessibilityHint="Asks first. Removes you from the room; checking back in needs your location again."
                testID="room-check-out"
                style={styles.checkOut}
              >
                <Animated.Text entering={glassContentsIn} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
                  Check out
                </Animated.Text>
              </ScalePress>
              <IconButton
                icon="settings-2"
                accessibilityLabel="Room settings"
                accessibilityHint="Why you are here tonight, and whether people can see your name"
                onPress={() => router.push({ pathname: '/event-preferences/[eventId]', params: { eventId: room.event!.id } as never })}
                testID="room-settings"
              />
            </Animated.View>
          ) : null}
        </View>
      )}

      {/* A wave while you're here: the ✓ capsule, which opens their card (R3-D4 4.2). */}
      {waves.latest ? (
        <WaveToast
          key={`${waves.latest.fromUserId}:${waves.latest.at}`}
          wave={waves.latest}
          onOpen={() => {
            const w = waves.latest
            if (w) openCard({ id: w.fromUserId, name: w.fromName })
          }}
          onDone={() => waves.latest && waveShown(waves.latest)}
        />
      ) : null}

      <PersonCard
        visible={open !== null}
        onClose={() => {
          if (card) forget(card.id)
          setOpen(null)
        }}
        onDismissed={cardGone}
        variant={cardVariant}
        person={{
          face: cardPerson ? faceOf(cardPerson) : { kind: 'creature', pseudonym: card?.name ?? '' },
          name: cardPerson?.name ?? card?.name ?? '',
          age: cardPerson?.age,
          reason: cardPerson ? (cardPerson.matched ? 'You matched' : reasonLine(cardPerson)) : undefined,
          // The line says overlaps[0]; the panel keeps the rest, never the same sentence twice.
          reasons: cardPerson ? reasonLines(cardPerson).filter((r) => r !== cardOverlap?.line) : undefined,
          overlap: cardOverlap ?? undefined,
          chips: cardPerson ? [...cardPerson.interests.slice(0, 8), ...(cardPerson.sign ? [cardPerson.sign] : [])] : undefined,
          badges: parseBadges(cardPerson?.badges)?.map((b) => b.kind),
        }}
        liked={!!cardPerson && (cardPerson.liked || cardPerson.pending) && !cardPerson.matched}
        requested={!!cardPerson?.requested}
        waving={!!card && sent[card.id] === 'busy'}
        waved={!!card && sent[card.id] === 'waved'}
        wavedAtYou={card ? (wavedAtYouLabel(waves.received[card.id]?.at, now) ?? undefined) : undefined}
        refusal={refusal ? { text: refusal.text, action: refusal.checkIn ? { label: 'Check in', onPress: checkInAgain } : undefined } : undefined}
        crewLike={
          cardPerson && personAs && !cardPerson.matched
            ? personAs === 'ask'
              ? { name: 'your crew', onPress: () => cardCrewLike(cardPerson) }
              : { name: personAs.name, emblemSeed: emblemOf(personAs.crewId), onPress: () => cardCrewLike(cardPerson) }
            : undefined
        }
        onLike={() => cardPerson && void like(cardPerson)}
        onWave={() => card && void wave(card.id)}
        onMessage={() => {
          if (!card) return
          const to = card
          closeCardThen(() => setConnectTo(to))
        }}
        onSayHi={() => cardPerson?.conversationId && sayHi(cardPerson.conversationId, cardPerson)}
        onMore={() => card && safety(card)}
        onViewProfile={() => card && openProfile(card)}
        testID="person-card"
      />

      <ConnectSheet
        // A new person is a new draft: the sheet keeps none from the last (SCREENS Flow 4, ConnectSheet).
        key={connectTo?.id ?? 'none'}
        visible={connectTo !== null}
        displayName={connectTo?.name ?? ''}
        theyAreRevealed={Boolean(room.people.find((p) => p.id === connectTo?.id)?.photo)}
        sending={connecting}
        error={connectError}
        onDismiss={() => {
          setConnectTo(null)
          setConnectError(undefined)
        }}
        onSend={async (message) => {
          if (!connectTo) return
          setConnecting(true)
          setConnectError(undefined)
          try {
            // Closed only once the request stands; a failure keeps the sheet and the note, and says so.
            const sent = await room.connect(connectTo.id, message)
            if (sent.stands) setConnectTo(null)
            // In the sheet, under the note: the sheet's scrim dims a toast behind it.
            else setConnectError(sent.refusal ?? 'Couldn’t send the request. Try again.')
          } finally {
            setConnecting(false)
          }
        }}
      />

      {cancelled ? (
        <RoomCancelled
          title={cancelled.title}
          onSeeTonight={() => {
            dismissCancelled()
            void room.refresh()
            void tonight.refresh()
          }}
          onClose={() => {
            dismissCancelled()
            onClose()
          }}
          testID="room-cancelled"
        />
      ) : null}

      {/*
        Faces only where they have been earned (D · 4.4): theirs is a photo only
        if they revealed, else their creature; yours is the mark they know you
        by unless you are named in this room. {name} is the name the room shows.
      */}
      {room.match ? (
        <MomentMatch
          you={myRoomFace({ revealed: controls.revealed, photo: myPhoto, pseudonym: room.match.you ?? myPseudonym, eventId })}
          them={matchPerson?.photo ? { kind: 'photo', uri: matchPerson.photo } : { kind: 'creature', pseudonym: room.match.name }}
          name={room.match.name}
          reason={matchPerson ? reasonLine(matchPerson) : null}
          opener={matchPerson ? openerFor(matchPerson) : null}
          onClose={room.clearMatch}
          onSayHi={() => {
            const m = room.match
            room.clearMatch()
            if (m) sayHi(m.conversationId, { id: matchPerson?.id ?? '', name: m.name }, matchPerson ? openerFor(matchPerson) : null)
          }}
          testID="match-moment"
        />
      ) : null}

      {blend ? (
        <MomentBlend
          {...blend.sides}
          yourLike
          onOpen={() => {
            setBlend(null)
            openBlend(blend.ref, blend.title)
          }}
          onLater={() => setBlend(null)}
          testID="blend-moment"
        />
      ) : null}

      {/* Over Tonight, and over the Room as it takes over: the pour clears itself, so it stays mounted. */}
      {/* Held, filled, until the Room is there; a question first plays it out and clears it onto Tonight (Flow 4 #12–#14). */}
      {checkIn.pours > 0 ? (
        <MomentPour key={checkIn.pours} testID="blendn-pour" frame={passFrame ?? undefined} venue={insideEvent?.venue ?? ''} ready={pourMayHandOff} asks={checkIn.asks} onDone={onPourDone} />
      ) : null}

      <Sheet
        visible={tray.visible}
        onClose={checkIn.dismissTray}
        title={tray.title}
        body={tray.message}
        icon={tray.extra?.icon}
        actions={tray.buttons.map((b) => ({ label: b.label, onPress: b.onPress, loading: b.loading, disabled: b.disabled, kind: b.kind ?? (b.variant === 'primary' ? 'primary' : b.variant === 'destructive' ? 'destructive' : 'secondary') }))}
        testID="blendn-tray"
      >
        {tray.extra?.detail ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary]}>{tray.extra.detail}</Text> : null}
      </Sheet>

      <Sheet
        visible={confirmingOut}
        onClose={() => setConfirmingOut(false)}
        title="Check out of this event?"
        body="You’ll leave the room and its people. To come back in you’ll need to check in again, with your location."
        actions={[
          { label: 'Stay', kind: 'secondary', onPress: () => setConfirmingOut(false) },
          { label: 'Check out', kind: 'destructive', loading: controls.checkOutBusy, onPress: () => void checkOut() },
        ]}
        testID="check-out-confirm"
      />

      {toast ? <Toast key={toast.key} kind={toast.kind} text={toast.text} onDismiss={() => setToast(null)} testID="blendn-toast" /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /** Tonight and the Room are one absolute stack: as flex siblings, a Room mounted under the pour halved Tonight's height (drive 3). */
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  topBar: {
    position: 'absolute',
    left: SPACE.lg,
    right: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  barGlass: { position: 'absolute', top: 0, left: 0, right: 0 },
  contrast: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
  checkOut: {
    height: SIZE.tag,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    justifyContent: 'center',
  },
})
