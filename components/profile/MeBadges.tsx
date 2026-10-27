import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import type { Badge } from '../../lib/aboutYou'
import { BADGE_MEANING } from '../../lib/profileBadges'
import { AchievementBadge } from '../ds/AchievementBadge'
import { SettingsRow } from '../ds/SettingsRow'
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
 * Your badges on Me (Flow 14 · 14.5): the earned ones as pills, one line on where they come from, and a tap on one says what it
 * means, in one line, with no haptic. Nothing earned yet is a sentence and no locked grid: badges simply appear. Not drawn at all
 * when the server sent none (the person turned them off, or an older server): `badges` is `null` then, and the card is absent.
 * Composed from the DS heading, `AchievementBadge` and the surface card; "Show 'Shows up'" stays in About you.
 */
export function MeBadges({
  badges,
  showsUp,
}: {
  badges: readonly Badge[] | null
  /** The "Shows up" opt-in on the card (14.5): its value and the write; `onChange` says whether the server kept it. Omitted: the row is not drawn. */
  showsUp?: { value: boolean; onChange: (next: boolean) => Promise<boolean> }
}) {
  const bold = useBoldText()
  const [meaning, setMeaning] = useState<string | null>(null)
  if (badges === null) return null
  return (
    <ProfileSection title="Badges" testID="me-badges">
      <View style={styles.card}>
        {badges.length > 0 ? (
          <>
            <BadgeRow
              badges={badges}
              onPress={(b) => {
                const line = BADGE_MEANING[b.kind]
                setMeaning(line)
                // iOS does not read a live region that changes: said out loud.
                announceOutcome(line)
              }}
            />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} accessibilityLiveRegion="polite" style={[font('meta', bold), styles.muted]}>
              {meaning ?? 'From your check-ins. They can’t be bought, and they come and go on their own.'}
            </Text>
          </>
        ) : (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
            Badges come from your check-ins: showing up to what you said you would, and nights out. They appear here when you earn them.
            Nothing to unlock.
          </Text>
        )}
        {showsUp ? <ShowsUpRow value={showsUp.value} onChange={showsUp.onChange} /> : null}
      </View>
    </ProfileSection>
  )
}

const SHOWS_UP_ON = 'When 80%+ of your RSVPs turn into nights, 3 or more'
const SHOWS_UP_OFF = 'Off · earned, not shown'

export const SHOWS_UP_TITLE = 'Show badge: Shows up'

/**
 * Show "Shows up" (Flow 14 · 14.5 #01 to #03): the one opt-in on the card, a switch under a hairline. It changes at once and
 * is written at once; a write the server refuses puts it back and says so under the row (`error`, which plays `H.error`).
 */
function ShowsUpRow({ value, onChange }: { value: boolean; onChange: (next: boolean) => Promise<boolean> }) {
  const [on, setOn] = useState(value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // What the server holds, when it changes from outside (the profile read again): state adjusted in render.
  const [held, setHeld] = useState(value)
  if (held !== value) {
    setHeld(value)
    setOn(value)
  }
  const change = async (next: boolean) => {
    if (busy) return
    setOn(next)
    setBusy(true)
    setFailed(false)
    const kept = await onChange(next)
    setBusy(false)
    if (!kept) {
      setOn(!next)
      setFailed(true)
    }
  }
  return (
    <View style={styles.rule}>
      <SettingsRow
        testID="me-shows-up"
        icon="calendar-check"
        // D-L31: what the switch shows, said plainly; "Show “Shows up”" read as a stutter.
        title={SHOWS_UP_TITLE}
        hint={failed ? 'Couldn’t save that. Try again.' : on ? SHOWS_UP_ON : SHOWS_UP_OFF}
        trail="switch"
        value={on}
        busy={busy}
        error={failed}
        onValueChange={(next) => void change(next)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.card, padding: SPACE.lg, gap: SPACE.md },
  muted: { color: COLOR.textSecondary },
  // The row spans the card, edge to edge, under a hairline: it brings its own padding, so the card's is taken back.
  rule: { marginHorizontal: -SPACE.lg, marginBottom: -SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
})
