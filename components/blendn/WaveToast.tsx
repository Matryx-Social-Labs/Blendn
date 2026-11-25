import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { toastTitle } from '../../lib/receivedWaves'
import type { PersonWave, RoomWave, WaveToastItem } from '../../lib/roomWaves'
import { COLOR, EASING, FONT_FAMILY, PRESS, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { toastDwell } from '../ds/Toast'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Material } from '../ui/Material'
import { Avatar } from '../ds/Avatar'
import { CrewFace } from '../ds/CrewFace'
import { Facepile, type PileFace } from '../ds/Facepile'
import { Button } from '../ds/Button'

/** #19: in from 16 pt above. */
const ENTER_FROM = -SPACE.lg

/** L-B: the fold shows the newest three faces. */
/** Board 03 `.toast`: a 34 face in a 48 capsule. */
const TOAST_FACE = 34
const FOLD_FACES = 3

/**
 * A wave while you are in the room (board 03 L-A / L-B, Flow 4 Room #07): a capsule at the top of the Room, between the
 * close chevron and the settings circle, on the toast glass.
 * - **L-A, one wave:** their face, "{name} waved at you" and Wave back inline. The body opens their card.
 * - **L-B, a fold:** three faces, "{n} people waved at you" and See, which opens the list.
 * A crew's wave is the same capsule with its emblem (advisor X-A 2026-11-25): its body opens the list, where the crew's row is.
 * Holding a one-wave toast offers Block and Report for them (anti-spam W7); a screen reader has both as actions.
 *
 * `H.arrive` once, as it lands. In from 16 pt on `M.snap`, out over `quick` (#19). Glass never fades (§5.2 rule 6): on
 * iOS it slides out; Android's solid tier fades too. Reduce Motion: no movement. Read once, politely.
 */
export function WaveToast({
  toast,
  emblemOf = () => null,
  onOpen,
  onWaveBack,
  onSeeAll,
  onSafety,
  onDone,
  testID = 'wave-toast',
}: {
  toast: WaveToastItem
  /** A crew's emblem seed, when the room knows it (the socket sends none). */
  emblemOf?: (crewId: string) => string | null
  onOpen: (wave: PersonWave) => void
  onWaveBack: (wave: RoomWave) => void
  onSeeAll: () => void
  onSafety: (wave: RoomWave) => void
  onDone: () => void
  testID?: string
}) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const text = toastTitle(toast)
  const one = toast.waves.length === 1 ? toast.waves[0] : null
  const crew = one && 'fromCrewId' in one ? one : null
  const android = Platform.OS === 'android'
  const y = useSharedValue(reduceMotion ? 0 : ENTER_FROM)
  const opacity = useSharedValue(android ? 0 : 1)
  const [leaving, setLeaving] = useState(false)
  const { duration } = motionTokens(reduceMotion)

  useEffect(() => {
    H.arrive()
    AccessibilityInfo.announceForAccessibility(one ? `${text}. Wave back is one tap away.` : `${text}.`)
    if (!reduceMotion) y.set(withSpring(0, SPRING.snap))
    if (android) opacity.set(withTiming(1, { duration: duration.base, easing: Easing.bezier(...EASING.entrance) }))
    const dwell = setTimeout(() => setLeaving(true), toastDwell(text, {}))
    return () => clearTimeout(dwell)
    // Once, as it lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!leaving) return
    const exit = { duration: duration.quick, easing: Easing.bezier(...EASING.exit) }
    if (android) opacity.set(withTiming(0, exit))
    else if (!reduceMotion) y.set(withTiming(-(insets.top + SPACE.md + SIZE.circleButton), exit))
    const gone = setTimeout(onDone, reduceMotion && !android ? 0 : duration.quick)
    return () => clearTimeout(gone)
  }, [leaving, android, reduceMotion, insets.top, duration.quick, opacity, y, onDone])

  const motion = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: y.get() }] }))

  return (
    <Animated.View
      testID={testID}
      pointerEvents={leaving ? 'none' : 'box-none'}
      style={[styles.place, { top: insets.top + SPACE.md }, motion]}
    >
      <ScalePress
        onPress={() => {
          if (one && !('fromCrewId' in one)) onOpen(one)
          else onSeeAll()
          setLeaving(true)
        }}
        onLongPress={
          one
            ? () => {
                H.longPress()
                onSafety(one)
              }
            : undefined
        }
        pressedScale={PRESS.scale}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={one && !('fromCrewId' in one) ? 'Opens their card' : 'Opens who waved'}
        // One element to a screen reader (iOS hides the pill inside it): Wave back and Block or report are actions.
        accessibilityActions={one ? [{ name: 'waveBack', label: 'Wave back' }, { name: 'block', label: `Block or report ${one.fromName}` }] : undefined}
        onAccessibilityAction={(e) => {
          if (!one) return
          if (e.nativeEvent.actionName === 'block') return onSafety(one)
          if (e.nativeEvent.actionName !== 'waveBack') return
          H.select()
          onWaveBack(one)
          setLeaving(true)
        }}
        testID={`${testID}-press`}
      >
        <Material role="toast" style={[styles.capsule, contrast && IC_HAIRLINE]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {one ? (
              'fromCrewId' in one ? (
                <CrewFace size={TOAST_FACE} seed={emblemOf(one.fromCrewId)} testID={`${testID}-emblem`} />
              ) : (
                <Avatar size={TOAST_FACE} kind="creature" pseudonym={one.fromName} />
              )
            ) : (
              <Facepile faces={toast.waves.slice(0, FOLD_FACES).map((w): PileFace => ('fromCrewId' in w ? { kind: 'crew', seed: emblemOf(w.fromCrewId) } : { kind: 'creature', pseudonym: w.fromName }))} total={Math.min(toast.waves.length, FOLD_FACES)} size={32} />
            )}
          </View>
          {crew ? (
            // A crew's name runs to 32 characters: on its own line, so "waved at you" is never what an ellipsis takes.
            <View style={styles.text}>
              <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                {crew.fromName}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), styles.ink]}>
                waved at you
              </Text>
            </View>
          ) : (
            <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink, styles.text]}>
              {text}
            </Text>
          )}
          {/* Wave back is the DS positive (buttons board C); the toast's has no hand (board 03 L-A). */}
          <Button
            kind="lit"
            size="pill"
            label={one ? 'Wave back' : 'See'}
            pressHaptic={H.select}
            accessibilityLabel={one ? `Wave back at ${one.fromName}` : 'See who waved'}
            onPress={() => {
              if (one) onWaveBack(one)
              else onSeeAll()
              setLeaving(true)
            }}
            testID={`${testID}-action`}
          />
        </Material>
      </ScalePress>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Board 03 L-A: across the bar, over the chevron and the settings circle (the capsule carries its own action).
  place: { position: 'absolute', left: SPACE.lg, right: SPACE.lg, zIndex: 2 },
  capsule: {
    // Board 03 `.toast`: 48 tall, 8 before the face, 6 after the pill.
    minHeight: SIZE.control,
    borderRadius: RADIUS.capsule,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.xs + SPACE.xxs,
    paddingVertical: SPACE.xs + SPACE.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    overflow: 'hidden',
  },
  text: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
})
