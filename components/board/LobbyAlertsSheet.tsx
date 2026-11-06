import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { SettingsRow } from '../ds/SettingsRow'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'
import { apiClient } from '../../lib/apiClient'
import { ALERT_ROWS, type LobbyAlerts } from '../../lib/lobby'
import { Logger } from '../../lib/logger'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'

/**
 * The Lobby's bell (FLOW-WALK § Flow 4c, decided): two switches for this event only, off until turned on — somebody
 * offers what you are looking for, and the host posts. `GET|PUT /events/:id/board/alerts`, one switch per save, and the
 * server's answer is what shows. The board's `lA-alerts` draws a third, "Someone replies to you"; it was dropped after
 * admin #918 (asks and accepts always push), so the server's `replies` is never shown or sent.
 */
export function LobbyAlertsSheet({ eventId, visible, onClose }: { eventId: string; visible: boolean; onClose: () => void }) {
  const bold = useBoldText()
  const [alerts, setAlerts] = useState<LobbyAlerts | null>(null)
  const [busy, setBusy] = useState<keyof LobbyAlerts | null>(null)
  const [failed, setFailed] = useState(false)

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
      <View>
        {ALERT_ROWS.map((row) => (
          <SettingsRow
            key={row.key}
            title={row.title}
            hint={row.hint}
            trail="switch"
            value={alerts?.[row.key] ?? false}
            disabled={!alerts}
            busy={busy === row.key}
            onValueChange={(next) => void flip(row.key, next)}
            testID={`lobby-alert-${row.key}`}
          />
        ))}
        {failed ? (
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.failed]}>
            {alerts ? 'Couldn’t save that. Try again.' : 'Couldn’t load your alerts. Try again.'}
          </Text>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  failed: { color: COLOR.destructive, marginTop: SPACE.sm },
})
