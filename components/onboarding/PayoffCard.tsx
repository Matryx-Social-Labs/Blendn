import { StyleSheet, Text, View } from 'react-native'

import { Light } from './LandingIntro'
import { Chip } from '../ds/Chip'
import { font, useBoldText, useSelection } from '../ds/shared'
import { OptimizedImage } from '../OptimizedImage'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The payoff's card (direction A): the person as a card, their photo, "Émilie, 27" and one interest lit in the step's hue,
 * tilted, with the landing's violet light behind it. Without a photo, their initial on a plate: never a creature (owner: no
 * creature glyphs on onboarding), never a placeholder name.
 */

const CARD_WIDTH = 232
const PHOTO_HEIGHT = 200
const TILT = '-4deg'
const GLOW = 420
/** The glow sits under the card at a little over half the landing's settled light. */
const GLOW_OPACITY = 0.6

export function PayoffCard({ first, age, photo, interest }: { first?: string; age?: number | null; photo?: string; interest?: string }) {
  const bold = useBoldText()
  const sel = useSelection()
  const name = first ? (age ? `${first}, ${age}` : first) : undefined
  return (
    <View style={styles.stage}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.glow}>
        <Light id="payoff-glow" color={COLOR.brandViolet} size={GLOW} />
      </View>
      <View testID="ready-card" accessible accessibilityLabel={name ? `Your card: ${name}${interest ? `, ${interest}` : ''}` : 'Your card'} style={[styles.card, { borderColor: sel.edge }]}>
        <View style={styles.photo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {photo ? (
            <View testID="ready-card-photo" style={StyleSheet.absoluteFill}>
              <OptimizedImage source={photo} style={StyleSheet.absoluteFill} width={CARD_WIDTH} height={PHOTO_HEIGHT} contentFit="cover" />
            </View>
          ) : first ? (
            <Text testID="ready-initial" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[font('display', bold), styles.initial]}>
              {Array.from(first)[0]}
            </Text>
          ) : null}
        </View>
        <View style={styles.body}>
          {name ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} numberOfLines={2} style={[font('title', bold), styles.name]}>
              {name}
            </Text>
          ) : null}
          {interest ? <Chip label={interest} selected /> : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.xl },
  glow: { position: 'absolute', alignSelf: 'center', opacity: GLOW_OPACITY },
  card: {
    width: CARD_WIDTH,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
    transform: [{ rotate: TILT }],
  },
  photo: { height: PHOTO_HEIGHT, backgroundColor: COLOR.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  initial: { color: COLOR.textSecondary },
  body: { gap: SPACE.sm, padding: SPACE.lg, alignItems: 'flex-start' },
  name: { color: COLOR.textPrimary },
})
