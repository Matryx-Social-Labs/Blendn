import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated'

import { DURATION, EASING, RISE, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import type { CrewCard } from '../../lib/crews'
import { getNetworkState, subscribeNetworkState } from '../../lib/networkStatus'
import { connect, type SocketConnectionStatus } from '../../lib/socketClient'
import type { RoomPerson } from '../../lib/useRoom'
import type { RoomLens } from '../../lib/roomLens'
import { Banner } from '../ds/Banner'
import { BannerPresence } from '../motion/BannerPresence'
import { StateScreen } from '../ds/StateScreen'
import { SOCKET_GRACE_MS } from '../RealtimeStatusBanner'
import { EveryoneHead, GRID_GAP, GRID_ROW_GAP, MeetNextRow, RoomCrewsRow, RoomGridFace, ShowMore, useGridCell } from './RoomSections'
import { useStageScroll } from './RoomStage'
import { useReducedMotion } from '../../lib/motion'

/*
 * Motion #9, after the pour: People's sections rise 8 on the entrance ease from +60 ms, 28 ms apart (R-A has no hero:
 * the bar holds the room's name and count).
 */
const SECTIONS_AT = 60
/** The content under a section that appears or goes (Friends here) moves on `M.settle`, never jumps. */
const SETTLE = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)

/**
 * #9's entrance on shared values, not layout animations: the Room can be
 * mounted, hidden, under the pour (so its mount cost is paid while the pour
 * holds still) and still enter when it is revealed. Latched at mount: a
 * later `enter` change (or a header part remounting with People | Crews)
 * never replays it.
 */
function useEntrance(enter: boolean, hidden: boolean) {
  const [entering] = useState(enter)
  const s0 = useSharedValue(entering ? 0 : 1)
  const s1 = useSharedValue(entering ? 0 : 1)
  const s2 = useSharedValue(entering ? 0 : 1)
  const started = useRef(false)
  useEffect(() => {
    if (!entering || hidden || started.current) return
    started.current = true
    const ease = Easing.bezier(...EASING.entrance)
    ;[s0, s1, s2].forEach((s, i) => s.set(withDelay(SECTIONS_AT + i * STAGGER.base, withTiming(1, { duration: DURATION.base, easing: ease }))))
  }, [entering, hidden, s0, s1, s2])
  return [useSection(s0), useSection(s1), useSection(s2)] as const
}

function useSection(p: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: (1 - p.get()) * RISE.list }] }))
}

/**
 * The Room's two status banners (Flow 4 Room #12, #13): "Offline." in the
 * destructive tint, or after a 3 s grace "Updates paused." in the warning tint
 * with Try again. Solid, never auto-hiding while true. Without them a dead
 * socket makes the room look quiet rather than broken.
 */
function RoomStatus({ status }: { status: SocketConnectionStatus }) {
  const network = useSyncExternalStore(subscribeNetworkState, getNetworkState)
  const down = status.state !== 'connected'
  const [downLong, setDownLong] = useState(false)
  const [wasDown, setWasDown] = useState(down)
  if (down !== wasDown) {
    setWasDown(down)
    if (!down) setDownLong(false)
  }
  useEffect(() => {
    if (!down) return
    const timer = setTimeout(() => setDownLong(true), SOCKET_GRACE_MS)
    return () => clearTimeout(timer)
  }, [down])
  if (network === 'offline') return <View style={styles.status}><BannerPresence><Banner kind="offline" text="Offline. Some actions won’t work until you’re back." testID="room-offline" /></BannerPresence></View>
  if (!down || !downLong) return null
  return <View style={styles.status}><BannerPresence><Banner kind="paused" text="Updates paused. Trying to reconnect." action={{ label: 'Try again', onPress: () => void connect() }} testID="room-paused" /></BannerPresence></View>
}

export type RoomViewProps = {
  people: RoomPerson[]
  connection: SocketConnectionStatus
  /** You, first in People: your room name and who sees you (`RoomYouCard`). */
  you: ReactNode
  /**
   * How many crews are here, for the "3 crews here" row that opens them (audit A-1); 0 when none is here but you are in one (the row says Crews). Null when no
   * crew is here and you are in none: no row (R2-D1's rule, without the second tab row it used to draw).
   */
  crewsHere: number | null
  view: 'people' | 'crews'
  onView: (view: 'people' | 'crews') => void
  /** Your crews here, in the People view (CrewStrip). */
  crewStrip?: ReactNode
  /** Friends here (the friends at this event who let friends see them): the row under Meet next. Null draws nothing, no gap. */
  friendsHere?: ReactNode
  /** The section has someone in it: the empty state then says nobody *new* (a friend is here, so the room is not empty). */
  friendsPresent?: boolean
  /** The Crews view: its head, its cards, its foot. */
  crewsHead?: ReactNode
  crewCards: CrewCard[]
  renderCrew: (card: CrewCard, index: number) => ReactNode
  crewsFoot?: ReactNode
  picks: RoomPerson[]
  nextShuffleAt: number
  everyoneTitle: string
  everyoneCount: number
  hasMore: boolean
  loadingMore: boolean
  /** How many "Show more" brings, when the room's size says (20 at most). */
  moreCount: number | null
  onMore: () => void
  /** Who arrived this session (their face enters on M.snap, #25). */
  arrivingIds: ReadonlySet<string>
  /** Bumps per person when they wave at you (#51). */
  waveKeys: Readonly<Record<string, number>>
  onOpen: (p: RoomPerson) => void
  /** Flow 5 P-A: the room's lens, for what a Meet next pick says. */
  lens?: RoomLens | null
  /** The double tap's crew like, or null (people are waved at from their card). */
  onLike: ((p: RoomPerson) => void) | null
  /** Meet next's Wave pill: Wave or Wave back. */
  onWave: (p: RoomPerson) => void
  /** Meet next's Say hi, once you both waved. */
  onSayHi: (p: RoomPerson) => void
  /** Fresh out of the pour: the hero rises and the sections follow (#9). Read at mount. */
  enter: boolean
  /** Mounted under the pour, not yet shown: the entrance waits for this to turn false. */
  hidden?: boolean
  topInset: number
  bottomInset: number
}

/**
 * People, the Room's first tab (Flow 5 R-A, Flow 4 Room, R2-D1): you, People | Crews when crews are here, Meet next,
 * the friends here, and Everyone here as a three-column grid of faces (virtualised, paged 20: a concert is 12,480 of
 * them) with Show more. The chat is the Room's other tab (`RoomTabs`). Alive through change, still otherwise: nothing
 * on the grid moves unless something happened.
 */
export function RoomView(props: RoomViewProps) {
  const { onScroll, native, scrollEventThrottle, scrolled, atTop } = useStageScroll()
  const cell = useGridCell()
  const { view, people, enter, hidden = false } = props
  const sections = useEntrance(enter, hidden)
  const reduceMotion = useReducedMotion()
  const crewsView = view === 'crews'
  // People and Crews are separate lists (`key={view}`), so a switch lands on a new one at its top.
  useEffect(atTop, [atTop, view])
  const empty = people.length === 0

  const header = (
    <View style={styles.header}>
      <View style={styles.gutter}>
        <RoomStatus status={props.connection} />
      </View>
      <View style={styles.sections}>
        <Animated.View style={sections[0]}>{props.you}</Animated.View>
        {props.crewsHere !== null ? (
          <Animated.View style={sections[1]}>
            <RoomCrewsRow count={props.crewsHere} back={crewsView} onPress={() => props.onView(crewsView ? 'people' : 'crews')} />
          </Animated.View>
        ) : null}
        {crewsView ? (
          props.crewsHead
        ) : (
          <Animated.View style={[styles.sections, sections[2]]} layout={reduceMotion ? undefined : SETTLE}>
            {props.crewStrip}
            {empty ? (
              <>
                {/* A friend is not a stranger card: they are here (plans/friends-in-room.md), even when nobody else is. */}
                {props.friendsHere}
                <View style={styles.empty}>
                  <StateScreen icon="users" title={props.friendsPresent ? 'No one new here yet' : 'Nobody else is here yet'} body="People show up as they check in." testID="room-empty" />
                </View>
              </>
            ) : (
              <>
                <MeetNextRow picks={props.picks} lens={props.lens} nextShuffleAt={props.nextShuffleAt} width={cell} onOpen={props.onOpen} onWave={props.onWave} onSayHi={props.onSayHi} />
                {props.friendsHere}
                <EveryoneHead title={props.everyoneTitle} count={props.everyoneCount} />
              </>
            )}
          </Animated.View>
        )}
      </View>
    </View>
  )

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={native}>
        <Animated.FlatList<RoomPerson | CrewCard>
          testID="room"
          // Faces in threes, crews one to a row: a new list per view, since numColumns cannot change in place.
          key={view}
          data={crewsView ? props.crewCards : people}
          keyExtractor={(item) => ('crewId' in item ? item.crewId : item.id)}
          numColumns={crewsView ? 1 : 3}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          bounces={false}
          showsVerticalScrollIndicator={false}
          // A scrolled list keeps its place when a section above it arrives or goes: nothing jumps under a thumb. Only then:
          // at the top the anchor pushed the title off the screen when the header grew, on an arrival or on opening.
          maintainVisibleContentPosition={scrolled ? { minIndexForVisible: 0 } : undefined}
          columnWrapperStyle={crewsView ? undefined : styles.gridRow}
          contentContainerStyle={{ paddingTop: props.topInset, paddingBottom: props.bottomInset + SPACE.xxxl * 2 }}
          ListHeaderComponent={header}
          renderItem={({ item, index }) =>
            'crewId' in item ? (
              <View style={styles.crewRow}>{props.renderCrew(item, index)}</View>
            ) : (
              <RoomGridFace
                person={item}
                width={cell}
                index={index}
                arriving={props.arrivingIds.has(item.id)}
                waveKey={props.waveKeys[item.id]}
                onOpen={props.onOpen}
                onLike={props.onLike}
              />
            )
          }
          ListFooterComponent={
            crewsView ? (
              <>{props.crewsFoot}</>
            ) : props.hasMore && !empty ? (
              <ShowMore count={props.moreCount} loading={props.loadingMore} onMore={props.onMore} />
            ) : null
          }
        />
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { marginBottom: SPACE.md },
  gutter: { paddingHorizontal: SPACE.gutter },
  status: { marginBottom: SPACE.lg },
  sections: { gap: SPACE.xl },
  empty: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl },
  gridRow: { paddingHorizontal: SPACE.gutter, columnGap: GRID_GAP, marginBottom: GRID_ROW_GAP },
  crewRow: { marginBottom: SPACE.md },
})
