import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'

import { StateScreen, type StateScreenProps } from '../ds/StateScreen'
import { stateScreenIn } from '../motion/presence'
import { Backdrop, ORB_LEVEL } from '../onboarding/Backdrop'
import { COLOR } from '../../lib/design/tokens'

/**
 * The one system screen (guidelines/flow-15 `sys`): ink with the brand orbs faint behind, a glyph well (or the screen's
 * own mark), a title, one paragraph, a dock. Suspended, a staff account, a deleted one, not found, can't reach,
 * maintenance, update required: all one shape, as `StateScreen` draws it.
 *
 * It arrives as a crossfade over `base` (Flow 15: "replaces the landing or the current screen · base 220 ms · no
 * haptic"), with nothing to rise, so Reduce Motion has nothing to remove. A refusal's `H.error` belongs to whatever asked.
 */
export function SystemScreen(props: Omit<StateScreenProps, 'variant'>) {
  return (
    <View style={styles.root}>
      <Backdrop level={ORB_LEVEL.form} />
      <Animated.View entering={stateScreenIn} style={styles.fill}>
        <StateScreen {...props} variant="screen" />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.ink },
  fill: { flex: 1 },
})
