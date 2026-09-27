import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MOTION_SPRING } from '../../lib/motion'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { Text } from '../ui/Text'
import { Face } from './Face'

const FACE = 104
/** How far each face sits from the centre line; they overlap by 16pt. */
const OFFSET = FACE / 2 - 8
const HEART_MS = 560
/** Three hearts, three heights, so the arcs read as thrown rather than stamped. */
const ARCS = [
  { lift: 72, delay: 0, size: ICON.md },
  { lift: 104, delay: 90, size: ICON.lg },
  { lift: 56, delay: 180, size: ICON.sm },
] as const

/**
 * It's mutual — the moment the whole product is built toward.
 *
 * The old ConnectionSheet was a sheet with two avatars and a button. This is a
 * beat instead (Honk's heart pop): your face and theirs slide in from either
 * side and meet, three hearts arc from you into them, their face bumps once as
 * the last one lands, and the phone gives the success notification on that
 * frame. Then it is still, and the only thing left to do is say hi.
 *
 * Flat, per tasks/lessons.md: no confetti, no glow, no loop. The motion is one
 * gesture from you to them and it ends.
 *
 * Reduce Motion: the faces are simply there, no hearts, and the haptic still
 * fires — it is the news, not decoration.
 */
export function MatchMoment({
  visible,
  me,
  them,
  reason,
  opener,
  onSayHi,
  onClose,
}: {
  visible: boolean
  me: { name: string; photo: string | null }
  them: { name: string; photo: string | null }
  /** Why you two — "Both open to dating", "3 shared · Jazz". */
  reason?: string | null
  /** A first line they can send, built from what you share. */
  opener?: string | null
  onSayHi: () => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const meX = useSharedValue(-120)
  const themX = useSharedValue(120)
  const bump = useSharedValue(1)
  const hearts = [useSharedValue(0), useSharedValue(0), useSharedValue(0)]

  const landed = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [])

  useEffect(() => {
    if (!visible) return
    if (reduceMotion) {
      meX.set(0)
      themX.set(0)
      landed()
      return
    }
    meX.set(-120)
    themX.set(120)
    meX.set(withSpring(0, MOTION_SPRING.gentle))
    themX.set(withSpring(0, MOTION_SPRING.gentle))
    hearts.forEach((h, i) => {
      h.set(0)
      h.set(
        withDelay(
          260 + ARCS[i].delay,
          withTiming(1, { duration: HEART_MS, easing: Easing.bezier(0.33, 0, 0.2, 1) }, (finished) => {
            if (!finished || i !== ARCS.length - 1) return
            bump.set(withSequence(withTiming(1.08, { duration: 110 }), withSpring(1, MOTION_SPRING.snappy)))
            scheduleOnRN(landed)
          })
        )
      )
    })
    // Shared values are stable; the effect is keyed on the moment opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion])

  const meStyle = useAnimatedStyle(() => ({ transform: [{ translateX: meX.get() - OFFSET }] }))
  const themStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: themX.get() + OFFSET }, { scale: bump.get() }],
  }))

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[styles.wrap, { paddingBottom: insets.bottom + SPACE.xl }]} pointerEvents="box-none">
        <View style={styles.stage} accessible accessibilityLabel={`You and ${them.name} liked each other`}>
          <Animated.View style={[styles.face, meStyle]}>
            <Face name={me.name} photo={me.photo} size={FACE} ring />
          </Animated.View>
          <Animated.View style={[styles.face, themStyle]}>
            <Face name={them.name} photo={them.photo} size={FACE} ring />
          </Animated.View>
          {reduceMotion
            ? null
            : hearts.map((h, i) => <Heart key={i} progress={h} lift={ARCS[i].lift} size={ARCS[i].size} />)}
        </View>

        <Animated.View entering={FadeIn.delay(reduceMotion ? 0 : 420).duration(220)} exiting={FadeOut.duration(120)}>
          <Text variant="label" style={styles.eyebrow}>
            IT&apos;S MUTUAL
          </Text>
          <Text variant="title" style={styles.title} maxFontSizeMultiplier={1.4}>
            You and {them.name} matched
          </Text>
          {reason ? (
            <Text variant="meta" style={styles.centreText}>
              {reason}
            </Text>
          ) : null}
          {opener ? (
            <View style={styles.opener}>
              <Text variant="caption" color={EMBER.textTertiary}>
                TRY
              </Text>
              <Text variant="body" style={styles.centreText}>
                “{opener}”
              </Text>
            </View>
          ) : null}

          <ScalePress onPress={onSayHi} style={styles.primary} accessibilityRole="button" accessibilityLabel={`Say hi to ${them.name}`}>
            <Text variant="button" color={EMBER.onGradient}>
              Say hi
            </Text>
          </ScalePress>
          <ScalePress onPress={onClose} haptic={false} style={styles.secondary} accessibilityRole="button">
            <Text variant="button">Keep looking</Text>
          </ScalePress>
        </Animated.View>
      </View>
    </Modal>
  )
}

/**
 * One heart on a quadratic arc from your face (left) to theirs (right).
 * Position is computed per frame from `progress` on the UI thread; it grows
 * in the first third and shrinks into their face in the last.
 */
function Heart({ progress, lift, size }: { progress: SharedValue<number>; lift: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.get()
    const x = -OFFSET + (2 * OFFSET) * t
    const y = -4 * lift * t * (1 - t)
    const grow = t < 0.3 ? t / 0.3 : t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1
    return {
      opacity: t === 0 ? 0 : grow,
      transform: [{ translateX: x }, { translateY: y }, { scale: 0.5 + 0.5 * grow }],
    }
  })
  return (
    <Animated.View style={[styles.heart, style]} pointerEvents="none">
      <Ionicons name="heart" size={size} color={EMBER.accent} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: EMBER.backdrop },
  wrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: GUTTER },
  stage: {
    height: FACE + SPACE.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.lg,
  },
  face: { position: 'absolute' },
  heart: { position: 'absolute' },
  eyebrow: { textAlign: 'center', marginBottom: SPACE.xs },
  title: { textAlign: 'center' },
  centreText: { textAlign: 'center', marginTop: SPACE.xs },
  opener: {
    marginTop: SPACE.lg,
    padding: SPACE.md,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
  },
  primary: {
    marginTop: SPACE.xl,
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    marginTop: SPACE.sm,
    height: CONTROL.lg,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
