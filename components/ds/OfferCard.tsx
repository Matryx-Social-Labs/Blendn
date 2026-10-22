import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Button } from './Button'
import { monoCaption } from './MonoFamily'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'
import { VenuePlate } from './VenuePlate'

/** Used and ended offers dim to 72% and say so (the page). */
const SPENT_OPACITY = 0.72
const PLATE = SIZE.control - SPACE.sm
/** The state pill: 28 pt, white for used, a 1 pt 22% edge for ended. */
const PILL = SIZE.tag - SPACE.xs
const PILL_EDGE = 0.22
/** The ⋯: 36, reaching the target through slop. */
const MORE = SIZE.control - SPACE.md

export type OfferVenue = {
  name: string
  /** The plate's type (`VenuePlate`): brewery, bar, club… */
  type: string
  /** "Brewery". */
  typeLabel: string
  area: string
}

const STANDARD = Easing.bezier(...EASING.standard)
const GENTLE = Easing.bezier(...EASING.gentle)
/** The chevron turns a quarter: pointing right closed, down open. */
const CHEVRON_OPEN_DEG = 90
/** Under Reduce Motion the text still fades in: the change is explained, not moved. */
const REDUCED_FADE_MS = 200

/** G3: offers go to regulars only, so "why" is one sentence, the rule and who picked. */
function why(venue: string) {
  return {
    rule: `${venue} sent this to everyone who’s been there 3 or more nights in the last 30 days.`,
    picked: ` Blend’n picked who — ${venue} never sees the list, only roughly how many were sent and used.`,
  }
}

/**
 * A venue speaking to the people who come back (guidelines/components/OfferCard.html,
 * Flow 13, ROUND3 G3): the venue, the offer in heading, the window and validity
 * (the date in Geist Mono), "Use at the door", "Why you got this" expanding
 * inline to the regulars rule, and the floor sentence. Report this offer and
 * Stop offers from {venue} sit under the ⋯ (`onMore`: the caller's tray).
 * Used and ended dim to 72% and say so. Offers are never pushed without the
 * Flow 13 consent; that's the caller's.
 *
 * Read venue → offer → window → validity as one element, then the buttons.
 * `H.primary` on the press-in of Use at the door (R3-G); everything else is
 * silent. Why expands over `base`, at once under Reduce Motion.
 */
export function OfferCard({
  venue,
  offer,
  window,
  validUntil,
  state = 'live',
  stateLabel,
  onUse,
  onMore,
  defaultWhyOpen = false,
  testID,
}: {
  venue: OfferVenue
  offer: string
  /** "Thu–Sun, before 10 pm". */
  window: string
  /** "Sun". */
  validUntil: string
  state?: 'live' | 'used' | 'ended'
  /** "Used Fri", "Ended Sun". */
  stateLabel?: string
  onUse?: () => void
  onMore: () => void
  /** The design gallery only: draw "Why you got this" already open. */
  defaultWhyOpen?: boolean
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(defaultWhyOpen)
  // The chevron is one glyph that turns, not two that swap.
  const turn = useSharedValue(defaultWhyOpen ? CHEVRON_OPEN_DEG : 0)
  useEffect(() => {
    const to = open ? CHEVRON_OPEN_DEG : 0
    turn.set(reduceMotion ? to : withTiming(to, { duration: DURATION.base, easing: STANDARD, reduceMotion: ReduceMotion.Never }))
  }, [open, reduceMotion, turn])
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }))
  const live = state === 'live'
  const detail = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const quiet = live ? COLOR.textPrimary : COLOR.textSecondary
  const text = why(venue.name)

  return (
    // `layout`: opening "Why" grows the card and moves the floor sentence together, over base (a plain jump under Reduce Motion).
    <Animated.View
      testID={testID}
      layout={reduceMotion ? undefined : LinearTransition.duration(DURATION.base).easing(STANDARD)}
      style={[styles.card, !live && { opacity: SPENT_OPACITY }, contrast && IC_HAIRLINE]}
    >
      <View style={styles.top}>
        <VenuePlate type={venue.type} size={PLATE} radius={RADIUS.thumb} />
        <View style={styles.fill}>
          <Text style={[font('bodyStrong', bold), styles.ink]}>{venue.name}</Text>
          <Text style={[font('meta', bold), { color: detail }]}>{`${venue.typeLabel} · ${venue.area}`}</Text>
        </View>
        {state === 'used' ? (
          <View style={[styles.pill, styles.used]}>
            <Icon name="check" size={ICON.inline} color={COLOR.selectionInk} active />
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), { color: COLOR.selectionInk }]}>
              {stateLabel}
            </Text>
          </View>
        ) : state === 'ended' ? (
          <View style={[styles.pill, styles.ended]}>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), { color: detail }]}>
              {stateLabel}
            </Text>
          </View>
        ) : (
          <Text style={[font('label', bold), { color: COLOR.textTertiary }]}>OFFER</Text>
        )}
        <Pressable
          onPress={onMore}
          hitSlop={(minTarget() - MORE) / 2}
          accessibilityRole="button"
          accessibilityLabel={`${venue.name}’s offer, more`}
          android_ripple={{ color: PRESSED_WASH.android, borderless: true }}
          style={styles.more}
        >
          <Icon name="ellipsis" size={ICON.control} />
        </Pressable>
      </View>

      <View accessible accessibilityLabel={`${venue.name}: ${offer}. ${window}, valid until ${validUntil}`} style={styles.body}>
        <Text style={[font('heading', bold), { color: quiet }]}>{offer}</Text>
        <Text style={[font('meta', bold), { color: detail }]}>
          {`${window} `}
          <Text style={{ color: COLOR.textTertiary }}>·</Text>
          {' Valid '}
          <Text style={monoCaption(bold)}>{`until ${validUntil}`}</Text>
        </Text>
      </View>

      {live && onUse ? <Button kind="lit" size="md" icon="ticket" label="Use at the door" pressHaptic={H.primary} onPress={onUse} /> : null}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Why you got this"
        accessibilityState={{ expanded: open }}
        hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
        style={styles.why}
      >
        <Text style={[font('meta', bold, FONT_FAMILY.brand[500]), { color: quiet }]}>Why you got this</Text>
        <Animated.View testID={testID && `${testID}-chevron`} style={chevron}>
          <Icon name="chevron-right" size={ICON.inline} color={COLOR.textSecondary} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Animated.View
          testID={testID && `${testID}-why`}
          entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeIn.duration(DURATION.base).easing(GENTLE)}
          exiting={FadeOut.duration(DURATION.quick)}
        >
          <Text style={[font('meta', bold), styles.ink]}>
            {text.rule}
            <Text style={font('meta', bold, FONT_FAMILY.brand[500])}>{text.picked}</Text>
          </Text>
        </Animated.View>
      ) : null}

      <View style={styles.foot}>
        <Text style={[font('caption', bold, FONT_FAMILY.brand[400]), { color: contrast ? COLOR.textSecondary : COLOR.textTertiary }]}>
          Offers only go to groups of 5 or more, so no one can be singled out.
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  pill: { height: PILL, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule },
  used: { backgroundColor: COLOR.selectionFill },
  ended: { borderWidth: 1, borderColor: tint(COLOR.textPrimary, PILL_EDGE) },
  more: { width: MORE, height: MORE, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.capsule, marginRight: -SPACE.sm },
  body: { gap: SPACE.xs },
  why: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start' },
  foot: { paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLOR.hairline },
})
