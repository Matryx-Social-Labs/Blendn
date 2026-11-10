import { Linking } from 'react-native'

import { SystemScreen } from './SystemScreen'
import { useToast } from '../Toast'
import { updateStore } from '../../lib/updateRequired'

/**
 * The server will not talk to this build any more (Flow 15 15.14 · proposal): the store button is the one primary
 * (H.primary), which leaves the app, and there is nothing else to press. It keeps the person signed in: updating is
 * a minute, and nothing is cleared.
 */
export function UpdateRequiredScreen() {
  const store = updateStore()
  const { showToast } = useToast()
  // The only button here: when the store doesn't open, say what to do instead of nothing (M23).
  const open = () => void Linking.openURL(store.url).catch(() => showToast('The store didn’t open. Update Blend’n from it when you can.', 'info'))
  return (
    <SystemScreen
      icon="download"
      title="Update Blend’n to keep going"
      body="This version can’t talk to Blend’n any more. The update takes about a minute and keeps you signed in."
      actions={[{ label: store.label, kind: 'primary', onPress: open }]}
      testID="update-required"
    />
  )
}
