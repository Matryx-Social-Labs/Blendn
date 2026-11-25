import { barTop } from '../../lib/barGeometry'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, RADIUS, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { Material, useMapInk } from '../ui/Material'

/** Frame `1141:4819`: the bar is 64 tall, below the status bar. */
export const TOP_BAR_HEIGHT = 64

const WORDMARK = 'Blend’n'

/**
 * The Pulse's top bar, floating over the map (Flow 3 `home`): the wordmark as a glass capsule (44 pt iOS · 48 dp
 * Android, 700 20/24) 16 pt in from each edge, the bell (`actions`) beside it as a glass circle. It occupies no layout.
 *
 * The opaque `ink` band with a Plus Jakarta wordmark it grew out of had no caller left and was deleted
 * (`__tests__/retiredDesign.test.ts`). `floating` is the only bar, so the one caller still says so.
 *
 * `pointerEvents` is `box-none`, so the bell is tappable while the gaps pass touches through to the map.
 */
export function PulseTopBar({ actions }: { floating: true; actions?: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const mapInk = useMapInk()

  return (
    <View style={[styles.bar, { paddingTop: barTop(insets.top), height: insets.top + TOP_BAR_HEIGHT }]} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <Material role="control" testID="pulse-wordmark-capsule" style={[styles.capsule, mapInk]}>
          <Text style={styles.wordmark} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {WORDMARK}
          </Text>
        </Material>
        <View style={styles.actions} pointerEvents="box-none">
          {actions}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Edge to edge: without left/right the absolute bar shrinks to its content and the bell slides in beside the wordmark.
  bar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'transparent' },
  // The capsule and the bell start at the safe-area top (Flow 3 `home`: top 62 under a 59 pt status bar), not centred in the band under it.
  row: {
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  capsule: {
    height: Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.capsule,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wordmark: { ...TYPE.heading, color: COLOR.textPrimary },
})
