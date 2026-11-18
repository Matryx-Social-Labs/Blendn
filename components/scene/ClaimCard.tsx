import { StyleSheet, Text, View } from 'react-native'

import { font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, PRESS, SPACE } from '../../lib/design/tokens'

export type ClaimCardProps = {
  /** "Listed by Blend’n" (an event) or "Nobody runs this place on Blend’n yet" (a venue). */
  title: string
  /** The words before the link ("Running this event?") and after it ("to post updates and see who came."). */
  before: string
  after: string
  onPress: () => void
  testID?: string
}

/**
 * "Listed by Blend’n · Claim it" (going-lifecycle C1, sheet 09; owner-approved 2026-11-17): a card under the facts on a
 * curated event and under the name on an unclaimed venue, so the people who run them see it on the first scroll. The
 * whole card is the link (it leaves the app for the claim page). Drawn only when the server offers a claim: it never
 * does for a host's own night, nor for anything claimed.
 */
export function ClaimCard({ title, before, after, onPress, testID }: ClaimCardProps) {
  const bold = useBoldText()
  return (
    <ScalePress
      testID={testID}
      onPress={onPress}
      pressedScale={PRESS.scale}
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${before} Claim it ${after}`}
      accessibilityHint="Opens the Blend’n dashboard in your browser"
      style={styles.card}
    >
      <Icon name="info" size={GLYPH} color={COLOR.textSecondary} />
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('control', bold, FONT_FAMILY.brand[900]), styles.ink]}>
          {title}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('note', bold), styles.secondary, styles.line]}>
          {before} <Text style={[font('note', bold, FONT_FAMILY.brand[700]), styles.ink, styles.underline]}>Claim it</Text> {after}
        </Text>
      </View>
    </ScalePress>
  )
}

/** The board's info glyph, 22 pt (`.claimcard svg`). */
const GLYPH = 22

const styles = StyleSheet.create({
  // design-exception: the board's `.claimcard` is 18 pt round and 14 in (between the radius and spacing steps).
  card: { flexDirection: 'row', gap: SPACE.md, padding: 14, borderRadius: 18, backgroundColor: COLOR.surface },
  words: { flex: 1, minWidth: 0 },
  // design-exception: 3 pt under the title (`.claimcard .v { margin-top: 3px }`).
  line: { marginTop: 3 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  underline: { textDecorationLine: 'underline' },
})
