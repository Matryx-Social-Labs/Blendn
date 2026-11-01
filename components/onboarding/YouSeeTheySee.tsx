import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import { useBoldText } from '../ds/shared'
import { monoCaption } from '../ds/MonoFamily'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * The main photo twice (direction A): as you see it, and blurred, as a viewer who cannot see who you are yet sees the stored
 * derivative (`blurPhoto`, docs/API.md). The derivative is made when the photo is saved, so this blurs the same photo on the
 * phone to the same look: the server's copy is 40 px wide, which drawn at this size is about this radius.
 */
const BLUR_RADIUS = 24
const RATIO = 4 / 3

export function YouSeeTheySee({ uri }: { uri: string }) {
  const bold = useBoldText()
  return (
    <View
      testID="media-you-they"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Your photo, and how it looks to people before you show who you are: blurred"
      style={styles.root}
    >
      <View style={styles.pair}>
        <Image testID="media-you-see" source={{ uri }} contentFit="cover" style={styles.photo} />
        <Image testID="media-they-see" source={{ uri }} contentFit="cover" blurRadius={BLUR_RADIUS} style={styles.photo} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[monoCaption(bold), styles.caption]}>
        You see · They see
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACE.sm, alignItems: 'center' },
  pair: { flexDirection: 'row', gap: SPACE.md, alignSelf: 'stretch' },
  photo: { flex: 1, aspectRatio: 1 / RATIO, borderRadius: RADIUS.card, backgroundColor: COLOR.surface },
  caption: { color: COLOR.textSecondary, textTransform: 'uppercase' },
})
