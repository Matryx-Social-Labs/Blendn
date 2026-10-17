import { type RefObject, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AccessibilityInfo, BackHandler, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

import { COLOR, DURATION, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { COACH_MARK_CARET, COACH_MARK_MAX_WIDTH, CoachMark } from './CoachMark'

export type Rect = { x: number; y: number; width: number; height: number }
type Size = { width: number; height: number }

/** How far the hole reaches past the target it frames. */
export const SPOTLIGHT_PAD = SPACE.sm
/**
 * How often the host re-measures its target: a scroll moves it without a layout event.
 * ponytail: polling; drive it from the scroll if it ever shows in a profile.
 */
const MEASURE_MS = 250

/**
 * The dim around a target, as four rects (above, below, left, right) that
 * leave `target` grown by `pad` uncovered, clipped to the window.
 */
export function spotlightRects(target: Rect, window: Size, pad = SPOTLIGHT_PAD): Rect[] {
  const left = Math.max(0, target.x - pad)
  const top = Math.max(0, target.y - pad)
  const right = Math.min(window.width, target.x + target.width + pad)
  const bottom = Math.min(window.height, target.y + target.height + pad)
  return [
    { x: 0, y: 0, width: window.width, height: top },
    { x: 0, y: bottom, width: window.width, height: window.height - bottom },
    { x: 0, y: top, width: left, height: bottom - top },
    { x: right, y: top, width: window.width - right, height: bottom - top },
  ]
}

/** Measuring, in one place: a test can stand in for the native measure. */
export const spotlightMeasure = {
  inWindow(node: View, done: (rect: Rect) => void) {
    node.measureInWindow((x, y, width, height) => done({ x, y, width, height }))
  },
}

export type CoachMarkSpot = {
  /** What it points at: the hole. Measured in window coordinates by the host. */
  target: RefObject<View | null>
  text: string
  /** `below` the target, caret up; `above` it, caret down. */
  place: 'below' | 'above'
  /** The target's corner radius, so the hole follows it. */
  radius?: number
  /** Room between the hole and the tip, past the default (the disc's check-in label sits there). */
  gap?: number
  /** Got it, and Android back. */
  onDismiss: () => void
  /** The target is gone or off screen: it ends, without counting as seen before the dwell. */
  onLost: () => void
  /** The tip must end above this window y (the tab bar); past it, `onOverflow` gets the overlap. */
  bottomLimit?: number
  onOverflow?: (px: number) => void
  testID?: string
}

type Entry = Omit<CoachMarkSpot, 'onDismiss' | 'onLost' | 'onOverflow'> & { latest: () => CoachMarkSpot }

let current: Entry | null = null
const listeners = new Set<() => void>()
function publish(next: Entry | null) {
  current = next
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * A screen's coach mark, drawn by the one `CoachMarkHost` at the root, above
 * everything (the tab bar, the drawer, the lists). The screen passes its
 * target's ref; while `active`, the host dims all but the target and shows the
 * tip beside it. One at a time, as `lib/coachMarks.ts` already guarantees.
 */
export function useCoachMarkSpot(active: boolean, spot: CoachMarkSpot) {
  const latest = useRef(spot)
  useLayoutEffect(() => {
    latest.current = spot
  })
  const { target, text, place, radius, gap, bottomLimit, testID } = spot
  useEffect(() => {
    if (!active) return
    const entry: Entry = { target, text, place, radius, gap, bottomLimit, testID, latest: () => latest.current }
    publish(entry)
    return () => {
      if (current === entry) publish(null)
    }
  }, [active, target, text, place, radius, gap, bottomLimit, testID])
}

const onScreen = (r: Rect, w: Size) => r.width > 0 && r.height > 0 && r.y < w.height && r.y + r.height > 0 && r.x < w.width && r.x + r.width > 0
const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * The root's coach-mark layer (mounted last in app/_layout.tsx, so nothing
 * draws over it). `box-none`: only the dim and the tip take touches, so the
 * target in the hole stays usable. A tap on the dim does nothing; Got it (or
 * Android back) is the way out. Fades on `base`, at once under Reduce Motion.
 * The tip is focused first; the dim is not focusable.
 */
export function CoachMarkHost() {
  const entry = useSyncExternalStore(subscribe, () => current, () => current)
  const win = useWindowDimensions()
  const { width: winWidth, height: winHeight } = win
  const reduceMotion = useReducedMotion()
  // Keyed by its entry, so a new mark never draws at the last one's place.
  const [measured, setMeasured] = useState<{ entry: Entry; rect: Rect } | null>(null)
  const rect = measured && measured.entry === entry ? measured.rect : null
  const tip = useRef<View>(null)

  // Measured now, on every rotation or resize, and on a short poll for scrolls.
  useEffect(() => {
    if (!entry) return
    let alive = true
    const measure = () => {
      const node = entry.target.current
      if (!node) return entry.latest().onLost()
      spotlightMeasure.inWindow(node, (r) => {
        if (!alive) return
        if (!onScreen(r, { width: winWidth, height: winHeight })) return entry.latest().onLost()
        setMeasured((prev) => (prev?.entry === entry && same(prev.rect, r) ? prev : { entry, rect: r }))
      })
    }
    measure()
    const timer = setInterval(measure, MEASURE_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [entry, winWidth, winHeight])

  useEffect(() => {
    if (!entry) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      entry.latest().onDismiss()
      return true
    })
    return () => sub.remove()
  }, [entry])

  const shown = entry !== null && rect !== null
  useEffect(() => {
    if (shown && tip.current) AccessibilityInfo.sendAccessibilityEvent(tip.current, 'focus')
  }, [shown])

  if (!entry || !rect) return null

  const pad = SPOTLIGHT_PAD
  const hole = { x: rect.x - pad, y: rect.y - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }
  const corner = entry.radius ? Math.min(entry.radius + pad, hole.width / 2, hole.height / 2) : 0
  const width = Math.min(win.width - 2 * SPACE.lg, COACH_MARK_MAX_WIDTH)
  // A target narrower than the tip is centred under it; a wider one shares its left edge.
  const left = clamp(rect.width < width ? rect.x + rect.width / 2 - width / 2 : rect.x, SPACE.lg, win.width - width - SPACE.lg)
  const aim = Math.min(rect.x + rect.width / 2, rect.x + SPACE.xl + COACH_MARK_CARET / 2)
  const caretOffset = clamp(aim - left - COACH_MARK_CARET / 2, SPACE.lg, width - SPACE.lg - COACH_MARK_CARET)
  const gap = SPACE.sm + (entry.gap ?? 0)
  const position =
    entry.place === 'below' ? { top: hole.y + hole.height + gap } : { bottom: win.height - hole.y + gap }

  const onTipLayout = (e: LayoutChangeEvent) => {
    const { bottomLimit, onOverflow } = entry.latest()
    const { y, height } = e.nativeEvent.layout
    const over = y + height + SPACE.sm - (bottomLimit ?? Infinity)
    if (over > 0) onOverflow?.(over)
  }

  return (
    <Animated.View
      testID="coach-mark-host"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      entering={reduceMotion ? undefined : FadeIn.duration(DURATION.base)}
      exiting={reduceMotion ? undefined : FadeOut.duration(DURATION.base)}
    >
      {spotlightRects(rect, win, pad).map((r, i) => (
        <View
          key={i}
          testID={`coach-mark-dim-${i}`}
          // Taps on the dim do nothing: Got it is the way out.
          onStartShouldSetResponder={() => true}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.dim, { left: r.x, top: r.y, width: r.width, height: r.height }]}
        />
      ))}
      {corner > 0 ? <HoleCorners hole={hole} radius={corner} /> : null}
      <View ref={tip} style={[styles.tip, position, { left, width }]} onLayout={onTipLayout}>
        <CoachMark
          text={entry.text}
          caret={entry.place === 'below' ? 'top' : 'bottom'}
          caretOffset={caretOffset}
          onDismiss={() => entry.latest().onDismiss()}
          testID={entry.testID}
        />
      </View>
    </Animated.View>
  )
}

/**
 * The hole's rounded corners: in each corner of the hole, the dim outside a
 * quarter circle of `radius` (a clipped ring). Inside the hole, so they never
 * overlap the four rects; they take no touches.
 */
function HoleCorners({ hole, radius: r }: { hole: Rect; radius: number }) {
  const right = hole.x + hole.width - r
  const bottom = hole.y + hole.height - r
  const corners = [
    { x: hole.x, y: hole.y, dx: -r, dy: -r },
    { x: right, y: hole.y, dx: -2 * r, dy: -r },
    { x: hole.x, y: bottom, dx: -r, dy: -2 * r },
    { x: right, y: bottom, dx: -2 * r, dy: -2 * r },
  ]
  return (
    <>
      {corners.map((c, i) => (
        <View key={i} pointerEvents="none" style={[styles.corner, { left: c.x, top: c.y, width: r, height: r }]}>
          <View style={[styles.ring, { left: c.dx, top: c.dy, width: 4 * r, height: 4 * r, borderWidth: r }]} />
        </View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: COLOR.scrim },
  corner: { position: 'absolute', overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: RADIUS.capsule, borderColor: COLOR.scrim },
  tip: { position: 'absolute' },
})
