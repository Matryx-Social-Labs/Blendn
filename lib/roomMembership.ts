import { useSyncExternalStore } from 'react'

import type { RoomMute } from './apiClient'
import { calendarDate, calendarDaysBetween, clockTime, dateIn, instantIn } from './time'

/**
 * Your own standing in a room: whether you muted it, and whether you left it.
 *
 * ## Two facts, three screens
 *
 * Room info sets them; the chat header and the Banter row show them. Those
 * screens are all mounted at once (Banter → room → Room info is a stack), so a
 * mute chosen on Room info has to reach the header underneath it without a
 * refetch. A module-level store does that, the same shape as `lib/sheet.ts`:
 * the server's answer is written here, and every screen reads it.
 *
 * The server stays the source of truth. Every list or chat load writes what it
 * says (`rememberRoomMute`), so this is only ever as stale as the last read.
 *
 * ## Not the organiser's mute
 *
 * `room_state: 'muted'` in the Banter (`lib/roomState.ts`) is a moderator
 * stopping you from posting. This is you silencing the room's pushes. They
 * share a word and nothing else, which is why nothing here says "Muted" alone
 * where the other could be meant — the row shows a bell with a slash.
 */

// ---------------------------------------------------------------------------
// Mute: what the options mean, and how a mute reads
// ---------------------------------------------------------------------------

export type MuteOption = '1h' | '8h' | 'tomorrow' | 'always'

export const MUTE_OPTIONS: { value: MuteOption; label: string }[] = [
  { value: '1h', label: 'For 1 hour' },
  { value: '8h', label: 'For 8 hours' },
  { value: 'tomorrow', label: 'Until tomorrow' },
  { value: 'always', label: 'Until I turn it back on' },
]

/** "Tomorrow" ends at 8 in the morning: the room has gone quiet by then, and you are up. */
const TOMORROW_HOUR = 8

/**
 * The `until` to send for an option, or null for "until I turn it back on".
 * Always in the future and always under the server's one-year ceiling.
 */
export function muteUntil(option: MuteOption, now: Date = new Date()): string | null {
  switch (option) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    case '8h':
      return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString()
    case 'tomorrow': {
      const [y, m, day] = dateIn(now)
      return new Date(instantIn(y, m, day + 1, TOMORROW_HOUR)).toISOString()
    }
    case 'always':
      return null
  }
}

/** A mute as the server sent it, or null when there is none to read. */
export function muteFrom(raw: unknown): RoomMute | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { muted?: unknown; until?: unknown }
  if (typeof r.muted !== 'boolean') return null
  return { muted: r.muted, until: r.muted && typeof r.until === 'string' ? r.until : null }
}

/** Muted right now. A mute whose `until` has passed has lapsed, as it has on the server. */
export function isMuted(mute: RoomMute | null | undefined, now: Date = new Date()): boolean {
  if (!mute?.muted) return false
  if (mute.until === null) return true
  const at = Date.parse(mute.until)
  return !Number.isNaN(at) && at > now.getTime()
}

/**
 * The line under "Mute notifications": when it ends, in words.
 * Null when the room is not muted.
 */
export function muteLabel(mute: RoomMute | null | undefined, now: Date = new Date()): string | null {
  if (!isMuted(mute, now)) return null
  if (!mute?.until) return 'Muted until you turn it back on'
  const at = new Date(mute.until)
  const time = clockTime(at)
  const days = calendarDaysBetween(now, at)
  if (days === 0) return `Muted until ${time}`
  if (days === 1) return `Muted until tomorrow, ${time}`
  return `Muted until ${calendarDate(at, { weekday: true, now })}`
}

/**
 * The line under a room's name in its header. The event's title when the room
 * is called something else; when the two are the same string — most rooms are
 * named after their event — repeating it said nothing, so the line is how many
 * are in the room, or nothing at all until that is known.
 *
 * A room's own name is often "<event> Chat" (what the check-in passes as it
 * hands off to the chat), which is the same name with a suffix: both header
 * lines truncated to "Founders' Breakfast Club — …" and the count never showed.
 */
export function roomSubtitle(name: string, eventTitle: string | undefined, memberCount: number | null): string | undefined {
  const bare = name.trim().replace(/\s+chat$/i, '')
  if (eventTitle && eventTitle.trim() !== name.trim() && eventTitle.trim() !== bare) return eventTitle
  if (memberCount && memberCount > 0) return `${memberCount} in the room`
  return undefined
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

type State = { mutes: ReadonlyMap<string, RoomMute>; left: ReadonlySet<string> }

let state: State = { mutes: new Map(), left: new Set() }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Write what the server said about a room's mute. Absent says nothing, and changes nothing. */
export function rememberRoomMute(chatGroupId: string, raw: unknown): void {
  const mute = muteFrom(raw)
  if (!chatGroupId || !mute) return
  const prev = state.mutes.get(chatGroupId)
  if (prev && prev.muted === mute.muted && prev.until === mute.until) return
  const mutes = new Map(state.mutes)
  mutes.set(chatGroupId, mute)
  state = { ...state, mutes }
  emit()
}

/**
 * You left this room, on this phone. The Banter hides it straight away rather
 * than waiting for its next read, and the room screen opens on "You left".
 */
export function markRoomLeft(chatGroupId: string): void {
  if (state.left.has(chatGroupId)) return
  state = { ...state, left: new Set(state.left).add(chatGroupId) }
  emit()
}

/** Back in — a rejoin, or a load the server answered as a member. */
export function markRoomJoined(chatGroupId: string): void {
  if (!state.left.has(chatGroupId)) return
  const left = new Set(state.left)
  left.delete(chatGroupId)
  state = { ...state, left }
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const snapshot = () => state

/** The mute the app last heard for this room, if any. */
export function useRoomMute(chatGroupId: string | null | undefined): RoomMute | undefined {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot)
  return chatGroupId ? s.mutes.get(chatGroupId) : undefined
}

/** Every room's mute and every room you left, for a list. */
export function useRoomMembership(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** The mute last heard for this room, outside a component. */
export function roomMuteFor(chatGroupId: string): RoomMute | undefined {
  return state.mutes.get(chatGroupId)
}

export function hasLeftRoom(chatGroupId: string): boolean {
  return state.left.has(chatGroupId)
}

/** Forget every room's mute and leave: sign-out and session end (`lib/useAuth.ts`), and tests. */
export function resetRoomMembership(): void {
  state = { mutes: new Map(), left: new Set() }
  emit()
}
