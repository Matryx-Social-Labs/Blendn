import { lobbyRoomLine, lobbyRoomsFrom } from '../lib/lobby'
import { metInLine } from '../lib/personFace'

/** A Lobby room as admin #991 lists it in `GET /chat/groups` `rooms` (Flow 5 C5 · B-A "Rooms · Your ride"). */
const row = (patch: Record<string, unknown> = {}) => ({
  id: 'g1',
  kind: 'board_post',
  name: 'Car from Indiranagar at 5:30',
  crewId: null,
  blendId: null,
  closesAt: '2026-11-22T03:00:00.000Z',
  boardPost: { id: 'p1', eventId: 'e1', kind: 'offer', subKind: 'ride', yours: false },
  others: { names: ['Lunar Fox', 'Velvet Owl', 'Amber Lynx'], count: 3 },
  unreadCount: 2,
  mute: { muted: false, until: null },
  lastMessageAt: '2026-11-20T10:00:00.000Z',
  lastMessage: { id: 'm1', content: 'Leaving in 10', type: 'text', createdAt: '2026-11-20T10:00:00.000Z', user: { id: 'rh_x', name: 'Velvet Owl' } },
  membership: { role: 'member', joinedAt: '2026-11-20T09:00:00.000Z', status: 'active' },
  status: 'active',
  ...patch,
})

describe('lobbyRoomsFrom: the Lobby rooms in a chat list answer', () => {
  it('reads a board_post row and nothing else', () => {
    const rooms = lobbyRoomsFrom({ rooms: [row(), { ...row({ id: 'c1', kind: 'crew' }) }, { ...row({ id: 'b1', kind: 'blend' }) }] })
    expect(rooms).toEqual([
      {
        id: 'g1',
        name: 'Car from Indiranagar at 5:30',
        kind: 'offer',
        subKind: 'ride',
        yours: false,
        others: { names: ['Lunar Fox', 'Velvet Owl', 'Amber Lynx'], count: 3 },
        unreadCount: 2,
        lastMessageAt: '2026-11-20T10:00:00.000Z',
        mute: { muted: false, until: null },
      },
    ])
  })

  it('reads an older server, or a malformed row, as no Lobby rooms', () => {
    expect(lobbyRoomsFrom({ groups: [] })).toEqual([])
    expect(lobbyRoomsFrom(null)).toEqual([])
    expect(lobbyRoomsFrom({ rooms: [row({ id: 7 })] })).toEqual([])
    // No others block (a malformed row): nobody named, nothing invented.
    expect(lobbyRoomsFrom({ rooms: [row({ others: undefined, boardPost: undefined })] })[0]).toMatchObject({ others: { names: [], count: 0 }, kind: 'offer', subKind: null })
  })
})

describe('lobbyRoomLine: "With Lunar Fox and 2 others · <the post’s words>" (owner pick A, 2026-11-20)', () => {
  it('names the first other, counts the rest, then the post’s words', () => {
    expect(lobbyRoomLine({ names: ['Lunar Fox', 'Velvet Owl'], count: 3 }, 'Car from Indiranagar at 5:30')).toBe('With Lunar Fox and 2 others · Car from Indiranagar at 5:30')
    expect(lobbyRoomLine({ names: ['Lunar Fox', 'Velvet Owl'], count: 2 }, 'Car')).toBe('With Lunar Fox and 1 other · Car')
    expect(lobbyRoomLine({ names: ['Lunar Fox'], count: 1 }, 'Car')).toBe('With Lunar Fox · Car')
  })

  it('counts thousands compactly and says only the words when nobody else is left', () => {
    expect(lobbyRoomLine({ names: ['Lunar Fox'], count: 12481 }, 'Car')).toBe('With Lunar Fox and 12k others · Car')
    expect(lobbyRoomLine({ names: [], count: 0 }, 'Car from Indiranagar')).toBe('Car from Indiranagar')
  })
})

describe('metInLine: the Lobby (Flow 5 C5 "Met in the Lobby · Your ride")', () => {
  it('says the Lobby and what the post is about', () => {
    expect(metInLine({ kind: 'board_post', name: 'Rooftop Sundowner', subKind: 'ride', yours: true })).toBe('Met in the Lobby · Your ride')
    expect(metInLine({ kind: 'board_post', name: 'Rooftop Sundowner', subKind: 'ticket', yours: false })).toBe('Met in the Lobby · Your ticket')
    expect(metInLine({ kind: 'board_post', name: 'Rooftop Sundowner', subKind: null, yours: false })).toBe('Met in the Lobby · Your group')
  })

  it('still says the room for an event or a venue day', () => {
    expect(metInLine({ kind: 'event', name: 'Rooftop Sundowner' })).toBe('Met in the room at Rooftop Sundowner')
  })
})
