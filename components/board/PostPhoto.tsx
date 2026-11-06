import { Image } from 'expo-image'
import { StyleSheet, Text as RNText, View } from 'react-native'

import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import type { BoardPost } from '../../lib/board'
import { COLOR, ICON as DS_ICON, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { photoView } from '../../lib/lobby'

/**
 * A Lobby post's own photo (C-A), the one image a board surface draws: what somebody chose to show with their words,
 * never a person's face from their profile. It reads `post.photo` through `photoView` alone (https only; pending and
 * turned-down ones reach their author only), and `__tests__/board.test.ts` holds every other board file to no image.
 */

/** `.lp .pic`. */
const PHOTO_HEIGHT = 196
/** A pending photo, to its author: blurred until checked. */
const PENDING_BLUR = MATERIAL.blurRadius

/** The post's one photo: shown, or yours and blurred while it is checked, or yours and turned down. */
export function PostPhoto({ post }: { post: Pick<BoardPost, 'photo' | 'mine'> }) {
  const bold = useBoldText()
  const view = photoView(post.photo, post.mine)
  if (view.kind === 'none') return null
  if (view.kind === 'rejected') {
    return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>Your photo wasn’t approved, so only your words are up.</RNText>
  }
  const pending = view.kind === 'pending'
  return (
    <View style={styles.photoWrap}>
      <View style={styles.photo}>
        <Image
          source={{ uri: view.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={pending ? PENDING_BLUR : 0}
          accessible
          accessibilityRole="image"
          accessibilityLabel={view.alt}
        />
        {pending ? (
          <View style={styles.checking}>
            <Icon name="clock" size={DS_ICON.inline} color={COLOR.textPrimary} />
            <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.ink]}>Checking your photo</RNText>
          </View>
        ) : null}
      </View>
      {pending ? (
        <View style={styles.photoNote}>
          <Icon name="eye-off" size={DS_ICON.inline} color={COLOR.textSecondary} />
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary, styles.footerLine]}>Only you can see the photo until it’s checked.</RNText>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  footerLine: { flex: 1 },
  photoWrap: { gap: SPACE.sm, marginTop: SPACE.xxs },
  photo: { height: PHOTO_HEIGHT, borderRadius: RADIUS.rowInCard, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
  checking: { position: 'absolute', left: SPACE.md, bottom: SPACE.md, height: 28, paddingHorizontal: SPACE.sm + SPACE.xxs, borderRadius: RADIUS.capsule, backgroundColor: MATERIAL.scrimPill, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },
  photoNote: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs + SPACE.xxs },
})
