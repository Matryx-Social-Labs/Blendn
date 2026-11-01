import { useEffect, type ReactNode } from 'react'
import { AccessibilityInfo, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { Button, type ButtonKind, type ButtonProps } from './Button'
import { monoCaption } from './MonoFamily'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from './shared'

/** One component, two well sizes (the R3 ruling): 56 inline (a list, a card), 80 for a whole screen. */
const WELL = { inline: 56, screen: 80 } as const
const GLYPH_FRACTION = { inline: 0.5, screen: 0.45 } as const
/** The full-screen well sits at 22% of the height (flow-15's system screen). */
const WELL_TOP = 0.22

/** The circle a state's glyph sits in. Decorative: the title says what happened. */
export function GlyphWell({ icon, size = 'inline', testID }: { icon: IconName; size?: 'inline' | 'screen'; testID?: string }) {
  const contrast = useIncreaseContrast()
  const side = WELL[size]
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.well, { width: side, height: side }, contrast && IC_HAIRLINE]}
    >
      <Icon
        name={icon}
        size={Math.round(side * GLYPH_FRACTION[size])}
        color={size === 'screen' || contrast ? COLOR.textPrimary : COLOR.textSecondary}
      />
    </View>
  )
}

export type StateAction = {
  label: string
  onPress: () => void
  kind?: ButtonKind
  loading?: boolean
  disabled?: boolean
  /** A leading glyph (Open the dashboard ↗). */
  icon?: IconName
  /** The press-in cue where the frame names one its kind does not carry (`H.primary` on a strong action). */
  pressHaptic?: ButtonProps['pressHaptic']
  /** A counting figure after the label, in Geist Mono ("Try again in 0:48"). Give `accessibilityLabel` too: the figure is not part of the label. */
  price?: ButtonProps['price']
  accessibilityLabel?: string
}

/** An action's kind when the caller names none: the first is the lit recovery, the rest stay quiet (rc7 D4). */
export const stateActionKind = (index: number): ButtonKind => (index === 0 ? 'lit' : 'secondary')

export type StateScreenProps = {
  icon: IconName
  title: string
  /** One paragraph; the server's sentence verbatim where there is one. */
  body?: string
  /**
   * A phrase inside `body` that is a link (Flow 15 #1: the support address in the server's sentence), underlined
   * and pressable in place. Ignored when `body` does not contain it. Its action is always also an action below.
   */
  bodyLink?: { text: string; onPress: () => void }
  /** In place of the glyph well, a screen's own mark (Flow 15 #12: the disc on a not-found). Decorative. */
  lead?: ReactNode
  note?: string
  /** The note is a path or an address (Flow 15 not found): Geist Mono, truncated in the middle so both ends show. */
  noteMono?: boolean
  /**
   * Top to bottom in the fixed order. `kind` defaults to `lit` for the first (a state's recovery is a positive action inside
   * the screen's world, PLAN-buttons L3) and `secondary` for the rest. A screen whose one CTA this is says `primary`.
   */
  actions?: StateAction[]
  /** Under the actions, in the dock (`screen` only): the crash screen's error id, the line that says where to write. */
  foot?: ReactNode
  /** The first action is in flight. */
  busy?: boolean
  /** `inline` in a list or card; `screen` fills it, with the actions docked at the bottom. */
  variant?: 'inline' | 'screen'
  /**
   * Inline, in a screen with no gutter of its own (Going's empty state): the frame's `left: 24; right: 24`, so the body and the
   * action stop at the page's margins instead of running edge to edge. Off by default: a card or a padded list already has them.
   */
  gutter?: boolean
  testID?: string
}

/**
 * Every empty, failed, refused and system state, as one pattern
 * (guidelines/components/StateScreen.html): a glyph well, a title, one
 * paragraph, then actions. Read as title (a heading), body, actions; the glyph
 * is decorative. A whole screen is announced on arrival. No haptic: a
 * refusal's `H.error` belongs to the control that asked, when the answer came.
 *
 * Text scales freely; the well never does. Increase Contrast: the well's
 * hairline, a white glyph, secondary text lifted to white.
 */
export function StateScreen({ icon, title, body, bodyLink, lead, note, noteMono = false, actions = [], foot, busy = false, variant = 'inline', gutter = false, testID }: StateScreenProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const screen = variant === 'screen'

  // Said on arrival, inline too: a load that fails where "Loading" was read must say so. Inline queues, so it never cuts off what is being read (M4).
  useEffect(() => {
    AccessibilityInfo.announceForAccessibilityWithOptions(body ? `${title}. ${body}` : title, { queue: !screen })
  }, [screen, title, body])

  const content = (
    <View style={styles.column}>
      {lead ? (
        <View testID={testID && `${testID}-lead`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {lead}
        </View>
      ) : (
        <GlyphWell icon={icon} size={variant} testID={testID && `${testID}-well`} />
      )}
      {/* Inline, the state sits in a list or under a section heading, so its title is a step below both (r7 M5: 24 pt bold read louder than the page). */}
      {/* Every line stops at its role's cap, so at AX XXXL the actions under it stay on the screen (A21, A25). */}
      <Text
        accessibilityRole="header"
        textBreakStrategy="balanced"
        lineBreakStrategyIOS="standard"
        maxFontSizeMultiplier={MAX_FONT_SCALE[screen ? 'title' : 'bodyStrong']}
        style={[font(screen ? 'title' : 'bodyStrong', bold), styles.title]}
      >
        {title}
      </Text>
      {body ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.center, { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
          <BodyWithLink body={body} link={bodyLink} />
        </Text>
      ) : null}
      {note ? (
        <Text
          numberOfLines={noteMono ? 2 : undefined}
          ellipsizeMode={noteMono ? 'middle' : undefined}
          maxFontSizeMultiplier={MAX_FONT_SCALE[noteMono ? 'caption' : 'meta']}
          style={[noteMono ? monoCaption(bold) : font('meta', bold), styles.center, { color: contrast ? COLOR.textSecondary : COLOR.textTertiary }]}
        >
          {note}
        </Text>
      ) : null}
    </View>
  )
  const kinds = actions.map((a, i) => a.kind ?? stateActionKind(i))
  // A lit action is never 56 pt (the primary's): a state with one stacks all of its actions at 48.
  const actionSize = kinds.includes('lit') ? 'md' : undefined
  const buttons = actions.map(({ kind: _kind, loading, ...action }, i) => (
    <Button key={action.label} kind={kinds[i]} size={actionSize} loading={loading || (busy && i === 0)} {...action} />
  ))

  if (!screen) {
    return (
      <View testID={testID} style={[styles.column, gutter && styles.gutter]}>
        {content}
        {buttons.length ? <View style={styles.actions}>{buttons}</View> : null}
      </View>
    )
  }
  return (
    <View testID={testID} style={styles.fill}>
      <ScrollView contentContainerStyle={[styles.screen, { paddingTop: Math.round(height * WELL_TOP) }]}>{content}</ScrollView>
      {buttons.length || foot ? (
        <View testID={testID && `${testID}-dock`} style={[styles.dock, { paddingBottom: insets.bottom + SPACE.lg }]}>
          {buttons}
          {foot ? <View style={styles.foot}>{foot}</View> : null}
        </View>
      ) : null}
    </View>
  )
}

/** The paragraph, with `link.text` drawn as an underlined, pressable span in white (a nested Text, so it wraps with the sentence). */
function BodyWithLink({ body, link }: { body: string; link?: StateScreenProps['bodyLink'] }) {
  const at = link ? body.indexOf(link.text) : -1
  if (!link || at < 0) return <>{body}</>
  return (
    <>
      {body.slice(0, at)}
      <Text accessibilityRole="link" onPress={link.onPress} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.link}>
        {link.text}
      </Text>
      {body.slice(at + link.text.length)}
    </>
  )
}

const styles = StyleSheet.create({
  link: { color: COLOR.textPrimary, textDecorationLine: 'underline' },
  well: { borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface, alignItems: 'center', justifyContent: 'center' },
  column: { alignItems: 'center', gap: SPACE.md },
  title: { color: COLOR.textPrimary, textAlign: 'center' },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: SPACE.sm, marginTop: SPACE.md },
  gutter: { paddingHorizontal: SPACE.gutter },
  fill: { flex: 1 },
  foot: { alignItems: 'center', gap: SPACE.sm },
  screen: { paddingHorizontal: SPACE.gutter },
  dock: { gap: SPACE.md, paddingTop: SPACE.lg, paddingHorizontal: SPACE.gutter },
})
