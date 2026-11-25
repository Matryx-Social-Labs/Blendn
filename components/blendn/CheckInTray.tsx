import { useCallback, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE } from '../../lib/design/tokens'
import type { ShowTray, TrayButton, TrayExtra } from '../../lib/locationFix'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'

export type Tray = { visible: boolean; title: string; message: string; buttons: TrayButton[]; extra?: TrayExtra }
const NO_TRAY: Tray = { visible: false, title: '', message: '', buttons: [] }

/** The check-in's trays (the server's refusals, a weak fix, a timeout): one state and one sheet for every door that runs the hold. */
export function useCheckInTray() {
  const [tray, setTray] = useState<Tray>(NO_TRAY)
  const closeTray = useCallback(() => setTray((t) => ({ ...t, visible: false })), [])
  const showTray: ShowTray = useCallback(
    (title, message, buttons, extra) =>
      setTray({ visible: true, title, message, buttons: buttons?.length ? buttons : [{ label: 'Close', kind: 'secondary', onPress: closeTray }], extra }),
    [closeTray]
  )
  return { tray, showTray, closeTray }
}

export function CheckInTray({ tray, onClose, testID }: { tray: Tray; onClose: () => void; testID: string }) {
  const bold = useBoldText()
  return (
    <Sheet
      visible={tray.visible}
      onClose={onClose}
      title={tray.title}
      body={tray.message}
      icon={tray.extra?.icon}
      actions={tray.buttons.map((b) => ({ label: b.label, onPress: b.onPress, loading: b.loading, disabled: b.disabled, kind: b.kind ?? (b.variant === 'primary' ? 'primary' : b.variant === 'destructive' ? 'destructive' : 'secondary') }))}
      testID={testID}
    >
      {tray.extra?.detail ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), styles.secondary]}>{tray.extra.detail}</Text> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({ secondary: { color: COLOR.textSecondary } })
