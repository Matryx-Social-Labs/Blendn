import { Fragment, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { inYouLast, namesLine, type StripCrewRow } from '../../lib/crews'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { CountTicks } from './CountTicks'
import { CrewEmblem } from './CrewEmblem'
import { Facepile, type Face } from './Facepile'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

/** One crew's row: `StripCrewRow` (lib/crews.ts), and `cheer` for your own crew check-in moment. */
export type StripCrew = StripCrewRow & {
  /** Which crew check-in this row is (`{eventId}|{crewId}`): drawn naming you for the first time, the huddle cheers. */
  cheerKey?: string
}

/** The crew check-ins that have cheered this run: once per crew per event, not on every mount of the strip. */
const cheered = new Set<string>()
/** True the first time `key` asks. ponytail: in memory, so a relaunch may cheer again, which is harmless. */
function firstCheer(key: string): boolean {
  if (cheered.has(key)) return false
  cheered.add(key)
  return true
}

const EMBLEM = 40
const FACE = 24
/** Off (crews hidden at this event): one quiet line. The frame's second sentence ("The strip hides and “We’re here” is refused") is a note on behaviour, not copy (owner's ruling, PR #393). */
const OFF_LINE = 'Crews are off at this event.'
const ROW_MIN_HEIGHT = SIZE.primary + SPACE.sm
/** The off line's edge: 1 pt at 14%. */
const OFF_EDGE = 0.14

/**
 * Your crews, after your own check-in (crews 4-A3, board 04-checkin A3; was Flow 10 · 10.6): on the pass's success and in the
 * Room. "Nebula · 3 of 5 in", the ticks, and who is in by first name with their faces ("Priya, Arjun, You"). Only who came in
 * with the crew is named; nobody is ever listed as not here yet. No action: the hold's "With {crew}" is how you tell the crew
 * ("Tell your crew — We're here" is retired, owner 7). Two crews stack. Off (crews hidden at this event) is one quiet line.
 *
 * Read: "Nebula, 3 of 5 in, Vinyl Night · Toit. In: Priya, Arjun, You". A count rising plays nothing; your own crew check-in
 * plays the huddle's cheer once (`cheerKey`; Reduce Motion: the still).
 */
export function CrewStrip({ crews, off = false, testID }: { crews: StripCrew[]; off?: boolean; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  if (off) {
    return (
      <View testID={testID} style={[styles.strip, styles.off]}>
        <Icon name="users" size={ICON.control} color={COLOR.textSecondary} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.fill, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{OFF_LINE}</Text>
      </View>
    )
  }
  return (
    <View testID={testID} style={[styles.strip, styles.surface, contrast && IC_HAIRLINE]}>
      {crews.map((crew, i) => (
        <Fragment key={crew.id}>
          {i ? <View style={styles.hairline} /> : null}
          <CrewStripRow crew={crew} testID={testID && `${testID}-${crew.id}`} />
        </Fragment>
      ))}
    </View>
  )
}

function CrewStripRow({ crew, testID }: { crew: StripCrew; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  // Decided once, as the row is first drawn: a row that names you then is your arrival with the crew.
  const [cheer] = useState(() => !!crew.cheerKey && crew.people.some((p) => p.you) && firstCheer(crew.cheerKey))
  const count = Math.max(0, Math.min(crew.in, crew.size))
  const everyone = count >= crew.size
  const names = crew.people.length ? namesLine(crew.people) : null
  const faces: Face[] = inYouLast(crew.people).map((x) => (x.photo ? { kind: 'photo', uri: x.photo } : { kind: 'creature', pseudonym: x.name }))
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const label = [`${crew.name}, ${everyone ? 'everyone' : `${count} of ${crew.size}`} in, ${crew.context}`, names && `In: ${names}`].filter(Boolean).join('. ')
  return (
    <View accessible accessibilityLabel={label} style={styles.row}>
      <View style={styles.top}>
        <CrewEmblem seed={crew.emblemSeed} size={EMBLEM} scene={cheer ? 'cheer' : undefined} />
        <View style={styles.fill}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
            {crew.name}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={1} style={[font('meta', bold), { color: secondary }]}>
            {/* Mono is for figures: "3 of 5" is, "Everyone" is a word in the body face (rc7 D12). */}
            {everyone ? <Text style={styles.ink}>Everyone</Text> : <Text style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{`${count} of ${crew.size}`}</Text>}
            {` in · ${crew.context}`}
          </Text>
        </View>
      </View>
      <CountTicks size={crew.size} here={count} />
      {names ? (
        <View testID={testID && `${testID}-who`} style={styles.who}>
          <Facepile faces={faces} size={FACE} max={FACES_SHOWN} ring={COLOR.surface} accessibilityLabel="" />
          <Text testID={testID && `${testID}-names`} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={1} style={[font('meta', bold), styles.ink, styles.fill]}>
            {names}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** Faces before "+N" in the names row (the Facepile's own default). */
const FACES_SHOWN = 5

const styles = StyleSheet.create({
  strip: { borderRadius: RADIUS.sheet, overflow: 'hidden' },
  surface: { backgroundColor: COLOR.surface },
  off: {
    minHeight: SIZE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderWidth: 1,
    borderColor: tint(COLOR.textPrimary, OFF_EDGE),
  },
  row: { minHeight: ROW_MIN_HEIGHT, gap: SPACE.sm, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  fill: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  tabular: { color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
  hairline: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACE.lg, backgroundColor: COLOR.hairline },
})
