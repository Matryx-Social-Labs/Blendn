import { readFileSync } from 'fs'
import { join } from 'path'

import {
  hasLeftRoom,
  isMuted,
  markRoomJoined,
  markRoomLeft,
  muteFrom,
  muteLabel,
  muteUntil,
  MUTE_OPTIONS,
  rememberRoomMute,
  resetRoomMembership,
  roomMuteFor,
  roomSubtitle,
} from '../lib/roomMembership'

/**
 * Leave, mute and the room header — the pure half. The screens that use them
 * are pinned at the bottom, as source, like the rest of the chat tests.
 */

// A Monday afternoon, local time, so "tomorrow" and "today" are unambiguous.
const NOW = new Date(2026, 8, 28, 15, 30, 0)

describe('muteUntil', () => {
  it('offers the four options, in order, ending with "until I turn it back on"', () => {
    expect(MUTE_OPTIONS.map((o) => o.value)).toEqual(['1h', '8h', 'tomorrow', 'always'])
  })

  it('counts hours from now', () => {
    expect(Date.parse(muteUntil('1h', NOW)!) - NOW.getTime()).toBe(60 * 60 * 1000)
    expect(Date.parse(muteUntil('8h', NOW)!) - NOW.getTime()).toBe(8 * 60 * 60 * 1000)
  })

  it('ends "tomorrow" at 8 the next morning', () => {
    const at = new Date(muteUntil('tomorrow', NOW)!)
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([29, 8, 0])
  })

  it('sends null for "until I turn it back on", which the server reads as no end', () => {
    expect(muteUntil('always', NOW)).toBeNull()
  })

  it('never sends a time the server would refuse (past, or over a year)', () => {
    for (const { value } of MUTE_OPTIONS) {
      const until = muteUntil(value, NOW)
      if (until === null) continue
      const ms = Date.parse(until) - NOW.getTime()
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThan(366 * 24 * 60 * 60 * 1000)
    }
  })
})

describe('reading a mute', () => {
  it('reads the server shape, and nothing else', () => {
    expect(muteFrom({ muted: true, until: null })).toEqual({ muted: true, until: null })
    expect(muteFrom({ muted: false, until: '2026-01-01T00:00:00Z' })).toEqual({ muted: false, until: null })
    expect(muteFrom(undefined)).toBeNull()
    expect(muteFrom({ until: 'x' })).toBeNull()
  })

  it('treats a mute whose end has passed as lapsed, as the server does', () => {
    expect(isMuted({ muted: true, until: new Date(NOW.getTime() - 1000).toISOString() }, NOW)).toBe(false)
    expect(isMuted({ muted: true, until: new Date(NOW.getTime() + 1000).toISOString() }, NOW)).toBe(true)
    expect(isMuted({ muted: true, until: null }, NOW)).toBe(true)
    expect(isMuted({ muted: false, until: null }, NOW)).toBe(false)
    expect(isMuted(undefined, NOW)).toBe(false)
  })

  it('says until when', () => {
    expect(muteLabel({ muted: true, until: null }, NOW)).toBe('Muted until you turn it back on')
    expect(muteLabel({ muted: true, until: muteUntil('1h', NOW) }, NOW)).toMatch(/^Muted until \d/)
    expect(muteLabel({ muted: true, until: muteUntil('tomorrow', NOW) }, NOW)).toMatch(/^Muted until tomorrow, /)
    expect(muteLabel({ muted: false, until: null }, NOW)).toBeNull()
  })
})

describe('the store', () => {
  beforeEach(() => resetRoomMembership())

  it('remembers a room left on this phone until it is rejoined', () => {
    expect(hasLeftRoom('g1')).toBe(false)
    markRoomLeft('g1')
    expect(hasLeftRoom('g1')).toBe(true)
    markRoomJoined('g1')
    expect(hasLeftRoom('g1')).toBe(false)
  })

  it('ignores a list row that says nothing about a mute', () => {
    rememberRoomMute('g1', { muted: true, until: null })
    rememberRoomMute('g1', undefined)
    // Still muted: absent is not "unmuted".
    expect(roomMuteFor('g1')).toEqual({ muted: true, until: null })
    rememberRoomMute('g1', { muted: false, until: null })
    expect(roomMuteFor('g1')).toEqual({ muted: false, until: null })
  })
})

describe('the room header subtitle', () => {
  it('shows the event when the room is named something else', () => {
    expect(roomSubtitle('Late crew', 'AI Meetup #42', 38)).toBe('AI Meetup #42')
  })

  it('does not repeat the title; says how many are in the room instead', () => {
    expect(roomSubtitle('AI Meetup #42', 'AI Meetup #42', 38)).toBe('38 in the room')
    // "<event> Chat" is the same name: check-in's "Go to Chat" passes it.
    expect(roomSubtitle('AI Meetup #42 Chat', 'AI Meetup #42', 38)).toBe('38 in the room')
  })

  it('shows nothing rather than a repeat or a zero', () => {
    expect(roomSubtitle('AI Meetup #42', 'AI Meetup #42', null)).toBeUndefined()
    expect(roomSubtitle('AI Meetup #42', 'AI Meetup #42', 0)).toBeUndefined()
    expect(roomSubtitle('AI Meetup #42', undefined, null)).toBeUndefined()
  })
})

describe('the screens', () => {
  const read = (p: string) =>
    readFileSync(join(__dirname, '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  const INFO = read('app/chat-info/[id].tsx')
  const CHAT = read('app/chat/[id].tsx')
  const BANTER = read('app/(tabs)/chat.tsx')

  it('Room info offers mute, a room report and leave — and no longer reports the event', () => {
    expect(INFO).toContain('label="Mute notifications"')
    expect(INFO).toContain('apiClient.muteChatGroup(')
    expect(INFO).toContain('apiClient.unmuteChatGroup(')
    expect(INFO).toContain('label="Report this room"')
    expect(INFO).toContain('showRoomReportOptions(chatGroupId)')
    expect(INFO).not.toContain('showEventReportOptions')
    expect(INFO).toContain('label="Leave room"')
    expect(INFO).toContain('apiClient.leaveChatGroup(')
    expect(INFO).toContain("router.dismissTo('/(tabs)/chat')")
    // Popups go through the app's one sheet, never Alert.
    expect(INFO).not.toMatch(/Alert\.alert/)
  })

  it('the leave confirmation says how to come back', () => {
    expect(INFO).toMatch(/rejoin by checking in at the event again/)
  })

  it('the room answers LEFT_ROOM and a plain 403 with the left state and Rejoin', () => {
    // LEFT_ROOM → left, FORBIDDEN → out (and NOT_LIVE → not live): roomRefusalState, table-tested in placeRoom.test.ts.
    expect(CHAT).toContain('roomRefusalState(result.errorCode)')
    expect(CHAT).toContain("if (refused === 'left') markRoomLeft(String(chatRoomId))")
    expect(CHAT).toContain("else if (refused === 'out') setOutOfRoom(true)")
    expect(CHAT).toContain('<RoomLeftState')
    expect(CHAT).toContain('apiClient.rejoinChatGroup(')
  })

  it('the header back button can be found by a screen reader', () => {
    const header = CHAT.slice(CHAT.indexOf('function GroupChatHeader'), CHAT.indexOf('const headerStyles'))
    expect(header).toMatch(/onPress=\{onBack\}\s*accessibilityRole="button"\s*accessibilityLabel="Go back"/)
  })

  it('the header shows a muted room and does not repeat the event title', () => {
    expect(CHAT).toContain('muted={muted}')
    expect(CHAT).toContain('subtitle={roomSubtitle(')
  })

  it('the Banter hides a room left here and marks a muted one', () => {
    expect(BANTER).toContain('membership.left.has(c.chat_room_id)')
    expect(BANTER).toContain('muted: roomMuted(c.chat_room_id)')
  })
})
