import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { type AnimatedProps } from 'react-native-reanimated'

import { Button } from '../ds/Button'
import { UploadRing } from '../ds/ChatBubble'
import { ScrimPill, monoCaption } from '../ds/MonoFamily'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useSelection, useAnnounced } from '../ds/shared'
import { OptimizedImage } from '../OptimizedImage'
import { Icon } from '../ui/Icon'
import type { PhotoTile as Tile } from './photoTiles'
import { COLOR, ICON, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'

/** The main photo's height, as a multiple of a half-width slot (Flow 2 media). */
export const MAIN_RATIO = 1.55
/** The remove badge is 24 pt, reached by slop to the target. */
const REMOVE = 24
/**
 * A photo moderation took down (Flow 2 · 2.3 #19, C13): an empty tile with the shield glyph, nothing of the photo left. Tapping
 * it adds a different one; the × clears it. A screen reader hears why it is empty.
 */
export function PulledPhotoTile({ slot, onAdd, onDismiss, disabled = false }: { slot: number; onAdd: () => void; onDismiss: () => void; disabled?: boolean }) {
  const contrast = useIncreaseContrast()
  return (
    <View testID="photo-tile-pulled" style={[styles.tile, styles.pulled, { width: slot, height: slot }, contrast && IC_HAIRLINE]}>
      <Pressable
        onPress={onAdd}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Removed. This photo didn’t meet the photo rules. Add a different photo"
        accessibilityState={{ disabled }}
        style={[StyleSheet.absoluteFill, styles.pulledWell]}
      >
        <Icon name="shield" size={ICON.nav} color={COLOR.textSecondary} />
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={SPACE.md}
        accessibilityRole="button"
        accessibilityLabel="Dismiss removed photo"
        style={[styles.remove, contrast && IC_HAIRLINE]}
      >
        <Icon name="x" size={ICON.inline} color={COLOR.textPrimary} />
      </Pressable>
    </View>
  )
}

/** A photo that is not on the server yet is shown at 45%, under its ring or its Retry. */
const IN_FLIGHT_OPACITY = 0.45

/**
 * One photo in the grid (Flow 2 media 02 to 05): the picture; the main one large with a white ring and "Main photo", the
 * others "Make main"; a determinate ring and its percentage while it uploads; "Didn't upload" with Retry when it did not
 * get there; and Remove at the corner. A tile still on its way has no label pill and cannot be made main.
 *
 * A photo moderation took down is `PulledPhotoTile`, beside these.
 */
export function PhotoTile({
  tile,
  index,
  slot,
  onMakeMain,
  onRemove,
  onRetry,
  retryDisabled = false,
  animation,
}: {
  tile: Tile
  index: number
  /** A half-width slot, in points. */
  slot: number
  onMakeMain: () => void
  onRemove: () => void
  onRetry: () => void
  retryDisabled?: boolean
  animation?: Pick<AnimatedProps<object>, 'layout' | 'exiting' | 'entering'>
}) {
  useAnnounced(tile.state === 'failed' ? `Photo ${index + 1} didn’t upload` : null)
  const bold = useBoldText()
  const sel = useSelection()
  const contrast = useIncreaseContrast()
  const primary = index === 0
  const ready = tile.state === 'ready'
  const height = primary ? Math.round(slot * MAIN_RATIO) : slot
  const label =
    tile.state === 'uploading'
      ? `Photo ${index + 1}, uploading`
      : tile.state === 'failed'
        ? `Photo ${index + 1} didn’t upload`
        : primary
          ? 'Your main photo'
          : `Make photo ${index + 1} your main photo`

  return (
    <Animated.View {...animation} testID={`photo-tile-${index}`} style={[styles.tile, { height }, primary ? styles.main : { width: slot }, primary && styles.chosen, primary && { borderColor: sel.edge }]}>
      {/* "Make main" moves the photo to the front and grows it; the ring on the main one, in the screen's hue, is the third signal, after size and the label. */}
      <Pressable
        onPress={onMakeMain}
        disabled={primary || !ready}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={StyleSheet.absoluteFill}
      >
        <OptimizedImage
          source={tile.state === 'ready' ? tile.url : tile.uri}
          style={ready ? styles.photo : [styles.photo, styles.photoDim]}
          width={slot}
          height={slot}
          contentFit="cover"
        />
      </Pressable>

      {tile.state === 'uploading' ? (
        <>
          <UploadRing progress={tile.progress} label="Uploading photo" />
          <View pointerEvents="none" style={styles.percent}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[monoCaption(bold), styles.ink]}>{`${Math.round(tile.progress * 100)}%`}</Text>
          </View>
        </>
      ) : null}

      {tile.state === 'failed' ? (
        <View style={styles.failed} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Icon name="circle-alert" size={ICON.nav} color={COLOR.textPrimary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink]}>Didn’t upload</Text>
          <Button label="Retry" kind="lit" size="sm" onPress={onRetry} disabled={retryDisabled} testID={`photo-retry-${index}`} style={styles.centred} />
        </View>
      ) : null}

      {ready ? (
        <View pointerEvents="none" style={primary ? styles.tagTop : styles.tagBottom}>
          <ScrimPill>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.ink]}>{primary ? 'Main photo' : 'Make main'}</Text>
          </ScrimPill>
        </View>
      ) : null}

      {/* Remove is its own hit target now that tapping the photo means "make this the main one". */}
      <Pressable
        onPress={onRemove}
        hitSlop={SPACE.md}
        accessibilityRole="button"
        accessibilityLabel={`Remove photo ${index + 1}`}
        style={[styles.remove, contrast && IC_HAIRLINE]}
      >
        <Icon name="x" size={ICON.inline} color={COLOR.textPrimary} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  pulled: { borderWidth: 1, borderColor: COLOR.hairlineStrong },
  pulledWell: { alignItems: 'center', justifyContent: 'center' },
  tile: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface, overflow: 'hidden' },
  main: { width: '100%' },
  chosen: { borderWidth: SPACE.xxs },
  photo: { width: '100%', height: '100%' },
  photoDim: { opacity: IN_FLIGHT_OPACITY },
  percent: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: SIZE.circleButton / 2 + SPACE.sm, alignItems: 'center' },
  failed: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, padding: SPACE.md },
  ink: { color: COLOR.textPrimary, textAlign: 'center' },
  tagTop: { position: 'absolute', left: SPACE.md, top: SPACE.md },
  tagBottom: { position: 'absolute', left: SPACE.md, bottom: SPACE.md },
  remove: {
    position: 'absolute',
    right: SPACE.md - SPACE.xxs,
    top: SPACE.md - SPACE.xxs,
    width: REMOVE,
    height: REMOVE,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.scrim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
