import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { badgeLabel } from '../../lib/notificationFormat'
import { subscribeToBell } from '../../lib/socketClient'
import { EMBER, ICON, SPACE } from '../../lib/theme'
import { Badge } from '../ds/MonoFamily'
import { Material } from '../ui/Material'
import { COLOR, SIZE, SPACE as DS_SPACE } from '../../lib/design/tokens'
import ScalePress from '../motion/ScalePress'

/**
 * The bell in The Pulse's top bar — frame `1141:4819`'s right glyph. It opens the Notifications screen
 * (`app/notifications.tsx`, Flow 9 · 9.2), pushed on the stack; the sheet it used to open is gone.
 *
 * ## The badge counts what you have not seen
 *
 * Not what is unread, and not a request still waiting (that count is "Waiting on you · N" on the screen): "is
 * there something I have not seen". Opening the screen is the act that answers it, so the badge clears at once
 * on the tap (optimistic), and the screen marks everything seen on the server. The count is read when the tab
 * comes into view and when a row lands (`subscribeToBell`), never polled: the server's count, not a local +1.
 *
 * `glass`: the home frame's bell (Flow 3 discovery, guidelines/flow-3/flow3.js): a glass control circle over the map,
 * 44 pt iOS · 48 dp Android, its badge ringed in ink. Without it, the bare glyph the Scene's bar still uses.
 */
export function NotificationBell({ glass = false }: { glass?: boolean } = {}) {
  const [unread, setUnread] = useState(0)

  /** One row is enough: the feed carries the count beside it, and the bell asks for nothing else. */
  const load = useCallback(async () => {
    try {
      const result = await apiClient.getNotifications({ limit: 1 })
      if (result.success && result.data) setUnread(result.data.unreadCount)
    } catch (error) {
      Logger.warn('notifications', 'count:failed', { error: error as never })
    }
  }, [])

  /*
   * The count whenever the tab comes into view, so the badge is right before anybody taps.
   *
   * One request per focus, not a poll. This was once-on-mount, deliberately, with a note that the cheap
   * version had to be shown insufficient first. It was: driven across two phones, the other person revealed
   * and a rating opened, three new rows landed, and the badge kept saying 5 for the whole session. A bell
   * that polls is still the wrong answer; a bell that looks when you look at it is the cheapest right one.
   */
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  /*
   * And the moment a row lands while the app is open. The server says so on your own socket room, and the
   * bell asks the server for the count rather than adding one: it read 3 for one row on the owner's iPhone
   * when the app held three sockets, and a re-read cannot drift that way.
   */
  useEffect(() => subscribeToBell(() => void load()), [load])

  const open = useCallback(() => {
    // Optimistic: the badge clears on tap rather than after a round trip, because opening it is what "seen" means.
    setUnread(0)
    router.push('/notifications')
  }, [])

  const badge = badgeLabel(unread)

  return (
    // Scales like the Scene's top-bar icons; no haptic, the screen is the answer.
    <ScalePress
      haptic={false}
      pressedScale={0.9}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      // The true number, even where the badge says "9+" (Flow 9 · 9.1).
      accessibilityValue={unread > 0 ? { text: `${unread} unseen` } : undefined}
      // The box is the glyph, so its right edge lands on the page margin like the city chip below it; `hitSlop` makes the target 48pt.
      hitSlop={glass ? undefined : 12}
      style={glass ? glassCircle : styles.bell}
      testID="notification-bell"
    >
      {glass ? <Material role="control" style={[StyleSheet.absoluteFill, { borderRadius: glassCircle.borderRadius }]} /> : null}
      <Ionicons name="notifications-outline" size={ICON.lg} color={EMBER.textPrimary} />
      {/*
        The badge fades and scales in when something is new (0 → any) and fades out when it clears (DS #28); the
        digits roll between non-zero counts and "9+" never rolls — all inside the DS badge. The wrapper stays, so
        the badge's own exit can play as the count goes.
      */}
      <View style={glass ? styles.badgeOnGlass : styles.badge} pointerEvents="none">
        {badge ? <Badge text={badge} ring={glass ? COLOR.ink : EMBER.bg} arrive testID="bell-badge" /> : null}
      </View>
    </ScalePress>
  )
}

const glassSize = Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton
const glassCircle = { width: glassSize, height: glassSize, borderRadius: glassSize / 2, alignItems: 'center', justifyContent: 'center' } as const

const styles = StyleSheet.create({
  bell: {
    width: ICON.lg,
    height: ICON.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', top: -SPACE.sm, right: -SPACE.sm },
  // The frame: the badge sits on the circle's corner, 2 pt out.
  badgeOnGlass: { position: 'absolute', top: -DS_SPACE.xxs, right: -DS_SPACE.xxs },
})
