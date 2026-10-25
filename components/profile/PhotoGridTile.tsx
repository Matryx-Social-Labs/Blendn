import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { Spinner } from '../ds/Loader'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, PRESSED_WASH, ROOMY_FONT_SCALE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'

/*
 * The faces a tile in Edit profile's photo grid wears (Flow 6 edit 01 · 03 · 04 · 05 · 06): a photo, one on its way up with its
 * progress, one that did not get there with Retry, one moderation took down, and the empty slot that adds. Each fills the tile it is
 * given (radius 16 on `surfaceSunken`); where a tile sits and how it moves is the grid's (`PhotoManager`).
 */

/** Flow 6 edit: the × is a 28 pt disc; its target is reached by slop. */
const REMOVE = 28
/** The upload's bar along the tile's foot (the frame's 3 pt). */
// design-exception: the frame's progress bar is 3 pt
const BAR = 3
const FAIL_EDGE_ALPHA = 0.5
/** Flow 6 edit 06: the blurred tile is `blur(14px)`. */
const BLUR = 14

const tile = StyleSheet.create({
  base: { ...StyleSheet.absoluteFill, borderRadius: RADIUS.rowInCard, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  centre: { alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, padding: SPACE.sm },
  fail: { borderWidth: 1, borderColor: tint(COLOR.destructive, FAIL_EDGE_ALPHA) },
  // The frame's hairline round an empty tile: nothing of the photo is left, and nothing red either (a removal, not an error).
  pulled: { borderWidth: 1, borderColor: COLOR.hairlineStrong },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLOR.hairlineStrong },
  ink: { color: COLOR.textPrimary, textAlign: 'center' },
  fill: { width: '100%', height: '100%' },
})

/** A photo in the grid: the picture, "Main" on the first, and the × (with its 44 pt reach). */
export function PhotoFace({
  uri,
  label,
  main,
  blurred = false,
  onRemove,
  removeLabel,
  removeDisabled,
  actions,
  onAction,
}: {
  uri: string
  /** What a screen reader says of the picture ("Photo 2 of 3"). */
  label: string
  main: boolean
  /** "Blurred for others" (Flow 6 edit 06): shown blurred, with the note. */
  blurred?: boolean
  onRemove: () => void
  removeLabel: string
  removeDisabled: boolean
  /** What a screen reader can do with the tile in place of dragging it: move it, make it main. */
  actions?: { name: string; label: string }[]
  onAction?: (name: string) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const slop = Math.max(0, (minTarget() - REMOVE) / 2)
  // Past the roomy scale "Main" and the × met in the top band of a 150 pt tile (D-M8): Main goes to the bottom-left, above
  // the blurred note when there is one.
  const low = useWindowDimensions().fontScale > ROOMY_FONT_SCALE
  return (
    <View style={tile.base}>
      <Image
        source={{ uri }}
        style={tile.fill}
        accessible={false}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        blurRadius={blurred ? BLUR : 0}
      />
      {/* The picture is one element of its own: the × beside it stays reachable, and dragging has its actions. */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityActions={actions}
        onAccessibilityAction={(e) => onAction?.(e.nativeEvent.actionName)}
        style={StyleSheet.absoluteFill}
      />
      {main ? (
        <View testID="tile-main" pointerEvents="none" style={[styles.main, low ? (blurred ? styles.mainAboveNote : styles.mainLow) : styles.mainTop]}>
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), styles.mainText]}>
            Main
          </Text>
        </View>
      ) : null}
      {blurred ? (
        <View testID="tile-blur-note" pointerEvents="none" style={styles.blurNote}>
          <Icon name="eye-off" size={ICON.inline} color={COLOR.textPrimary} />
          <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), tile.ink]}>
            Blurred for others
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={onRemove}
        disabled={removeDisabled}
        hitSlop={slop}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        accessibilityState={{ disabled: removeDisabled }}
        style={[styles.remove, contrast && IC_HAIRLINE]}
      >
        <Icon name="x" size={ICON.inline} color={COLOR.textPrimary} active />
      </Pressable>
    </View>
  )
}

/** A photo on its way (Flow 6 edit 03): a spinner, and the bar along the foot filling as it goes. */
export function UploadingFace({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <View
      testID="tile-uploading"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Uploading photo"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[tile.base, tile.centre]}
    >
      <Spinner size={20} />
      <View style={[styles.bar, { width: `${clamped * 100}%` }]} />
    </View>
  )
}

/** A photo that did not get there (Flow 6 edit 04): the whole tile is Retry. */
export function FailedFace({ onRetry, disabled }: { onRetry: () => void; disabled: boolean }) {
  const bold = useBoldText()
  return (
    <Pressable
      testID="tile-failed"
      onPress={onRetry}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Didn’t upload. Retry"
      accessibilityState={{ disabled }}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={[tile.base, tile.centre, tile.fail]}
    >
      <Icon name="refresh-cw" size={ICON.control} color={COLOR.textPrimary} />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold), tile.ink]}>
        Didn’t upload · Retry
      </Text>
    </Pressable>
  )
}

/**
 * A photo moderation took down (Flow 6 · 6.3 #13, C13): an empty tile with the shield glyph, nothing of the photo left and no
 * words on it (the approved tile said "Removed · didn't meet the photo rules"; Me and the notes under the grid say why). Its ×
 * clears the slot; with `onReplace` the tile itself is the way to put a different photo in its place. The picture and the ×
 * are separate elements, so a screen reader reaches both, and the reader's label still says what happened.
 */
export function PulledFace({
  onRemove,
  removeLabel,
  removeDisabled,
  onReplace,
}: {
  onRemove: () => void
  removeLabel: string
  removeDisabled: boolean
  onReplace?: () => void
}) {
  const slop = Math.max(0, (minTarget() - REMOVE) / 2)
  const why = 'Removed. This photo didn’t meet the photo rules'
  return (
    <View testID="tile-pulled" style={[tile.base, tile.pulled]}>
      <Pressable
        testID="tile-pulled-replace"
        onPress={onReplace}
        disabled={!onReplace || removeDisabled}
        accessible
        accessibilityRole={onReplace ? 'button' : undefined}
        accessibilityLabel={onReplace ? `${why}. Add a different photo` : why}
        accessibilityState={{ disabled: !!onReplace && removeDisabled }}
        android_ripple={onReplace ? { color: PRESSED_WASH.android } : undefined}
        style={[StyleSheet.absoluteFill, tile.centre]}
      >
        <Icon name="shield" size={ICON.nav} color={COLOR.textSecondary} />
      </Pressable>
      <Pressable onPress={onRemove} disabled={removeDisabled} hitSlop={slop} accessibilityRole="button" accessibilityLabel={removeLabel} style={styles.remove}>
        <Icon name="x" size={ICON.inline} color={COLOR.textPrimary} active />
      </Pressable>
    </View>
  )
}

/** The empty slot: a dashed outline and a plus. Tapping any of them adds the next photo. */
export function AddFace({ onPress, disabled, busy, label, accessible = true }: { onPress: () => void; disabled: boolean; busy: boolean; label?: string; accessible?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessible={accessible}
      // Out of the reading order on Android too: TalkBack still lands on a clickable view that is only `accessible={false}`,
      // and reads it with no name (audit L8; the first slot carries the one Add).
      importantForAccessibility={accessible ? 'auto' : 'no'}
      accessibilityRole={accessible ? 'button' : undefined}
      accessibilityLabel={accessible ? label : undefined}
      accessibilityState={{ disabled, busy }}
      android_ripple={{ color: PRESSED_WASH.android }}
      style={[tile.base, tile.centre, tile.dashed]}
    >
      <Icon name="plus" size={ICON.nav} color={COLOR.textSecondary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  main: { position: 'absolute', left: SPACE.sm, height: SPACE.xl, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, backgroundColor: COLOR.textPrimary, justifyContent: 'center' },
  mainTop: { top: SPACE.sm },
  mainLow: { bottom: SPACE.sm },
  mainAboveNote: { bottom: SPACE.sm + SPACE.xl + SPACE.xs },
  mainText: { color: COLOR.ink },
  blurNote: { position: 'absolute', left: SPACE.sm, bottom: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, height: SPACE.xl, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.capsule, backgroundColor: COLOR.scrim },
  remove: {
    position: 'absolute',
    top: SPACE.xs + SPACE.xxs,
    right: SPACE.xs + SPACE.xxs,
    width: REMOVE,
    height: REMOVE,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { position: 'absolute', left: 0, bottom: 0, height: BAR, backgroundColor: COLOR.textPrimary },
})
