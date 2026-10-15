import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, SPACE, TYPE } from '../../lib/design/tokens'
import { OPACITY } from '../../lib/theme'
import { PresenceDot } from './MonoFamily'
import { font, minTarget, useBoldText } from './shared'

export type SectionAction = { label: string; onPress: () => void; busy?: boolean }

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
 */
export function SectionHeader({
  title,
  count,
  action,
  live = false,
  caption,
  right,
  testID,
}: {
  title: string
  count?: number
  action?: SectionAction
  /** The live dot before the title ("Live now"). */
  live?: boolean
  caption?: string
  right?: ReactNode
  testID?: string
}) {
  const bold = useBoldText()
  const slop = (minTarget() - TYPE.meta.lineHeight) / 2
  const heading = count == null ? title : `${title}, ${count}`

  return (
    <View style={styles.block}>
      <View testID={testID} style={[styles.row, { alignItems: right ? 'center' : 'baseline' }]}>
        <View accessible accessibilityRole="header" accessibilityLabel={heading} style={styles.left}>
          {live ? (
            <View style={styles.dot}>
              <PresenceDot kind="live" testID={testID && `${testID}-live`} />
            </View>
          ) : null}
          <Text numberOfLines={1} style={[font('heading', bold), styles.title]}>
            {title}
          </Text>
          {count != null ? (
            <>
              <Text style={[font('heading', bold), styles.muted]}>·</Text>
              <Text style={[font('heading', bold, FONT_FAMILY.mono[700]), styles.muted, styles.tabular]}>{count}</Text>
            </>
          ) : null}
        </View>
        {action || right ? (
          <View style={styles.right}>
            {action ? (
              <Pressable
                testID={testID && `${testID}-action`}
                onPress={action.onPress}
                disabled={action.busy}
                hitSlop={{ top: slop, bottom: slop, left: SPACE.sm, right: SPACE.sm }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: !!action.busy, busy: !!action.busy }}
                style={action.busy ? styles.busy : null}
              >
                <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.action]}>{action.label}</Text>
              </Pressable>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md },
  left: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs, flexShrink: 1 },
  dot: { alignSelf: 'center', marginRight: SPACE.xs },
  title: { color: COLOR.textPrimary, flexShrink: 1 },
  muted: { color: COLOR.textSecondary },
  tabular: { fontVariant: ['tabular-nums'] },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flexShrink: 0 },
  action: { color: COLOR.textPrimary },
  busy: { opacity: OPACITY.disabled },
})
