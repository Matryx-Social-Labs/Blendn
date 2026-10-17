import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

import { DURATION, EASING, RISE, SPACE, SPRING, STAGGER } from '../../lib/design/tokens'
import type { CrewCard } from '../../lib/crews'
import { getNetworkState, subscribeNetworkState } from '../../lib/networkStatus'
import { connect, type SocketConnectionStatus } from '../../lib/socketClient'
import type { ChatHistory } from '../../lib/dockHistory'
import type { RoomPerson } from '../../lib/useRoom'
import { Banner } from '../ds/Banner'
import type { Face } from '../ds/Facepile'
import { SegmentedControl } from '../ds/SegmentedControl'
import { StateScreen } from '../ds/StateScreen'
import { SOCKET_GRACE_MS } from '../RealtimeStatusBanner'
import { ChatDock, type DockLine } from './ChatDock'
import { EveryoneHead, GRID_GAP, MeetNextRow, RoomGridFace, RoomHero, ShowMore, useGridCell } from './RoomSections'
import { useStageScroll } from './RoomStage'

/*
 * Motion #9, after the pour: the Room's hero rises 12 on M.travel and its
 * sections follow from +60 ms, 28 ms apart, rising 8 on the entrance ease.
 */
const HERO_RISE = SPACE.md
const SECTIONS_AT = 60

/**
 * #9's entrance on shared values, not layout animations: the Room can be
 * mounted, hidden, under the pour (so its mount cost is paid while the pour
 * holds still) and still enter when it is revealed. Latched at mount: a
 * later `enter` change (or a header part remounting with People | Crews)
 * never replays it.
 */
function useEntrance(enter: boolean, hidden: boolean) {
  const [entering] = useState(enter)
  const hero = useSharedValue(entering ? HERO_RISE : 0)
  const s0 = useSharedValue(entering ? 0 : 1)
  const s1 = useSharedValue(entering ? 0 : 1)
  const s2 = useSharedValue(entering ? 0 : 1)
  const started = useRef(false)
  useEffect(() => {
    if (!entering || hidden || started.current) return
    started.current = true
    hero.set(withSpring(0, SPRING.travel))
    const ease = Easing.bezier(...EASING.entrance)
    ;[s0, s1, s2].forEach((s, i) => s.set(withDelay(SECTIONS_AT + i * STAGGER.base, withTiming(1, { duration: DURATION.base, easing: ease }))))
  }, [entering, hidden, hero, s0, s1, s2])
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hero.get() }] }))
  return { heroStyle, sections: [useSection(s0), useSection(s1), useSection(s2)] as const }
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
  if (network === 'offline') return <Banner kind="offline" text="Offline. Some actions won’t work until you’re back." testID="room-offline" />
  if (!down || !downLong) return null
  return <Banner kind="paused" text="Updates paused. Trying to reconnect." action={{ label: 'Try again', onPress: () => void connect() }} testID="room-paused" />
}

export type RoomViewProps = {
  title: string
  hereCount: number
  checkedInAt: string | null
  me: Face
  people: RoomPerson[]
  arrivals: RoomPerson[]
  connection: SocketConnectionStatus
  /** The visibility line, always on (`VisibilityBanner`). */
  visibility: ReactNode
  /** People | Crews: shown when a crew is here or you are in one (R2-D1). */
  segments: boolean
  view: 'people' | 'crews'
  onView: (view: 'people' | 'crews') => void
  /** Your crews here, in the People view (CrewStrip). */
  crewStrip?: ReactNode
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
  /** The double tap's like, or null when a like would have to ask first (then a double tap just opens the card). */
  onLike: ((p: RoomPerson) => void) | null
  chatGroupId: string | null
  /** The room's first read of its chat, for the dock (`useRoom`). */
  chatHistory?: ChatHistory | null
  myId?: string
  dockWave: Extract<DockLine, { kind: 'wave' }> | null
  onOpenChat: () => void
  onOpenPerson: (userId: string) => void
  /** Fresh out of the pour: the hero rises and the sections follow (#9). Read at mount. */
  enter: boolean
  /** Mounted under the pour, not yet shown: the entrance waits for this to turn false. */
  hidden?: boolean
  topInset: number
  bottomInset: number
}

/**
 * The Room (Flow 4 Room, R3-0, R2-D1): the hero, the visibility line, People |
 * Crews, Meet next, Everyone here as a three-column grid of faces
 * (virtualised: a busy night is a hundred of them), Show more, and the chat
 * dock floating at the bottom. Alive through change, still otherwise: nothing
 * on the grid moves unless something happened.
 */
export function RoomView(props: RoomViewProps) {
  const { onScroll, native, scrollEventThrottle } = useStageScroll()
  const cell = useGridCell()
  const { view, people, enter, hidden = false } = props
  const entrance = useEntrance(enter, hidden)
  const crewsView = view === 'crews'
  const empty = people.length === 0

  const header = (
    <View style={styles.header}>
      <View style={styles.gutter}>
        <RoomStatus status={props.connection} />
      </View>
      <Animated.View style={entrance.heroStyle}>
        <RoomHero
          title={props.title}
          hereCount={props.hereCount}
          checkedInAt={props.checkedInAt}
          me={props.me}
          arrivals={props.arrivals}
          people={people}
        />
      </Animated.View>
      <Animated.View style={[styles.gutter, entrance.sections[0]]}>
        {props.visibility}
      </Animated.View>
      {props.segments ? (
        <Animated.View style={[styles.gutter, entrance.sections[1]]}>
          <SegmentedControl
            items={['People', 'Crews']}
            selected={crewsView ? 1 : 0}
            onChange={(i) => props.onView(i === 1 ? 'crews' : 'people')}
            testID="room-segments"
          />
        </Animated.View>
      ) : null}
      {crewsView ? (
        props.crewsHead
      ) : (
        <Animated.View style={[styles.sections, entrance.sections[2]]}>
          {props.crewStrip}
          {empty ? (
            <View style={styles.empty}>
              <StateScreen icon="users" title="Nobody else is here yet" body="People show up as they check in." testID="room-empty" />
            </View>
          ) : (
            <>
              <MeetNextRow picks={props.picks} nextShuffleAt={props.nextShuffleAt} width={cell} onOpen={props.onOpen} />
              <EveryoneHead title={props.everyoneTitle} count={props.everyoneCount} />
            </>
          )}
        </Animated.View>
      )}
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
      <ChatDock
        chatGroupId={props.chatGroupId}
        history={props.chatHistory}
        myId={props.myId}
        wave={props.dockWave}
        onOpen={props.onOpenChat}
        onOpenPerson={props.onOpenPerson}
        bottomInset={props.bottomInset}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: SPACE.lg, marginBottom: SPACE.md },
  gutter: { paddingHorizontal: SPACE.gutter },
  sections: { gap: SPACE.xl },
  empty: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl },
  gridRow: { paddingHorizontal: SPACE.gutter, columnGap: GRID_GAP, marginBottom: GRID_GAP },
  crewRow: { marginBottom: SPACE.md },
})
