import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { barCircleBottom } from '../../lib/barGeometry'
import { MODAL_FADE_MS, useQueuedModal } from '../../lib/modalTurn'
import { COLOR, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { ContextMenu, type MenuItem } from '../ds/ContextMenu'

/** flow10.js `detail` menu: the page dims to 30% black. */
const DIM = 0.3

/**
 * The page's ⋯ (flow10.js `detail`, `menu`; flow9.js `screen`): a column of rows under the top
 * bar's right edge, the page dimmed. Closes on a tap outside and on system back.
 *
 * It starts a little under the circle row, as the frames draw it (112 under circles that end at 106 on iOS, 116
 * under 114 on Android): `barCircleBottom` plus that gap, so it follows the bar wherever the bar goes.
 * design-exception: the gap is 6 pt on iOS and 2 dp on Android in the frames; `SPACE.xs + SPACE.xxs` and `SPACE.xxs` are those.
 */
const MENU_GAP = Platform.OS === 'android' ? SPACE.xxs : SPACE.xs + SPACE.xxs
export function OverflowMenu({ visible, items, onClose, testID = 'menu' }: { visible: boolean; items: MenuItem[]; onClose: () => void; testID?: string }) {
  const insets = useSafeAreaInsets()
  // One Modal on screen at a time on iOS (lib/modalTurn): the sheet an item opens waits for this menu to have gone.
  const turn = useQueuedModal(visible, { animationMs: MODAL_FADE_MS, closeForLink: onClose })
  return (
    <Modal
      visible={turn.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={turn.onShow}
      onDismiss={turn.onDismiss}
      testID={`${testID}-modal`}
    >
      <Pressable style={[styles.dim, { paddingTop: barCircleBottom(insets.top, Platform.OS === 'android') + MENU_GAP }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
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
