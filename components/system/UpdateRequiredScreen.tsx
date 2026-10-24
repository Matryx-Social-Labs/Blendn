import { Linking } from 'react-native'

import { SystemScreen } from './SystemScreen'
import { updateStore } from '../../lib/updateRequired'

/**
 * The server will not talk to this build any more (Flow 15 15.14 · proposal): the store button is the one primary
 * (H.primary), which leaves the app, and there is nothing else to press. It keeps the person signed in: updating is
 * a minute, and nothing is cleared.
 */
export function UpdateRequiredScreen() {
  const store = updateStore()
  return (
    <SystemScreen
      icon="download"
      title="Update Blend’n to keep going"
      body="This version can’t talk to Blend’n any more. The update takes about a minute and keeps you signed in."
      actions={[{ label: store.label, kind: 'primary', onPress: () => void Linking.openURL(store.url).catch(() => {}) }]}
      testID="update-required"
    />
  )
}
