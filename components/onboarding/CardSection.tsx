import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { GroundProvider, font, useBoldText } from '../ds/shared'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'

/** The icon badge's circle, 48 pt (Flow 2 `cardSection`). */
const BADGE = 48

/**
 * A question as a card (Flow 2 journey): a surface at 32, a hairline, 16 inside, a 48 pt badge with a glyph, the title in
 * `bodyStrong` and a line of what it is for. The journey step asks three unrelated things (where you live, what you do,
 * where you studied) and the enclosure is what makes them three things rather than one long form.
 *
 * Controls inside it sit on `surface`, so chips take the sunken rest fill (`ground`), and a field is the solid capsule.
 */
export function CardSection({ icon, title, caption, children }: { icon: IconName; title: string; caption?: string; children: ReactNode }) {
  const bold = useBoldText()
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name={icon} size={ICON.control} color={COLOR.textPrimary} />
        </View>
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} accessibilityRole="header" style={[font('bodyStrong', bold), styles.title]}>
            {title}
          </Text>
          {caption ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.caption]}>{caption}</Text> : null}
        </View>
      </View>
      <GroundProvider value="surface">
        <View style={styles.body}>{children}</View>
      </GroundProvider>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  badge: { width: BADGE, height: BADGE, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: SPACE.xxs },
  title: { color: COLOR.textPrimary },
  caption: { color: COLOR.textSecondary },
  body: { gap: SPACE.lg },
})
