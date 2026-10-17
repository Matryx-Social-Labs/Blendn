import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { ContextMenu, type MenuItem } from '../ds/ContextMenu'

/** flow10.js `detail` menu: the page dims to 30% black. */
const DIM = 0.3

/**
 * The page's ⋯ (flow10.js `detail`, `menu`): a column of rows under the top
 * bar's right edge, the page dimmed. Closes on a tap outside and on system back.
 */
export function OverflowMenu({ visible, items, onClose, testID = 'menu' }: { visible: boolean; items: MenuItem[]; onClose: () => void; testID?: string }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose} testID={`${testID}-modal`}>
      <Pressable style={[styles.dim, { paddingTop: insets.top + SIZE.circleButton + SPACE.md }]} onPress={onClose} accessibilityLabel="Close menu">
        <View style={styles.anchor}>
          <ContextMenu
            testID={testID}
            items={items.map((item) => ({
              ...item,
              // Close first, then act: a sheet opened by the action must not be under a menu that is still leaving.
              onPress: () => {
                onClose()
                item.onPress()
              },
            }))}
          />
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: tint(COLOR.ink, DIM), alignItems: 'flex-end', paddingHorizontal: SPACE.lg },
  anchor: { alignItems: 'flex-end' },
})
