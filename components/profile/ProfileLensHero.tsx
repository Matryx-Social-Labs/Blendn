import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { font, useBoldText, useSelection } from '../ds/shared'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

/** `pA-page`'s hero: the 120 face. */
const FACE = 120
/** The face's lit rim (`.xhero2 .gl`): the hue's edge at 60%. The board's outer glow has no DS token, so it is not drawn (C1's call). */
const RIM = 0.6
const RIM_WIDTH = 1.5
// design-exception: 28/34 −0.4, the board's profile name (`.xhero2 b`); `display` is 34/40 and `title` 24/30
const NAME = { fontSize: 28, lineHeight: 34, letterSpacing: -0.4 }
// design-exception: 15/22, the board's line under the name (`.xhero2 span`); `control` is 15/20
const META = { fontSize: 15, lineHeight: 22 }

export type ProfileLensHeroProps = {
  /** Their photo once they have shown you who they are (`pA-page-named`); else the room's creature for `seed`. */
  photo: string | null
  /** The room's seed rule (`markSeed`), never a user id. */
  seed: string
  /** The pseudonym, or their first name once shown. */
  name: string
  /** "Anonymous · 31" or "Shown to you · 31" (`metaLine`). */
  meta: string
  testID?: string
}

/**
 * The full profile page opened from a room (Flow 5 P-A, `pA-page` / `pA-page-named`): the face centred and lit, the
 * name, and whether they have shown you who they are. What follows is the room's lens (`LensBlocks`).
 */
export function ProfileLensHero({ photo, seed, name, meta, testID }: ProfileLensHeroProps) {
  const bold = useBoldText()
  const sel = useSelection()
  return (
    <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={`${name}, ${meta.replace(/ · /g, ', ')}`} style={styles.hero}>
      <View>
        {photo ? <Avatar kind="photo" uri={photo} size={FACE} /> : <Avatar kind="creature" pseudonym={seed} size={FACE} />}
        {/* Outside the face, as the board's box-shadow is: it takes no room, so the face stays 120. */}
        <View pointerEvents="none" style={[styles.rim, { borderColor: tint(sel.edge, RIM) }]} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={[font('title', bold), NAME, styles.name]}>
        {name}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('control', bold, FONT_FAMILY.brand[400]), META, styles.meta]}>
        {meta}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: SPACE.md },
  rim: { position: 'absolute', top: -RIM_WIDTH, right: -RIM_WIDTH, bottom: -RIM_WIDTH, left: -RIM_WIDTH, borderRadius: FACE, borderWidth: RIM_WIDTH },
  name: { color: COLOR.textPrimary, textAlign: 'center' },
  meta: { color: COLOR.textSecondary, textAlign: 'center' },
})
