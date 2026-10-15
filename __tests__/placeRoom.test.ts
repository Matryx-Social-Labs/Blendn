import { isPlaceRoom, roomDisplayTitle, roomMemberCount, roomRefusalState, roomVenueId } from '../lib/placeRoom'

/**
 * A place's room wherever a room is drawn — one rule each (step 5 review):
 * the Banter's row, the room's header and the Blend'n room read these.
 */

/** A `GET /chat/groups` row, as Blendn-Admin #641 sends it. */
const groupRow = (over: Record<string, unknown> = {}, event: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Cubbon Park Bandstand',
  type: 'event',
  memberCount: null,
  unreadCount: 0,
  mute: null,
  lastMessageAt: null,
  lastMessage: null,
  event: {
    id: 'day-1',
    kind: 'venue_day',
    venueId: 'v1',
    slug: 'venue-day-day-1',
    title: 'Venue day · Cubbon Park Bandstand · 2026-10-09',
    coverImageUrl: null,
    startTime: '2026-10-09T00:30:00.000Z',
    endTime: '2026-10-10T00:30:00.000Z',
    status: 'published',
    ...event,
  },
  membership: { role: 'member', joinedAt: 'x', status: 'active' },
  status: 'active',
  isCheckedIn: true,
  ...over,
})

/** A `GET /checkins/active` entry. */
const checkIn = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  eventId: 'day-1',
  kind: 'venue_day',
  venueId: 'v1',
  expiresAt: '2026-10-09T10:29:22.540Z',
  stay: false,
  event: { id: 'day-1', title: 'Venue day · Cubbon Park Bandstand · 2026-10-09', venueName: 'Cubbon Park Bandstand' },
  ...over,
})

describe('roomDisplayTitle', () => {
  it.each([
    ['a place room row: the place, never the bookkeeping title', groupRow(), 'Cubbon Park Bandstand'],
    ['a place check-in: the venue name', checkIn(), 'Cubbon Park Bandstand'],
    ["an event's room: its event's title", groupRow({ name: 'Jazz Night Chat' }, { kind: 'event', title: 'Jazz Night', venueId: null }), 'Jazz Night'],
    ['an event check-in: its title', checkIn({ kind: 'event', event: { id: 'e1', title: 'Jazz Night', venueName: 'Toast & Tonic' } }), 'Jazz Night'],
    ['an older server (no kind): the event title as before', groupRow({}, { kind: undefined }), 'Venue day · Cubbon Park Bandstand · 2026-10-09'],
    ['a place room with no name falls back to its venue name, then its title', groupRow({ name: ' ' }, { venueName: null }), 'Venue day · Cubbon Park Bandstand · 2026-10-09'],
  ])('%s', (_label, room, title) => {
    expect(roomDisplayTitle(room)).toBe(title)
  })

  it('says nothing it was not told', () => {
    expect(roomDisplayTitle(null)).toBeNull()
    expect(roomDisplayTitle({})).toBeNull()
  })
})

describe('roomMemberCount (H5, D-19)', () => {
  it.each([
    ["an event's room: its count", groupRow({ memberCount: 12 }, { kind: 'event' }), 12],
    ['a place room: never, whatever an older server sends', groupRow({ memberCount: 3 }), null],
    ['a place room: never (server null)', groupRow(), null],
    ['no count, or zero: none', groupRow({ memberCount: 0 }, { kind: 'event' }), null],
    ['a string count is read', groupRow({ memberCount: '7' }, { kind: 'event' }), 7],
  ])('%s', (_label, room, count) => {
    expect(roomMemberCount(room)).toBe(count)
  })
})

describe('roomVenueId (M4)', () => {
  it('names the place of a place room, from either shape, and nothing for an event', () => {
    expect(roomVenueId(groupRow())).toBe('v1')
    expect(roomVenueId(checkIn())).toBe('v1')
    expect(roomVenueId(groupRow({}, { kind: 'event', venueId: 'v9' }))).toBeNull()
    expect(roomVenueId(groupRow({}, { venueId: null }))).toBeNull()
    expect(isPlaceRoom(checkIn({ kind: 'event' }))).toBe(false)
  })
})

describe('roomRefusalState: the room by code, never by sentence', () => {
  it.each([
    ['LEFT_ROOM', 'left'],
    ['FORBIDDEN', 'out'],
    ['NOT_LIVE', 'not_live'],
    ['CHAT_LOCKED', null],
    ['USER_BANNED', null],
    [undefined, null],
    ['', null],
  ])('%s → %s', (code, state) => {
    expect(roomRefusalState(code as string | undefined)).toBe(state)
  })
})
