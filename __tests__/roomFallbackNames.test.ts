/**
 * C7 naming follow-ups (owner 2026-11-15, SCRUM-1042): a room with no name of its own is "The room" wherever it is drawn
 * (Banter's row, the muted rooms list, Room info, a header opened from a push), and Room info's muted row says
 * "Muted until …" as C6 does, not "Notifications · muted until …". The retired strings are pinned in bannedNames.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({}))

import { readFileSync } from 'fs'
import { join } from 'path'

import { groupChatFrom } from '../lib/useBanterInbox'

it('Banter: a room with no name anywhere is "The room"; a named one keeps its name (control)', () => {
  expect(groupChatFrom({ id: 'g1' }, 'u1').event_title).toBe('The room')
  expect(groupChatFrom({ id: 'g1', event: { title: 'Bass Thursday' } }, 'u1').event_title).toBe('Bass Thursday')
})

it('Room info: the muted row is the mute’s own words ("Muted until …"); unmuted, "Mute this room"', () => {
  const src = readFileSync(join(__dirname, '../app/chat-info/[id].tsx'), 'utf8')
  expect(src).toContain("title={(muted && muteLabel(mute)) || 'Mute this room'}")
  expect(src).toContain("|| nameParam(params.eventTitle) || 'The room'")
})
