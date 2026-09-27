import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { EMBER, EMBER_RADIUS, TYPE } from '../../lib/theme'
import { SwipeDeck, type DeckFan } from '../motion/SwipeDeck'
import { OptimizedImage } from '../OptimizedImage'
import { Text } from '../ui/Text'

/** One photo card. Portrait, like the photos themselves. */
const CARD_W = 84
const CARD_H = 108

/*
 * Where each depth sits in the fan: the front card leans a little left, the
 * two behind it fan out to either side. Small angles — at 10°+ a portrait
 * card's corner pokes into the name beside it. Deeper than the third card,
 * a photo waits invisibly behind it.
 */
const FAN: DeckFan = {
  rotate: [-4, 7, -11, -11],
  shiftX: [0, 14, -14, -14],
  shiftY: [0, 2, 4, 4],
  scale: [1, 0.96, 0.92, 0.92],
  opacity: [1, 1, 1, 0],
}

/**
 * Your photos as a small fanned pile beside your name.
 *
 * Tap it to open the photo on top, full screen. Drag or flick the top photo sideways
 * and it goes to the back of the pile: something to fidget with that also
 * shows which photos people will see. The order is only for this screen. It
 * resets to your real first photo whenever the photos change, and nothing is
 * written back.
 *
 * The deal, drag, throw and settle are `SwipeDeck`'s (`components/motion`),
 * shared with the Blend'n screen's Tonight deck.
 *
 * With no photos it's one card with your pseudonym mark, and it can't be swiped.
 */
export function PhotoStack({
  photos,
  fallback,
  onPress,
}: {
  photos: string[]
  /** Your pseudonym mark (`pseudonymAvatar`), drawn when there are no photos. */
  fallback: { colors: readonly [string, string]; character: string }
  /** Tapped, with the index (into `photos`) of the photo on top. */
  onPress: (index: number) => void
}) {
  if (!photos.length) {
    return (
      <View style={styles.stack} accessible accessibilityRole="imagebutton" accessibilityLabel="Your profile mark">
        <View style={[styles.card, styles.markTilt]}>
          <LinearGradient colors={fallback.colors} style={styles.mark}>
            <Text style={styles.glyph} maxFontSizeMultiplier={1}>
              {fallback.character}
            </Text>
          </LinearGradient>
        </View>
      </View>
    )
  }
  return (
    <SwipeDeck
      items={photos}
      keyOf={(uri, i) => `${i}:${uri}`}
      width={CARD_W}
      height={CARD_H}
      fan={FAN}
      style={styles.stack}
      cardStyle={styles.card}
      onPress={onPress}
      accessibilityLabel="Your photos"
      accessibilityHint={photos.length > 1 ? 'Swipe the photos sideways to see the next one' : undefined}
      nextLabel="Next photo"
      renderCard={(uri) => (
        <OptimizedImage
          source={uri}
          recyclingKey={uri}
          style={styles.fill as never}
          width={CARD_W}
          height={CARD_H}
          contentFit="cover"
        />
      )}
    />
  )
}

const styles = StyleSheet.create({
  // Room for the fan's widest card and the tilt at the corners.
  stack: {
    width: CARD_W + 2 * FAN.shiftX[1] + 8,
    height: CARD_H + FAN.shiftY[2] + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: EMBER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: EMBER.surface,
    // A page-coloured edge, so overlapping photos read as separate cards without a shadow.
    borderWidth: 2,
    borderColor: EMBER.bg,
  },
  fill: { width: '100%', height: '100%' },
  markTilt: { transform: [{ rotate: '-4deg' }] },
  mark: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: { ...TYPE.display },
})
