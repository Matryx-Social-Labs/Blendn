import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

import { COLOR, EASING, SPRING } from '../../lib/design/tokens'
import { SHOW_WATCHDOG_MS, useQueuedModal } from '../../lib/modalTurn'
import { useLatest } from '../../lib/useLatest'
import { tint } from '../../lib/theme'
import { Grain } from './Grain'
import { Orbs, type OrbSet } from './Orbs'
import { useReduceTransparency } from './shared'

/*
 * What the five moments share (DESIGN-BRIEF §9.1 rule 6, §9.3 #9 and #11): a
 * beat clock that a skip runs out, the timed and sprung moves on the tokens,
 * and the L4 stage itself.
 */

/** Each moment picks its own Reduce Motion path, so the system setting skips nothing here. */
const NEVER = ReduceMotion.Never

/** A timed effect (opacity, a fill): never overshoots (§9.1 rule 4). */
export function fade(to: number, duration: number, delay = 0, easing: keyof typeof EASING = 'gentle') {
  const [x1, y1, x2, y2] = EASING[easing]
  return withDelay(delay, withTiming(to, { duration, easing: Easing.bezier(x1, y1, x2, y2), reduceMotion: NEVER }), NEVER)
}

/** A spatial move on one of the seven springs. */
export const spring = (to: number, name: keyof typeof SPRING, delay = 0) => withDelay(delay, withSpring(to, { ...SPRING[name], reduceMotion: NEVER }), NEVER)

/** A person's face in a moment: a photo only where they are named to you, else their creature (from the pseudonym). */
export type MomentFace = { kind: 'photo'; uri: string } | { kind: 'creature'; pseudonym: string }

/** Something that happens once at `at` ms into a moment: its haptic, buttons going live, the hand-off. */
export type Beat = { at: number; run: () => void }

/**
 * Plays each beat once, at its time. `skip()` plays every beat still to come
 * at once, in order: a skipped moment still lands its haptic (it is the news,
 * not decoration) and still hands off, and nothing plays twice.
 * The beats are read at mount (a moment plays once); their callbacks are read
 * fresh when they fire. `running`: the clock starts when it turns true (the
 * moment is on screen, `onShown`), so nothing plays out of sight.
 *
 * ponytail: a JS timer, while the moves run on the UI thread; a JS thread busy
 * mounting the moment can land a haptic a frame or two after its frame. Fire
 * it from the animation's completion (`scheduleOnRN`) if a device shows it.
 */
export function useBeats(beats: Beat[], running = true) {
  const latest = useRef(beats)
  useEffect(() => {
    latest.current = beats
  })
  const state = useRef({ played: new Set<number>(), timers: [] as ReturnType<typeof setTimeout>[] })
  const live = useLatest(running)
  const play = useCallback((i: number) => {
    const s = state.current
    if (s.played.has(i)) return
    s.played.add(i)
    latest.current[i]?.run()
  }, [])
  useEffect(() => {
    if (!running) return
    const s = state.current
    s.timers = latest.current.map((b, i) => setTimeout(() => play(i), b.at))
    return () => s.timers.forEach(clearTimeout)
  }, [play, running])
  return useCallback(() => {
    state.current.timers.forEach(clearTimeout)
    // Skipped before it was ever seen (a link closing a moment still waiting its turn): spent, but nothing buzzes unseen.
    if (!live.current) return latest.current.forEach((_, i) => state.current.played.add(i))
    latest.current.forEach((_, i) => play(i))
  }, [play, live])
}

export type MomentStageProps = {
  /** Read once as it appears, queued behind whatever is being read. */
  label: string
  /** The scrim's ink at rest (0 for none), and its 0 → 1 progress. */
  scrimAlpha: number
  scrim: SharedValue<number>
  /** The orbs behind the moment (with the grain), and their opacity: they lift once at a peak. */
  orbs?: OrbSet
  orbsOpacity?: SharedValue<number>
  /**
   * The orbs on ink, as the assets are (their art board is ink): at rest they
   * all but hide what is under the moment. `false` lays the bare orbs over it
   * instead (Ready brightens the screen's own, which it cannot reach).
   */
  orbsOnInk?: boolean
  /** A tap anywhere that is not a button, or a two-finger double-tap (VoiceOver's Magic Tap). */
  onSkip: () => void
  /** System back, or VoiceOver's escape. */
  onBack?: () => void
  /** `false` for a moment that hands the screen back while it clears (the pour): drawn in place, not in a Modal. */
  modal?: boolean
  /**
   * Told once, when the stage is really on screen. On iOS a Modal waits its turn behind whatever holds the screen (a card,
   * the share tray), so a moment starts its clock from this and never plays behind them.
   */
  onShown?: () => void
  /** Once it has handed off: every touch goes through to what is under it, the screen reader no longer finds it, the orbs stop. */
  done?: boolean
  testID?: string
  children: ReactNode
}

/**
 * An L4 moment's stage (guidelines/backdrop/layers.html): full screen, the
 * scrim over what is under it, the moment's orbs and grain, a tap anywhere to
 * skip. In a Modal by default, so it covers the tab bar, holds the screen
 * reader inside and takes system back. Reduce Transparency makes the scrim
 * opaque.
 */
export function MomentStage({ label, scrimAlpha, scrim, orbs, orbsOpacity, orbsOnInk = true, onSkip, onBack, modal = true, done = false, onShown, testID, children }: MomentStageProps) {
  const reduceTransparency = useReduceTransparency()
  const arrived = useRef(false)
  const arrive = () => {
    if (arrived.current) return
    arrived.current = true
    AccessibilityInfo.announceForAccessibilityWithOptions(label, { queue: true })
    onShown?.()
  }

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }))
  const orbStyle = useAnimatedStyle(() => ({ opacity: orbsOpacity ? orbsOpacity.get() : 1 }))
  const ink = reduceTransparency && scrimAlpha > 0 ? COLOR.ink : tint(COLOR.ink, scrimAlpha)
  /*
   * One Modal on screen at a time on iOS (lib/modalTurn). A link closes a moment that can be closed (`onBack`: the match
   * and the Blend, whose moment is already recorded, so it is not shown again); one with only a skip (onboarding's
   * Ready, whose skip navigates) stays, and the link waits behind it like any other route.
   */
  const turn = useQueuedModal(modal, { closeForLink: onBack })
  const arriveNow = useLatest(arrive)
  // In place: on screen now. iOS always answers with onShow or a refusal the turn retries; Android has no watchdog, so a moment cannot wait forever there.
  useEffect(() => {
    if (!modal) return arriveNow.current()
    if (Platform.OS !== 'android' || !turn.visible) return
    const timer = setTimeout(() => arriveNow.current(), SHOW_WATCHDOG_MS)
    return () => clearTimeout(timer)
    // Only the turn decides; `arrive` reads the latest label and callback when it runs, and it runs once.
  }, [modal, turn.visible, arriveNow])

  const stage = (
    <View
      testID={testID}
      // Never flattened (SCRUM-921). `done` flips the three props below, which are what make Fabric flatten a View or not;
      // on Android a stage that flipped was re-parented in the same batch as Ready's replace and died in addViewAt
      // ("The specified child already has a parent"), at the end of every new account's onboarding.
      collapsable={false}
      pointerEvents={done ? 'none' : 'auto'}
      accessibilityElementsHidden={done}
      importantForAccessibility={done ? 'no-hide-descendants' : 'auto'}
      accessibilityViewIsModal={modal}
      onAccessibilityEscape={onBack}
      onMagicTap={onSkip}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View testID={testID && `${testID}-scrim`} style={[StyleSheet.absoluteFill, { backgroundColor: ink }, scrimStyle]} />
      {orbs ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbsOnInk && styles.ink, orbStyle]}>
          <Orbs set={orbs} paused={done} />
          <Grain />
        </Animated.View>
      ) : null}
      <Pressable testID={testID && `${testID}-skip`} accessible={false} style={StyleSheet.absoluteFill} onPress={onSkip} />
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  )

  if (!modal) return stage
  return (
    <Modal
      testID={testID && `${testID}-modal`}
      visible={turn.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onBack ?? onSkip}
      onShow={() => {
        turn.onShow()
        arrive()
      }}
      onDismiss={turn.onDismiss}
    >
      {stage}
    </Modal>
  )
}

const styles = StyleSheet.create({
  ink: { backgroundColor: COLOR.ink },
})
