import { StyleSheet, Text, View } from 'react-native'

import { Chip } from '../ds/Chip'
import { font, useBoldText, useSelection } from '../ds/shared'
import { OptimizedImage } from '../OptimizedImage'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The payoff's card (direction A): the person as a card, their photo, "Émilie, 27" and one interest lit in the step's hue,
 * tilted; the step's two lights sit behind it (`StepLights` `hero`). Without a photo, their initial on a plate: never a creature (owner: no
 * creature glyphs on onboarding), never a placeholder name.
 */

const CARD_WIDTH = 232
const PHOTO_HEIGHT = 200
const TILT = '-4deg'

export function PayoffCard({ first, age, photo, interest }: { first?: string; age?: number | null; photo?: string; interest?: string }) {
  const bold = useBoldText()
  const sel = useSelection()
  const name = first ? (age != null && age > 0 ? `${first}, ${age}` : first) : undefined
  return (
    <View style={styles.stage}>
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
