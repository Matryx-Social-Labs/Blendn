import { useEffect, useState, type Ref } from 'react'
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, SPRING } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Avatar } from './Avatar'
import { Disc, type DiscProps } from './Disc'
import { PresenceDot } from './MonoFamily'
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

/** The slot each tab sits in: the disc owns the middle one (2). */
const SLOT: Record<Tab, number> = { pulse: 0, going: 1, banter: 3, me: 4 }

/**
 * Where the selection pill's left edge is, in the row's own space: its slot's centre, less half the pill, after the row's
 * 4 pt of padding (a positioned child ignores padding, so it is added here).
 */
export function pillX(tab: Tab, cell: number, pillWidth: number) {
  return SPACE.xs + cell * (SLOT[tab] + 0.5) - pillWidth / 2
}

/**
 * The bar's geometry. The capsule sits 16 pt in from each edge with 4 pt of
 * padding inside it, and the row is FIVE EQUAL SLOTS: Pulse · Going · the
 * disc · Banter · Me. Each item is centred in its slot, and the disc keeps
 * its 56 pt inside the middle one.
 *
 * Owner override (2026-10-17, PR #401 drive): the design's grid,
 * `1fr 1fr 56px 1fr 1fr` (journey/ui.js `JU.tabbar`), measured 86/71/71/86
 * between centres on iOS, and the inner tabs read as crowding the disc.
 * Owner ruling: all five centres equally spaced. `centres` are in screen x.
 */
export function tabBarGeometry(screenWidth: number) {
  const left = SPACE.tabBarInset + SPACE.xs
  const cell = Math.max(0, (screenWidth - 2 * left) / 5)
  const centres = [0, 1, 2, 3, 4].map((i) => left + cell * (i + 0.5))
  return { cell, centres }
}

/**
 * How far the centre button's "Check in · {venue}" pill (components/ds/Disc)
 * rises above the bar's top edge: the disc is centred in the bar, the pill sits
 * `SPACE.sm` over it and is a `SIZE.tag` tall. Whatever floats over the bar
 * (the Android snackbar) clears it.
 */
export const TAB_BAR_HINT_RISE = SIZE.disc + SPACE.sm + SIZE.tag - (SIZE.tabBar + SIZE.disc) / 2

export type TabBarProps = {
  selected: Tab
  /** Every tap, the selected tab's too (re-tapping it scrolls to the top: the screen's call). */
  onSelect: (tab: Tab) => void
  /** The centre disc, exactly as `<Disc>` takes it; the bar only reserves its 56 pt slot. */
  disc: DiscProps
  /** Your own face on Me; the outlined person until there is one. */
  mePhoto?: string
  /** Conversations with something unread from the other side: a dot on Banter's glyph, the count only in its spoken label ("Banter, 3 new"). */
  banterUnread?: number
  /** The disc's slot, for whoever points at it (the centre button's coach mark). */
  discRef?: Ref<View>
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
export function TabBar({ selected, onSelect, disc, mePhoto, banterUnread = 0, discRef, testID = 'tabs' }: TabBarProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { cell } = tabBarGeometry(useWindowDimensions().width)
  const reduceMotion = useReducedMotion()
  // A photo URL that failed to load: Me shows the glyph for that URL (E1), and a new URL gets its try.
  const [deadPhoto, setDeadPhoto] = useState<string | null>(null)

  /*
   * One pill, not one per tab (DS #2): it slides to the new tab on M.snap, and a second tap mid-flight retargets it from
   * where it is. Under Reduce Motion it jumps (the crossfade of the content stays; that is the screen's). Android's is
   * the 56 × 32 indicator behind the glyph. The selected glyph and label still change at t0, in the tab itself.
   */
  const pillWidth = SIZE.primary
  const target = pillX(selected, cell, pillWidth)
  const x = useSharedValue(target)
  useEffect(() => {
    if (x.get() === target) return
    x.set(reduceMotion ? target : withSpring(target, SPRING.snap))
  }, [target, reduceMotion, x])
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))

  const tab = ({ key, label: name, icon }: (typeof TABS)[number]) => {
    const on = key === selected
    const fresh = key === 'banter' && banterUnread > 0
    const label = fresh ? `${name}, ${banterUnread} new` : name
    const ink = on ? COLOR.textPrimary : COLOR.textSecondary
    const family = bold || (on && !android) ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]
    return (
      <View key={key} testID={`${testID}-${key}-cell`} style={[styles.cell, { width: cell }]}>
        <Pressable
          testID={`${testID}-${key}`}
          onPress={() => onSelect(key)}
          android_ripple={{ color: PRESSED_WASH.android, borderless: true, radius: SIZE.primary / 2 }}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: on }}
          /*
           * The label is capped at CONTROL_FONT_CAP, as UIKit's own tab bar is; at the accessibility sizes a long-press shows
           * the large content viewer (the glyph and the name, big), as it does there (D2). iOS only; a no-op on Android.
           */
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle={label}
          style={styles.tab}
        >
          {key === 'me' && mePhoto && mePhoto !== deadPhoto ? (
            <Avatar
              kind="photo"
              uri={mePhoto}
              size={ICON.nav}
              ring={on ? COLOR.textPrimary : undefined}
              onError={() => setDeadPhoto(mePhoto)}
              testID={`${testID}-me-avatar`}
            />
          ) : (
            <View>
              <Icon name={icon} size={ICON.nav} color={ink} active={on} />
              {fresh ? (
                <View style={styles.dot} pointerEvents="none">
                  <PresenceDot testID={`${testID}-banter-dot`} />
                </View>
              ) : null}
            </View>
          )}
          <Text style={[font('caption', false, family), { color: ink }]} maxFontSizeMultiplier={CONTROL_FONT_CAP} numberOfLines={1}>
            {name}
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
        <Animated.View testID={`${testID}-pill`} pointerEvents="none" style={[android ? styles.indicator : styles.pill, slide]} />
        {TABS.slice(0, 2).map(tab)}
        <View testID={`${testID}-disc-slot`} style={[styles.slot, { width: cell }]}>
          {/* Sized by the disc, not the slot: what the centre button's coach mark frames. */}
          <View ref={discRef}>
            <Disc {...disc} />
          </View>
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
  cell: { alignItems: 'center' },
  // On the glyph's top-right corner.
  dot: { position: 'absolute', top: -SPACE.xxs, right: -SPACE.xxs },
  // The middle slot is a tab slot's width; the disc keeps its 56 pt, centred in it.
  slot: { height: SIZE.disc, alignItems: 'center', justifyContent: 'center' },
  tab: { width: SIZE.primary, maxWidth: '100%', height: SIZE.primary, alignItems: 'center', justifyContent: 'center', gap: SPACE.xxs },
  pill: {
    position: 'absolute',
    left: 0,
    top: (SIZE.tabBar - SIZE.primary) / 2,
    width: SIZE.primary,
    height: SIZE.primary,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.tabCapsule,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: (SIZE.tabBar - SIZE.primary) / 2 + SPACE.xxs,
    width: INDICATOR.width,
    height: INDICATOR.height,
    borderRadius: RADIUS.capsule,
    backgroundColor: tint(COLOR.textPrimary, INDICATOR.alpha),
  },
})
