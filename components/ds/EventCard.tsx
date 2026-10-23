import { Image } from 'expo-image'
import { useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { H } from '../../lib/haptics'
import { measureAnchor } from './anchor'
import type { Rect } from './chatShared'

import ScalePress from '../motion/ScalePress'
import { PhotoScrim } from '../ui/GradientFill'
import { COLOR, FONT_FAMILY, ICON, PRESS, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { Icon } from '../ui/Icon'
import { VenuePlate } from './VenuePlate'
import { PROMOTED_LABEL } from '../../lib/pulseSections'
import { MonoRun, ScrimPill, TimeBadge } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

export type EventCardKind = 'hero' | 'compact' | 'row'

export type EventCardProps = {
  kind: EventCardKind
  title: string
  /** The time badge, in the one date grammar: "Live", "In 25 min", "9 PM". */
  time: string
  venue: string
  /** "1.2 km". */
  distance?: string
  /**
   * `row` only: `distance` leads the row in its own 64 pt column, in Geist Mono 700 17 (Nearby, "nearest first":
   * Flow 3 `nearby`, the Pulse's Nearby section), instead of riding the meta line. A row with no distance has no column.
   */
  lead?: 'distance'
  going?: number
  /** Inside now, shown as "{n} here now" in place of `going` on a live card. The caller applies the floor of five. */
  here?: number
  /** A paid placement: a "PROMOTED" scrim pill top-right, read first. Editorial picks carry none. */
  promoted?: boolean
  cover?: string | null
  /**
   * `row` only: a place's type art (`VenuePlate`) in the thumb where an event would have its cover: a visit to a place, not a
   * night (Going › Past). A type it has no plate for draws the bar's.
   */
  plate?: string
  /** The card goes nowhere (a visit whose place the server has not named): it is read, not offered as a button. */
  inert?: boolean
  /** The one sentence a screen reader hears, when the card's words are not the usual title, time and "at {venue}" (a visit). */
  label?: string
  /** You're going: the ribbon reads "You're going · {saved}" ("9 PM"). */
  saved?: string
  onPress?: () => void
  /** The finger is down: a screen warms what the press opens (~100 ms before it). */
  onPressIn?: () => void
  /**
   * The peek (save, share, preview, check in or out), also reached by a screen reader's "Quick actions" action. It plays
   * `H.longPress` as the hold completes and hands over the card's frame in the window, for the screen to lift (`LongPressMenu`).
   */
  onLongPress?: (anchor: Rect) => void
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
  /** Size and placement (hero and compact take their width and height from here); never the look. */
  style?: StyleProp<ViewStyle>
}

/** The page's sizes, when the caller gives none: hero 300 tall, compact 240 × 170. */
const DEFAULT_SIZE: Record<'hero' | 'compact', ViewStyle> = { hero: { height: 300 }, compact: { width: 240, height: 170 } }
/** The scrim covers the lower 62% of the photo (the page). */
const SCRIM_HEIGHT = '62%'
const ROW_HEIGHT = 64
/**
 * The distance column: 64 at least, so the rows' thumbs line up at the default size, and sized to its words past that
 * (a larger font scale, "9.9 km") up to 96, which holds six Geist Mono characters at the 1.3 cap. A fixed 64 clipped
 * "11.2 km" to "11.2…" (RC drive 4 D-4).
 */
const LEAD_WIDTH = 64
const LEAD_MAX = 96
/**
 * The words on the photo stop at 1.5×: the card is a fixed size, and past it a
 * two-line title runs up under the pills (the page lets them scale freely; a
 * fixed card can't hold that).
 */
const FOOT_FONT_CAP = 1.5
const PILL_HEIGHT = 28
const QUICK_ACTIONS = [{ name: 'quickActions', label: 'Quick actions' }]

/** "{You're going, }{title}, {time}, at {venue}, {distance}, {N} going": the pills are not separate elements. */
export function eventLabel({
  title,
  time,
  venue,
  distance,
  going,
  here,
  promoted,
  saved,
}: Pick<EventCardProps, 'title' | 'time' | 'venue' | 'distance' | 'going' | 'here' | 'promoted' | 'saved'>) {
  const people = here ? `${here} here now` : going ? `${going} going` : null
  // "Live" leads the way "Promoted" does: it is the first thing to know about the card.
  const live = time === 'Live'
  const parts = [saved ? 'You’re going' : null, title, live ? null : time, `at ${venue}`, distance, people].filter(Boolean).join(', ')
  return [promoted ? PROMOTED_LABEL : null, live ? 'Live' : null, parts].filter(Boolean).join('. ')
}

/**
 * One card, three sizes (guidelines/components/EventCard.html, the Lantern
 * composition the journey approved).
 *
 * - `hero` (radius 32) and `compact` (radius 24): the words on the photo over
 *   the 62% ink scrim; the time badge and "N going" top-left as scrim pills;
 *   the title in two lines at most, then "at {venue} · {distance}". Saved adds
 *   the white "You're going · 9 PM" ribbon. Their text stops at 1.5×.
 * - `row`: the list form, 64 pt: a 56 pt thumb, the title, venue · distance ·
 *   the time in Geist Mono, one line each, capped at 1.3×.
 *
 * One button, "{title}, {time}, at {venue}, {distance}, {N} going" (saved:
 * "You're going" first). A tap is a push, so no haptic. iOS presses scale to
 * 0.97 (a row highlights); Android ripples. Increase Contrast: the 50% hairline
 * on the card and the scrim 20% deeper.
 */
export function EventCard(props: EventCardProps) {
  const { kind, title, time, venue, distance, lead, going, here, promoted, cover, plate, saved, onPress, onPressIn, onLongPress, previewState, testID, style } = props
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const android = Platform.OS === 'android'
  const [focused, setFocused] = useState(false)
  const label = props.label ?? eventLabel(props)
  const box = useRef<View>(null)
  const hold = onLongPress
    ? () => {
        H.longPress()
        measureAnchor(box.current, onLongPress)
      }
    : undefined
  const ring = focused || previewState === 'focused'
  const a11y = {
    accessibilityRole: props.inert ? ('text' as const) : ('button' as const),
    accessibilityLabel: label,
    ...(onLongPress
      ? {
          accessibilityActions: QUICK_ACTIONS,
          onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
            if (e.nativeEvent.actionName === 'quickActions') measureAnchor(box.current, onLongPress)
          },
        }
      : null),
  }

  if (kind === 'row') {
    const leading = lead === 'distance' && !!distance
    return (
      <View ref={box} collapsable={false} style={style}>
        <Pressable
          testID={testID}
          disabled={props.inert}
          onPress={onPress}
          onPressIn={onPressIn}
          onLongPress={hold}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          android_ripple={{ color: PRESSED_WASH.android }}
          {...a11y}
          style={({ pressed }) => [styles.row, (pressed || previewState === 'pressed') && !android && styles.rowPressed]}
        >
          {leading ? (
            <Text testID={testID && `${testID}-lead`} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold, FONT_FAMILY.mono[700]), styles.lead]}>
              {distance}
            </Text>
          ) : null}
          <View testID={testID && `${testID}-thumb`} style={styles.thumb}>
            {cover ? (
              <Image source={{ uri: cover }} recyclingKey={cover} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
            ) : plate ? (
              <VenuePlate type={plate} />
            ) : null}
          </View>
          <View style={styles.rowText}>
            <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold), styles.ink]}>
              {title}
            </Text>
            {/* The venue gives way to a long name; the time, the thing the row is for, never does. */}
            <View style={styles.rowMeta}>
              <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary, styles.shrink]}>
                {[venue, leading ? undefined : distance].filter(Boolean).join(' · ')}
              </Text>
              {/* Outside the run that truncates, so a long venue keeps its "·" before the time (r7 L12). */}
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.secondary]}>
                ·
              </Text>
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary, styles.tabular]}>
                <MonoRun text={time} />
              </Text>
            </View>
          </View>
        </Pressable>
        {ring ? <Ring radius={RADIUS.rowInCard} testID={testID} /> : null}
      </View>
    )
  }

  const hero = kind === 'hero'
  const radius = hero ? RADIUS.card : RADIUS.mediaInCard
  return (
    <View
      ref={box}
      collapsable={false}
      testID={testID && `${testID}-scale`}
      style={[DEFAULT_SIZE[kind], style, previewState === 'pressed' && !android && styles.pressed]}
    >
      <ScalePress
        testID={testID}
        disabled={props.inert}
        onPress={onPress}
        onPressIn={onPressIn}
        onLongPress={hold}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        pressedScale={android ? 1 : PRESS.scale}
        android_ripple={{ color: PRESSED_WASH.android, foreground: true }}
        {...a11y}
        style={[styles.card, { borderRadius: radius }]}
      >
        {cover ? <Image source={{ uri: cover }} recyclingKey={cover} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
        <PhotoScrim testID={testID && `${testID}-scrim`} contrast={contrast} style={styles.scrim} />
        <View style={styles.pills}>
          <TimeBadge when={time} />
          {here ? (
            <ScrimPill testID={testID && `${testID}-here`}>
              <Text style={[font('caption', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{here}</Text>
                {' here now'}
              </Text>
            </ScrimPill>
          ) : going ? (
            <ScrimPill>
              <Text style={[font('caption', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                {`${going} going`}
              </Text>
            </ScrimPill>
          ) : null}
        </View>
        {promoted ? (
          <View style={styles.promoted} testID={testID && `${testID}-promoted`}>
            <ScrimPill>
              <Icon name="megaphone" size={ICON.inline} color={COLOR.textSecondary} />
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('label', bold), styles.secondary]}>
                {PROMOTED_LABEL.toUpperCase()}
              </Text>
            </ScrimPill>
          </View>
        ) : null}
        {saved ? (
          <View testID={testID && `${testID}-saved`} style={styles.saved}>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.onWhite]}>
              You’re going · <Text style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.tabular]}>{saved}</Text>
            </Text>
          </View>
        ) : null}
        <View style={[styles.foot, hero ? styles.footHero : styles.footCompact]}>
          <Text numberOfLines={2} maxFontSizeMultiplier={FOOT_FONT_CAP} style={[font(hero ? 'title' : 'bodyStrong', bold), styles.ink]}>
            {title}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={FOOT_FONT_CAP} style={[font('meta', bold), styles.ink]}>
            {[`at ${venue}`, distance].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {/* Android's live press is the ripple; the wash stands in for it only in the gallery. */}
        {previewState === 'pressed' && android ? <View testID={testID && `${testID}-wash`} style={[StyleSheet.absoluteFill, styles.wash]} /> : null}
        {contrast ? <View testID={testID && `${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, IC_HAIRLINE, { borderRadius: radius }]} /> : null}
      </ScalePress>
      {ring ? <Ring radius={radius} testID={testID} /> : null}
    </View>
  )
}

function Ring({ radius, testID }: { radius: number; testID?: string }) {
  return (
    <>
      {focusRing(radius).map((ring, i) => (
        <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={ring} />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: PRESS.scale }] },
  card: { flex: 1, overflow: 'hidden', backgroundColor: COLOR.surface },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT },
  pills: { position: 'absolute', top: SPACE.md, left: SPACE.md, flexDirection: 'row', gap: SPACE.sm },
  promoted: { position: 'absolute', top: SPACE.md, right: SPACE.md },
  saved: {
    position: 'absolute',
    top: SPACE.md + PILL_HEIGHT + SPACE.sm,
    left: SPACE.md,
    height: PILL_HEIGHT,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
    justifyContent: 'center',
  },
  onWhite: { color: COLOR.ink },
  foot: { position: 'absolute', gap: SPACE.xxs },
  footHero: { left: SPACE.xl, right: SPACE.xl, bottom: SPACE.xl },
  footCompact: { left: SPACE.lg, right: SPACE.lg, bottom: SPACE.lg },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  wash: { backgroundColor: PRESSED_WASH.android },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderRadius: RADIUS.rowInCard },
  rowPressed: { backgroundColor: PRESSED_WASH.ios },
  lead: { minWidth: LEAD_WIDTH, maxWidth: LEAD_MAX, flexShrink: 0, color: COLOR.textPrimary, fontVariant: ['tabular-nums'] },
  thumb: { width: SIZE.primary, height: SIZE.primary, borderRadius: RADIUS.thumb, overflow: 'hidden', backgroundColor: COLOR.surface },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  shrink: { flexShrink: 1 },
})
