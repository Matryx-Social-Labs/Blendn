import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import type { Badge } from '../../lib/aboutYou'
import { BADGE_MEANING } from '../../lib/profileBadges'
import { AchievementBadge } from '../ds/AchievementBadge'
import { font, useBoldText } from '../ds/shared'
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
 * Your badges on Me (Flow 14 · 14.5): the earned ones as pills, one line on where they come from, and a tap on one says what it
 * means, in one line, with no haptic. Nothing earned yet is a sentence and no locked grid: badges simply appear. Not drawn at all
 * when the server sent none (the person turned them off, or an older server): `badges` is `null` then, and the card is absent.
 * Composed from the DS heading, `AchievementBadge` and the surface card; "Show 'Shows up'" stays in About you.
 */
export function MeBadges({ badges }: { badges: readonly Badge[] | null }) {
  const bold = useBoldText()
  const [meaning, setMeaning] = useState<string | null>(null)
  if (badges === null) return null
  return (
    <ProfileSection title="Badges" testID="me-badges">
      <View style={styles.card}>
        {badges.length > 0 ? (
          <>
            <BadgeRow badges={badges} onPress={(b) => setMeaning(BADGE_MEANING[b.kind])} />
            <Text accessibilityLiveRegion="polite" style={[font('meta', bold), styles.muted]}>
              {meaning ?? 'From your check-ins. They can’t be bought, and they come and go on their own.'}
            </Text>
          </>
        ) : (
          <Text style={[font('meta', bold), styles.muted]}>
            Badges come from your check-ins: showing up to what you said you would, and nights out. They appear here when you earn them.
            Nothing to unlock.
          </Text>
        )}
      </View>
    </ProfileSection>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.card, padding: SPACE.lg, gap: SPACE.md },
  muted: { color: COLOR.textSecondary },
})
