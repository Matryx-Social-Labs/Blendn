import { useRef, type ComponentRef } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { crewBadge, type CrewCard } from '../../lib/crews'
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
  card,
  wave,
  onClose,
  onWave,
  onHideTonight,
  onBlock,
  onReport,
}: {
  visible: boolean
  card: CrewCard | null
  wave: Omit<CrewWave, 'onPress'>
  onClose: () => void
  onWave: () => void
  onHideTonight: () => void
  onBlock: () => void
  onReport: () => void
}) {
  const bold = useBoldText()
  const quiet = useIncreaseContrast() ? COLOR.textPrimary : COLOR.textSecondary
  const head = useRef<ComponentRef<typeof View>>(null)
  if (!card) return null
  const here = Math.max(0, Math.min(card.presentCount, card.size))
  const badge = crewBadge(card.badges)
  const line = [`Crew of ${card.size}`, here ? `${here} here now` : null, badge ? ACHIEVEMENT[badge].label : null].filter(Boolean).join(' · ')
  const bio = card.bio?.trim()
  const overlap = card.overlaps?.[0]?.text ?? null

  return (
    <Sheet visible={visible} onClose={onClose} focusRef={head} testID="crew-sheet">
      <ScrollView contentContainerStyle={styles.body}>
        <View ref={head} accessible accessibilityRole="header" accessibilityLabel={`${card.name}, ${line}`} style={styles.head}>
          <CrewEmblem seed={card.emblemSeed} size={EMBLEM} />
          <Title style={[styles.ink, styles.center]}>{card.name}</Title>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.center, { color: quiet }]}>{line}</Text>
        </View>

        {card.tags.length ? (
          <View style={styles.chips}>
            {card.tags.map((t) => <Chip key={t.slug} label={t.label} lines={2} />)}
          </View>
        ) : null}

        {bio || overlap ? (
          <View accessible style={styles.about} testID="crew-sheet-about">
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>About them</Text>
            {bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('body', bold), styles.ink]}>{`“${bio}”`}</Text> : null}
            {overlap ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: quiet }]}>{overlap}</Text> : null}
          </View>
        ) : null}

        <WaveButton wave={{ ...wave, onPress: onWave }} />

        <OptionRows
          rows={[
            { key: 'hide', label: 'Hide this crew tonight', onPress: onHideTonight },
            { key: 'block', label: 'Block this crew', onPress: onBlock },
            { key: 'report', label: 'Report this crew', onPress: onReport },
          ]}
        />
      </ScrollView>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg },
  head: { alignItems: 'center', gap: SPACE.xs },
  center: { textAlign: 'center' },
  ink: { color: COLOR.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE.sm },
  about: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface, padding: SPACE.md, gap: SPACE.xs },
})
