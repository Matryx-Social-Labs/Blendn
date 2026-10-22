import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, withTiming } from 'react-native-reanimated'

import { Glyph } from '../ui/Glyph'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, PRESS, RADIUS, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { Avatar } from './Avatar'
import { Button, ROW_ACTION_HEIGHT } from './Button'
import { Creature, creatureFor } from './Creature'
import { CrewEmblem } from './CrewEmblem'
import { Badge, PresenceDot } from './MonoFamily'
import { announceOutcome, font, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'

/** Someone in a stack, as the server lets you see them: a photo only where the face is already yours to see. */
export type StackPerson = { pseudonym: string } | { uri: string }

/**
 * Who the actor is to you (Flow 9 `visual`, 9.3): a photo only where you may
 * already see the face; a creature for someone pseudonymous; a raised glyph
 * tile for the system; the emblem for a crew; the event's cover with a badge
 * for logistics; a stack with +N for merged rows.
 */
export type NotificationVisualSpec =
  | { type: 'photo'; uri: string }
  | { type: 'creature'; pseudonym: string }
  | { type: 'glyph'; icon: IconName }
  | { type: 'emblem'; seed: string }
  | { type: 'event'; cover?: string | null; badge: IconName; cancelled?: boolean }
  | { type: 'stack'; people: readonly StackPerson[]; extra?: number }

/** Flow 9 `visual`, as shares of the visual's side: a tile's corner, a stack's faces and their step, up to three. */
const TILE_CORNER = 0.25
const STACK_FACE = 0.7
const STACK_STEP = 0.15
const STACK_MAX = 3
/** The event badge: a 16 pt ink disc in a 2 pt ink ring on the cover's corner, its glyph at 10. */
const EVENT_BADGE = SPACE.lg
const EVENT_BADGE_GLYPH = SPACE.sm + SPACE.xxs
/** A cancelled cover: grey at 70% (the greyscale is Android's; iOS draws the fade alone). */
const CANCELLED_OPACITY = 0.7
/** The unread dot sits level with the title's first line. */
const DOT_TOP = SPACE.sm + SPACE.xxs
const STALE_OPACITY = 0.5
/** A row's visual; the in-app banner draws it at 32. */
const ROW_VISUAL = 40

/**
 * A notification's leading visual at 40 (a row) or 32 (the in-app banner).
 * Decorative: the title beside it names the actor. `ground` is the colour it
 * sits on, so a stack's faces and the event badge cut out of it.
 *
 * `lit` (a row on Notifications, in its world): the glyph tile takes the hue's fill and light glyph, and `play` runs the glyph's
 * verb once. `halo` rings a face in the hue's edge, outside its cut-out: a request's. The banner draws neither.
 */
export function NotificationVisual({
  visual,
  size,
  ground = COLOR.ink,
  lit = false,
  halo,
  play,
  testID,
}: {
  visual: NotificationVisualSpec
  size: 32 | 40
  ground?: string
  lit?: boolean
  halo?: string
  play?: boolean
  testID?: string
}) {
  const sel = useSelection()
  const corner = Math.round(size * TILE_CORNER)
  // A halo needs the cut-out inside it, or it would touch the face.
  const faceRing = halo ? ground : undefined
  const box = { width: size, height: size }
  return (
    <View testID={testID} style={box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {visual.type === 'photo' ? <Avatar kind="photo" uri={visual.uri} size={size} ring={faceRing} halo={halo} testID={testID && `${testID}-face`} /> : null}
      {visual.type === 'creature' ? <Avatar kind="creature" pseudonym={visual.pseudonym} size={size} ring={faceRing} halo={halo} testID={testID && `${testID}-face`} /> : null}
      {visual.type === 'emblem' ? <CrewEmblem seed={visual.seed} size={size} /> : null}
      {visual.type === 'glyph' ? (
        <View testID={testID && `${testID}-tile`} style={[box, styles.center, { borderRadius: corner, backgroundColor: lit ? sel.fill : COLOR.surfaceRaised }]}>
          {lit ? (
            <Glyph name={visual.icon} size={size === 40 ? ICON.control : ICON.inline} color={sel.glyph} play={play} />
          ) : (
            <Icon name={visual.icon} size={size === 40 ? ICON.control : ICON.inline} />
          )}
        </View>
      ) : null}
      {visual.type === 'event' ? (
        <>
          <View style={[box, styles.cover, { borderRadius: corner }, visual.cancelled && styles.cancelled]}>
            {visual.cover ? <Image source={{ uri: visual.cover }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
          </View>
          <View style={[styles.eventBadge, { borderColor: ground }]}>
            <Icon name={visual.badge} size={EVENT_BADGE_GLYPH} />
          </View>
        </>
      ) : null}
      {visual.type === 'stack' ? <Stack people={visual.people} extra={visual.extra} size={size} ground={ground} /> : null}
    </View>
  )
}

function Stack({ people, extra, size, ground }: { people: readonly StackPerson[]; extra?: number; size: number; ground: string }) {
  const shown = people.slice(0, STACK_MAX)
  const face = Math.round(size * STACK_FACE)
  const step = Math.round(size * STACK_STEP)
  return (
    <>
      {shown.map((p, i) => (
        <View key={i} style={[styles.stacked, { left: i * step, top: i * step, zIndex: shown.length - i }]}>
          {'uri' in p ? (
            <View style={[styles.stackPhoto, { width: face, height: face, borderColor: ground }]}>
              <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
            </View>
          ) : (
            <Creature {...creatureFor(p.pseudonym)} size={face} ring={ground} />
          )}
        </View>
      ))}
      {extra ? (
        <View style={styles.extra}>
          <Badge text={`+${extra}`} ring={ground} />
        </View>
      ) : null}
    </>
  )
}

/** Accept and Join are `lit` (a glyph before the label); Decline and View are `secondary`. */
export type NotificationAction = { label: string; kind: 'lit' | 'secondary'; icon?: IconName; onPress: () => void }

export type NotificationRowProps = {
  visual: NotificationVisualSpec
  title: string
  /** One line: where it came from and when, as the flow writes it ("Vinyl Night · 2 min ago"). */
  context: string
  /** Unseen: the title at 700 and the 8 pt dot (no dot on a request: its pills say it). */
  fresh?: boolean
  /** A request's 36 pt pills: Accept / Join lit in the screen's hue, Decline / View / Not now raised. While set, a request's face takes the hue's ring. */
  actions?: NotificationAction[]
  /** pending: the tapped pill is busy (the first, if it came in pending) and the rest wait · done: the outcome replaces the pills · stale: dimmed, "This request is no longer open". */
  state?: 'pending' | 'done' | 'stale'
  /** The outcome, "You're friends". */
  doneText?: string
  /** Where the push would go. */
  onPress?: () => void
  /** The colour behind the row (`COLOR.surface` in the Waiting card). */
  ground?: string
  testID?: string
}

/**
 * `H.success` and the outcome said once when a request is recorded (pending → done, the server's answer); never for a row that
 * arrives done. Returns whether this row was answered while it was on screen: only then does the outcome come in and the ✓ draw.
 */
function useRecordedOutcome(state: NotificationRowProps['state'], doneText: string | undefined) {
  const was = useRef(state)
  // Derived during render (not from the ref, which is for the effect): the previous state is kept beside the verdict.
  const [seen, setSeen] = useState(state)
  const [answered, setAnswered] = useState(false)
  if (seen !== state) {
    setSeen(state)
    setAnswered(seen === 'pending' && state === 'done')
  }
  useEffect(() => {
    if (state === 'done' && was.current === 'pending') {
      H.success()
      if (doneText) announceOutcome(doneText)
    }
    was.current = state
    // `doneText` is read as it stood when the answer came.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  return answered
}

/** The outcome line, in the pills' slot: it comes in over `base` and the ✓ draws itself on the frame it lands (Reduce Motion: the fade alone, the ✓ drawn at once, `Glyph`). */
function DoneLine({ text, answered, bold, reduceMotion, testID }: { text: string; answered: boolean; bold: boolean; reduceMotion: boolean; testID?: string }) {
  const sel = useSelection()
  // `Glyph` plays on the edge false → true after mount, so an answered row's ✓ draws once; a row that arrives done shows it drawn.
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (answered) setDrawn(true)
  }, [answered])
  return (
    <Animated.View testID={testID} entering={answered ? (reduceMotion ? OUTCOME_IN_REDUCED : OUTCOME_IN) : undefined} accessibilityLiveRegion="polite" style={styles.done}>
      <Glyph name="check" size={ICON.inline} color={sel.glyph} active play={drawn} testID={testID && `${testID}-check`} />
      <Text style={[font('meta', bold), styles.ink]}>{text}</Text>
    </Animated.View>
  )
}

/**
 * One notification (guidelines/components/NotificationRow.html, Flow 9 · 9.3):
 * a 40 pt visual, the title (700 while new, with the dot; two lines at most),
 * one line of context; a request adds its pills; a stale row dims its visual to
 * 50% and says "This request is no longer open" (the flow's frame; the page's
 * intro says "This isn't available any more").
 *
 * The row is one button, "{title}, {context}, new", silent like every row; the
 * pills follow it as buttons. Unread → read (motion #29): the dot leaves over `quick` and the title steps to 500 at once, never while it is being read (the screen decides when `fresh` ends). A lit pill (Accept, Join) plays `H.primary`
 * on press-in and the row plays `H.success` when the server records it (the
 * Flow 9 prototype); Decline plays nothing. Pressed: the row wash on iOS, the
 * ripple on Android. Text scales and the row grows.
 */
export function NotificationRow({
  visual,
  title,
  context,
  fresh = false,
  actions,
  state,
  doneText,
  onPress,
  ground = COLOR.ink,
  testID,
}: NotificationRowProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const sel = useSelection()
  const answered = useRecordedOutcome(state, doneText)
  /** The pill that was tapped carries the spinner while the request is pending; the others wait. */
  const [tapped, setTapped] = useState(0)
  const stale = state === 'stale'
  const done = state === 'done' && doneText ? doneText : null
  const line = stale ? 'This request is no longer open' : context
  const pills = actions?.length && !stale && state !== 'done' ? actions : null
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const slot = pills || done

  return (
    <View testID={testID}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessible
        accessibilityLabel={[title, line, done, fresh ? 'new' : null].filter(Boolean).join(', ')}
        android_ripple={{ color: PRESSED_WASH.android }}
        style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' ? { backgroundColor: PRESSED_WASH.ios } : null]}
      >
        <View testID={testID && `${testID}-visual`} style={stale ? { opacity: STALE_OPACITY } : null}>
          <NotificationVisual visual={visual} size={ROW_VISUAL} ground={ground} lit halo={actions?.length ? sel.edge : undefined} play={state === 'done'} testID={testID && `${testID}-art`} />
        </View>
        <View style={styles.text}>
          <Text
            numberOfLines={2}
            style={[font('bodyStrong', bold, fresh ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]), { color: stale ? COLOR.textSecondary : COLOR.textPrimary }]}
          >
            {title}
          </Text>
          <Text style={[font('meta', bold), { color: stale ? COLOR.textTertiary : detail }]}>{line}</Text>
        </View>
        {fresh && !pills ? (
          // Motion #29, unread → read: the dot leaves over `quick` as the title's weight swaps (at once, in the font above). Reduce Motion: it goes.
          <Animated.View style={styles.dot} exiting={reduceMotion ? undefined : DOT_EXIT}>
            <PresenceDot size={SPACE.sm} color={sel.glyph} testID={testID && `${testID}-dot`} />
          </Animated.View>
        ) : null}
      </Pressable>
      {slot ? (
        // One slot at the pills' height: the pills fold away over `quick` (scaled to 0.97) as the outcome line comes in over them,
        // so the row never changes height. Reduce Motion: a crossfade.
        <View testID={testID && `${testID}-slot`} style={styles.slot}>
          {done ? <DoneLine text={done} answered={answered} bold={bold} reduceMotion={reduceMotion} testID={testID && `${testID}-done`} /> : null}
          {pills ? (
            <Animated.View exiting={reduceMotion ? PILLS_OUT_REDUCED : pillsOut} style={styles.pills}>
              {pills.map((a, i) => (
                <Button
                  key={a.label}
                  testID={testID && `${testID}-pill-${i}`}
                  kind={a.kind}
                  size="sm"
                  icon={a.icon}
                  label={a.label}
                  loading={state === 'pending' && i === tapped}
                  disabled={state === 'pending' && i !== tapped}
                  pressHaptic={a.kind === 'lit' ? H.primary : false}
                  onPress={() => {
                    setTapped(i)
                    a.onPress()
                  }}
                />
              ))}
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/** The pills fold: opacity to 0 and a squeeze to the press scale over `quick`, as the outcome takes their place. */
const pillsOut = () => {
  'worklet'
  const t = { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, t), transform: [{ scale: withTiming(PRESS.scale, t) }] },
  }
}
/** Reduce Motion keeps the crossfade (the spec: "crossfade only"): opacity alone, so it plays whatever the setting. */
const PILLS_OUT_REDUCED = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit)).reduceMotion(ReduceMotion.Never)
/** The outcome line arrives over `base` on the entrance curve, over the pills it replaces. */
const OUTCOME_IN = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))
const OUTCOME_IN_REDUCED = OUTCOME_IN.reduceMotion(ReduceMotion.Never)

/** The unread dot's way out (motion #29). */
const DOT_EXIT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))

/** Where the text column starts: past the row's padding, the visual and the gap. */
const TEXT_INSET = SPACE.lg + ROW_VISUAL + SPACE.md

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  cover: { overflow: 'hidden', backgroundColor: COLOR.surfaceRaised },
  cancelled: { opacity: CANCELLED_OPACITY, filter: [{ grayscale: 1 }] },
  stackPhoto: { borderRadius: RADIUS.capsule, borderWidth: SPACE.xxs, overflow: 'hidden' },
  dot: { marginTop: DOT_TOP },
  eventBadge: {
    position: 'absolute',
    right: -SPACE.xs,
    bottom: -SPACE.xs,
    width: EVENT_BADGE + 2 * SPACE.xxs,
    height: EVENT_BADGE + 2 * SPACE.xxs,
    borderRadius: RADIUS.capsule,
    borderWidth: SPACE.xxs,
    backgroundColor: COLOR.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stacked: { position: 'absolute' },
  extra: { position: 'absolute', right: -(SPACE.xs + SPACE.xxs), bottom: -SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  text: { flex: 1, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  // The pills' slot: the row's height is the same with the pills and with the outcome line.
  slot: { minHeight: ROW_ACTION_HEIGHT, marginTop: -SPACE.xs, marginBottom: SPACE.md, marginLeft: TEXT_INSET, marginRight: SPACE.lg },
  done: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
})
