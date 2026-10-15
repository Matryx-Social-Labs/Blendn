import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { Avatar } from './Avatar'
import { Disc, type DiscProps } from './Disc'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast } from './shared'

export type Tab = 'pulse' | 'going' | 'banter' | 'me'

const TABS: readonly { key: Tab; label: string; icon: IconName }[] = [
  { key: 'pulse', label: 'Pulse', icon: 'radio' },
  { key: 'going', label: 'Going', icon: 'calendar' },
  { key: 'banter', label: 'Banter', icon: 'message-circle' },
  { key: 'me', label: 'Me', icon: 'circle-user-round' },
]

/** Android's indicator: a 56 × 32 pill at 10% white behind the glyph (§13), not iOS's whole-tab capsule. */
const INDICATOR = { width: SIZE.primary, height: SIZE.tag, alpha: 0.1 } as const

export type TabBarProps = {
  selected: Tab
  /** Every tap, the selected tab's too (re-tapping it scrolls to the top: the screen's call). */
  onSelect: (tab: Tab) => void
  /** The centre disc, exactly as `<Disc>` takes it; the bar only reserves its 56 pt slot. */
  disc: DiscProps
  /** Your own face on Me; the outlined person until there is one. */
  mePhoto?: string
  testID?: string
}

/**
 * The tab bar (guidelines/components/TabBar.html; DESIGN-BRIEF §11, §13):
 * Pulse · Going · the disc · Banter · Me in a 64 pt capsule on the bar glass,
 * 16 pt in from the edges and floating at the safe area (12 dp above
 * Android's gesture bar). iOS marks the selected tab with a 22% white pill and
 * a 700 label; Android with a 56 × 32 indicator behind the glyph and no bold
 * (§13). The selected glyph strokes at 2.25; Me is your face, ringed white.
 *
 * Silent: no haptic on a tab switch (§10.1 rule 5, §13: Material bars don't
 * vibrate); the disc has its own. Android tabs ripple. Labels cap at 1.3× in
 * the fixed bar. Reduce Transparency: the solid tier (through <Material>).
 * Increase Contrast: the 50% outline on the capsule. Bold Text: every label
 * 700, so the pill alone tells selected from not.
 */
export function TabBar({ selected, onSelect, disc, mePhoto, testID = 'tabs' }: TabBarProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()

  const tab = ({ key, label, icon }: (typeof TABS)[number]) => {
    const on = key === selected
    const ink = on ? COLOR.textPrimary : COLOR.textSecondary
    const family = bold || (on && !android) ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]
    return (
      <View key={key} style={styles.cell}>
        <Pressable
          testID={`${testID}-${key}`}
          onPress={() => onSelect(key)}
          android_ripple={{ color: PRESSED_WASH.android, borderless: true, radius: SIZE.primary / 2 }}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: on }}
          style={styles.tab}
        >
          {on ? <View testID={`${testID}-${key}-pill`} style={android ? styles.indicator : styles.pill} /> : null}
          {key === 'me' && mePhoto ? (
            <Avatar kind="photo" uri={mePhoto} size={ICON.nav} ring={on ? COLOR.textPrimary : undefined} testID={`${testID}-me-avatar`} />
          ) : (
            <Icon name={icon} size={ICON.nav} color={ink} active={on} />
          )}
          <Text style={[font('caption', false, family), { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View
      testID={testID}
      style={[styles.bar, { bottom: insets.bottom + (android ? SPACE.tabBarBottomGapAndroid : 0) }]}
    >
      {/* Behind, not around: the disc's check-in label rises above the bar and must not be clipped. */}
      <Material role="bar" style={[StyleSheet.absoluteFill, styles.round]} />
      <View testID={`${testID}-row`} accessibilityRole="tablist" style={styles.row}>
        {TABS.slice(0, 2).map(tab)}
        <View style={styles.slot}>
          <Disc {...disc} />
        </View>
        {TABS.slice(2).map(tab)}
      </View>
      {contrast ? <View testID={`${testID}-contrast`} pointerEvents="none" style={[StyleSheet.absoluteFill, IC_HAIRLINE, styles.round]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: SPACE.tabBarInset,
    right: SPACE.tabBarInset,
    height: SIZE.tabBar,
    borderRadius: RADIUS.tabBar,
  },
  round: { borderRadius: RADIUS.tabBar },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.xs },
  cell: { flex: 1, alignItems: 'center' },
  slot: { width: SIZE.disc, height: SIZE.disc },
  tab: { width: SIZE.primary, maxWidth: '100%', height: SIZE.primary, alignItems: 'center', justifyContent: 'center', gap: SPACE.xxs },
  pill: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.capsule, backgroundColor: COLOR.tabCapsule },
  indicator: {
    position: 'absolute',
    top: SPACE.xxs,
    width: INDICATOR.width,
    height: INDICATOR.height,
    borderRadius: RADIUS.capsule,
    backgroundColor: tint(COLOR.textPrimary, INDICATOR.alpha),
  },
})
