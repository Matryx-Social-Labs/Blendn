import { readFileSync } from 'fs'
import { join } from 'path'
import { roomStateFrom, roomStateLine } from '../lib/roomState'

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
    expect(roomStateLine('locked')).toBe('Locked by the organiser — read only')
    expect(roomStateLine(null)).toBeNull()
  })
})

describe('the Banter list', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'chat.tsx'), 'utf8')
  it('prefers the state line to the last message on a Recent row', () => {
    expect(src).toContain("preview: roomStateLine(c.room_state) ?? displayPreview(c.last_message, 'No messages yet')")
    expect(src).toContain('room_state: roomStateFrom(room)')
  })
})
