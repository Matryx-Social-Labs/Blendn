import { readFileSync } from 'fs'
import { join } from 'path'
import { roomLockedIn, roomStateFrom, roomStateLine } from '../lib/roomState'

/*
 * A muted member's room stays in the list, with a reason (SCRUM-178).
 *
 * Driven on Android: the organiser muted a member and the room vanished from
 * their Banter. The server now keeps it in the list and says which state the
 * row is in; this is the line the list shows instead of the last message.
 */
describe('roomStateFrom', () => {
  it('reads the membership first, then the room', () => {
    expect(roomStateFrom({ membership: { status: 'muted' }, status: 'active' })).toBe('muted')
    expect(roomStateFrom({ membership: { status: 'active' }, status: 'locked' })).toBe('locked')
    // Muted in a locked room: the mute is the more personal fact.
    expect(roomStateFrom({ membership: { status: 'muted' }, status: 'locked' })).toBe('muted')
    expect(roomStateFrom({ membership: { status: 'active' }, status: 'active' })).toBeNull()
    // Older servers send neither field.
    expect(roomStateFrom({})).toBeNull()
  })
})

describe('roomStateLine', () => {
  it('says what the person can and cannot do', () => {
    expect(roomStateLine('muted')).toBe('Muted — you can read, not post')
    expect(roomStateLine('locked')).toBe('Locked by the organizer — read only')
    expect(roomStateLine(null)).toBeNull()
  })
})

describe('the Banter list', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'chat.tsx'), 'utf8')
  it('prefers the state line to the last message on a conversation row', () => {
    // As a status chip, before any last message (Flow 5 #08).
    expect(src).toContain('const stateLine = roomStateLine(c.room_state)')
    expect(src).toContain("line: state ?? lineFor(")
    expect(readFileSync(join(__dirname, '..', 'lib', 'useBanterInbox.ts'), 'utf8')).toContain('room_state: roomStateFrom(room)')
  })
})

describe('roomLockedIn (TG-02: a locked room opens read-only)', () => {
  it('finds the room in either list and reads its own status, a mute or not', () => {
    const payload = {
      groups: [{ id: 'g1', status: 'locked', membership: { status: 'muted' } }, { id: 'g2', status: 'active' }],
      rooms: [{ id: 'c1', kind: 'crew', status: 'locked' }],
    }
    expect(roomLockedIn(payload, 'g1')).toBe(true)
    expect(roomLockedIn(payload, 'c1')).toBe(true)
    expect(roomLockedIn(payload, 'g2')).toBe(false)
    expect(roomLockedIn(payload, 'nope')).toBe(false)
    expect(roomLockedIn([{ chat_room_id: 'g3', status: 'locked' }], 'g3')).toBe(true)
    expect(roomLockedIn(null, 'g1')).toBe(false)
  })
})
