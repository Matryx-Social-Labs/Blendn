import { Image } from 'expo-image'
import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { COLOR, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { compactCount } from '../../lib/format'
import { BUBBLE, plural } from '../ds/chatShared'
import { PresenceDot } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, minTarget, SELECTION, useBoldText } from '../ds/shared'
import { glassContentsIn, glassRiseIn, popOut } from '../motion/presence'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'

/** The headers' 36 pt cover or face (the room and DM frames). */
export const HEADER_FACE = 36
/** The header's live dot (6 pt in the frames, beside 13 pt text). */
const HEADER_DOT = 6

/** A room is its cover in a rounded square; a person is round (Flow 5's one avatar family). */
export function RoomCover({ uri, size = HEADER_FACE, radius = RADIUS.thumb }: { uri?: string | null; size?: number; radius?: number }) {
  const box = { width: size, height: size, borderRadius: radius }
  return uri ? (
    <Image source={{ uri }} recyclingKey={uri} contentFit="cover" accessible={false} style={[box, styles.cover]} />
  ) : (
    <View style={[box, styles.cover, styles.center]}>
      <Icon name="users" size={ICON.control} color={COLOR.textSecondary} />
    </View>
  )
}

/** The room header's line: a still live dot, the count in Geist Mono, "in the room". */
export function CountLine({ count }: { count: number }) {
  const bold = useBoldText()
  return (
    <>
      <PresenceDot kind="live" size={HEADER_DOT} />
      <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary]}>
        <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{count.toLocaleString('en-US')}</Text> in the room
      </Text>
    </>
  )
}

/** "Load older messages": the pull at the top does it too; this is its button for everyone else. */
export function LoadOlder({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const bold = useBoldText()
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Load older messages"
      accessibilityState={{ busy }}
      hitSlop={SPACE.sm}
      style={styles.loadOlder}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.label} style={[font('label', bold), styles.ink]}>{busy ? 'LOADING…' : 'LOAD OLDER MESSAGES'}</Text>
    </Pressable>
  )
}

/**
 * Scroll to newest (Flow 5 room #15): a glass capsule above the composer. Once
 * something arrives while you read back it is the F-A pill, centred and rose:
 * "48 new messages", the count in Geist Mono (compact past 999, said whole),
 * announced once. Nothing moves the list but a tap on it. No haptic.
 */
export function NewestChip({ count, bottom, onPress }: { count: number; bottom: number; onPress: () => void }) {
  const bold = useBoldText()
  const said = useRef(false)
  const words = count === 1 ? 'new message' : 'new messages'
  useEffect(() => {
    if (!count || said.current) return
    said.current = true
    AccessibilityInfo.announceForAccessibility(plural(count, 'new message'))
  }, [count])
  if (count) {
    return (
      <Animated.View entering={glassRiseIn} exiting={popOut} pointerEvents="box-none" style={[styles.pillPlace, { bottom }]}>
        <Pressable
          testID="chat-newest"
          onPress={onPress}
          hitSlop={(minTarget() - PILL) / 2}
          accessibilityRole="button"
          accessibilityLabel={`${plural(count, 'new message')}, jump to the newest`}
          style={styles.pill}
        >
          <Icon name="arrow-down" size={ICON.inline} color={ROSE.glyph} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
            <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{compactCount(count)}</Text> {words}
          </Text>
        </Pressable>
      </Animated.View>
    )
  }
  return (
    <Animated.View entering={glassRiseIn} exiting={popOut} style={[styles.chipPlace, { bottom }]}>
      <Pressable
        testID="chat-newest"
        onPress={onPress}
        hitSlop={(minTarget() - CHIP) / 2}
        accessibilityRole="button"
        accessibilityLabel="Jump to the newest message"
      >
        <Material role="control" style={styles.chip}>
          <Animated.View entering={glassContentsIn} style={styles.chipContents}>
            <Icon name="arrow-down" size={ICON.control} />
          </Animated.View>
        </Material>
      </Pressable>
    </Animated.View>
  )
}
const CHIP = SIZE.control - SPACE.sm
/** F-A `.xnew`: a 36 pt rose capsule, 14 at the sides. */
const PILL = SIZE.tagHeader
// design-exception: the pill pads 14 at the sides (`.xnew`), between the 12 and 16 steps
const PILL_PAD = 14
const ROSE = SELECTION.rose

/** A mute that arrived while you were here (R2-D2 #06): one line over the flipped composer. */
export function JustMutedLine() {
  const bold = useBoldText()
  return (
    <View style={styles.justMuted} accessible accessibilityLiveRegion="polite">
      <Icon name="mic-off" size={ICON.inline} color={COLOR.textTertiary} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.tertiary]}>Just now · the organizer muted you</Text>
    </View>
  )
}

/**
 * The bubble-shaped skeleton (Flow 5 room #01, DM): four rows at the real
 * geometry, theirs with a face, yours on the right. Still: nothing loops.
 */
export function FeedSkeleton({ faces = true }: { faces?: boolean }) {
  return (
    <View accessible testID="chat-skeleton" accessibilityLabel="Loading messages" style={styles.skeleton}>
      {[0, 1, 2, 3].map((i) => {
        const mine = i % 2 === 1
        return (
          <View key={i} style={[styles.skeletonRow, mine && styles.reverse]}>
            {faces && !mine ? <View style={[styles.block, styles.face]} /> : null}
            <View style={[styles.block, { width: SKELETON_WIDTH + i * SKELETON_STEP, height: mine ? SKELETON_TALL : SKELETON_SHORT }]} />
          </View>
        )
      })}
    </View>
  )
}
/** A point in the window, where the flight starts and lands. */
export type Point = { x: number; y: number }
export type Flight = { key: number; emoji: string; from: Point; to: Point }

/** #37: 180 ms, x on `standard`, y on an arc. */
const FLIGHT_MS = 180
/** The bar's 22 pt emoji, drawn by the system. */
// design-exception: an emoji glyph at the reaction bar's size, drawn by the system
const FLIGHT_EMOJI = { fontSize: 22, lineHeight: 28 }
const FLIGHT_HALF = 14

/**
 * Your reaction lands (motion #37): the emoji flies from the bar to the chip
 * under the bubble in 180 ms on split axes, then the chip pops (the bubble's
 * `landed`). The screen hands it the two points; `onLanded` sets the pop.
 * Reduce Motion: no flight, the chip simply appears.
 */
export function ReactionFlight({ flight, onLanded }: { flight: Flight | null; onLanded: () => void }) {
  const reduceMotion = useReducedMotion()
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  useEffect(() => {
    if (!flight) return
    if (reduceMotion) {
      onLanded()
      return
    }
    x.set(flight.from.x)
    y.set(flight.from.y)
    x.set(withTiming(flight.to.x, { duration: FLIGHT_MS, easing: Easing.bezier(...EASING.standard) }))
    y.set(
      withTiming(flight.to.y, { duration: FLIGHT_MS, easing: Easing.bezier(...EASING.exit) }, (done) => {
        if (done) scheduleOnRN(onLanded)
      })
    )
    // One flight per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.key])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - FLIGHT_HALF }, { translateY: y.get() - FLIGHT_HALF }] }))
  if (!flight || reduceMotion) return null
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.flight, style]}>
      <Text maxFontSizeMultiplier={1} style={FLIGHT_EMOJI}>
        {flight.emoji}
      </Text>
    </Animated.View>
  )
}

/** The frames' 160, 190, 220, 250 wide; 44 and 64 tall. */
const SKELETON_WIDTH = 160
const SKELETON_STEP = 30
const SKELETON_SHORT = 44
const SKELETON_TALL = 64

const styles = StyleSheet.create({
  cover: { backgroundColor: COLOR.surface, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  secondary: { color: COLOR.textSecondary, flexShrink: 1 },
  tertiary: { color: COLOR.textTertiary },
  ink: { color: COLOR.textPrimary },
  tabular: { fontVariant: ['tabular-nums'] },
  chipPlace: { position: 'absolute', right: SPACE.xl },
  pillPlace: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    height: PILL,
    paddingHorizontal: PILL_PAD,
    borderRadius: RADIUS.capsule,
    backgroundColor: ROSE.fill,
    borderWidth: 1,
    borderColor: ROSE.edge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
  },
  chip: {
    height: CHIP,
    borderRadius: RADIUS.capsule,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.md,
  },
  chipContents: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  justMuted: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingBottom: SPACE.sm },
  skeleton: { gap: SPACE.lg, justifyContent: 'flex-end', flexGrow: 1 },
  skeletonRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm },
  reverse: { flexDirection: 'row-reverse' },
  block: { backgroundColor: COLOR.surface, borderRadius: BUBBLE.radius },
  face: { width: BUBBLE.avatar, height: BUBBLE.avatar, borderRadius: RADIUS.capsule },
  flight: { position: 'absolute', left: 0, top: 0 },
  loadOlder: { alignItems: 'center', paddingVertical: SPACE.md },
})
