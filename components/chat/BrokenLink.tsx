import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'

import { COLOR } from '../../lib/design/tokens'
import { StateScreen } from '../ds/StateScreen'

/** A chat link whose id is not one the server could have made (`lib/routeParams.ts`): nothing loads, Back. */
export function BrokenLink() {
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chat'))
  return (
    <View style={styles.screen}>
      <StateScreen variant="screen" icon="link-2-off" title="This link doesn’t work" body="It doesn’t lead to a chat." actions={[{ label: 'Back', onPress: back }]} testID="chat-broken-link" />
    </View>
  )
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: COLOR.ink } })
