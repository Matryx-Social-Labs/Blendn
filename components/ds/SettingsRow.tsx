import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { Glyph } from '../ui/Glyph'
import { Icon, type IconName } from '../ui/Icon'
import { COLOR, ICON, MATERIAL, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { OPACITY, tint } from '../../lib/theme'
import { Spinner } from './Loader'
import { font, IC_HAIRLINE, LIGHT, PRESSED_WASH, useBoldText, useIncreaseContrast, useSelection } from './shared'
import { Toggle } from './Toggle'

export type SettingsTrail = 'switch' | 'chevron' | 'external' | 'none'

const ROW_MIN_HEIGHT = SIZE.primary
/** The tile a switch row's glyph sits in: 32 pt, `RADIUS.thumb`, `surfaceRaised`; the hue's light pours into it when the switch is on. */
const TILE = SPACE.xxl
/** The Danger zone's outline (Flow 7 `settings`): the destructive colour at 38%. */
const DANGER_RING = 0.38
const ROLE = { switch: 'switch', chevron: 'button', external: 'link', none: undefined } as const

export type SettingsRowProps = {
  /** The 20 pt glyph. Omit when `leading` stands in its place. */
  icon?: IconName
  /** In place of the glyph: a crew's emblems, say. Decorative; the title is what is read. */
  leading?: ReactNode
  title: string
  /** A line under the title; on a rollback, the sentence that names it. */
  hint?: string
  /** What a screen reader says in place of "{title}, {hint}": the whole sentence, when a count is part of it ("3 friend requests"). */
  label?: string
  /** What the row reports before its chevron: a count (the DS `Badge`, Geist Mono), a dot. Decorative; `label` carries it for a screen reader. */
  accessory?: ReactNode
  trail?: SettingsTrail
  /** The switch's value (`trail="switch"`). */
  value?: boolean
  onValueChange?: (next: boolean) => void
  /** A chevron or external row's action. */
  onPress?: () => void
  /** What an external row does, for a screen reader (", opens in browser" by default; "opens your mail app" for a mailto). */
  opens?: string
  /** Saving: a spinner beside the switch, which holds still. */
  busy?: boolean
  disabled?: boolean
  /** The server refused an optimistic change (#39): roll `value` back and say so in `hint`. Plays `H.error` as it turns on. */
  error?: boolean
  destructive?: boolean
  /** The design gallery only: draws a transient state with no finger or keyboard. */
  previewState?: 'pressed' | 'focused'
  testID?: string
}

/** `H.error` when `error` turns on, not when a row mounts already in error. */
function useRollbackHaptic(error: boolean) {
  const was = useRef(error)
  useEffect(() => {
    if (error && !was.current) H.error()
    was.current = error
  }, [error])
}

/** A switch row's leading glyph: in its tile, lit in the screen's hue while the switch is on, its verb played as it turns on. */
function SwitchTile({ icon, on, testID }: { icon: IconName; on: boolean; testID?: string }) {
  const sel = useSelection()
  const reduceMotion = useReducedMotion()
  const light = on ? (reduceMotion ? LIGHT.pourReduced : LIGHT.pour) : reduceMotion ? LIGHT.drainReduced : LIGHT.drain
  return (
    <View testID={testID} style={styles.tile}>
      <Animated.View testID={testID && `${testID}-light`} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: sel.fill }, light]} />
      <Glyph name={icon} size={ICON.control} color={on ? sel.glyph : COLOR.textPrimary} play={on} />
    </View>
  )
}

/** Where a row's text starts, so the hairline under the row above begins there. */
const textEdge = (row: unknown) => {
  const p = isValidElement(row) ? (row.props as Partial<SettingsRowProps>) : null
  return SPACE.lg + (p?.trail === 'switch' && p.icon && !p.leading ? TILE : ICON.control) + SPACE.lg
}

/**
 * A settings row (guidelines/components/SettingsRow.html): at least 56 pt, a
 * 20 pt glyph (a switch row's sits in a 32 pt tile that the hue lights while it is on), a title, a hint, and a switch, chevron or external-link trail.
 *
 * One element for a screen reader: "{title}, {hint}, switch, on" — the whole
 * row toggles, so the switch is drawn, not focused. It plays `H.toggle` (§10.2,
 * a switch changes); a chevron or external row is silent. Pressed: a 6% wash on
 * iOS, a ripple on Android; no scale on rows, but the row's press reaches the
 * <Toggle>'s thumb. Busy dims the toggle beside its spinner. Text scales
 * freely and the row grows. Increase Contrast whitens the trailing glyph.
 */
export function SettingsRow({
  icon,
  leading,
  title,
  hint,
  label,
  accessory,
  trail = 'none',
  value = false,
  onValueChange,
  onPress,
  opens = 'opens in browser',
  busy = false,
  disabled = false,
  error = false,
  destructive = false,
  previewState,
  testID,
}: SettingsRowProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [focused, setFocused] = useState(false)
  // The finger on the row reaches the toggle's thumb.
  const [down, setDown] = useState(false)
  useRollbackHaptic(error)

  const isSwitch = trail === 'switch'
  const ink = destructive ? COLOR.destructive : COLOR.textPrimary
  const press = isSwitch
    ? () => {
        H.toggle(!value)
        onValueChange?.(!value)
      }
    : onPress
  const external = trail === 'external' ? `, ${opens}` : ''

  return (
    <Pressable
      testID={testID}
      // A plain row has no action, but is not disabled: it must not read as dimmed.
      onPress={trail === 'none' ? undefined : press}
      disabled={disabled || busy}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: PRESSED_WASH.android }}
      accessibilityRole={ROLE[trail]}
      accessibilityLabel={label ?? `${title}${hint ? `, ${hint}` : ''}${external}`}
      accessibilityState={{ disabled, busy, checked: isSwitch ? value : undefined }}
      style={({ pressed }) => [
        styles.row,
        // Android's live press is the ripple; the wash stands in for it only in the gallery.
        ((pressed && Platform.OS !== 'android') || previewState === 'pressed') && {
          backgroundColor: PRESSED_WASH[Platform.OS === 'android' ? 'android' : 'ios'],
        },
        disabled && { opacity: OPACITY.disabled },
      ]}
    >
      {leading ??
        (icon ? isSwitch ? <SwitchTile testID={testID && `${testID}-tile`} icon={icon} on={value} /> : <Icon name={icon} size={ICON.control} color={ink} /> : null)}
      <View style={styles.text}>
        <Text style={[font('bodyStrong', bold), { color: ink }]}>{title}</Text>
        {hint ? <Text style={[font('meta', bold), { color: error ? COLOR.destructive : COLOR.textSecondary }]}>{hint}</Text> : null}
      </View>
      {accessory ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.accessory}>
          {accessory}
        </View>
      ) : null}
      {busy ? <Spinner testID={testID && `${testID}-spinner`} size={18} /> : null}
      {isSwitch ? (
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Toggle value={value} disabled={busy} pressed={down || previewState === 'pressed'} testID={testID && `${testID}-toggle`} />
        </View>
      ) : null}
      {trail === 'chevron' || trail === 'external' ? (
        <Icon
          name={trail === 'chevron' ? 'chevron-right' : 'external-link'}
          size={ICON.inline}
          color={contrast ? COLOR.textPrimary : COLOR.textTertiary}
        />
      ) : null}
      {focused || previewState === 'focused' ? (
        <View testID={testID && `${testID}-focus`} pointerEvents="none" style={styles.focus} />
      ) : null}
    </Pressable>
  )
}

/**
 * Settings rows in a 24 pt surface card under a mono label (a heading), with
 * hairlines from the text edge. Increase Contrast: the hairlines at 50% and
 * 1 pt, the card outlined, the label white.
 */
export function SettingsGroup({
  title,
  children,
  danger = false,
  testID,
}: {
  title?: string
  children: ReactNode
  /** The Danger zone (Flow 7): no fill, a 1 pt outline in the destructive colour at 38%, and 24 pt more room above it. */
  danger?: boolean
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <View testID={testID} style={[styles.group, danger && styles.dangerRoom]}>
      {title ? (
        <Text accessibilityRole="header" style={[font('label', bold), styles.label, contrast && styles.labelContrast]}>
          {title}
        </Text>
      ) : null}
      <View testID={testID && `${testID}-card`} style={[styles.card, danger && styles.dangerCard, contrast && IC_HAIRLINE]}>
        {Children.toArray(children).map((row, i) => (
          // `toArray` keys each row, so a row's focus and rollback state stay with it when rows come and go.
          <Fragment key={isValidElement(row) ? row.key : i}>
            {i ? (
              <View
                testID={testID && `${testID}-hairline`}
                accessibilityElementsHidden
                style={[styles.hairline, { marginLeft: textEdge(row) }, contrast && styles.hairlineContrast]}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    padding: SPACE.lg,
    minHeight: ROW_MIN_HEIGHT,
  },
  tile: { width: TILE, height: TILE, borderRadius: RADIUS.thumb, backgroundColor: COLOR.surfaceRaised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  accessory: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  focus: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: RADIUS.rowInCard, borderWidth: SPACE.xxs, borderColor: COLOR.focusRing },
  group: { gap: SPACE.sm },
  label: { color: COLOR.textSecondary, paddingLeft: SPACE.lg },
  labelContrast: { color: COLOR.textPrimary },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  dangerCard: { backgroundColor: 'transparent', borderWidth: 1, borderColor: tint(COLOR.destructive, DANGER_RING) },
  dangerRoom: { marginTop: SPACE.xl },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline },
  hairlineContrast: { height: 1, backgroundColor: MATERIAL.hairlineIncreaseContrast },
})
