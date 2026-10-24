import { Fragment, useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Button } from './Button'
import { CountTicks } from './CountTicks'
import { CrewEmblem } from './CrewEmblem'
import { announceOutcome, CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/** "We're here": not yet · on its way · the server said OK · someone already told them. */
export type TellState = 'no' | 'sending' | 'yes' | 'already'

export type StripCrew = {
  id: string
  name: string
  emblemSeed: string
  size: number
  /** Checked in now, you included: a count, never who. */
  here: number
  /** "Vinyl Night · Toit". */
  context: string
  told: TellState
}

const EMBLEM = 40
/** Off (crews hidden at this event): one quiet line. The frame's second sentence ("The strip hides and “We’re here” is refused") is a note on behaviour, not copy (owner's ruling, PR #393). */
const OFF_LINE = 'Crews are off at this event.'
const ROW_MIN_HEIGHT = SIZE.primary + SPACE.sm
/** The action and what it settles to: 44 pt capsules (Flow 10 · 10.6), 48 dp on Android; settled, a 1 pt edge at 14%. */
const SETTLED_EDGE = 0.14

/** `H.success` and the announcement once, when "We're here" lands (the server's OK); never for a row already told. */
function useToldOutcome(told: TellState) {
  const was = useRef(told)
  useEffect(() => {
    if (told === 'yes' && was.current !== 'yes' && was.current !== 'already') {
      H.success()
      announceOutcome('Your crew knows')
    }
    was.current = told
  }, [told])
}

/**
 * Your crew, after your own check-in (guidelines/components/CrewStrip.html,
 * Flow 10 · 10.6): on the pass's success and in the Room. "Crew Nebula · 2 of 4
 * in" with the ticks, and "Tell your crew — We're here" as a secondary that
 * settles to "Your crew knows". No group check-in, ever. Two crews stack. Off
 * (crews hidden at this event) is one quiet line and no action.
 *
 * "Crew Nebula, 2 of 4 here, Vinyl Night · Toit", then "Tell your crew, button".
 * `H.primary` on the press-in of We're here, `H.success` when the server says
 * OK; a count rising plays nothing.
 */
export function CrewStrip({ crews, off = false, onTell, testID }: { crews: StripCrew[]; off?: boolean; onTell: (id: string) => void; testID?: string }) {
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
          <CrewStripRow crew={crew} onTell={onTell} testID={testID && `${testID}-${crew.id}`} />
        </Fragment>
      ))}
    </View>
  )
}

function CrewStripRow({ crew, onTell, testID }: { crew: StripCrew; onTell: (id: string) => void; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  useToldOutcome(crew.told)
  const here = Math.max(0, Math.min(crew.here, crew.size))
  const sub = here <= 1 ? `You’re the first from ${crew.name}. Your crew shows up here once two of you are in.` : crew.context
  return (
    <View>
      <View accessible accessibilityLabel={`Crew ${crew.name}, ${here} of ${crew.size} here, ${sub}`} style={styles.row}>
        <CrewEmblem seed={crew.emblemSeed} size={EMBLEM} />
        <View style={styles.fill}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink]}>
            {`Crew ${crew.name} `}
            <Text style={{ color: COLOR.textSecondary }}>·</Text>{' '}
            {/* Mono is for figures: "3 of 5" is, "everyone" is a word in the body face (rc7 D12: the wide mono word orphaned "in"). */}
            {here >= crew.size ? (
              'everyone'
            ) : (
              <Text style={[font('bodyStrong', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{`${here} of ${crew.size}`}</Text>
            )}
            {' in'}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sub}</Text>
        </View>
        <CountTicks size={crew.size} here={here} />
      </View>
      <View style={styles.action}>
        {crew.told === 'yes' ? (
          <Settled icon="check" text="Your crew knows" testID={testID && `${testID}-settled`} />
        ) : crew.told === 'already' ? (
          <Settled icon="info" text="Your crew already knows" raised testID={testID && `${testID}-settled`} />
        ) : (
          <TellButton sending={crew.told === 'sending'} onPress={() => onTell(crew.id)} testID={testID && `${testID}-tell`} />
        )}
      </View>
    </View>
  )
}

/** "Tell your crew — We're here": the raised 44 Button (A31), `H.primary` on press-in; busy, a spinner in its place. */
function TellButton({ sending, onPress, testID }: { sending: boolean; onPress: () => void; testID?: string }) {
  return (
    <Button
      kind="lit"
      size="raised"
      icon="hand"
      label="Tell your crew — We’re here"
      loading={sending}
      pressHaptic={H.primary}
      onPress={onPress}
      testID={testID}
    />
  )
}

/** What the action settles to, over `quick` (Flow 10 · 10.6): words, not a button. */
function Settled({ icon, text, raised = false, testID }: { icon: IconName; text: string; raised?: boolean; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const ink = raised || contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <Animated.View
      testID={testID}
      accessibilityLiveRegion="polite"
      entering={reduceMotion ? undefined : FadeIn.duration(motionTokens(reduceMotion).duration.quick)}
      style={[styles.settled, { minHeight: minTarget() }, raised ? styles.raised : styles.edge, contrast && styles.contrastEdge]}
    >
      <Icon name={icon} size={ICON.inline} color={ink} />
      <Text style={[font('button', bold), { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
        {text}
      </Text>
    </Animated.View>
  )
}

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
    borderColor: tint(COLOR.textPrimary, SETTLED_EDGE),
  },
  row: { minHeight: ROW_MIN_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  tabular: { color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
  action: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
  hairline: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACE.lg, backgroundColor: COLOR.hairline },
  settled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderRadius: RADIUS.capsule,
    paddingHorizontal: SPACE.lg,
  },
  raised: { backgroundColor: COLOR.surfaceRaised },
  edge: { borderWidth: 1, borderColor: tint(COLOR.textPrimary, SETTLED_EDGE) },
  contrastEdge: { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast },
})
