import { useEffect, useState, type Ref } from 'react'
import { AppState, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon, type IconName } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, SPRING, TYPE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { tabBarShape } from '../../lib/tabBarSettle'
import { tint } from '../../lib/theme'
import { Avatar } from './Avatar'
import { Disc, type DiscProps } from './Disc'
import { PresenceDot } from './MonoFamily'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, PRESSED_WASH, useBoldText, useIncreaseContrast, useScreenReader } from './shared'

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
 * `SPACE.md` over it (8 over the bar's top edge) and is a `SIZE.tag` tall. Whatever floats over the bar
 * (the Android snackbar) clears it.
 */
export const TAB_BAR_HINT_RISE = SIZE.disc + SPACE.md + SIZE.tag - (SIZE.tabBar + SIZE.disc) / 2

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
  /** What asks the bar to settle into its compact pill, on the UI thread: 1 compact, 0 full (`lib/tabBarSettle`). None: always full. */
  settle?: SharedValue<number>
  /** Where the bar is between full (0) and compact (1), written here as it moves, for what rides on its top edge. */
  progress?: SharedValue<number>
  /** Keep the full bar whatever `settle` says (the disc's coach mark is pointing at it). */
  holdFull?: boolean
  /** Stepped away while the keyboard is up: kept mounted, not drawn. */
  hidden?: boolean
  /** Any touch on the bar, before the tab or the disc handles it: a tap anywhere on the pill opens it. */
  onTouch?: () => void
  testID?: string
}

/** Reduce Motion: the labels dissolve over 200 ms (timer-driven), then the pill steps to its new size in one frame. */
const DISSOLVE = { duration: 200, reduceMotion: ReduceMotion.Never } as const
const STEP = { duration: 0, reduceMotion: ReduceMotion.Never } as const
/** iOS's selection pill: 56 × 56 in the full bar, 48 × 44 in the compact pill (the board's `.pil`). */
const PILL = { full: SIZE.primary, compactWidth: SIZE.control, compactHeight: SIZE.discCompact } as const
/*
 * The label sits right under the glyph, no gap: the board draws an 11/13 label 2 pt under it, and the DS caption is
 * 12/16, whose line already carries the space. So both the glyph and the label's line centre land within 1 pt of the
 * board's (glyph 24 vs 24.5 from the bar's top, label 44 vs 45), where a 2 pt gap put the glyph 1.5 pt high.
 */
const LABEL_GAP = 0
/** Half the glyph's drop to the middle in the compact pill: the label's line and its gap, until the label is measured. */
const LABEL_SHIFT = (TYPE.caption.lineHeight + LABEL_GAP) / 2

/**
 * The tab bar (guidelines/components/TabBar.html; DESIGN-BRIEF §11, §13):
 * Pulse · Going · the disc · Banter · Me in a 64 pt capsule on the bar glass,
 * 16 pt in from the edges and floating at the safe area (12 dp above
 * Android's gesture bar). iOS marks the selected tab with a 22% white pill and
 * a 700 label; Android with a 56 × 32 indicator behind the glyph and no bold
 * (§13). The selected glyph strokes at 2.25; Me is your face, ringed white.
 *
 * It settles as you read (tab-bar board, option B): asked by `settle`, it narrows to a 288 × 52 pill, the labels fade,
 * the glyphs drop to the middle and the disc goes 56 → 44 with every state; the bottom edge never moves. Down on
 * `SPRING.settle`, back on `SPRING.snap`, retargeting from where it is. Only the glass is re-laid out as it moves; the
 * tabs, the pill and the disc move by transform. With VoiceOver or TalkBack on it never settles; the labels stay the
 * tabs' accessibility labels whatever it shows.
 *
 * Silent: no haptic on a tab switch (§10.1 rule 5, §13: Material bars don't
 * vibrate), nor on settling or returning (automatic); the disc has its own. Android tabs ripple. Labels cap at 1.3× in
 * the fixed bar. Reduce Transparency: the solid tier (through <Material>).
 * Increase Contrast: the 50% outline on the capsule. Bold Text: every label
 * 700, so the pill alone tells selected from not.
 */
export function TabBar({
  selected,
  onSelect,
  disc,
  mePhoto,
  banterUnread = 0,
  discRef,
  settle,
  progress,
  holdFull = false,
  hidden = false,
  onTouch,
  testID = 'tabs',
}: TabBarProps) {
  const android = Platform.OS === 'android'
  const insets = useSafeAreaInsets()
  const contrast = useIncreaseContrast()
  const screenReader = useScreenReader()
  const screenWidth = useWindowDimensions().width
  const { cell } = tabBarGeometry(screenWidth)
  const reduceMotion = useReducedMotion()
  // A photo URL that failed to load: Me shows the glyph for that URL (E1), and a new URL gets its try.
  const [deadPhoto, setDeadPhoto] = useState<string | null>(null)
  // A URL that failed (offline, a blip) gets another try when the app comes back to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setDeadPhoto(null))
    return () => sub.remove()
  }, [])

  /*
   * One pill, not one per tab (DS #2): it slides to the new tab's slot on M.snap, and a second tap mid-flight retargets it
   * from where it is. Under Reduce Motion it jumps (the crossfade of the content stays; that is the screen's). Android's
   * is the 56 × 32 indicator behind the glyph. The selected glyph and label still change at t0, in the tab itself.
   */
  const slot = useSharedValue<number>(SLOT[selected])
  useEffect(() => {
    if (slot.get() === SLOT[selected]) return
    slot.set(reduceMotion ? SLOT[selected] : withSpring(SLOT[selected], SPRING.snap))
  }, [selected, reduceMotion, slot])

  const own = useSharedValue(0)
  const p = progress ?? own
  const target = useSharedValue(0)
  const dissolved = useSharedValue(1)
  const labelShift = useSharedValue(LABEL_SHIFT)
  const free = !screenReader && !holdFull
  useAnimatedReaction(
    () => (free && settle ? settle.get() : 0),
    (to) => {
      if (to === target.get()) return
      target.set(to)
      if (!reduceMotion) {
        dissolved.set(1 - to)
        p.set(withSpring(to, to ? SPRING.settle : SPRING.snap))
      } else if (to) {
        dissolved.set(withTiming(0, DISSOLVE))
        p.set(withDelay(DISSOLVE.duration, withTiming(1, STEP), ReduceMotion.Never))
      } else {
        p.set(0)
        dissolved.set(withTiming(1, DISSOLVE))
      }
    },
    [free, reduceMotion]
  )

  // The glass is the one thing re-laid out per frame: reshaped, so its rim follows (glass never fades or clips).
  const capsule = useAnimatedStyle(() => {
    const s = tabBarShape(p.get(), screenWidth)
    return { left: s.left - SPACE.tabBarInset, top: SIZE.tabBar - s.height, width: s.width, height: s.height, borderRadius: s.radius }
  })
  const pill = useAnimatedStyle(() => {
    const t = p.get()
    const s = tabBarShape(t, screenWidth)
    const centre = (screenWidth - 2 * SPACE.tabBarInset) / 2 + (slot.get() - 2) * s.cell
    if (android) {
      // Behind the glyph, wherever it is: centred on it at both ends.
      const glyph = SIZE.tabBar / 2 - labelShift.get() + s.drop + t * labelShift.get()
      return { transform: [{ translateX: centre - INDICATOR.width / 2 }, { translateY: glyph - INDICATOR.height / 2 }] }
    }
    const width = PILL.full + (PILL.compactWidth - PILL.full) * t
    const height = PILL.full + (PILL.compactHeight - PILL.full) * t
    return { width, height, transform: [{ translateX: centre - width / 2 }, { translateY: SIZE.tabBar - s.height + (s.height - height) / 2 }] }
  })
  const discScale = useDerivedValue(() => tabBarShape(p.get(), screenWidth).disc / SIZE.disc)
  const discSlot = useAnimatedStyle(() => ({ transform: [{ translateY: tabBarShape(p.get(), screenWidth).drop }] }))
  const motion: CellMotion = { p, cell, screenWidth, labelShift, dissolved, reduceMotion }

  const tab = (t: (typeof TABS)[number]) => (
    <TabCell
      key={t.key}
      tab={t}
      on={t.key === selected}
      unread={t.key === 'banter' ? banterUnread : 0}
      photo={t.key === 'me' && mePhoto && mePhoto !== deadPhoto ? mePhoto : undefined}
      onPhotoError={() => setDeadPhoto(mePhoto ?? null)}
      onSelect={onSelect}
      motion={motion}
      testID={testID}
    />
  )

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      onTouchEnd={onTouch}
      style={[styles.bar, { bottom: insets.bottom + (android ? SPACE.tabBarBottomGapAndroid : 0) }, hidden && styles.hidden]}
    >
      {/* Behind, not around: the disc's check-in label rises above the bar and must not be clipped. */}
      <Material testID={`${testID}-capsule`} role="bar" style={styles.capsule} animatedStyle={capsule} />
      <View testID={`${testID}-row`} accessibilityRole="tablist" pointerEvents="box-none" style={styles.row}>
        <Animated.View testID={`${testID}-pill`} pointerEvents="none" style={[android ? styles.indicator : styles.pill, pill]} />
        {TABS.slice(0, 2).map(tab)}
        <Animated.View testID={`${testID}-disc-slot`} pointerEvents="box-none" style={[styles.slot, { width: cell }, discSlot]}>
          {/* Sized by the disc, not the slot: what the centre button's coach mark frames. */}
          <View ref={discRef}>
            <Disc {...disc} scale={discScale} />
          </View>
        </Animated.View>
        {TABS.slice(2).map(tab)}
      </View>
      {contrast ? (
        <Animated.View testID={`${testID}-contrast`} pointerEvents="none" style={[styles.capsule, IC_HAIRLINE, capsule]} />
      ) : null}
    </View>
  )
}

type CellMotion = {
  p: SharedValue<number>
  /** The full bar's cell, which the row is laid out in; the compact cells are reached by transform. */
  cell: number
  screenWidth: number
  labelShift: SharedValue<number>
  /** The labels under Reduce Motion, which dissolve on a timer rather than with the shape. */
  dissolved: SharedValue<number>
  reduceMotion: boolean
}

/** One tab in its slot: it slides in to its compact cell, its glyph drops to the middle and its label fades. */
function TabCell({
  tab: { key, label: name, icon },
  on,
  unread,
  photo,
  onPhotoError,
  onSelect,
  motion,
  testID,
}: {
  tab: (typeof TABS)[number]
  on: boolean
  unread: number
  photo?: string
  onPhotoError: () => void
  onSelect: (tab: Tab) => void
  motion: CellMotion
  testID: string
}) {
  const android = Platform.OS === 'android'
  const bold = useBoldText()
  const fresh = unread > 0
  const label = fresh ? `${name}, ${unread} new` : name
  const ink = on ? COLOR.textPrimary : COLOR.textSecondary
  const family = bold || (on && !android) ? FONT_FAMILY.brand[700] : FONT_FAMILY.brand[500]
  const { p, cell, screenWidth, labelShift, dissolved, reduceMotion } = motion
  const place = SLOT[key] - 2
  const slide = useAnimatedStyle(() => {
    const s = tabBarShape(p.get(), screenWidth)
    return { transform: [{ translateX: place * (s.cell - cell) }, { translateY: s.drop }] }
  })
  const drop = useAnimatedStyle(() => ({ transform: [{ translateY: p.get() * labelShift.get() }] }))
  const fade = useAnimatedStyle(() => ({ opacity: reduceMotion ? dissolved.get() : tabBarShape(p.get(), screenWidth).labels }))

  return (
    <Animated.View testID={`${testID}-${key}-cell`} pointerEvents="box-none" style={[styles.cell, { width: cell }, slide]}>
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
         * The compact pill has no labels at all; the viewer still names the tab.
         */
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle={label}
        style={styles.tab}
      >
        <Animated.View style={[styles.column, drop]}>
          {photo ? (
            <Avatar kind="photo" uri={photo} size={ICON.nav} ring={on ? COLOR.textPrimary : undefined} onError={onPhotoError} testID={`${testID}-me-avatar`} />
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
          <Animated.Text
            testID={`${testID}-${key}-label`}
            onLayout={(e) => labelShift.set((e.nativeEvent.layout.height + LABEL_GAP) / 2)}
            style={[font('caption', false, family), { color: ink }, fade]}
            maxFontSizeMultiplier={CONTROL_FONT_CAP}
            numberOfLines={1}
          >
            {name}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
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
  hidden: { display: 'none' },
  capsule: { position: 'absolute', left: 0, top: 0 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.xs },
  cell: { alignItems: 'center' },
  // On the glyph's top-right corner.
  dot: { position: 'absolute', top: -SPACE.xxs, right: -SPACE.xxs },
  // The middle slot is a tab slot's width; the disc keeps its 56 pt, centred in it.
  slot: { height: SIZE.disc, alignItems: 'center', justifyContent: 'center' },
  tab: { width: SIZE.primary, maxWidth: '100%', height: SIZE.primary, alignItems: 'center', justifyContent: 'center' },
  column: { alignItems: 'center', gap: LABEL_GAP },
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE.primary,
    height: SIZE.primary,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.tabCapsule,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: INDICATOR.width,
    height: INDICATOR.height,
    borderRadius: RADIUS.capsule,
    backgroundColor: tint(COLOR.textPrimary, INDICATOR.alpha),
  },
})
