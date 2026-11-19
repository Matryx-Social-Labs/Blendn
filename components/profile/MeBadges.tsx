import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import type { Badge } from '../../lib/aboutYou'
import { BADGE_MEANING } from '../../lib/profileBadges'
import { AchievementBadge } from '../ds/AchievementBadge'
import { announceOutcome, font, useBoldText } from '../ds/shared'
import { ProfileSection } from './ProfileSections'

/** The badges as pills, 8 pt apart (Flow 14 · 14.5). `onPress` makes each one say what it means. */
export function BadgeRow({ badges, onPress, testID }: { badges: readonly Badge[]; onPress?: (badge: Badge) => void; testID?: string }) {
  return (
    <View testID={testID} style={styles.row}>
      {badges.map((b) => (
        <AchievementBadge key={b.kind} kind={b.kind} onPress={onPress ? () => onPress(b) : undefined} testID={`badge-${b.kind}`} />
      ))}
    </View>
  )
}

/**
 * Your badges on Me (Me + settings A 01, owner 2026-11-18): the earned ones as chips under a heading, a tap on one says what it
 * means in one line, with no haptic. Nothing earned yet is a sentence and no locked grid. The switches ("Show my badges",
 * "Show “Shows up”") live in Edit about you only now; with badges hidden the line says so and where to change it. Not drawn
 * at all when nothing says anything about badges (`badges` is `null`: an older server with badges on and none sent).
 */
export function MeBadges({ badges, hidden = false }: { badges: readonly Badge[] | null; /** "Show my badges" is off. */ hidden?: boolean }) {
  const bold = useBoldText()
  const [meaning, setMeaning] = useState<string | null>(null)
  if (badges === null) return null
  return (
    <ProfileSection title="Badges" testID="me-badges">
      {badges.length > 0 ? (
        <BadgeRow
          badges={badges}
          onPress={(b) => {
            const line = BADGE_MEANING[b.kind]
            setMeaning(line)
            // iOS does not read a live region that changes: said out loud.
            announceOutcome(line)
          }}
        />
      ) : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.muted]}>
        {hidden ? SHOWN_TO_NOBODY : badges.length === 0 ? NONE_YET : (meaning ?? FROM_CHECK_INS)}
      </Text>
    </ProfileSection>
  )
}

const FROM_CHECK_INS = 'From your check-ins. They can’t be bought, and they come and go on their own.'
const NONE_YET = 'Badges come from your check-ins: showing up to what you said you would, and nights out. They appear here when you earn them. Nothing to unlock.'
export const SHOWN_TO_NOBODY = 'Earned, shown to nobody. Change it in Edit profile.'

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  muted: { color: COLOR.textSecondary },
})
