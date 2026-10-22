import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { PresenceDot } from './MonoFamily'
import { CONTROL_FONT_CAP, focusRing, font, minTarget, useBoldText, useSelection } from './shared'

/** The lit count's capsule, as `Badge` at size 22. */
const CAPSULE = 22

/** `accessibilityLabel` only when the words on screen are not enough alone ("See all" says how many); it starts with the label. */
export type SectionAction = { label: string; onPress: () => void; busy?: boolean; accessibilityLabel?: string }

/** A count in thousands is grouped ("1,204"): it reads at a glance and never wraps the header. */
const grouped = (n: number) => n.toLocaleString('en-US')

/**
 * How every section inside a screen starts (guidelines/components/SectionHeader.html):
 * the heading at 20, an optional "· N" count in Geist Mono at textSecondary,
 * and at the right a text action in 700 14 white ("See all", "Edit") or a
 * built slot (`right`, a small control that carries its own haptic). An
 * optional caption in meta under it.
 *
 * The action is white for every row-scale text action (the R3 ruling, which
 * folds Flow 6's textSecondary and Flows 3–4's 16 pt "See all" into this). It
 * is silent (a push). A long title truncates before the action wraps.
 *
 * Screen reader: a heading "{title}, {N}", then the action as its own button.
 * The page's count is 18 pt, between roles: it is drawn at the heading's 20.
 *
 * `countStyle="lit"` (a screen's own list, in its world): the count is a 22 pt capsule in the hue's fill with its 1 pt edge, the
 * number white in Geist Mono 700 12/16, `Badge`'s geometry. The reader still hears "{title}, {N}".
 */
export function SectionHeader({
  title,
  count,
  countStyle = 'plain',
  action,
  live = false,
  caption,
  right,
  testID,
}: {
  title: string
  count?: number
  /** `plain`: "· N" in textSecondary. `lit`: a capsule in the screen's hue (`HueProvider`). */
  countStyle?: 'plain' | 'lit'
  action?: SectionAction
  /** The live dot before the title ("Live now"). */
  live?: boolean
  caption?: string
  right?: ReactNode
  testID?: string
}) {
  const bold = useBoldText()
  const sel = useSelection()
  const [focused, setFocused] = useState(false)
  const slop = (minTarget() - TYPE.meta.lineHeight) / 2
  const heading = count == null ? title : `${title}, ${grouped(count)}`

  return (
    <View style={styles.block}>
      <View testID={testID} style={[styles.row, { alignItems: right ? 'center' : 'baseline' }]}>
        <View accessible accessibilityRole="header" accessibilityLabel={heading} style={styles.left}>
          {live ? (
            <View style={styles.dot}>
              <PresenceDot kind="live" testID={testID && `${testID}-live`} />
            </View>
          ) : null}
          <Text numberOfLines={2} style={[font('heading', bold), styles.title]}>
            {title}
          </Text>
          {count != null && countStyle === 'lit' ? (
            <View testID={testID && `${testID}-count`} style={[styles.capsule, { backgroundColor: sel.fill, borderColor: sel.edge }]}>
              <Text style={[font('caption', bold, FONT_FAMILY.mono[700]), styles.capsuleText, styles.tabular]} maxFontSizeMultiplier={CONTROL_FONT_CAP}>
                {grouped(count)}
              </Text>
            </View>
          ) : count != null ? (
            <>
              <Text style={[font('heading', bold), styles.muted]}>·</Text>
              <Text style={[font('heading', bold, FONT_FAMILY.mono[700]), styles.muted, styles.tabular]}>{grouped(count)}</Text>
            </>
          ) : null}
        </View>
        {action || right ? (
          <View style={styles.right}>
            {action ? (
              <View>
                <Pressable
                  testID={testID && `${testID}-action`}
                  onPress={action.onPress}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  disabled={action.busy}
                  hitSlop={{ top: slop, bottom: slop }}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel ?? action.label}
                  accessibilityState={{ disabled: !!action.busy, busy: !!action.busy }}
                  style={[styles.actionBox, { minWidth: minTarget() }, action.busy && styles.busy]}
                >
                  <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.action]}>{action.label}</Text>
                </Pressable>
                {focused
                  ? focusRing(RADIUS.thumb).map((ring, i) => (
                      <View key={i} testID={i ? undefined : testID && `${testID}-action-focus`} pointerEvents="none" style={ring} />
                    ))
                  : null}
              </View>
            ) : null}
            {right}
          </View>
        ) : null}
      </View>
      {caption ? <Text style={[font('meta', bold), styles.muted]}>{caption}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: SPACE.xs },
  // The title is never given up for a slot: when the two do not fit, the slot wraps under it instead.
  row: { flexDirection: 'row', flexWrap: 'wrap', rowGap: SPACE.xs, columnGap: SPACE.md, justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs, flexShrink: 0, maxWidth: '100%' },
  dot: { alignSelf: 'center', marginRight: SPACE.xs },
  title: { color: COLOR.textPrimary, flexShrink: 0 },
  muted: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  /**
   * `Badge`'s 22: a pill that grows with a large count, a 1 pt edge inside it. 6 a side, so one digit (Geist Mono 12, ~7.5 wide)
   * plus the padding and the edge stays inside the 22 and draws a circle; at 8 a side a single digit made a lozenge.
   */
  capsule: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: CAPSULE,
    minWidth: CAPSULE,
    paddingHorizontal: SPACE.xs + SPACE.xxs,
    borderRadius: RADIUS.capsule,
    borderWidth: 1,
  },
  capsuleText: { color: COLOR.textPrimary },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexShrink: 1, minWidth: 0, marginLeft: 'auto' },
  action: { color: COLOR.textPrimary },
  /** A short action ("Edit") still reaches the 44 / 48 width; the label sits at the right edge. */
  actionBox: { alignItems: 'flex-end' },
  busy: { opacity: OPACITY.disabled },
})
