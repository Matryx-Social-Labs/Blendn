import { useEffect, useState } from 'react'

import { apiClient } from './apiClient'
import { roomKindParam } from './crews'
import { roomDisplayTitle, roomHereCount, roomVenueId } from './placeRoom'
import { rememberRoomMute } from './roomMembership'
import { subscribeToEventCheckIn, subscribeToEventCheckOut } from './socketClient'

/**
 * A room as the Banter's list (`GET /chat/groups`) describes it: what the room
 * and Room info read when their opener did not say. Usually cached already,
 * so free.
 */
export type RoomRow = {
  title?: string
  image?: string
  /** A place's room (a venue day): the place. */
  venueId?: string
  eventId?: string
  /** The event's own title, when the room is named something else. */
  eventTitle?: string
  /** When the event starts (ISO): the room opens a day before (`lib/preEventRoom.ts`). Absent for a crew's or a place's room. */
  startTime?: string
  /** A place's room: when its venue day resets (the daily close). */
  dayEndsAt?: string
  /** In the room now (`roomHereCount`); never for a place's room, where an exact count is a differencing channel (H5). */
  hereCount: number | null
  /** Your role here: `admin` (Organiser), `moderator`, or a member. */
  role?: string
  /** You are checked in and have not checked out: the room is live for you. */
  live?: boolean
  /** A crew's or a Blend's room (`rooms`, step 9): it opens as that room. */
  kind?: 'crew' | 'blend'
  crewId?: string
  blendId?: string
  /** The mute the server holds for you, raw (`lib/roomMembership.ts` reads it). */
  mute?: unknown
}

/** The room `roomId` in a `GET /chat/groups` payload, or null. */
export function roomRowFrom(payload: unknown, roomId: string): RoomRow | null {
  const data = payload as Record<string, any> | null
  if (!data) return null
  const rooms: Record<string, any>[] = Array.isArray(data) ? data : data.groups || data.rooms || data.data || []
  const room = rooms.find((g) => String(g.id || g.chat_room_id || g.chatRoomId || '') === roomId)
  if (room) {
    const image = room.event?.coverImageUrl || room.event?.cover_image_url || room.coverImageUrl || room.cover_image_url
    const title = roomDisplayTitle(room) || room.event_title || room.eventTitle
    return {
      title: title ? String(title) : undefined,
      image: image ? String(image) : undefined,
      venueId: roomVenueId(room) ?? undefined,
      eventId: room.event?.id ? String(room.event.id) : undefined,
      eventTitle: room.event?.title ? String(room.event.title) : undefined,
      // A place's room is a venue day: it has no pre-event window.
      startTime: room.event?.startTime && room.event?.kind !== 'venue_day' ? String(room.event.startTime) : undefined,
      dayEndsAt: room.event?.endTime && room.event?.kind === 'venue_day' ? String(room.event.endTime) : undefined,
      hereCount: roomHereCount(room),
      role: room.membership?.role,
      live: room.isCheckedIn === true,
      mute: room.mute,
    }
  }
  const other = Array.isArray(data.rooms) ? (data.rooms as Record<string, any>[]).find((r) => String(r.id) === roomId) : null
  if (!other) return null
  return {
    title: other.name ? String(other.name) : undefined,
    hereCount: null,
    kind: roomKindParam(other.kind) ?? undefined,
    crewId: other.crewId ? String(other.crewId) : undefined,
    blendId: other.blendId ? String(other.blendId) : undefined,
    mute: other.mute,
  }
}

/** The room's row, read once per room; its mute goes to the store every screen reads. */
export function useRoomRow(roomId: string | null): RoomRow | null {
  const [row, setRow] = useState<RoomRow | null>(null)
  useEffect(() => {
    if (!roomId) return
    let live = true
    apiClient
      .getChatGroups()
      .then((result) => {
        if (!live || !result.success) return
        const found = roomRowFrom(result.data, roomId)
        if (!found) return
        rememberRoomMute(roomId, found.mute)
        setRow(found)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [roomId])
  return row
}

/**
 * How many are in an event's room now, kept live: the row's `hereCount`, then
 * the server's recount on each check-in and checkout (`event:checkin`,
 * `event:checkout`), as the Room keeps its own headline. A chat leave is not
 * one: whoever presses Leave is still in the room. Null for a place's room
 * and for a crew's or a Blend's.
 */
export function useHereCount(row: Partial<RoomRow> | null | undefined): number | null {
  const eventId = row && !row.venueId && !row.kind ? row.eventId ?? null : null
  const [live, setLive] = useState<{ eventId: string; count: number } | null>(null)
  useEffect(() => {
    if (!eventId) return
    const take = (data: { hereCount?: number }) => {
      const n = data.hereCount
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) setLive({ eventId, count: Math.floor(n) })
    }
    const offIn = subscribeToEventCheckIn(eventId, take)
    const offOut = subscribeToEventCheckOut(eventId, take)
    return () => {
      offIn()
      offOut()
    }
  }, [eventId])
  if (!eventId) return null
  return live?.eventId === eventId ? live.count : row?.hereCount ?? null
}
