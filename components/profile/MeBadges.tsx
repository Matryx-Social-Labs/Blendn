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
 * only when nothing says anything about badges (`badges` is `null`: an older server with badges on and none sent). Turned off, the card stays
 * with its "Show my badges" switch, so there is always a way back from Me.
 * Composed from the DS heading, `AchievementBadge` and the surface card; "Show 'Shows up'" stays in About you.
 */
export function MeBadges({
  badges,
  showBadges,
  showsUp,
}: {
  badges: readonly Badge[] | null
  /** "Show my badges" (14.5 #04/#05): the master switch, kept on Me so turning badges off is never a dead end. Omitted from a server that sends no `show_badges`. */
  showBadges?: { value: boolean; onChange: (next: boolean) => Promise<boolean> }
  /** The "Shows up" opt-in on the card (14.5): its value and the write; `onChange` says whether the server kept it. Omitted: the row is not drawn. */
  showsUp?: { value: boolean; onChange: (next: boolean) => Promise<boolean> }
}) {
  const bold = useBoldText()
  const [meaning, setMeaning] = useState<string | null>(null)
  if (badges === null) return null
  const hidden = showBadges?.value === false
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
              {hidden ? SHOWN_TO_NOBODY : (meaning ?? 'From your check-ins. They can’t be bought, and they come and go on their own.')}
            </Text>
          </>
        ) : (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
            Badges come from your check-ins: showing up to what you said you would, and nights out. They appear here when you earn them.
            Nothing to unlock.
          </Text>
        )}
        {showBadges || (showsUp && !hidden) ? (
          <View style={styles.rule}>
            {showBadges ? (
              <SwitchRow
                testID="me-show-badges"
                icon="badge-check"
                title={SHOW_BADGES_TITLE}
                hintOn={SHOW_BADGES_ON}
                hintOff={SHOW_BADGES_OFF}
                value={showBadges.value}
                onChange={showBadges.onChange}
              />
            ) : null}
            {/* With every badge hidden the "Shows up" opt-in has nothing to opt into. */}
            {showsUp && !hidden ? (
              <SwitchRow testID="me-shows-up" icon="calendar-check" title={SHOWS_UP_TITLE} hintOn={SHOWS_UP_ON} hintOff={SHOWS_UP_OFF} value={showsUp.value} onChange={showsUp.onChange} />
            ) : null}
          </View>
        ) : null}
      </View>
    </ProfileSection>
  )
}

const SHOWS_UP_ON = 'When 80%+ of your RSVPs turn into nights, 3 or more'
const SHOWS_UP_OFF = 'Off · earned, not shown'

export const SHOWS_UP_TITLE = 'Show badge: Shows up'
const SHOW_BADGES_TITLE = 'Show my badges'
const SHOW_BADGES_ON = 'Never shown in rooms under 8'
const SHOW_BADGES_OFF = 'Off · hidden on every card'
const SHOWN_TO_NOBODY = 'Earned, shown to nobody'

/**
 * A switch on the card (Flow 14 · 14.5 #01 to #05), under a hairline: "Show my badges" and "Show “Shows up”". It changes at once
 * and is written at once; a write the server refuses puts it back and says so under the row (`error`, which plays `H.error`).
 */
function SwitchRow({
  testID,
  icon,
  title,
  hintOn,
  hintOff,
  value,
  onChange,
}: {
  testID: string
  icon: 'badge-check' | 'calendar-check'
  title: string
  hintOn: string
  hintOff: string
  value: boolean
  onChange: (next: boolean) => Promise<boolean>
}) {
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
    <SettingsRow
      testID={testID}
      icon={icon}
      // D-L31: what the switch shows, said plainly; "Show “Shows up”" read as a stutter.
      title={title}
      hint={failed ? 'Couldn’t save that. Try again.' : on ? hintOn : hintOff}
      trail="switch"
      value={on}
      busy={busy}
      error={failed}
      onValueChange={(next) => void change(next)}
    />
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.card, padding: SPACE.lg, gap: SPACE.md },
  muted: { color: COLOR.textSecondary },
  // The row spans the card, edge to edge, under a hairline: it brings its own padding, so the card's is taken back.
  rule: { marginHorizontal: -SPACE.lg, marginBottom: -SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
})
