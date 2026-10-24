import { router } from 'expo-router'
import { StyleSheet, Text } from 'react-native'

import { COLOR, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { font, useBoldText } from '../ds/shared'
import { SettingsRow } from '../ds/SettingsRow'

/**
 * "Make a crew · from your friends" (Flow 6 R4.1 Friends · Make a crew from the list): a settings row under Friend requests
 * that opens the Make a crew sheet over Friends (`/crews/new`: a sheet on the screen beneath it, three steps, friends only).
 * One `SettingsRow`; the caller puts it in a `SettingsGroup`. Drawn once there is anybody to make a crew with, so the
 * row never opens a picker that can only say "Add friends first". No haptic: it opens a sheet.
 */
export function MakeCrewRow() {
  const bold = useBoldText()
  return (
    <SettingsRow
      testID="make-crew-row"
      icon="users-round"
      title="Make a crew"
      label="Make a crew, from your friends"
      accessory={<Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.meta]}>from your friends</Text>}
      trail="chevron"
      onPress={() => router.push('/crews/new')}
    />
  )
}

const styles = StyleSheet.create({ meta: { color: COLOR.textSecondary } })
