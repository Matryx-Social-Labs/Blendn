import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Toggle } from '../ds/Toggle'
import { Sheet } from '../ds/Sheet'
import { font, useAnnounced, useBoldText } from '../ds/shared'
import { apiClient } from '../../lib/apiClient'
import { ALERT_ROWS, type LobbyAlerts } from '../../lib/lobby'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { OPACITY } from '../../lib/theme'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'

/**
 * The Lobby's bell (FLOW-WALK § Flow 4c, decided): two switches for this event only, off until turned on — somebody
 * offers what you are looking for, and the host posts. `GET|PUT /events/:id/board/alerts`, one switch per save, and the
 * server's answer is what shows. The board's `lA-alerts` draws a third, "Someone replies to you"; it was dropped after
 * admin #918 (asks and accepts always push), so the server's `replies` is never shown or sent.
 */
/** `.ltg`: a switch row is 64 at least. */
const ROW_HEIGHT = 64
/** The board's words sit in line boxes 1 taller each side (`alertMatch` is 66 with two lines and a hint). */
const ROW_LINE_BOX = 1

export function LobbyAlertsSheet({ eventId, visible, onClose }: { eventId: string; visible: boolean; onClose: () => void }) {
  const bold = useBoldText()
  const [alerts, setAlerts] = useState<LobbyAlerts | null>(null)
  const [busy, setBusy] = useState<keyof LobbyAlerts | null>(null)
  const [failed, setFailed] = useState(false)
  const failedLine = failed ? (alerts ? 'Couldn’t save that. Try again.' : 'Couldn’t load your alerts. Try again.') : null
  useAnnounced(failedLine)

  useEffect(() => {
    if (!visible) return
    let gone = false
    apiClient
      .getBoardAlerts(eventId)
      .then((r) => {
        if (gone) return
        if (r.success && r.data) setAlerts({ offersMatch: r.data.offersMatch, hostPosts: r.data.hostPosts })
        else setFailed(true)
      })
      .catch((error) => {
        Logger.warn('board', 'alerts read failed', { eventId, error })
        if (!gone) setFailed(true)
      })
    return () => {
      gone = true
    }
  }, [eventId, visible])

  const flip = async (key: keyof LobbyAlerts, next: boolean) => {
    if (!alerts || busy) return
    const was = alerts
    setBusy(key)
    setFailed(false)
    setAlerts({ ...was, [key]: next })
    try {
      const r = await apiClient.setBoardAlerts(eventId, { [key]: next })
      if (r.success && r.data) setAlerts({ offersMatch: r.data.offersMatch, hostPosts: r.data.hostPosts })
      else {
        setAlerts(was)
        setFailed(true)
      }
    } catch (error) {
      Logger.warn('board', 'alerts save failed', { eventId, error })
      setAlerts(was)
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const close = () => {
    setFailed(false)
    onClose()
  }

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Lobby alerts"
      headerAction={{ label: 'Done', onPress: close }}
      body="For this event only. All off until you turn one on."
      testID="lobby-alerts"
    >
      <View style={styles.rows}>
        {ALERT_ROWS.map((row) => (
          <AlertRow
            key={row.key}
            title={row.title}
            hint={row.hint}
            value={alerts?.[row.key] ?? false}
            disabled={!alerts}
            busy={busy === row.key}
            onFlip={(next) => void flip(row.key, next)}
            testID={`lobby-alert-${row.key}`}
          />
        ))}
        {failed ? (
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.failed]}>
            {failedLine}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}

/**
 * One switch (`.ltg`): flat on the sheet, 64 tall, the words beside a 51 pt DS Toggle, a hairline under. The row is the switch
 * (as SettingsRow's is); the Toggle is drawn, not focused. SettingsRow is a card row, inset 16 each side, which the board's
 * sheet is not.
 */
function AlertRow({ title, hint, value, disabled, busy, onFlip, testID }: { title: string; hint: string; value: boolean; disabled: boolean; busy: boolean; onFlip: (next: boolean) => void; testID: string }) {
  const bold = useBoldText()
  const [down, setDown] = useState(false)
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        H.toggle(!value)
        onFlip(!value)
      }}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      disabled={disabled || busy}
      accessibilityRole="switch"
      accessibilityLabel={`${title}, ${hint}`}
      accessibilityState={{ checked: value, disabled, busy }}
      style={[styles.row, disabled && styles.dim]}
    >
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('rowTitle', bold), styles.ink]}>{title}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>{hint}</Text>
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Toggle value={value} disabled={busy} pressed={down} testID={`${testID}-toggle`} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  failed: { color: COLOR.destructive, marginTop: SPACE.sm },
  // `p.sub` keeps 6 under it and the rows' line boxes 1 over and under each row's words (lA-alerts `alertMatch` 66).
  rows: { marginTop: SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: ROW_HEIGHT, paddingVertical: ROW_LINE_BOX, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.hairline },
  words: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  dim: { opacity: OPACITY.disabled },
})
