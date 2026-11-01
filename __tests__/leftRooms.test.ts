import { activeRoomName, leftNames, youLeftLine } from '../lib/leftRooms'

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

// SCRUM-635 drive: "Hold to switch" read "Leaves Venue day · Cubbon Park Bandstand · 2026-10-31 and checks you in here."
describe('the room you are in, by name (SCRUM-635)', () => {
  const venueDay = { kind: 'venue_day' as const, event: { title: 'Venue day · Cubbon Park Bandstand · 2026-10-31', venueName: 'Cubbon Park Bandstand' } }
  it('a Go Live is named by its place, never the venue day’s own title', () => {
    expect(activeRoomName(venueDay)).toBe('Cubbon Park Bandstand')
  })
  it('an event is its title; a venue day with no place name falls back to the title; nothing is null', () => {
    expect(activeRoomName({ kind: 'event', event: { title: 'Vinyl Night', venueName: 'Toit' } })).toBe('Vinyl Night')
    expect(activeRoomName({ event: { title: 'Vinyl Night', venueName: null } })).toBe('Vinyl Night')
    expect(activeRoomName({ kind: 'venue_day', event: { title: 'Venue day · X', venueName: '  ' } })).toBe('Venue day · X')
    expect(activeRoomName(null)).toBeNull()
  })
})
