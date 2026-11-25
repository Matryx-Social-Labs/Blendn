import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import { BrokenLink } from '../../components/chat/BrokenLink'
import { RoomChat } from '../../components/chat/RoomChat'
import { openRoomChat, tabsPath } from '../../lib/blendnOverlay'
import { COLOR } from '../../lib/design/tokens'
import { idParam } from '../../lib/routeParams'
import { chatOpensInRoom, mayBeLiveRoom, resolveChatOpensInRoom } from '../../lib/roomTab'

/**
 * A chat room as a route: the room id, and what the opener knew about its room, come from the URL
 * (`components/chat/RoomChat.tsx`).
 *
 * The room you are in now is not a screen of its own (Flow 5 R-A): its chat is the Room's Chat tab, so an installed
 * link, a push, the Lobby handover, "Open the room" and the event page all land there, over the tabs, and this route
 * steps out of the way. Decided once, before anything is drawn: the room can't turn into another while you read it.
 */
export default function GroupChat() {
  const params = useLocalSearchParams()
  const id = idParam(params.id)
  const kind = typeof params.kind === 'string' ? params.kind : null
  const eventId = typeof params.eventId === 'string' ? params.eventId : null
  // `null` while the server is asked (cold, the app does not know your room yet: SCRUM-1049); a crew's or a Blend's never asks.
  const [inRoom, setInRoom] = useState<boolean | null>(() => {
    if (!id || !mayBeLiveRoom(kind)) return false
    return chatOpensInRoom({ id, kind, eventId }) ? true : null
  })
  useEffect(() => {
    if (inRoom !== null || !id) return
    let live = true
    void resolveChatOpensInRoom({ id, kind, eventId }).then((yes) => {
      if (live) setInRoom(yes)
    })
    return () => {
      live = false
    }
  }, [inRoom, id, kind, eventId])
  // The event page says it opened this (`from: 'event'`); a push carries the event too, and closes to the tabs.
  const [returnTo] = useState(() => (params.from === 'event' ? eventId : null))
  useEffect(() => {
    if (!inRoom) return
    openRoomChat(returnTo)
    // The overlay is hosted by the tabs, under the root stack: back to them, on the tab you were on (Banter stays
    // Banter; a dismiss-all would reach `index`, whose redirect is the Pulse), or it opens behind this route. A
    // cold-start link has nothing under it: the tabs replace it.
    if (router.canDismiss()) router.dismissTo(tabsPath())
    else router.replace(tabsPath())
  }, [inRoom, returnTo])
  if (!id) return <BrokenLink />
  if (inRoom !== false) return <View style={{ flex: 1, backgroundColor: COLOR.ink }} />
  return <RoomChat id={id} params={params} />
}
