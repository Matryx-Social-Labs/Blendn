import { BAR_BOTTOM, barTop } from '../../lib/barGeometry'
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '../ds/IconButton'
import { font, useBoldText } from '../ds/shared'
import { Material } from '../ui/Material'
import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** DS #30: the glass materialises at 8 pt of scroll (never animated opacity); the small title crossfades from 24 to 56. */
const GLASS_AT = SPACE.sm
const TITLE_FROM = 24
const TITLE_TO = 56
/** Reduce Motion: no crossfade, the small title swaps at this offset. */
const TITLE_SWAP = 40

const circle = () => (Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton)

/**
 * Where the small title may stand, between the back circle and the three on the right: 16 in, the circle, 12 of air on
 * the left; 16 in, three circles with their two 8 pt gaps, 12 of air on the right. Not symmetric: the right side is wider,
 * and a symmetric inset left the title 41 pt on a 393 pt screen.
 */
export function sceneBarTitleSpan(width: number, side: number) {
  const left = SPACE.lg + side + SPACE.md
  const right = SPACE.lg + 3 * side + 2 * SPACE.sm + SPACE.md
  return { left, right, width: Math.max(0, width - left - right) }
}

/** The bar's height: the status bar, then the circles with 8 pt above and below. */
export const sceneBarHeight = (top: number) => barTop(top) + circle() + BAR_BOTTOM

export type SceneBarProps = {
  /** The event's name: it crossfades in as the hero's own title scrolls away. */
  title: string
  saved: boolean
  onBack: () => void
  onSave: () => void
  /** Absent when the event may not be shared (private, a draft): the control is not drawn, never disabled. */
  onShare?: () => void
  onMore: () => void
  /** The page's `contentOffset.y`, from a worklet scroll handler; absent, the bar stays at rest. */
  scrollY?: SharedValue<number>
}

/**
 * The Scene's top chrome (Flow 3 `scene`, DS TopBar and IconButton): back on the left; the heart, the share and the
 * ⋯ on the right, 44 pt iOS · 48 dp Android `media` circles, 8 pt apart, over the hero's head scrim. Scrolled, the
 * glass bar comes up behind them over the first 8 pt (#30) and the event's name crossfades in between 24 and
 * 56 pt. The heart is the one toggle: white disc and ink glyph when saved, `H.select` through the IconButton.
 *
 * One bar, first in the tree, so a screen reader reaches Back before the page.
 */
export function SceneBar({ title, saved, onBack, onSave, onShare, onMore, scrollY }: SceneBarProps) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const android = Platform.OS === 'android'
  const { width } = useWindowDimensions()
  // The glass is always mounted and comes up with the first 8 pt of scroll: mounting it popped (#30: never a blur's own opacity).
  const glassStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY ? scrollY.get() : 0, [0, GLASS_AT], [0, 1], 'clamp') }))
  const titleStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    return { opacity: reduceMotion ? (y > TITLE_SWAP ? 1 : 0) : interpolate(y, [TITLE_FROM, TITLE_TO], [0, 1], 'clamp') }
  })

  const height = sceneBarHeight(insets.top)
  const side = circle()
  const span = sceneBarTitleSpan(width, side)
  return (
    <View testID="scene-bar" pointerEvents="box-none" style={[styles.bar, { height, paddingTop: barTop(insets.top) }]}>
      <Animated.View testID="scene-bar-glass" pointerEvents="none" style={[StyleSheet.absoluteFill, glassStyle]}>
        <Material role="bar" style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.row}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} tier="media" accessibilityLabel="Back" onPress={onBack} testID="scene-back" />
        <View pointerEvents="box-none" style={styles.actions}>
          <IconButton icon="heart" tier="media" selected={saved} accessibilityLabel={saved ? 'Saved' : 'Save'} onPress={onSave} testID="scene-save" />
          {onShare ? <IconButton icon="share" tier="media" accessibilityLabel="Share" onPress={onShare} testID="scene-share" /> : null}
          <IconButton icon="ellipsis" tier="media" accessibilityLabel="More options" onPress={onMore} testID="scene-more" />
        </View>
      </View>
      <Animated.View
        testID="scene-bar-title"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.title, { top: barTop(insets.top), height: side, left: span.left, right: span.right }, titleStyle]}
      >
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[font('bodyStrong', bold), styles.ink]}>
          {title}
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  ink: { color: COLOR.textPrimary },
})
