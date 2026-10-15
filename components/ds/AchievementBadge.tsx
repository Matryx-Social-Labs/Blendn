import { Pressable, StyleSheet, Text } from 'react-native'

import { Icon, type IconName } from '../ui/Icon'
import type { Badge } from '../../lib/aboutYou'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText, useIncreaseContrast } from './shared'

export type AchievementKind = Badge['kind']

/**
 * Each badge's glyph and its words (Flow 14 `BADGES`; ROUND3 G4). The words are
 * the design's, not the server's `label`: badges are tiers, never counts, so
 * the crew badge is "Out together often" however many nights the server counts
 * ("6 nights out together", lib/crews/signals.ts on the admin side).
 */
export const ACHIEVEMENT: Record<AchievementKind, { icon: IconName; label: string }> = {
  shows_up: { icon: 'calendar-check', label: 'Shows up' },
  nights_out: { icon: 'moon', label: '5+ nights this month' },
  regular_here: { icon: 'badge-check', label: 'Regular here' },
  nights_together: { icon: 'users', label: 'Out together often' },
}

/** The page's 28 pt pill (one step under the 32 pt tag). */
const PILL = SIZE.tag - SPACE.xs
const HAIRLINE = 0.5

/**
 * An achievement badge (guidelines/components/AchievementBadge.html, Flow 14
 * · 14.5): a 28 pt pill of 8% white with a glyph and the badge's words. Earned
 * from check-ins, never bought; they come and go on their own. After the name
 * on Me; "Regular here" only on a card in that venue's room. Which badges show
 * (the "Show my badges" switch, none in a room under 8) is the server's budget.
 *
 * Read as "Badge: Shows up". On Me a tap shows one line of what it means
 * (`onPress`, the caller's line; Flow 14 · 14.5); no haptic either way. The
 * words cap at 1.3× inside the pill; Bold Text steps them up; Increase
 * Contrast takes the 50% hairline. The pill reaches the target through slop.
 */
export function AchievementBadge({ kind, onPress, testID }: { kind: AchievementKind; onPress?: () => void; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { icon, label } = ACHIEVEMENT[kind]
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={(minTarget() - PILL) / 2}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Badge: ${label}`}
      style={[styles.pill, contrast ? styles.contrast : styles.hairline]}
    >
      <Icon name={icon} size={ICON.inline} />
      <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.text]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    height: PILL,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.fillOnGlass,
  },
  hairline: { borderWidth: HAIRLINE, borderColor: COLOR.hairlineStrong },
  contrast: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
  text: { color: COLOR.textPrimary },
})
