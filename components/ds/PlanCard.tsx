import { Children, Fragment, isValidElement, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { OPACITY, tint } from '../../lib/theme'
import { Price, spokenPrice } from './MonoFamily'
import { focusRing, font, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

/** The page's 64 pt row and its 22 pt ring: white 6 pt when picked, 35% at 1.5 pt when not. */
const ROW_MIN_HEIGHT = SIZE.primary + SPACE.sm
const RING = SPACE.xl - SPACE.xxs
const RING_ON = SPACE.sm - SPACE.xxs
const RING_OFF = 1.5
const RING_OFF_ALPHA = 0.35
/** The hairline between rows starts past the ring (the page's 50 pt inset). */
const HAIRLINE_INSET = SPACE.lg + RING + SPACE.md

export type PlanCardProps = {
  name: string
  /** The store's own price string ("₹199"): never computed here. */
  price: string
  per?: string
  /** One line: "About ₹166 a month · Save 16%", worked out from the store's prices. */
  sub?: string
  selected?: boolean
  onPress?: () => void
  /** While the store is answering: 45%, no pick. */
  disabled?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/**
 * A plan, as a radio row (guidelines/components/PlanCard.html, Flow 12
 * `planRow`, ROUND3 G2): a 22 pt ring, the name, one sub line, the price in
 * Geist Mono. No "most popular", no strike-through, no countdown. The four
 * packages are Monthly, 3 months (never "Quarterly"), Yearly and the Night
 * Pass; the caller holds which is picked (Monthly on the page, Just tonight in
 * the Tonight sheet).
 *
 * A radio for a screen reader: "Monthly, 199 rupees a month, selected".
 * `H.select` on a pick, none on a re-tap. Pressed: the row wash on iOS, the
 * ripple on Android; rows never scale. Text scales and the row grows.
 * Increase Contrast: the empty ring at 50%.
 */
export function PlanCard({ name, price, per, sub, selected = false, onPress, disabled = false, previewState, testID }: PlanCardProps) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => {
          if (selected) return
          H.select()
          onPress?.()
        }}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        android_ripple={{ color: PRESSED_WASH.android }}
        accessibilityRole="radio"
        accessibilityLabel={[name, spokenPrice(price, per), sub].filter(Boolean).join(', ')}
        accessibilityState={{ checked: selected, disabled }}
        style={({ pressed }) => [
          styles.row,
          (pressed || previewState === 'pressed') && { backgroundColor: PRESSED_WASH[android ? 'android' : 'ios'] },
          disabled && { opacity: OPACITY.disabled },
        ]}
      >
        <RadioRing selected={selected} testID={testID && `${testID}-ring`} />
        <View style={styles.text}>
          <Text style={[font('bodyStrong', bold), styles.ink]}>{name}</Text>
          {sub ? <Text style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{sub}</Text> : null}
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Price amount={price} per={per} />
        </View>
      </Pressable>
      {focused || previewState === 'focused'
        ? focusRing(RADIUS.rowInCard).map((r, i) => <View key={i} testID={i ? undefined : testID && `${testID}-focus`} pointerEvents="none" style={r} />)
        : null}
    </View>
  )
}

/** The 22 pt radio ring the plan rows and the Go Live dial share: white 6 pt when picked, 35% at 1.5 pt when not. */
export function RadioRing({ selected, testID }: { selected: boolean; testID?: string }) {
  const contrast = useIncreaseContrast()
  const ring = selected
    ? { borderWidth: RING_ON, borderColor: COLOR.selectionFill }
    : { borderWidth: RING_OFF, borderColor: contrast ? MATERIAL.hairlineIncreaseContrast : tint(COLOR.textPrimary, RING_OFF_ALPHA) }
  return <View testID={testID} style={[styles.ring, ring]} />
}

/** The Night Pass row: a one-off, 24 hours from purchase, and another adds 24 more (G2). Never "until 6 am". */
export function NightPassRow(props: Omit<PlanCardProps, 'name' | 'sub' | 'per'>) {
  return <PlanCard name="Just tonight" sub="24 hours · doesn’t renew" {...props} />
}

/**
 * The rows in one list: `surface`, radius 24, a hairline between rows past the
 * ring. `onSheet`: 8% white on iOS's glass sheet (no glass on glass), sunken
 * on Android's solid one (the Tonight sheet).
 */
export function PlanList({ children, onSheet = false, testID }: { children: ReactNode; onSheet?: boolean; testID?: string }) {
  const rows = Children.toArray(children).filter(isValidElement)
  const fill = !onSheet ? COLOR.surface : Platform.OS === 'android' ? COLOR.surfaceSunken : MATERIAL.fillOnGlass
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={[styles.list, { backgroundColor: fill }]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i ? <View testID={testID && `${testID}-hairline`} style={styles.hairline} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  ring: { width: RING, height: RING, borderRadius: RADIUS.capsule },
  text: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  list: { borderRadius: RADIUS.sheet, overflow: 'hidden' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: HAIRLINE_INSET, backgroundColor: COLOR.hairline },
})
