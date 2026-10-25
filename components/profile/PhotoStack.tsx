import { useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Polygon } from 'react-native-svg'

import { Icon } from '../ui/Icon'
import { COLOR, CREATURE_PALETTES, RADIUS } from '../../lib/design/tokens'
import type { Rect } from '../ds/chatShared'
import { SwipeDeck, type DeckFan } from '../motion/SwipeDeck'
import { OptimizedImage } from '../OptimizedImage'

/** Flow 6 `photoStack(…, 112)`: a 112 pt card, 1.28 tall. */
export const STACK_WIDTH = 112
export const STACK_HEIGHT = Math.round(STACK_WIDTH * 1.28)
/** The cat on the empty card: 0.4 of the card, as the frame draws it. */
// design-exception: a glyph drawn to the frame's 0.4 of the card, not a control icon
const MARK = 44
/** The room the tilt takes at the corners. */
const TILT_ROOM = 8

/**
 * Flow 6's pile: three cards the size of the stack, turned -4°, 7° and -11° (front to back), no shift and no shrink. The fourth
 * waits invisibly behind them.
 */
const FAN: DeckFan = {
  rotate: [-4, 7, -11, -11],
  shiftX: [0, 0, 0, 0],
  shiftY: [0, 0, 0, 0],
  scale: [1, 1, 1, 1],
  opacity: [1, 1, 1, 0],
}

/**
 * Your photos as a small fanned pile beside your name (Flow 6 `me`).
 *
 * Tap it to open the photo on top, full screen. Drag or flick the top photo sideways and it goes to the back of the pile:
 * something to fidget with that also shows which photos people will see. The order is only for this screen: it resets to your real
 * first photo whenever the photos change, and nothing is written back. The deal, drag, throw and settle are `SwipeDeck`'s.
 *
 * With no photo it is one card, turned -4°, on a creature's two-colour plate with the cat on it (Flow 6 `me` 02), and it can't be
 * swiped; tapping it goes to add one.
 */
export function PhotoStack({
  photos,
  onPress,
}: {
  photos: string[]
  /** Tapped, with the index (into `photos`) of the photo on top, and where the stack is, for the viewer to travel from. */
  onPress: (index: number, from: Rect | null) => void
}) {
  const box = useRef<View>(null)
  const press = (index: number) => {
    if (!box.current) return onPress(index, null)
    box.current.measureInWindow((x, y, width, height) => onPress(index, { x, y, width, height }))
  }

  if (!photos.length) {
    const [a, b] = CREATURE_PALETTES[0]
    return (
      <View ref={box} collapsable={false} style={styles.stack}>
        <Pressable
          testID="photo-stack-empty"
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          onPress={() => press(0)}
          style={[styles.card, styles.emptyTilt]}
        >
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1 1" preserveAspectRatio="none">
            <Polygon points="0,0 1,0 0,1" fill={a} />
            <Polygon points="1,0 1,1 0,1" fill={b} />
          </Svg>
          <View style={styles.mark}>
            <Icon name="cat" size={MARK} color={COLOR.textPrimary} />
          </View>
        </Pressable>
      </View>
    )
  }

  return (
    <View ref={box} collapsable={false}>
      <SwipeDeck
        items={photos}
        keyOf={(uri, i) => `${i}:${uri}`}
        width={STACK_WIDTH}
        height={STACK_HEIGHT}
        fan={FAN}
        style={styles.stack}
        cardStyle={styles.card}
        onPress={press}
        accessibilityLabel="Your photos"
        accessibilityHint={photos.length > 1 ? 'Swipe the photos sideways to see the next one' : 'Opens the photo'}
        nextLabel="Next photo"
        renderCard={(uri) => (
          <OptimizedImage source={uri} recyclingKey={uri} style={styles.fill as never} width={STACK_WIDTH} height={STACK_HEIGHT} contentFit="cover" />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { width: STACK_WIDTH + TILT_ROOM * 2, height: STACK_HEIGHT + TILT_ROOM * 2, alignItems: 'center', justifyContent: 'center' },
  // A page-coloured edge, so overlapping photos read as separate cards without a shadow.
  card: { width: STACK_WIDTH, height: STACK_HEIGHT, borderRadius: RADIUS.rowInCard, overflow: 'hidden', backgroundColor: COLOR.surface, borderWidth: 2, borderColor: COLOR.ink },
  fill: { width: '100%', height: '100%' },
  emptyTilt: { transform: [{ rotate: '-4deg' }] },
  mark: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})
