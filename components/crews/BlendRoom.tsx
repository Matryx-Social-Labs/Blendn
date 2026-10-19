import { router } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { apiClient } from '../../lib/apiClient'
import { markCoachUsed, useCoachMark } from '../../lib/coachMarks'
import { blendSides, blendTitle, crewMessage, type Blend, type BlendPerson, type BlendSide } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import {
  blendWelcome,
  closesAtLine,
  closingSoon,
  peopleLine,
  rememberReveal,
  revealedFor,
  revealRemembered,
  sideShape,
} from '../../lib/crewsScreens'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { closesLine } from '../../lib/crews'
import { markRoomLeft } from '../../lib/roomMembership'
import { showSheet, type Sheet, type SheetOutcome } from '../../lib/sheet'
import { useAuth } from '../../lib/useAuth'
import { serverOffset } from '../../lib/serverClock'
import { useBlends } from '../../lib/useBlends'
import { useNow } from '../../lib/useNow'
import { Button } from '../ds/Button'
import { Creature, creatureFor } from '../ds/Creature'
import { CrewEmblem, EMBLEM_SQUIRCLE } from '../ds/CrewEmblem'
import { RevealSheet, RevealSide } from '../ds/RevealSheet'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { useToast } from '../Toast'
import { OverflowMenu } from './OverflowMenu'

/** A minute: the header's "Closes in 9h" and the T-60 line follow the clock without a read. */
const CLOCK_MS = 60_000
/** flow10b.js `blendRoom`: the header pair is two 40 emblems, the second 12 over, with a 3 pt ink cut. */
const PAIR = 40
const PAIR_STEP = 12
const PAIR_CUT = 3
/** The first-open card's glyph well. */
const WELL = 44

/** The header's overlapped emblems: yours, then theirs (a person is their creature). */
function BlendPair({ mine, theirs }: { mine: BlendSide | null; theirs: BlendSide | null }) {
  const piece = (side: BlendSide | null, cut: boolean) => {
    if (side?.kind === 'crew' && side.emblemSeed) {
      return (
        <View>
          {cut ? (
            <Svg width={PAIR} height={PAIR} viewBox="0 0 100 100" style={[styles.cut, { left: -PAIR_CUT }]}>
              <Path d={EMBLEM_SQUIRCLE} fill={COLOR.ink} />
            </Svg>
          ) : null}
          <CrewEmblem seed={side.emblemSeed} size={PAIR} />
        </View>
      )
    }
    const pseudonym = side?.people[0]?.pseudonym ?? 'Someone'
    return <Creature {...creatureFor(pseudonym)} size={PAIR} ring={cut ? COLOR.ink : undefined} />
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pair}>
      <View style={styles.pairA}>{piece(mine, false)}</View>
      <View style={styles.pairB}>{piece(theirs, true)}</View>
    </View>
  )
}

/** "7 people · Closes in 9h": the clock in Geist Mono, white (flow10b.js `blendRoom`). */
function BlendSubtitle({ blend, now }: { blend: Blend; now: number }) {
  const bold = useBoldText()
  const closes = closesLine(blend.closesAt, now)
  return (
    <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
      {`${peopleLine(blend)}${closes ? ' · ' : ''}`}
      {closes ? <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.ink]}>{closes}</Text> : null}
    </Text>
  )
}

export type BlendRoomChrome = {
  /** The Blend, once the server lists it open to you; null while it loads, or if it is not. */
  blend: Blend | null
  /**
   * It was listed open to you and now is not: its clock ran out, its crew closed, or a block across
   * the sides refused your door (the server's D-9: the pair is hidden from each other, the room goes
   * on for everyone else). For you that is the Blend closing; the room says so, once and plainly.
   */
  gone: boolean
  title: string | null
  leading: ReactNode
  subtitle: ReactNode
  /** What sits between the header and the first message, absolutely placed at `top`. */
  bar: ReactNode
  /** Its height, for the feed to start below it. */
  barSpace: number
  /** The ⋯ menu, the reveal sheet: mount once. */
  overlays: ReactNode
  openMenu: () => void
}

/**
 * The Blend room's chrome inside the room screen (Flow 10 · 10.9): one room,
 * the sides above the feed and the composer under it, not a separate page.
 * Both emblems in the header; your side first, then theirs, each as the
 * emblem (or creature), the name and a tile per person; "Reveal my crew" on
 * yours. Reveal is the one confirmed action: it names the crew, goes only to
 * this Blend, and cannot be undone. The ⋯ has Block someone and Leave.
 *
 * `blendId` null is any other room: nothing is read, nothing drawn. The room draws nothing of this
 * while it shows an outside state of its own (closed, left, removed).
 */
export function useBlendRoom(blendId: string | null, top: number): BlendRoomChrome {
  const { user } = useAuth()
  const myId = user?.id
  const bold = useBoldText()
  const { showToast } = useToast()
  const { blends, reload } = useBlends(!!blendId)
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [height, setHeight] = useState(0)
  const [venue, setVenue] = useState<string | null>(null)
  // The server's clock, not the phone's: a Blend closes when the server says, and a fast or slow phone must not close it early or late.
  const now = useNow(CLOCK_MS) + serverOffset()
  /** One write at a time: a second tap while the first is in flight sends nothing. */
  const inFlight = useRef(false)

  const listed = blendId ? (blends.find((b) => b.blendId === blendId) ?? null) : null
  const blend = listed && Date.parse(listed.closesAt) > now ? listed : null
  const eventId = blend?.eventId
  useEffect(() => {
    if (!eventId) return
    let live = true
    void apiClient.getEvent(eventId).then((r) => live && setVenue(r.success ? (r.data?.venueName ?? null) : null))
    return () => {
      live = false
    }
  }, [eventId])

  // Seen open once is what makes "not listed now" a closing rather than a Blend that never loaded (state adjusted in render).
  const [seen, setSeen] = useState(false)
  if (blend && !seen) setSeen(true)
  const gone = !!blendId && seen && !blend

  const shown = !!blend
  const coach = useCoachMark('blend_first_open', { ready: shown })

  if (!blendId || !blend) {
    return { blend: null, gone, title: null, leading: null, subtitle: null, bar: null, barSpace: 0, overlays: null, openMenu: () => {} }
  }

  const { mine, theirs } = blendSides(blend, myId)
  const title = blendTitle(blend, myId)
  const revealed = revealedFor(mine, revealRemembered(myId, blend.blendId))
  const mineShape = mine ? sideShape(mine, myId, revealed) : null
  const theirShape = theirs ? sideShape(theirs, myId) : null
  const crewName = mineShape?.side.kind === 'crew' ? mineShape.side.name : null
  const closing = closingSoon(blend.closesAt, now) ? closesAtLine(blend.closesAt) : null

  const reveal = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRevealing(true)
    const result = await crewsApi.reveal(blend.blendId)
    inFlight.current = false
    setRevealing(false)
    setAsking(false)
    if (!result.success) return showToast(crewMessage(result, 'blend', 'Couldn’t reveal. Try again.'), 'error')
    H.success()
    if (myId) rememberReveal(myId, blend.blendId)
    // No toast: its "N revealed · M keep it private" needs the server's counts, which do not exist yet.
    void reload()
  }

  const leave = () =>
    showSheet({
      kind: 'actions',
      icon: 'log-out',
      title: 'Leave this Blend?',
      message: 'Only you leave — it goes on for everyone else, and it leaves your Banter.',
      actions: [
        {
          label: 'Leave',
          variant: 'destructive',
          run: async (): Promise<SheetOutcome> => {
            if (inFlight.current) return { ok: true }
            inFlight.current = true
            const result = await apiClient.leaveChatGroup(blend.chatGroupId)
            inFlight.current = false
            if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t leave. Try again.') }
            // The chat must offer Rejoin, not "closed": a Blend's door answers a leaver's read with the same 403 as somebody it took out.
            markRoomLeft(blend.chatGroupId)
            markCoachUsed('blend_first_open')
            router.dismissTo('/(tabs)/chat')
            return { ok: true, toast: 'You left the Blend' }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  /** Block by the handle this Blend gave them: the block route opens it for this Blend's people only. */
  const confirmBlock = (person: BlendPerson): Sheet => {
    const who = person.name ?? person.pseudonym
    return {
      kind: 'actions',
      icon: 'ban',
      title: `Block ${who}?`,
      message:
        'You won’t see each other here or anywhere else on Blend’n, and the Blend goes on for everyone else. They aren’t told. To report something said, long-press the message in the chat.',
      actions: [
        {
          label: 'Block',
          variant: 'destructive',
          run: async (): Promise<SheetOutcome> => {
            if (inFlight.current) return { ok: true }
            inFlight.current = true
            const result = await apiClient.blockUser(person.userId)
            inFlight.current = false
            if (!result.success) return { ok: false, error: crewMessage(result, 'blend', 'Couldn’t block them. Try again.') }
            void reload()
            return { ok: true, toast: `${who} is blocked` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    }
  }

  const pickToBlock = () =>
    showSheet({
      kind: 'actions',
      title: 'Block someone',
      message: 'Pick who. You won’t see each other here or anywhere else on Blend’n, and they aren’t told.',
      layout: 'rows',
      actions: [
        ...(theirs?.people ?? []).filter((p) => p.userId !== myId).map((p) => ({ label: p.name ?? p.pseudonym, icon: 'ban' as const, next: () => confirmBlock(p) })),
        { label: 'Cancel', cancel: true as const },
      ],
    })

  const bar = shown ? (
    <View pointerEvents="box-none" onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={[styles.bar, { top }]}>
      {mineShape ? (
        <RevealSide
          testID="blend-mine"
          mine
          side={mineShape.side}
          people={mineShape.people}
          status={mineShape.status}
          onReveal={revealed ? undefined : () => setAsking(true)}
        />
      ) : null}
      {theirShape ? <RevealSide testID="blend-theirs" side={theirShape.side} people={theirShape.people} /> : null}
      {closing ? (
        <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.quiet]}>
          {closing}
        </Text>
      ) : null}
      {coach.visible ? (
        <View style={styles.card} testID="blend-first-open">
          <View style={styles.well}>
            <Icon name="users" size={ICON.nav} />
          </View>
          <Text accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
            {`${title} · ${peopleLine(blend)}`}
          </Text>
          <Text style={[font('body', bold), styles.secondary]}>{blendWelcome(blend.closesAt, venue)}</Text>
          <View style={styles.cardActions}>
            <Button kind="strong" size="md" label="Got it" pressHaptic={false} onPress={() => markCoachUsed('blend_first_open')} style={styles.flex} />
            <Button kind="secondary" size="md" label="Leave" onPress={leave} style={styles.flex} />
          </View>
        </View>
      ) : null}
    </View>
  ) : null

  return {
    blend,
    gone: false,
    title,
    leading: <BlendPair mine={mine} theirs={theirs} />,
    subtitle: <BlendSubtitle blend={blend} now={now} />,
    bar,
    barSpace: shown ? height : 0,
    openMenu: () => setMenu(true),
    overlays: shown ? (
      <>
        <OverflowMenu
          testID="blend-menu"
          visible={menu}
          onClose={() => setMenu(false)}
          items={[
            ...(theirs?.people.length ? [{ icon: 'ban' as const, label: 'Block someone', onPress: pickToBlock }] : []),
            { icon: 'log-out', label: 'Leave this Blend', onPress: leave, destructive: true },
          ]}
        />
        <RevealSheet visible={asking} onClose={() => setAsking(false)} crew={crewName} onReveal={() => void reveal()} revealing={revealing} />
      </>
    ) : null,
  }
}

const styles = StyleSheet.create({
  pair: { width: PAIR + PAIR_STEP, height: PAIR },
  pairA: { position: 'absolute', left: 0, top: 0 },
  pairB: { position: 'absolute', left: PAIR_STEP, top: 0 },
  cut: { position: 'absolute', top: 0 },
  bar: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter, gap: SPACE.md, zIndex: 3 },
  quiet: { color: COLOR.textTertiary, textAlign: 'center' },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.xl, gap: SPACE.md },
  well: { width: WELL, height: WELL, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  flex: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
