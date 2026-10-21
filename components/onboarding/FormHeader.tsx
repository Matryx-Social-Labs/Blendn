import { barTop } from '../../lib/barGeometry'
import { router } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from '../ds/IconButton'
import { Lockup } from './Lockup'
import { SIZE, SPACE } from '../../lib/design/tokens'

/**
 * The top of the email forms (Flow 1 sign-in, forgot password): the back circle on the left, the 40 pt lockup centred on the
 * page. Back is `arrow-left` on Android and `chevron-left` on iOS, as the design system's TopBar draws it. The lockup is
 * decorative; the screen's own words say what it is for.
 */
export function FormHeader({ testID }: { testID?: string }) {
  const insets = useSafeAreaInsets()
  const android = Platform.OS === 'android'
  return (
    <View testID={testID} style={[styles.header, { paddingTop: barTop(insets.top) }]}>
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
