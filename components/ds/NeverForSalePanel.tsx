import { StyleSheet, Text, View } from 'react-native'

import { COLOR, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

/** What no plan buys (Flow 12 `NEVER`): the product's promise. */
export const NEVER_FOR_SALE = [
  'Seeing who liked you',
  'More asks or board requests than the caps allow',
  'Seeing a venue’s room without going live there',
  'A way round the reveal',
  'Boosting yourself in someone’s Grid',
] as const

/**
 * On the Blend'n+ page, before the plans: what is never for sale on any plan,
 * drawn as plainly as the plans (guidelines/components/NeverForSalePanel.html,
 * Flow 12 · 12.2). A surface card, a heading, em-dash lines at body size.
 *
 * A heading and a list for a screen reader; the dashes are decoration. No
 * haptic. Text scales freely. Increase Contrast: the 50% hairline.
 */
export function NeverForSalePanel({ items = NEVER_FOR_SALE, testID }: { items?: readonly string[]; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View testID={testID} style={[styles.card, contrast && IC_HAIRLINE]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header" style={[font('heading', bold), styles.ink]}>
        Never for sale, on any plan
      </Text>
      <View testID={testID && `${testID}-list`} accessibilityRole="list" style={styles.list}>
        {items.map((item) => (
          <View key={item} style={styles.line}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[font('body', bold), styles.dash]}>
              —
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.ink, styles.fill]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  list: { gap: SPACE.md },
  line: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  dash: { color: COLOR.textTertiary },
  ink: { color: COLOR.textPrimary },
  fill: { flex: 1 },
})
