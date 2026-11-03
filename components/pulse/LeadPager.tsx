import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import type { Rect } from '../ds/chatShared'
import { EventCard, eventLabel } from '../ds/EventCard'
import { COLOR, EASING, MATERIAL, RADIUS, REDUCE_MOTION, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { settlePage } from '../../lib/home'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'

/** One page of the lead: what the DS hero card draws. */
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
}

/** The gap between two pages while one slides over the other. */
const PAGE_GAP = SPACE.md
/** How far past either end the card follows the finger before it stops. */
const OVERDRAG = SPACE.xxl
/** Under Reduce Motion a drag this far (or a flick) is a page change, crossfaded. */
const REDUCED_STEP = SPACE.xxl
/** Board `.dots`: 6 pt pips, the page's own 16 pt, 5 apart, 35% off; 18 pt in from the card's top-right corner. */
// design-exception: the board measures 5 between pips (`.dots` gap), between SPACE.xs and SPACE.sm.
const PIP = { on: 16, off: 6, gap: 5, inset: 18 } as const
/** Board `.promo` sits at right 66: the room the dots keep beside the Promoted pill (the card's own pill row is 12 in). */
const PIPS_ROOM = 66 - SPACE.md - SPACE.sm
const PIP_OFF = tint(COLOR.textPrimary, 0.35)
/** The ember underglow behind the lead (board `.lead`: 0 18px 60px -18px): the drawer's one lit object (Foundations C, "lit from behind"). */
const GLOW = MATERIAL.glowLead.map(({ offsetY, radius, spread, color }) => ({ offsetX: 0, offsetY, blurRadius: radius, spreadDistance: spread, color }))
/** The board's 0.5 pt light rim round the card. */
const RIM = 0.5
const CROSSFADE = { duration: REDUCE_MOTION.duration.base, easing: Easing.bezier(...EASING.standard) } as const

/** What a screen reader hears for the lead: "Featured, 1 of 3", then the card as the DS card says it (Promoted first). */
export function leadLabel(card: LeadCard, index: number, count: number): string {
  const head = count > 1 ? `Featured, ${index + 1} of ${count}` : 'Featured'
  return `${head}. ${eventLabel(card)}`
}

function Pips({ count, page }: { count: number; page: number }) {
  return (
    <View pointerEvents="none" style={styles.pips}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} testID={`pulse-lead-pip-${i}`} style={[styles.pip, i === page ? styles.pipOn : styles.pipOff]} />
      ))}
    </View>
  )
}

/**
 * The Pulse's lead card (Flow 3 · Pulse, Option C, owner pick 2026-11-03): Featured as a pager of up to three DS hero
 * cards, lit from behind in ember, with pips top-right.
 *
 * - The card follows the finger and settles on `SPRING.settle` with the release's speed; a page change plays `H.select`
 *   and tells the screen (`onPage`), which moves the map to that venue and lights it. A tap opens the event, silently.
 * - Reduce Motion: the card does not slide; a drag past 32 pt (or a flick) crossfades to the next page over 200 ms.
 * - A screen reader hears one element ("Featured, 1 of 3. …, Promoted first"), adjustable by page; activate opens it.
 */
export function LeadPager({
  cards,
  width,
  height,
  onOpen,
  onPage,
  onPressIn,
  onLongPress,
  testID = 'pulse-lead',
}: {
  cards: LeadCard[]
  width: number
  height: number
  onOpen: (index: number) => void
  onPage?: (index: number) => void
  onPressIn?: (index: number) => void
  onLongPress?: (index: number, anchor: Rect) => void
  testID?: string
}) {
  const reduceMotion = useReducedMotion()
  const count = cards.length
  const [page, setPage] = useState(0)
  const shown = Math.min(page, Math.max(0, count - 1))
  const step = width + PAGE_GAP
  const x = useSharedValue(0)
  const fade = useSharedValue(1)
  const dragFrom = useSharedValue(0)
  // A page the gesture already sprang to, with its release speed: the effect below must not restart that spring without it.
  const sprung = useSharedValue(-1)

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= count || next === shown) return
      H.select()
      setPage(next)
      onPage?.(next)
    },
    [count, shown, onPage]
  )

  useEffect(() => {
    const to = -shown * step
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
  }, [shown, step, reduceMotion, x, fade, sprung])

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
          x.set(Math.min(OVERDRAG, Math.max(-(count - 1) * step - OVERDRAG, dragFrom.get() + e.translationX)))
        })
        .onEnd((e) => {
          const from = Math.round(-dragFrom.get() / step)
          if (reduceMotion) {
            const moved = e.translationX <= -REDUCED_STEP ? 1 : e.translationX >= REDUCED_STEP ? -1 : 0
            const next = Math.min(count - 1, Math.max(0, from + moved))
            if (next !== from) scheduleOnRN(go, next)
            return
          }
          const next = settlePage(x.get(), e.velocityX, step, count, from)
          x.set(withSpring(-next * step, { ...SPRING.settle, velocity: e.velocityX }))
          if (next !== from) {
            sprung.set(next)
            scheduleOnRN(go, next)
          }
        }),
    [count, step, reduceMotion, x, dragFrom, go, sprung]
  )

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], opacity: fade.get() }))

  if (!count) return null
  const current = cards[shown]
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={leadLabel(current, shown, count)}
      accessibilityHint={count > 1 ? 'Swipe up or down for the next featured event. Double-tap to open it.' : 'Double-tap to open it.'}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }, ...(onLongPress ? [{ name: 'longpress', label: 'Quick actions' }] : [])]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName
        if (name === 'increment') go(shown + 1)
        else if (name === 'decrement') go(shown - 1)
        else if (name === 'activate') onOpen(shown)
      }}
      style={[styles.frame, { width, height }]}
    >
      {/* The glow sits behind the frame, not on the sliding track: the track clips, and the light is the lead's, not a page's. */}
      <View testID="pulse-lead-glow" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow]} />
      <View style={styles.clip}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.track, { width: count * step }, track]}>
            {cards.map((card, i) => (
              <View key={card.id} style={{ width, height, marginRight: PAGE_GAP }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <EventCard
                  kind="hero"
                  layout="lead"
                  {...card}
                  corner={count > 1 ? <View style={styles.pipsRoom} /> : undefined}
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
      {/* Over the pages, not on one: the dots stay put while the card slides under them, as the board's do. */}
      {count > 1 ? <Pips count={count} page={shown} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
  glow: { borderRadius: RADIUS.card, backgroundColor: COLOR.ink, boxShadow: GLOW },
  clip: { flex: 1, borderRadius: RADIUS.card, overflow: 'hidden' },
  rim: { borderRadius: RADIUS.card, borderWidth: RIM, borderColor: COLOR.hairline },
  track: { flexDirection: 'row', height: '100%' },
  pips: { position: 'absolute', top: PIP.inset, right: PIP.inset, flexDirection: 'row', gap: PIP.gap },
  pipsRoom: { width: PIPS_ROOM },
  pip: { height: PIP.off, borderRadius: RADIUS.capsule },
  pipOn: { width: PIP.on, backgroundColor: COLOR.textPrimary },
  pipOff: { width: PIP.off, backgroundColor: PIP_OFF },
})
