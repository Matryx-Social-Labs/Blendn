import { useRef, useState, type ComponentRef } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { crewBadge, tagText, type CrewCard } from '../../lib/crews'
import { ACHIEVEMENT } from '../ds/AchievementBadge'
import { Chip } from '../ds/Chip'
import { CrewEmblem } from '../ds/CrewEmblem'
import { WaveButton, type CrewWave } from '../ds/CrewCard'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Title } from '../ds/Title'
import { OptionRows } from '../SheetHost'

/** Board crews/05-room A: the sheet's emblem. */
const EMBLEM = 104

/**
 * A crew as strangers see it, on a tap of its card in the Room (board crews/05-room A, advisor S-A 2026-11-25): the emblem,
 * the name, "Crew of N · N here now · badge", its tags, About them (its bio and what your sides share), Wave for your crew,
 * then three quiet rows: Hide this crew tonight, Block this crew, Report this crew. Counts and the crew's own words only:
 * never a member.
 */
export function CrewSheet({
  visible,
  card: live,
  wave,
  onClose,
  onDismissed,
  onWave,
  onHideTonight,
  onBlock,
  onReport,
}: {
  visible: boolean
  card: CrewCard | null
  wave: Omit<CrewWave, 'onPress'>
  onClose: () => void
  /** Once it has left the screen: what a row opens next (a confirm, the report, the Mix) waits for it. */
  onDismissed?: () => void
  onWave: () => void
  onHideTonight: () => void
  onBlock: () => void
  onReport: () => void
}) {
  const bold = useBoldText()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  const head = useRef<ComponentRef<typeof View>>(null)
  // Drawn as it leaves, even when its card has gone (blocked, hidden, left): the last crew shown (state adjusted in render).
  const [held, setHeld] = useState(live)
  if (live && live !== held) setHeld(live)
  const card = live ?? held
  if (!card) return null
  const here = Math.max(0, Math.min(card.presentCount, card.size))
  const badge = crewBadge(card.badges)
  const line = [`Crew of ${card.size}`, here ? `${here} here now` : null, badge ? ACHIEVEMENT[badge].label : null].filter(Boolean).join(' · ')
  const bio = card.bio?.trim()
  const overlap = card.overlaps?.[0]?.text ?? null

  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} focusRef={head} testID="crew-sheet">
      <View>
        <View ref={head} accessible accessibilityRole="header" accessibilityLabel={`${card.name}, ${line}`} style={styles.head} testID="crew-sheet-head">
          <View style={styles.emblem} testID="crew-sheet-emblem">
            <CrewEmblem seed={card.emblemSeed} size={EMBLEM} />
          </View>
          <Title style={[styles.ink, styles.center]}>{card.name}</Title>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.center, { color: quiet }]}>{line}</Text>
        </View>

        {card.tags.length ? (
          <View style={styles.chips} testID="crew-sheet-tags">
            {card.tags.map((t) => <Chip key={t.slug} label={`#${tagText(t)}`} lines={2} />)}
          </View>
        ) : null}

        {bio || overlap ? (
          <View accessible style={styles.about} testID="crew-sheet-about">
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>About them</Text>
            {bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('body', bold), styles.ink]}>{`“${bio}”`}</Text> : null}
            {overlap ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: quiet }]}>{overlap}</Text> : null}
          </View>
        ) : null}

        <View style={styles.wave} testID="crew-sheet-wave">
          <WaveButton wave={{ ...wave, onPress: onWave }} />
        </View>

        <View style={styles.rows} testID="crew-sheet-rows">
          <OptionRows
            rows={[
              { key: 'hide', label: 'Hide this crew tonight', onPress: onHideTonight },
              { key: 'block', label: 'Block this crew', onPress: onBlock },
              { key: 'report', label: 'Report this crew', onPress: onReport },
            ]}
          />
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  // The board's own gaps (05-room A, waves-b1 S-A): 12 under the emblem, 2, 10 to the tags, 14, 16 to Wave, 14 to the rows.
  head: { alignItems: 'center', gap: SPACE.xxs },
  emblem: { marginBottom: SPACE.md - SPACE.xxs },
  center: { textAlign: 'center' },
  ink: { color: COLOR.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE.sm, marginTop: SPACE.sm + SPACE.xxs },
  wave: { marginTop: SPACE.lg },
  rows: { marginTop: SPACE.md + SPACE.xxs },
  about: {
    marginTop: SPACE.md + SPACE.xxs,
    borderRadius: RADIUS.rowInCard,
    // The sheet's own fill: 8% white on iOS glass, sunken on Android's solid sheet (CrewCard onSheet).
    backgroundColor: Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass,
    padding: SPACE.md,
    gap: SPACE.xs,
  },
})
