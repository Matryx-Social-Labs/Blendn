import { useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { CrewEmblem, EMBLEM_MOTIFS, EMBLEM_PALETTES, emblemFor, type EmblemMotif } from '../../components/ds/CrewEmblem'
import { Grain } from '../../components/ds/Grain'
import { MomentBlend, type MomentBlendProps } from '../../components/ds/MomentBlend'
import { MomentMatch } from '../../components/ds/MomentMatch'
import { MomentPour } from '../../components/ds/MomentPour'
import { MomentReady } from '../../components/ds/MomentReady'
import { MomentRecap, type MomentRecapProps } from '../../components/ds/MomentRecap'
import type { MomentFace } from '../../components/ds/MomentStage'
import { Orbs, type OrbSet, type OrbTime } from '../../components/ds/Orbs'
import { COLOR, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'

/**
 * P5, sets and moments (ROUND3 B4; guidelines/components/Moment*.html,
 * guidelines/backdrop/*, guidelines/round2/emblem.js), every one on demand.
 *
 * Deep-link `exp+blendn:///preview/ds-p5`. Each moment replays from
 * `ds-play-<moment>-<variant>` and mounts as `ds-moment-<moment>`; the Recap's
 * states are inline cells (`ds-recap-<state>`, replay `ds-replay-recap`), the
 * orb sets `ds-orbs-<set>-<time>`, the emblems `ds-emblem-<motif>-<variant>`.
 *
 * The platform and the accessibility settings are the device's, so drive it on
 * iOS and Android, and again with Reduce Motion, Reduce Transparency and
 * Increase Contrast on. The orbs drift on iOS only.
 */
const PHOTO = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256'
const PHOTO_THEM = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256'
const ME: MomentFace = { kind: 'photo', uri: PHOTO }
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 }

const MATCHES: Record<string, { you: MomentFace; them: MomentFace; name: string }> = {
  'photo-photo': { you: ME, them: { kind: 'photo', uri: PHOTO_THEM }, name: 'Priya' },
  'photo-creature': { you: ME, them: { kind: 'creature', pseudonym: 'Velvet Heron' }, name: 'Velvet Heron' },
  'creature-creature': { you: { kind: 'creature', pseudonym: 'Cosmic Panda' }, them: { kind: 'creature', pseudonym: 'Velvet Heron' }, name: 'Velvet Heron' },
}
const NEBULA = { kind: 'crew', name: 'Nebula', emblemSeed: 'nebula', count: 3 } as const
const ORBIT = { kind: 'crew', name: 'Orbit', emblemSeed: 'orbit', count: 4 } as const
const noop = () => {}
const BLENDS: Record<string, MomentBlendProps> = {
  cc: { ours: NEBULA, theirs: ORBIT, facets: ['Dance floor', 'Friendship'], yourLike: true, onOpen: noop, onLater: noop },
  cpCrew: { ours: NEBULA, theirs: { kind: 'person', pseudonym: 'Quiet Heron' }, facets: ['Live music'], yourLike: true, onOpen: noop, onLater: noop },
  cpPerson: { ours: { kind: 'person', pseudonym: 'Cosmic Panda' }, theirs: NEBULA, yourLike: true, onOpen: noop, onLater: noop },
  'cc-later': { ours: NEBULA, theirs: ORBIT, yourLike: false, onOpen: noop, onLater: noop },
}
const PLAYS = [
  ...Object.keys(MATCHES).map((v) => `match-${v}`),
  ...Object.keys(BLENDS).map((v) => `blend-${v}`),
  'ready',
  'pour',
] as const

const RECAPS: Record<string, Partial<MomentRecapProps>> = {
  'two-matches': {},
  'no-matches': { matches: 0 },
  rated: { rated: true },
  'no-photo': { face: { kind: 'creature', pseudonym: 'Cosmic Panda' } },
}
const RECAP: Omit<MomentRecapProps, 'onRate' | 'onBack'> = { face: ME, title: 'Vinyl Night', venue: 'Toit', minutes: 135, matches: 2, rated: false }

const ORB_CELLS: [OrbSet, OrbTime][] = [
  ['brand', 'early'],
  ['brand', 'night'],
  ['brand', 'late'],
  ['feed', 'early'],
  ['feed', 'night'],
  ['feed', 'late'],
  ['moment', 'night'],
]

/** A seed for every palette × motif, found by trying `seed-0`, `seed-1`, … (the emblem takes only a seed). */
const SEEDS = (() => {
  const found = new Map<string, string>()
  for (let i = 0; found.size < EMBLEM_PALETTES.length * EMBLEM_MOTIFS.length; i++) {
    const { palette, motif } = emblemFor(`seed-${i}`)
    const key = `${palette}/${motif}`
    if (!found.has(key)) found.set(key, `seed-${i}`)
  }
  return found
})()
const seedFor = (palette: number, motif: EmblemMotif) => SEEDS.get(`${palette}/${motif}`) as string
const EMBLEM_SIZES = [24, 40, 56, 96, 160]

export default function DsP5Preview() {
  const insets = useSafeAreaInsets()
  const [moment, setMoment] = useState<{ play: (typeof PLAYS)[number]; key: number } | null>(null)
  const [recapRound, setRecapRound] = useState(0)
  const close = () => setMoment(null)

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P5 · sets and moments</Text>

        <Section title="Moments" note="Each plays once from its button; tap anywhere to skip. Say hi, Keep looking, Open the Blend and Later close it.">
          {PLAYS.map((play) => (
            <Button key={play} testID={`ds-play-${play}`} label={`Play: ${play}`} kind="secondary" size="md" onPress={() => setMoment({ play, key: Date.now() })} />
          ))}
        </Section>

        <Section title="Recap · states" note="#43: the blocks enter 28 ms apart; numbers arrive set.">
          <Button testID="ds-replay-recap" label="Replay the entrance" kind="secondary" size="md" onPress={() => setRecapRound((n) => n + 1)} />
          {Object.entries(RECAPS).map(([state, props]) => (
            <Cell key={state} label={state} testID={`ds-recap-${state}`} style={styles.tall}>
              <SafeAreaInsetsContext.Provider value={NO_INSETS}>
                <MomentRecap key={recapRound} {...RECAP} {...props} onRate={noop} onBack={noop} onClose={noop} />
              </SafeAreaInsetsContext.Provider>
            </Cell>
          ))}
        </Section>

        <Section title="Orbs · sets × time of night" note="Static on Android and under Reduce Motion; Increase Contrast halves them.">
          {ORB_CELLS.map(([set, time]) => (
            <Cell key={`${set}-${time}`} label={`${set} · ${time}`} testID={`ds-orbs-${set}-${time}`} style={styles.backdrop}>
              <Orbs set={set} time={time} />
              <Grain />
              <Text style={styles.title}>Tonight</Text>
            </Cell>
          ))}
          <Cell label="the clock’s set, drifting" testID="ds-orbs-clock" style={styles.backdrop}>
            <Orbs set="brand" />
            <Grain />
          </Cell>
        </Section>

        <Section title="Grain" note="Off, then on: one static 256 pt tile at 5%.">
          <Cell label="no grain · grain" testID="ds-grain" style={[styles.backdrop, styles.split]}>
            <View style={styles.half}>
              <Orbs set="moment" />
            </View>
            <View style={styles.half}>
              <Orbs set="moment" />
              <Grain />
            </View>
          </Cell>
        </Section>

        <Section title="Crew emblems · 12 motifs, field and glyph">
          {EMBLEM_MOTIFS.map((motif, i) => (
            <View key={motif} style={styles.row}>
              {(['field', 'glyph'] as const).map((variant) => (
                <View key={variant} testID={`ds-emblem-${motif}-${variant}`}>
                  <CrewEmblem seed={seedFor(i % EMBLEM_PALETTES.length, motif)} size={56} variant={variant} />
                </View>
              ))}
              <Text style={styles.caption}>{motif}</Text>
            </View>
          ))}
        </Section>
        <Section title="Crew emblems · 12 palettes">
          <View style={styles.wrap}>
            {EMBLEM_PALETTES.map((_, palette) => (
              <View key={palette} testID={`ds-emblem-palette-${palette}`}>
                <CrewEmblem seed={seedFor(palette, 'crescent')} size={40} />
              </View>
            ))}
          </View>
        </Section>
        <Section title="Crew emblems · sizes" note="24 chip · 40 row · 56 Banter · 96 card · 160 detail and the Blend">
          <View style={[styles.wrap, styles.bottom]}>
            {EMBLEM_SIZES.map((size) => (
              <View key={size} testID={`ds-emblem-size-${size}`}>
                <CrewEmblem seed="nebula" size={size} />
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      {moment ? <Moment key={moment.key} play={moment.play} onEnd={close} /> : null}
    </View>
  )
}

function Moment({ play, onEnd }: { play: (typeof PLAYS)[number]; onEnd: () => void }) {
  if (play.startsWith('match-')) {
    const m = MATCHES[play.slice('match-'.length)]
    return <MomentMatch testID="ds-moment-match" {...m} reason="Both into live music" opener="Which set are you here for?" onSayHi={onEnd} onClose={onEnd} />
  }
  if (play.startsWith('blend-')) {
    return <MomentBlend testID="ds-moment-blend" {...BLENDS[play.slice('blend-'.length)]} onOpen={onEnd} onLater={onEnd} />
  }
  if (play === 'ready') return <MomentReady testID="ds-moment-ready" name="Sam" onDone={onEnd} />
  // The pour clears itself and lets touches through; the next Play replaces it.
  return <MomentPour testID="ds-moment-pour" venue="Toit" onDone={noop} />
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.cells}>{children}</View>
    </View>
  )
}

function Cell({ label, testID, children, style }: { label: string; testID: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={testID} style={styles.cell}>
      <Text style={styles.caption}>{label}</Text>
      <View style={[styles.stage, style]}>{children}</View>
    </View>
  )
}

/** The narrowest supported phone (360 dp), as on /preview/ds-p0. */
const CELL_WIDTH = 360
const BACKDROP_HEIGHT = 240
const RECAP_HEIGHT = 720

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  note: { ...TYPE.meta, color: COLOR.textSecondary },
  cells: { gap: SPACE.lg },
  cell: { gap: SPACE.sm, maxWidth: CELL_WIDTH },
  caption: { ...TYPE.label, color: COLOR.textTertiary },
  title: { ...TYPE.title, color: COLOR.textPrimary, margin: SPACE.lg },
  stage: { borderRadius: RADIUS.rowInCard, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline, overflow: 'hidden' },
  backdrop: { height: BACKDROP_HEIGHT, backgroundColor: COLOR.ink },
  tall: { height: RECAP_HEIGHT },
  split: { flexDirection: 'row' },
  half: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  bottom: { alignItems: 'flex-end' },
})
