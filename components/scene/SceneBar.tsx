import { useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Animated, { interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { IconButton } from '../ds/IconButton'
import { font, useBoldText } from '../ds/shared'
import { Material } from '../ui/Material'
import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'

/** DS #30: the glass materialises at 8 pt of scroll (never animated opacity); the small title crossfades from 24 to 56. */
const GLASS_AT = SPACE.sm
const TITLE_FROM = 24
const TITLE_TO = 56
/** Reduce Motion: no crossfade, the small title swaps at this offset. */
const TITLE_SWAP = 40

const circle = () => (Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton)

/** The bar's height: the status bar, then the circles with 8 pt above and below. */
export const sceneBarHeight = (top: number) => top + SPACE.sm + circle() + SPACE.sm

export type SceneBarProps = {
  /** The event's name: it crossfades in as the hero's own title scrolls away. */
  title: string
  saved: boolean
  onBack: () => void
  onSave: () => void
  onShare: () => void
  onMore: () => void
  /** The page's `contentOffset.y`, from a worklet scroll handler; absent, the bar stays at rest. */
  scrollY?: SharedValue<number>
}

/**
 * The Scene's top chrome (Flow 3 `scene`, DS TopBar and IconButton): back on the left; the heart, the share and the
 * ⋯ on the right, 44 pt iOS · 48 dp Android `media` circles, 8 pt apart, over the hero's head scrim. Scrolled, the
 * glass bar mounts behind them at 8 pt (#30: mounted, never faded) and the event's name crossfades in between 24 and
 * 56 pt. The heart is the one toggle: white disc and ink glyph when saved, `H.select` through the IconButton.
 *
 * One bar, first in the tree, so a screen reader reaches Back before the page.
 */
export function SceneBar({ title, saved, onBack, onSave, onShare, onMore, scrollY }: SceneBarProps) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const android = Platform.OS === 'android'
  const [glass, setGlass] = useState(false)

  useAnimatedReaction(
    () => (scrollY ? scrollY.get() > GLASS_AT : false),
    (on, was) => {
      if (on !== was) scheduleOnRN(setGlass, on)
    },
    [scrollY]
  )
  const titleStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.get() : 0
    return { opacity: reduceMotion ? (y > TITLE_SWAP ? 1 : 0) : interpolate(y, [TITLE_FROM, TITLE_TO], [0, 1], 'clamp') }
  })

  const height = sceneBarHeight(insets.top)
  const side = circle()
  // The small title keeps clear of the three circles on the right (the widest side).
  const inset = SPACE.lg + 3 * side + 2 * SPACE.sm + SPACE.md
  return (
    <View testID="scene-bar" pointerEvents="box-none" style={[styles.bar, { height, paddingTop: insets.top + SPACE.sm }]}>
      {glass ? <Material role="bar" testID="scene-bar-glass" pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
      <View pointerEvents="box-none" style={styles.row}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} tier="media" accessibilityLabel="Back" onPress={onBack} testID="scene-back" />
        <View pointerEvents="box-none" style={styles.actions}>
          <IconButton icon="heart" tier="media" selected={saved} accessibilityLabel={saved ? 'Saved' : 'Save'} onPress={onSave} testID="scene-save" />
          <IconButton icon="share" tier="media" accessibilityLabel="Share" onPress={onShare} testID="scene-share" />
          <IconButton icon="ellipsis" tier="media" accessibilityLabel="More options" onPress={onMore} testID="scene-more" />
        </View>
      </View>
      <Animated.View
        testID="scene-bar-title"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.title, { top: insets.top + SPACE.sm, height: side, left: inset, right: inset }, titleStyle]}
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
