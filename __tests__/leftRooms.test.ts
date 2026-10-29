import { leftNames, youLeftLine } from '../lib/leftRooms'

// Fixture copied from admin lib/check-in-core.ts `left` (LeftRoom: eventId, kind, name) as the routes send it.
const route = { checkIn: { id: 'c1' }, left: [{ eventId: 'e0', kind: 'event', name: 'Vinyl Night' }, { eventId: 'v1', kind: 'venue_day', name: 'Toit' }] }

describe('left (ROOM-10)', () => {
  it('names the room a check-in or Go Live took you out of; the first is the toast', () => {
    expect(leftNames(route)).toEqual(['Vinyl Night', 'Toit'])
    expect(youLeftLine(route)).toBe('You left Vinyl Night.')
  })
  it('none, an older server, or garbage: silent', () => {
    expect(youLeftLine({ left: [] })).toBeNull()
    expect(youLeftLine({})).toBeNull()
    expect(youLeftLine(null)).toBeNull()
    expect(leftNames({ left: [null, { name: '  ' }, { name: 5 }] } as never)).toEqual([])
  })
})
