import { StyleSheet, View } from 'react-native'

import { COLOR, RADIUS } from '../../lib/design/tokens'
import { Icon } from '../ui/Icon'
import { CrewEmblem } from './CrewEmblem'

/** A crew's emblem, or, when its seed isn't known yet (the socket sends none), the crew glyph on its square: never a wrong emblem. */
export function CrewFace({ seed, size, testID }: { seed: string | null; size: number; testID?: string }) {
  if (seed) return <CrewEmblem seed={seed} size={size} testID={testID} />
  return (
    <View testID={testID && `${testID}-glyph`} style={[styles.square, { width: size, height: size }]}>
      <Icon name="users" size={Math.round(size / 2)} color={COLOR.textSecondary} />
    </View>
  )
}

const styles = StyleSheet.create({
  square: { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.thumb, backgroundColor: COLOR.surface },
})
