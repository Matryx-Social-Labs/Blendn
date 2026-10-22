import { barTop } from '../../lib/barGeometry'
import { router } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '../ds/IconButton'
import { Material } from '../ui/Material'
import { Lockup } from './Lockup'
import { SIZE, SPACE } from '../../lib/design/tokens'

/**
 * The top of the email forms (Flow 1 sign-in, forgot password): the back circle on the left, the 40 pt lockup centred on the
 * page. Back is `arrow-left` on Android and `chevron-left` on iOS, as the design system's TopBar draws it. The lockup is
 * decorative; the screen's own words say what it is for.
 *
 * `scrolled`: the form has moved under it, so it wears the bar's material, mounted rather than faded (glass fades wrong,
 * §5.2). Without it the fields were sliced on a bare line under the lockup, glyph tops and all (r7 M11).
 */
export function FormHeader({ testID, scrolled = false }: { testID?: string; scrolled?: boolean }) {
  const insets = useSafeAreaInsets()
  const android = Platform.OS === 'android'
  return (
    <View testID={testID} style={[styles.header, { paddingTop: barTop(insets.top) }]}>
      {scrolled ? <Material role="bar" testID={testID && `${testID}-bar`} pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.row, { minHeight: android ? SIZE.circleButtonAndroid : SIZE.circleButton }]}>
        <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={() => router.back()} testID={testID && `${testID}-back`} />
        <View pointerEvents="none" style={styles.lockup}>
          <Lockup size="form" />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm },
  row: { justifyContent: 'center', alignItems: 'flex-start' },
  lockup: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})
