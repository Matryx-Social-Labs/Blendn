import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { BrokenLink } from '../../components/chat/BrokenLink'
import { RoomChat } from '../../components/chat/RoomChat'
import { idParam } from '../../lib/routeParams'

/** A chat room as a route: the room id, and what the opener knew about its room, come from the URL (`components/chat/RoomChat.tsx`). */
export default function GroupChat() {
  const params = useLocalSearchParams()
  const id = idParam(params.id)
  if (!id) return <BrokenLink />
  return <RoomChat id={id} params={params} />
}
