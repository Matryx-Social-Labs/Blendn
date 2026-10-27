import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { PhotoScrim } from '../ui/GradientFill'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'

/** Flow 6 `memoryTile`: 140 tall, the ink fade over its lower 60%. */
export const MEMORY_HEIGHT = 140
const FADE = '60%'

/**
 * A night you went to, as a photo tile in Nights out (Flow 6 `me`): the cover fills the tile at radius 24, the ink fade carries the
 * words at its foot, the day above the title. With no cover it is a `surface` tile with a calendar glyph, so a row of mixed tiles
 * lines up. The glyph is centred in the room above the words, in the flow, not over the whole tile: centred over the tile, a
 * two-line title brought the day up through it (RC drive 3, "THU 22 OCT" under the glyph). Both lines stop at the control cap, so
 * the words at their tallest leave the glyph its room at every text size (__tests__/memoryTile.test.tsx). Fills the width its grid gives it; a tap
 * opens the event, silently.
 */
function MemoryTileImpl({ title, imageUrl, when, onPress, testID }: { title: string; imageUrl: string | null; when: string; onPress: () => void; testID?: string }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  return (
    <ScalePress
      testID={testID}
      onPress={onPress}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${when}`}
      accessibilityHint="Opens the event"
      style={styles.tile}
    >
      {imageUrl ? (
        <OptimizedImage source={imageUrl} recyclingKey={imageUrl} style={StyleSheet.absoluteFill as never} width={SPACE.xxxl * 4} height={MEMORY_HEIGHT} contentFit="cover" />
      ) : (
        <View testID={testID && `${testID}-blank`} style={styles.blank}>
          <Icon name="calendar-check" size={ICON.nav} color={COLOR.textTertiary} />
        </View>
      )}
      <PhotoScrim contrast={contrast} pointerEvents="none" style={styles.fade} />
      <View testID={testID && `${testID}-words`} style={styles.words}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('label', bold), styles.ink]}>
          {when}
        </Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
          {title}
        </Text>
      </View>
    </ScalePress>
  )
}

export const MemoryTile = memo(MemoryTileImpl)

const styles = StyleSheet.create({
  tile: { height: MEMORY_HEIGHT, borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface, justifyContent: 'flex-end' },
  blank: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE },
  words: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
})
