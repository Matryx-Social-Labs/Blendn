import { router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { markBellRead, useInboxBadge, useRefreshInboxBadge } from '../../lib/inboxBadge'
import { badgeLabel } from '../../lib/notificationFormat'
import { Badge } from '../ds/MonoFamily'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, SIZE, SPACE } from '../../lib/design/tokens'
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
 * One control wherever it sits (Flow 3 discovery, guidelines/flow-3/flow3.js; r7 M8): the IconButton's glass circle, 44 pt iOS ·
 * 48 dp Android, the DS bell glyph, its badge ringed in ink, so it lines up with the IconButtons beside it (Banter's Search and
 * Mark all) and sits over the map on Home.
 */
/** The most the server counts (`unreadCount` stops at 1000). */
const UNREAD_CAP = 1000

export function NotificationBell() {
  const { unreadCount: unread } = useInboxBadge()
  const load = useRefreshInboxBadge()

  /*
   * The count whenever the tab comes into view, so the badge is right before anybody taps.
   *
   * One request per focus, not a poll. This was once-on-mount, deliberately, with a note that the cheap
   * version had to be shown insufficient first. It was: driven across two phones, the other person revealed
   * and a rating opened, three new rows landed, and the badge kept saying 5 for the whole session. A bell
   * that polls is still the wrong answer; a bell that looks when you look at it is the cheapest right one.
   */
  useFocusEffect(load)

  /*
   * A row landing, a DM, and the app coming back to the front re-read the count too: one set of triggers for every reader,
   * mounted once in the tab layout (`useInboxBadgeSync`), because this bell is mounted on three screens.
   */

  // Optimistic: the badge clears on tap rather than after a round trip, because opening it is what "seen" means.
  const open = useCallback(() => {
    markBellRead()
    router.push('/notifications')
  }, [])

  const badge = badgeLabel(unread)
  // The server stops counting at 1000, so a count at the cap is "more than 999", never a number that looks exact.
  const capped = unread >= UNREAD_CAP
  const size = Platform.OS === 'android' ? SIZE.circleButtonAndroid : SIZE.circleButton
  const circle = { width: size, height: size, borderRadius: size / 2 }

  return (
    // Scales like the Scene's top-bar icons; no haptic, the screen is the answer.
    <ScalePress
      haptic={false}
      pressedScale={0.9}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={capped ? 'Notifications, more than 999 unread' : 'Notifications'}
      // The true number, even where the badge says "9+" (Flow 9 · 9.1); at the server's cap the label says it instead.
      accessibilityValue={unread > 0 && !capped ? { text: `${unread} unseen` } : undefined}
      style={[circle, styles.centre]}
      testID="notification-bell"
    >
      <Material role="control" style={[StyleSheet.absoluteFill, { borderRadius: circle.borderRadius }]} />
      <Icon name="bell" />
      {/*
        The badge fades and scales in when something is new (0 → any) and fades out when it clears (DS #28); the
        digits roll between non-zero counts and "9+" never rolls — all inside the DS badge. The wrapper stays, so
        the badge's own exit can play as the count goes.
      */}
      <View style={styles.badge} pointerEvents="none">
        {badge ? <Badge text={badge} ring={COLOR.ink} arrive testID="bell-badge" /> : null}
      </View>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  // The frame: the badge sits on the circle's corner, 2 pt out.
  badge: { position: 'absolute', top: -SPACE.xxs, right: -SPACE.xxs },
})
