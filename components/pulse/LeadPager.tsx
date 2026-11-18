import { Image } from 'expo-image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { Rect } from '../ds/chatShared'
import { EventCard, eventLabel } from '../ds/EventCard'
import { ContainedCover } from '../ds/LinkPreviewCard'
import { HeroVideo } from '../scene/SceneHeroMedia'
import { Icon } from '../ui/Icon'
import { BARE_TURN_MS, lapPolicy, nextStep, pipModel, playLabel, STILL_MS, turnOf, type LapStep } from '../../lib/featuredLap'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { COLOR, DURATION, EASING, MATERIAL, RADIUS, REDUCE_MOTION, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { settlePage } from '../../lib/home'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { useLatest } from '../../lib/useLatest'
import { useMediaSaver } from '../../lib/mediaSaver'
import { Text } from '../ui/Text'

/** One page of the lead: what the DS hero card draws, and the event's media for its turn. */
export type LeadCard = {
  id: string
  title: string
  time: string
  venue: string
  distance?: string
  going?: number
  here?: number
  promoted?: boolean
  cover?: string | null
  category?: string
  /** "Featured · Club night". */
  overline?: string
  /** The cover, then the event's media in order (`feedPlaylist`): its turn shows the first three. */
  playlist?: FeedMediaItem[]
}

/** The gap between two pages while one slides over the other. */
const PAGE_GAP = SPACE.md
/** How far past either end the card follows the finger before it stops. */
const OVERDRAG = SPACE.xxl
/** Under Reduce Motion a drag this far (or a flick) is a page change, crossfaded. */
const REDUCED_STEP = SPACE.xxl
// design-exception: the board's pill (pm.css `.cap1`): 28 tall, 12 in from the card's corner, 10 / 4 inside, 8 between its
// parts; pips 6 pt, the active 16, 5 apart; the hairline 0.5 × 14; the glyph's 24 pt circle, its target 44 by slop.
const PILL = { height: 28, inset: 12, padLeft: 10, padRight: 4, gap: 8, sep: 14, glyph: 24, glyphSize: 16 } as const
// design-exception: the board measures 5 between pips (`.pips` gap), between SPACE.xs and SPACE.sm, as before.
const PIP = { on: 16, off: 6, gap: 5 } as const
/** The room the words keep from the pill (the card's own pill row is 12 in). */
const PILL_ROOM = 66 - SPACE.md - SPACE.sm
const PIP_OFF = tint(COLOR.textPrimary, 0.35)
const SEP = tint(COLOR.textPrimary, 0.22)
const PILL_RIM = tint(COLOR.textPrimary, 0.16)
/** The ember underglow behind the lead (board `.lead`: 0 18px 60px -18px): the drawer's one lit object (Foundations C, "lit from behind"). */
const GLOW = MATERIAL.glowLead.map(({ offsetY, radius, spread, color }) => ({ offsetX: 0, offsetY, blurRadius: radius, spreadDistance: spread, color }))
/** The board's 0.5 pt light rim round the card. */
const RIM = 0.5
const CROSSFADE = { duration: REDUCE_MOTION.duration.base, easing: Easing.bezier(...EASING.standard) } as const
/** FeedMedia's dissolve: each item in over the one before, 320 ms on the entrance curve; kept under Reduce Motion (a fade, not a cut). */
const ITEM_IN = FadeIn.duration(DURATION.medium).easing(Easing.bezier(...EASING.entrance)).reduceMotion(ReduceMotion.Never)
const HIT = (44 - PILL.glyph) / 2

const START: LapStep = { event: 0, item: 0, lapDone: false }

/** What a screen reader hears for the lead: "Featured, 1 of 3", then the card as the DS card says it (Promoted first). */
export function leadLabel(card: LeadCard, index: number, count: number, paused = false): string {
  const head = count > 1 ? `Featured, ${index + 1} of ${count}${paused ? ', paused' : ''}` : 'Featured'
  return `${head}. ${eventLabel(card)}`
}

/**
 * The active card's media for its turn (FeedMedia's rules, restored): the cover is always mounted underneath, so a clip
 * that stalls shows a photograph, never black; each item dissolves in over the one before; a clip is muted and plays to
 * its own end over its poster (SceneHero's `HeroVideo`: the 15 s watchdog skips one that never loads). Only this card has
 * a player. Every surface is fit rule B (`ContainedCover auto`).
 */
function TurnMedia({
  items,
  at,
  clips,
  paused,
  onClipDone,
  onClipReady,
}: {
  items: FeedMediaItem[]
  at: number
  clips: boolean
  paused: boolean
  onClipDone: () => void
  /** The clip on screen is ready, with its length in seconds. */
  onClipReady: (durationSec: number) => void
}) {
  const [framed, setFramed] = useState<string | null>(null)
  const [fit, setFit] = useState<'cover' | 'contain'>('contain')
  const floor = items[0]
  const current = items[at]
  const still = (item: FeedMediaItem) => (item.kind === 'image' ? item.url : item.posterUrl)
  const floorUri = floor ? still(floor) : null
  const key = current ? `${current.url}-${at}` : ''
  const playing = current?.kind === 'video' && clips
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {floorUri ? <ContainedCover uri={floorUri} auto /> : null}
      {current && at > 0 ? (
        <Animated.View key={key} entering={ITEM_IN} style={StyleSheet.absoluteFill}>
          {still(current) ? (
            <ContainedCover uri={still(current) as string} auto fillOnly={playing && framed === key} onFit={setFit} />
          ) : (
            // A clip with no poster of its own: the cover underneath must not show in its bars (never another picture,
            // SCRUM-1066); the card's dark surface does, as the event hero's.
            <View testID="pulse-lead-clip-ground" style={[StyleSheet.absoluteFill, styles.clipGround]} />
          )}
        </Animated.View>
      ) : null}
      {playing && current?.kind === 'video' ? (
        <HeroVideo
          key={key}
          source={current.url}
          paused={paused}
          loop={false}
          fit={fit}
          onEnded={onClipDone}
          onFailed={onClipDone}
          onReady={onClipReady}
          onFramed={(drawn) => setFramed((was) => (drawn ? key : was === key ? null : was))}
        />
      ) : null}
    </View>
  )
}

/**
 * The Pulse's lead card, Featured C "one lap, lit not flown" (pulse-media 05–07 and pulse-map 10, owner 2026-11-17).
 *
 * - One lap through Featured, in the order it is given (the screen orders it nearest first): each event's turn is its
 *   cover and the next two items, stills 4 s with a 320 ms dissolve, a clip muted to its own end over its poster; a card
 *   with only its cover fills its pip over 6 s. Then the next event slides in and its venue lights on the map in place
 *   (`onLight`: the camera never moves for it). After the last, it rests on the first cover.
 * - The active pip fills over the event's turn; past five events the pill reads "4 / 12". Pause/Play sits on the pill.
 * - A swipe ends the lap for the visit and flies the map to that venue (`onPage`); so does a touch on the map
 *   (`tookOver`). A finger on the card holds it. Nothing runs off screen (`visible`), in another tab, in the background,
 *   for a screen reader or under Reduce Motion; Play runs it again (stills only under Reduce Motion). Low Power and
 *   cellular show a clip's poster (`useMediaSaver`).
 * - A screen reader hears one element ("Featured, 1 of 3. …"), adjustable by page; activate opens it.
 */
export function LeadPager({
  cards,
  width,
  height,
  onOpen,
  onPage,
  onLight,
  onPressIn,
  onLongPress,
  visible = true,
  screenReader = false,
  tookOver: mapTookOver = false,
  testID = 'pulse-lead',
}: {
  cards: LeadCard[]
  width: number
  height: number
  onOpen: (index: number) => void
  /** A swipe settled on this page: the map flies there. */
  onPage?: (index: number) => void
  /** The lap moved on to this page by itself: the map lights its venue where it stands. */
  onLight?: (index: number) => void
  onPressIn?: (index: number) => void
  onLongPress?: (index: number, anchor: Rect) => void
  /** The lead can be seen: its tab, its pane, the drawer at rest, the list not past it. */
  visible?: boolean
  screenReader?: boolean
  /** The map was touched this visit: the lap is over (pulse-map, "your touch wins"). */
  tookOver?: boolean
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  // Low Power or cellular: a clip shows its poster (no decoder), stills still rotate.
  const { lowPower, expensiveNetwork } = useMediaSaver()
  const count = cards.length
  const [step, setStep] = useState<LapStep>(START)
  const [play, setPlay] = useState<'auto' | 'paused' | 'playing'>('auto')
  const [swiped, setSwiped] = useState(false)
  const [touching, setTouching] = useState(false)
  // Unknown at launch on some platforms (and in tests): only a known background or inactive state holds the lap.
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
  const shown = Math.min(step.event, Math.max(0, count - 1))
  const stepRef = useLatest(step)
  const turn = useMemo(() => turnOf(cards[shown]?.playlist ?? []), [cards, shown])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'))
    return () => sub.remove()
  }, [])

  const inputs = {
    tabFocused: true,
    appActive,
    inView: visible,
    touching,
    screenReader,
    reduceMotion,
    lowPower,
    expensiveNetwork,
    play,
    tookOver: swiped || mapTookOver,
    lapDone: step.lapDone,
  }
  const policy = lapPolicy(inputs)
  // A clip stays mounted (holding its frame) through a finger on the card or Pause: only what would stop the lap for good
  // takes the player down.
  const clipMounts = lapPolicy({ ...inputs, touching: false, play: play === 'paused' ? 'auto' : play }).clips
  // Off screen or in the background: back to the cover (FeedMedia's rule), so a return resumes the turn from it. Reset in
  // render, not an effect: nothing past here draws the item while hidden, and it is one commit sooner.
  if ((!visible || !appActive) && step.item !== 0) setStep({ ...step, item: 0 })
  const item = Math.min(step.item, Math.max(0, turn.length - 1))
  const current = turn[item]

  const step_ = useCallback(() => {
    const at = stepRef.current
    const next = nextStep(at, count, Math.max(1, turnOf(cards[at.event]?.playlist ?? []).length))
    setStep(next)
    if (next.event !== at.event) onLight?.(next.event)
    // The lap's end is the rest: Play from here is a new lap.
    if (next.lapDone) setPlay((p) => (p === 'playing' ? 'auto' : p))
  }, [count, cards, onLight, stepRef])

  // The active pip fills over the event's turn: each item's share of it, over the item's dwell.
  const fill = useSharedValue(0)
  const items = Math.max(1, turn.length)
  const clipPlays = current?.kind === 'video' && policy.clips
  // The next item's still and the next event's cover are fetched ahead; never a clip (no prefetch on a metered network).
  useEffect(() => {
    const ahead = [turn[item + 1], cards[shown + 1]?.playlist?.[0]]
      .map((m) => (m ? (m.kind === 'image' ? m.url : m.posterUrl) : null))
      .filter((u): u is string => !!u)
    if (ahead.length) Image.prefetch(ahead).catch(() => {})
  }, [turn, item, cards, shown])
  const dwell = turn.length <= 1 ? BARE_TURN_MS : STILL_MS
  // A playing clip's length, once it says: its share of the pip fills over it (the clip's end, not a timer, moves on).
  const [clip, setClip] = useState<{ key: string; ms: number } | null>(null)
  const clipKey = `${shown}-${item}`
  const clipMs = clip?.key === clipKey ? clip.ms : null
  useEffect(() => {
    if (!policy.advances || !clipPlays || !clipMs) return
    fill.set(withTiming((item + 1) / items, { duration: clipMs, easing: Easing.linear }))
  }, [policy.advances, clipPlays, clipMs, item, items, fill])
  useEffect(() => {
    if (!policy.advances || clipPlays) {
      cancelAnimation(fill)
      if (!policy.advances) fill.set(step.lapDone || reduceMotion ? 0 : item / items)
      return
    }
    fill.set(item / items)
    fill.set(withTiming((item + 1) / items, { duration: dwell, easing: Easing.linear }))
    const id = setTimeout(step_, dwell)
    return () => clearTimeout(id)
  }, [policy.advances, clipPlays, item, items, dwell, step_, fill, step.lapDone, reduceMotion, shown])

  const step0 = step.event
  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= count || next === step0) return
      H.select()
      setSwiped(true)
      setStep({ event: next, item: 0, lapDone: false })
      onPage?.(next)
    },
    [count, step0, onPage]
  )

  const x = useSharedValue(0)
  const fade = useSharedValue(1)
  const dragFrom = useSharedValue(0)
  const page = width + PAGE_GAP
  // A page the gesture already sprang to, with its release speed: the effect below must not restart that spring without it.
  const sprung = useSharedValue(-1)
  useEffect(() => {
    const to = -shown * page
    if (sprung.get() === shown) {
      sprung.set(-1)
      return
    }
    if (reduceMotion) {
      x.set(to)
      fade.set(0)
      fade.set(withTiming(1, CROSSFADE))
      return
    }
    x.set(withSpring(to, SPRING.settle))
  }, [shown, page, reduceMotion, x, fade, sprung])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Sideways intent only: a vertical drag is the list's scroll.
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .enabled(count > 1)
        .onStart(() => {
          dragFrom.set(x.get())
        })
        .onUpdate((e) => {
          if (reduceMotion) return
          x.set(Math.min(OVERDRAG, Math.max(-(count - 1) * page - OVERDRAG, dragFrom.get() + e.translationX)))
        })
        .onEnd((e) => {
          const from = Math.round(-dragFrom.get() / page)
          if (reduceMotion) {
            const moved = e.translationX <= -REDUCED_STEP ? 1 : e.translationX >= REDUCED_STEP ? -1 : 0
            const next = Math.min(count - 1, Math.max(0, from + moved))
            if (next !== from) scheduleOnRN(go, next)
            return
          }
          const next = settlePage(x.get(), e.velocityX, page, count, from)
          x.set(withSpring(-next * page, { ...SPRING.settle, velocity: e.velocityX }))
          if (next !== from) {
            sprung.set(next)
            scheduleOnRN(go, next)
          }
        }),
    [count, page, reduceMotion, x, dragFrom, go, sprung]
  )

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], opacity: fade.get() }))
  const filled = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }))

  const togglePlay = () => {
    if (policy.advances) {
      setPlay('paused')
      return
    }
    // Play after the lap starts a new one from the first cover.
    if (step.lapDone) setStep(START)
    setPlay('playing')
  }

  if (!count) return null
  const card = cards[shown]
  const pips = pipModel(count, shown)
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={leadLabel(card, shown, count, !policy.advances)}
      accessibilityHint={count > 1 ? 'Swipe up or down for the next featured event. Double-tap to open it.' : 'Double-tap to open it.'}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }, ...(onLongPress ? [{ name: 'longpress', label: 'Quick actions' }] : [])]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName
        if (name === 'increment') go(shown + 1)
        else if (name === 'decrement') go(shown - 1)
        else if (name === 'activate') onOpen(shown)
      }}
      // A finger on the card holds the lap; lifting it (or a gesture taking it) lets go.
      onTouchStart={() => setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
      style={[styles.frame, { width, height }]}
    >
      {/* The glow sits behind the frame, not on the sliding track: the track clips, and the light is the lead's, not a page's. */}
      <View testID="pulse-lead-glow" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow]} />
      <View style={styles.clip}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.track, { width: count * page }, track]}>
            {cards.map((c, i) => (
              <View key={c.id} style={{ width, height, marginRight: PAGE_GAP }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <EventCard
                  kind="hero"
                  layout="lead"
                  {...c}
                  media={
                    i === shown && turn.length > 1 ? (
                      <TurnMedia
                        items={turn}
                        at={item}
                        clips={clipMounts}
                        paused={!policy.advances}
                        onClipDone={step_}
                        onClipReady={(sec) => setClip({ key: clipKey, ms: Math.max(0, sec) * 1000 })}
                      />
                    ) : undefined
                  }
                  corner={<View style={styles.pillRoom} />}
                  onPress={() => onOpen(i)}
                  onPressIn={onPressIn ? () => onPressIn(i) : undefined}
                  onLongPress={onLongPress ? (anchor) => onLongPress(i, anchor) : undefined}
                  style={{ width, height }}
                  testID={`${testID}-card-${i}`}
                />
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>
      <View testID="pulse-lead-rim" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim]} />
      {/* Over the pages, not on one: the pill stays put while the card slides under it, as the board's does. */}
      <View testID="pulse-lead-pill" style={styles.pill}>
        {count > 1 || pips.counter ? (
          <View style={styles.pips} pointerEvents="none">
            {pips.counter ? (
              <Text variant="caption" color={COLOR.textPrimary} testID="pulse-lead-counter">
                {pips.counter}
              </Text>
            ) : null}
            {Array.from({ length: pips.pips }, (_, i) => (
              <View key={i} testID={`pulse-lead-pip-${i}`} style={[styles.pip, i === pips.active ? styles.pipOn : styles.pipOff]}>
                {i === pips.active ? <Animated.View testID="pulse-lead-fill" style={[styles.pipFill, filled]} /> : null}
              </View>
            ))}
          </View>
        ) : null}
        {count > 1 ? <View style={styles.sep} /> : null}
        <Pressable
          testID="pulse-lead-play"
          accessibilityRole="button"
          accessibilityLabel={playLabel({ advances: policy.advances, lapDone: step.lapDone })}
          hitSlop={HIT}
          onPress={togglePlay}
          style={styles.glyph}
        >
          <Icon name={policy.advances ? 'pause' : 'play'} size={PILL.glyphSize} color={COLOR.textPrimary} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
  glow: { borderRadius: RADIUS.card, backgroundColor: COLOR.ink, boxShadow: GLOW },
  clip: { flex: 1, borderRadius: RADIUS.card, overflow: 'hidden' },
  rim: { borderRadius: RADIUS.card, borderWidth: RIM, borderColor: COLOR.hairline },
  track: { flexDirection: 'row', height: '100%' },
  pill: {
    position: 'absolute',
    top: PILL.inset,
    right: PILL.inset,
    height: PILL.height,
    borderRadius: PILL.height / 2,
    paddingLeft: PILL.padLeft,
    paddingRight: PILL.padRight,
    gap: PILL.gap,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MATERIAL.scrimPill,
    borderWidth: RIM,
    borderColor: PILL_RIM,
  },
  pillRoom: { width: PILL_ROOM },
  pips: { flexDirection: 'row', alignItems: 'center', gap: PIP.gap },
  pip: { height: PIP.off, borderRadius: RADIUS.capsule, overflow: 'hidden' },
  pipOn: { width: PIP.on, backgroundColor: PIP_OFF },
  pipOff: { width: PIP.off, backgroundColor: PIP_OFF },
  pipFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: COLOR.textPrimary },
  sep: { width: RIM, height: PILL.sep, backgroundColor: SEP },
  clipGround: { backgroundColor: COLOR.surfaceSunken },
  glyph: { width: PILL.glyph, height: PILL.glyph, alignItems: 'center', justifyContent: 'center' },
})
