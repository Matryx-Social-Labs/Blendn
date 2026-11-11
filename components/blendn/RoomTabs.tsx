import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import type { RoomTab } from '../../lib/roomTab'

/**
 * The room's two panes, People and Chat (Flow 5 R-A), both kept mounted for the whole visit: the hidden one is
 * see-through and laid over the shown one's frame, untouchable and out of a screen reader's reach. Never
 * `display: none`: Fabric does not mount that subtree, so the gesture handlers a pane draws while hidden (a bubble's
 * long-press, its swipe to reply) attach to no native view and never fire once it shows. Mounting only the shown pane would drop the chat's
 * subscriptions on People and make them again on Chat, a `leave:chat` and a `join:chat` on every switch
 * (`__tests__/roomTabsSocket.test.tsx`). The chat's draft, scroll and unread count survive a switch for the same reason.
 */
export function RoomTabs({ tab, people, chat }: { tab: RoomTab; people: ReactNode; chat: ReactNode }) {
  return (
    <View style={styles.fill}>
      <Pane shown={tab === 'people'} testID="room-tab-people">
        {people}
      </Pane>
      <Pane shown={tab === 'chat'} testID="room-tab-chat">
        {chat}
      </Pane>
    </View>
  )
}

function Pane({ shown, testID, children }: { shown: boolean; testID: string; children: ReactNode }) {
  return (
    <View
      testID={testID}
      // Never flattened: its opacity comes and goes, and a flattened pane moves its children between parents (SCRUM-1048).
      collapsable={false}
      style={[styles.fill, !shown && styles.hidden]}
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0 },
})
