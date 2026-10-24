import { Fragment, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { badgeFadeIn, badgeIn, badgeOut } from '../motion/presence'
import { RollingNumber } from './RollingNumber'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast } from './shared'

/*
 * The Geist Mono family (guidelines/components/MonoFamily.html, ROUND3 B4/B8):
 * the small marks that carry a number or a state, none below the 12 pt floor.
 * Each is one colour: white (selection, unread), the live green, or white on
 * the 60% ink scrim pill. None is tappable and none plays a haptic: they
 * report, they don't act.
 */

/** Geist Mono 500 at 12/16, tabular: a count or a time on the floor. TextField's counter uses it too. */
export const monoCaption = (bold: boolean) => ({ ...font('caption', bold, FONT_FAMILY.mono[500]), fontVariant: ['tabular-nums' as const] })

/**
 * A mono run's separators in the brand face: the " · " divider ("Sun · 3:30 PM") and every plain space ("1:12 PM",
 * "Oct 2026"). A mono space is a full cell, so set in Geist Mono they read double-spaced: "Sun  ·  3:30  PM" (C16, C17,
 * D-L1). Inside a mono `Text`; the digits and words between them stay mono.
 */
export function MonoRun({ text }: { text: string }) {
  return (
    <>
      {text.split(SEPARATOR).map((part, i) =>
        // `split` with a group keeps the separators at the odd indices.
        i % 2 ? (
          <Text key={i} style={styles.divider}>
            {part}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}
const SEPARATOR = /( · | )/

/** A count's horizontal padding: 5 in the 18 pt pill, 8 in the 22. */
const BADGE_PAD = { 18: SPACE.xs, 22: SPACE.sm } as const

/** Wraps a mark in a 2 pt ring of the colour it sits on, so it cuts out (§11.2 rule 6). */
function Ring({ color, testID, children }: { color?: string; testID?: string; children: ReactNode }) {
  if (!color) return <>{children}</>
  return (
    <View testID={testID} style={[styles.ring, { backgroundColor: color }]}>
      {children}
    </View>
  )
}

/**
 * The unread count: white, ink digits, Geist Mono 700. 18 on an icon (give it
 * `ring` in the ground colour), 22 as a label ("3 new"). Never red, never a
 * dot plus a number. Folded into its parent for a screen reader: the parent's
 * label says it ("Banter, 3 new").
 */
export function Badge({
  text,
  size = 18,
  ring,
  arrive = false,
  testID,
}: {
  text: string | number
  size?: 18 | 22
  ring?: string
  /** A count that appears while you watch (the bell, a filter count, "n new" in a dock): it arrives and leaves over `quick`. Off for a row that is simply drawn, so scrolling never pops. */
  arrive?: boolean
  testID?: string
}) {
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  // A count rolls its changing digit (DS #26); "9+", "99+" and "3 new" are words and never roll.
  const rolls = typeof text === 'number' && Number.isInteger(text) && text >= 0
  return (
    // DS #28, the badge's own: with `arrive`, it arrives (0.8 → 1, fading in) and leaves (a fade) over `quick`, so no caller
    // animates it. Without, it is just drawn: a row scrolling in or a screen's first paint never pops.
    <Animated.View entering={arrive ? (reduceMotion ? badgeFadeIn : badgeIn) : undefined} exiting={arrive ? badgeOut : undefined}>
      <Ring color={ring} testID={testID && `${testID}-ring`}>
        <View
          testID={testID}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // `minHeight`: at a large text size the digit's line grows past 18 and the pill grows with it, never clipping it.
          style={[styles.badge, { minHeight: size, minWidth: size, paddingHorizontal: BADGE_PAD[size] }]}
        >
          {rolls ? (
            <RollingNumber value={text} role="badge" color={COLOR.ink} testID={testID && `${testID}-count`} />
          ) : (
            <Text style={[font('caption', bold, FONT_FAMILY.mono[700]), styles.badgeText]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
              {String(text)}
            </Text>
          )}
        </View>
      </Ring>
    </Animated.View>
  )
}

/** 10 pt white beside something unread; the 8 pt live green beside what is live now. Never both on one row. */
const DOT = { unread: 10, live: 8 } as const

/**
 * A dot. A trait of its row, not an element: the row's label says "unread" or
 * "live". `ring` cuts it out of a face (`size` 12 there).
 */
export function PresenceDot({
  kind = 'unread',
  size = DOT[kind],
  ring,
  color,
  testID,
}: {
  kind?: 'unread' | 'live'
  size?: number
  ring?: string
  /** The unread dot in a world's light tone (a notification row: `useSelection().glyph`), instead of white. */
  color?: string
  testID?: string
}) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, borderRadius: RADIUS.capsule, backgroundColor: kind === 'live' ? COLOR.live : (color ?? COLOR.textPrimary) },
        ring ? { borderWidth: SPACE.xxs, borderColor: ring } : null,
      ]}
    />
  )
}

/** The scrim pill: 28 pt, white on 60% ink, a 0.5 pt hairline (1 pt at 50% under Increase Contrast). */
const PILL_HEIGHT = 28
const PILL_HAIRLINE = 0.5

export function ScrimPill({ testID, children }: { testID?: string; children: ReactNode }) {
  const contrast = useIncreaseContrast()
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        contrast
          ? { borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast }
          : { borderWidth: PILL_HAIRLINE, borderColor: COLOR.hairlineStrong },
      ]}
    >
      {children}
    </View>
  )
}

/** The live dot and a bucket word ("5–9 live"), read verbatim. Never a number of people, never who. */
export function LivePill({ text, testID }: { text: string; testID?: string }) {
  const bold = useBoldText()
  return (
    <ScrimPill testID={testID}>
      <PresenceDot kind="live" testID={testID && `${testID}-dot`} />
      <Text style={[font('caption', bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
        {text}
      </Text>
    </ScrimPill>
  )
}

/** "Live" with the dot, or a time or countdown in Geist Mono tabular ("9 PM", "In 25 min"). */
export function TimeBadge({ when, testID }: { when: string; testID?: string }) {
  const bold = useBoldText()
  const live = when === 'Live'
  return (
    <ScrimPill testID={testID}>
      {live ? <PresenceDot kind="live" testID={testID && `${testID}-dot`} /> : null}
      <Text style={[live ? font('caption', bold) : monoCaption(bold), styles.ink]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
        {live ? when : <MonoRun text={when} />}
      </Text>
    </ScrimPill>
  )
}

/**
 * The page's three sizes on the type roles: `lg` on a plan card (the page's 32
 * is between roles; `display`'s 34), `md` in a row (20), `sm` inline (14). The
 * unit is Satoshi at about 55% of the price, never under the 12 pt floor.
 */
const PRICE_ROLE = { lg: 'display', md: 'heading', sm: 'meta' } as const
const UNIT_ROLE = { lg: 'body', md: 'caption', sm: 'caption' } as const

/** "₹199" → "199 rupees"; "/ month" → "a month", "/ 3 months" → "every 3 months". "Free" stays "Free". */
export function spokenPrice(amount: string, per?: string) {
  const words = amount.startsWith('₹') ? `${amount.slice(1)} rupees` : amount
  return per ? `${words} ${per.replace(/^\/\s*(?=\d)/, 'every ').replace(/^\/\s*/, 'a ')}` : words
}

/**
 * A price: Geist Mono 700, tabular, the ₹ in the string, an optional unit.
 * Scales freely (no fixed box). Inherits nothing: `color` defaults to white.
 */
export function Price({
  amount,
  per,
  size = 'md',
  color = COLOR.textPrimary,
  testID,
}: {
  amount: string
  per?: string
  size?: keyof typeof PRICE_ROLE
  color?: string
  testID?: string
}) {
  const bold = useBoldText()
  return (
    <View testID={testID} accessible accessibilityLabel={spokenPrice(amount, per)} style={styles.price}>
      <Text style={[font(PRICE_ROLE[size], bold, FONT_FAMILY.mono[700]), styles.tabular, { color }]}>{amount}</Text>
      {per ? <Text style={[font(UNIT_ROLE[size], bold, FONT_FAMILY.brand[400]), styles.unit]}>{per}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  divider: { fontFamily: FONT_FAMILY.brand[500] },
  ring: { padding: SPACE.badgeRing, borderRadius: RADIUS.capsule },
  badge: { borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: COLOR.ink, fontVariant: ['tabular-nums'] },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.scrimPill,
  },
  ink: { color: COLOR.textPrimary },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  unit: { color: COLOR.textSecondary },
})
