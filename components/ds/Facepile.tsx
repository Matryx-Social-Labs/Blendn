import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { font, useBoldText } from './shared'

/** A face: a photo (earned) or a pseudonym's creature, as `<Avatar>` draws them. */
export type Face = { kind: 'photo'; uri: string } | { kind: 'creature'; pseudonym: string }

/** The arrival ring: 1.5 pt of white outside the 2 pt ink ring (the page's `0 0 0 3.5px #fff`). */
const ARRIVAL_WIDTH = 1.5
const ARRIVAL_FROM = 0.8

/**
 * Who's here, in one glance (guidelines/components/Facepile.html): up to five
 * faces at 32 (24 and 40 too), each cut out of the next by a 2 pt ring in the
 * ground colour and overlapping it by a quarter, then "+N" in meta. Photos and
 * creatures mix. A new arrival (`highlight`) takes a white ring that settles
 * in on `M.settle`; Reduce Motion draws it still.
 *
 * It never names anyone and is never tappable on its own (the section it heads
 * is). One element for a screen reader, "{N} people here"; the faces are
 * decorative. No haptic: an arrival is `H.arrive` on the Room, not here.
 */
export function Facepile({
  faces,
  total = faces.length,
  size = 32,
  max = 5,
  ring = COLOR.ink,
  text,
  highlight,
  accessibilityLabel,
  testID,
}: {
  faces: Face[]
  /** Everyone, of whom these are the first; "+N" counts the rest. */
  total?: number
  size?: 24 | 32 | 40
  max?: number
  /** The ground the pile sits on: ink on the page, `COLOR.surface` on a card. */
  ring?: string
  /** Replaces "+N". */
  text?: string
  /** The index of a new arrival, ringed in white. */
  highlight?: number
  accessibilityLabel?: string
  testID?: string
}) {
  const bold = useBoldText()
  const shown = faces.slice(0, max)
  const rest = total - shown.length
  const trailing = text ?? (rest > 0 ? `+${rest}` : '')

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel ?? [`${total} ${total === 1 ? 'person' : 'people'} here`, text].filter(Boolean).join(', ')}
      style={styles.row}
    >
      <View style={styles.stack}>
        {shown.map((face, i) => (
          <View
            // By who, so an arrival at the front doesn't repaint every face into its neighbour's slot.
            key={face.kind === 'photo' ? face.uri : face.pseudonym}
            testID={testID && `${testID}-slot-${i}`}
            style={i ? { marginLeft: -Math.round(size / 4) } : null}
          >
            {highlight === i ? <ArrivalRing size={size} testID={testID && `${testID}-arrival`} /> : null}
            <Avatar size={size} ring={ring} testID={testID && `${testID}-face-${i}`} {...face} />
          </View>
        ))}
      </View>
      {trailing ? <Text style={[font('meta', bold), styles.more]}>{trailing}</Text> : null}
    </View>
  )
}

function ArrivalRing({ size, testID }: { size: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(reduceMotion ? 1 : ARRIVAL_FROM)
  useEffect(() => {
    if (!reduceMotion) scale.set(withSpring(1, SPRING.settle))
  }, [reduceMotion, scale])
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  const out = SPACE.xxs + ARRIVAL_WIDTH
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.arrival,
        { top: -out, left: -out, width: size + out * 2, height: size + out * 2, borderWidth: ARRIVAL_WIDTH },
        grow,
      ]}
    />
  )
}

const MARK_GLYPH: Record<'liked' | 'matched' | 'requested', IconName> = {
  liked: 'heart',
  matched: 'message-circle',
  requested: 'check',
}
const MARK = 24

/**
 * A face's mark (Flow 4 `mark`): a 24 pt white disc with an ink glyph, cut out
 * by a 2 pt ink ring. Heart = liked, message = matched, check = requested.
 * Placed by its card (top right); hidden, as the card's label says it.
 */
export function FaceMark({ kind, testID }: { kind: keyof typeof MARK_GLYPH; testID?: string }) {
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.markRing}>
      <View testID={testID && `${testID}-disc`} style={styles.mark}>
        <Icon name={MARK_GLYPH[kind]} size={ICON.inline} color={COLOR.ink} active />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  stack: { flexDirection: 'row' },
  more: { color: COLOR.textSecondary },
  arrival: { position: 'absolute', borderRadius: RADIUS.capsule, borderColor: COLOR.textPrimary },
  markRing: { padding: SPACE.xxs, borderRadius: RADIUS.capsule, backgroundColor: COLOR.ink },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
