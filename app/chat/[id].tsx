import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import { BrokenLink } from '../../components/chat/BrokenLink'
import { RoomChat } from '../../components/chat/RoomChat'
import { openRoomChat } from '../../lib/blendnOverlay'
import { COLOR } from '../../lib/design/tokens'
import { idParam } from '../../lib/routeParams'
import { chatOpensInRoom } from '../../lib/roomTab'

/**
 * A chat room as a route: the room id, and what the opener knew about its room, come from the URL
 * (`components/chat/RoomChat.tsx`).
 *
 * The room you are in now is not a screen of its own (Flow 5 R-A): its chat is the Room's Chat tab, so an installed
 * link, a push, the Lobby handover, "Open the room" and the event page all land there, over the tabs, and this route
 * steps out of the way. Decided once, as it mounts: the room can't turn into another while you read it.
 */
export default function GroupChat() {
  const params = useLocalSearchParams()
  const id = idParam(params.id)
  const kind = typeof params.kind === 'string' ? params.kind : null
  const eventId = typeof params.eventId === 'string' ? params.eventId : null
  const [inRoom] = useState(() => !!id && chatOpensInRoom({ id, kind, eventId }))
  // The event page says it opened this (`from: 'event'`); a push carries the event too, and closes to the tabs.
  const [returnTo] = useState(() => (params.from === 'event' ? eventId : null))
  useEffect(() => {
    if (!inRoom) return
    openRoomChat(returnTo)
    // The overlay is hosted by the tabs, under the root stack: back to them, or it opens behind this route.
    router.dismissTo('/(tabs)/events')
  }, [inRoom, returnTo])
  if (!id) return <BrokenLink />
  if (inRoom) return <View style={{ flex: 1, backgroundColor: COLOR.ink }} />
  return <RoomChat id={id} params={params} />
}
