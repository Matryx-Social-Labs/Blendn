import { Platform, StyleSheet, Text, View } from 'react-native'

import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { tint } from '../../lib/theme'
import { BUBBLE, plural } from './chatShared'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** The page's option rows: 12 pt corners, a 6% white bar, an 18 pt ring at 50% (drawn at the 20 pt glyph size). */
const OPTION_RADIUS = 12
const BAR_ALPHA = 0.06
const RING_ALPHA = 0.5
const RING_WIDTH = 1.5

export type PollOption = {
  label: string
  /** A count; `null` withheld under five ("Fewer than 5", never a zero); absent, hidden until it closes. */
  votes?: number | null
}

export type PollBubbleProps = {
  question: string
  options: PollOption[]
  /** Your vote, by index. */
  picked?: number
  closed?: boolean
  /** A vote or a change, while it is open. */
  onVote?: (index: number) => void
  /** Who asked, as the label names them. */
  from?: string
  /**
   * The server's own words for counts it withheld under the floor ("Results appear once more people vote"). Given, the
   * options draw no per-option "Fewer than 5" and the foot says this: the number five is the server's to name, not ours.
   */
  withheldLine?: string
  /** The design gallery only: draws the option at this index pressed. */
  previewPressed?: number
  testID?: string
}

/** Every count is known: only then is there a total, and are there bars (never a zero, never a partial 100%). */
const counted = (options: PollOption[]) => options.every((o) => typeof o.votes === 'number')

function footLine(options: PollOption[], picked: number | undefined, closed: boolean, total: number, withheldLine?: string) {
  if (closed) return counted(options) ? `Closed · ${plural(total, 'vote')}` : 'Closed'
  if (picked === undefined) return 'Tap to vote · you can change it until it closes'
  if (options.every((o) => o.votes === undefined)) return 'Results appear when the poll closes'
  if (!counted(options)) return withheldLine ?? 'Counts show once 5 or more people vote'
  return plural(total, 'vote')
}

/**
 * A poll from the organiser (guidelines/components/PollBubble.html, ROUND3 C8):
 * an inbound `surfaceSunken` bubble, the question at 17, 44 pt option rows on
 * `surface`. Before you vote the rows carry an empty ring; after, your pick is
 * outlined and checked, and each row shows a 6% white bar and its count in
 * Geist Mono. The server withholds counts under five ("Fewer than 5", never a
 * zero) and can hide them until it closes ("Results appear when the poll
 * closes", its copy). A vote can change while it is open; closed rows no
 * longer press.
 *
 * `H.select` on a vote or a change, never on a re-tap; none on a closed row.
 * Read as "Poll from the organiser: {question}", then each option as a radio
 * ("One more, 7 votes"), then the foot line. No long-press menu. Increase
 * Contrast: the hairline.
 */
export function PollBubble({ question, options, picked, closed = false, onVote, from = 'the organizer', withheldLine, previewPressed, testID }: PollBubbleProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const shown = (picked !== undefined || closed) && options.some((o) => o.votes !== undefined)
  const total = options.reduce((sum, o) => sum + (o.votes ?? 0), 0)
  const head = from === 'the organizer' ? 'Organizer' : from

  return (
    <View testID={testID} style={[styles.bubble, contrast && IC_HAIRLINE]}>
      <View accessible accessibilityLabel={`Poll from ${from}: ${question}`} style={styles.words}>
        <View style={styles.head}>
          <Icon name="chart-column" size={ICON.inline} color={COLOR.textSecondary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            Poll · {head}
            {closed ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={styles.primary}> · Closed</Text> : null}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.primary]}>
          {question}
        </Text>
      </View>
      {options.map(({ label, votes }, i) => {
        const count = shown && votes !== undefined ? (votes === null ? (withheldLine ? null : 'Fewer than 5') : String(votes)) : null
        return (
          <Option
            key={i}
            label={label}
            count={count}
            spoken={count && (votes === null ? 'fewer than 5 votes' : plural(votes ?? 0, 'vote'))}
            bar={shown && counted(options) && typeof votes === 'number' && total > 0 ? (`${Math.round((votes / total) * 100)}%` as const) : null}
            mark={i === picked ? 'check' : picked === undefined && !closed ? 'ring' : 'none'}
            closed={closed}
            onPress={
              onVote && i !== picked
                ? () => {
                    H.select()
                    onVote(i)
                  }
                : undefined
            }
            pressed={previewPressed === i}
            testID={testID && `${testID}-bar-${i}`}
          />
        )
      })}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.foot]}>{footLine(options, picked, closed, total, withheldLine)}</Text>
    </View>
  )
}

/** One option row. `onPress` absent on your current pick (a re-tap changes nothing) and once it has closed. */
function Option({
  label,
  count,
  spoken,
  bar,
  mark,
  closed,
  onPress,
  pressed,
  testID,
}: {
  label: string
  count: string | null
  spoken: string | null
  bar: `${number}%` | null
  mark: 'check' | 'ring' | 'none'
  closed: boolean
  onPress?: () => void
  pressed: boolean
  testID?: string
}) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  // Your pick is lit as a chip is, in the screen's hue (rim and fill), never a white rim: the ReactionBar is the one white pick.
  const sel = useSelection()
  const lit = mark === 'check'
  return (
    <View style={pressed && !android && styles.pressedIos}>
      <ScalePress
        disabled={closed}
        onPress={onPress}
        android_ripple={{ color: PRESSED_WASH.android }}
        accessibilityRole="radio"
        accessibilityLabel={spoken ? `${label}, ${spoken}` : label}
        accessibilityState={{ checked: mark === 'check', disabled: closed }}
        style={[styles.option, { minHeight: minTarget() }, lit && { borderColor: sel.edge, backgroundColor: sel.fill }, pressed && android && styles.pressedAndroid]}
      >
        {bar ? <View testID={testID} style={[styles.bar, { width: bar }]} /> : null}
        {lit ? <Icon name="check" size={ICON.control} color={sel.glyph} /> : <View style={mark === 'ring' ? styles.ring : styles.ringSpace} />}
        {/* An option labels a control: it stops at the control cap, as the count beside it. */}
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.label]}>
          {label}
        </Text>
        {count ? (
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.count]}>
            {count}
          </Text>
        ) : null}
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: BUBBLE.radius,
    backgroundColor: COLOR.surfaceSunken,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
  },
  words: { gap: SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  option: {
    borderRadius: OPTION_RADIUS,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    overflow: 'hidden',
    // The outline's width always, transparent, so picking never shifts the row.
    borderWidth: RING_WIDTH,
    borderColor: 'transparent',
  },
  pressedIos: { transform: [{ scale: PRESS.scale }] },
  pressedAndroid: { backgroundColor: PRESSED_WASH.android },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: tint(COLOR.textPrimary, BAR_ALPHA) },
  ring: {
    width: ICON.control,
    height: ICON.control,
    borderRadius: RADIUS.capsule,
    borderWidth: RING_WIDTH,
    borderColor: tint(COLOR.textPrimary, RING_ALPHA),
  },
  ringSpace: { width: ICON.control },
  label: { flex: 1, color: COLOR.textPrimary },
  count: { color: COLOR.textSecondary, fontVariant: ['tabular-nums'] },
  primary: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  foot: { color: COLOR.textTertiary },
})
