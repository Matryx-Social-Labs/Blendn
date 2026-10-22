jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

import { hasMorePages, muteEnds, mutedCountFrom, mutedRoomRoute, mutedRoomsFrom, mutedRoomsFromServer, notificationsHint } from '../lib/mutedRooms'

const NOW = new Date('2026-10-22T18:00:00')
const later = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString()

describe('mutedRoomsFrom', () => {
  const payload = {
    groups: [
      { id: 'e1', event: { title: 'Bass Thursday' }, mute: { muted: true, until: later(3) } },
      { id: 'e2', event: { title: 'Quiet one' }, mute: { muted: false, until: null } },
      { id: 'e3', event: { title: 'Lapsed' }, mute: { muted: true, until: later(-1) } },
      { id: 'e4', event: { title: 'No mute field' } },
      { id: 'v1', kind: 'venue_day', name: 'Toit', event: { kind: 'venue_day', title: 'Venue day · Toit · 22 Oct' }, mute: { muted: true, until: null } },
    ],
    rooms: [
      { id: 'c1', kind: 'crew', name: 'Nebula', crewId: 'crew_1', mute: { muted: true, until: null } },
      { id: 'b1', kind: 'blend', name: 'Lot × Nebula', blendId: 'bl_1', mute: { muted: false, until: null } },
    ],
  }

  it('keeps the rooms muted right now, from the event rooms and from the crew and Blend rooms', () => {
    expect(mutedRoomsFrom(payload, NOW).map((r) => [r.id, r.kind])).toEqual([['e1', 'event'], ['v1', 'event'], ['c1', 'crew']])
  })

  it('names a place’s room for the place and a crew’s room for the crew', () => {
    const titles = Object.fromEntries(mutedRoomsFrom(payload, NOW).map((r) => [r.id, r.title]))
    expect(titles).toEqual({ e1: 'Bass Thursday', v1: 'Toit', c1: 'Nebula' })
  })

  it('carries what the room opens on', () => {
    const [event, , crew] = mutedRoomsFrom(payload, NOW)
    expect(event.eventTitle).toBe('Bass Thursday')
    expect(crew.crewId).toBe('crew_1')
  })

  it('takes a bare array, and nothing, without throwing', () => {
    expect(mutedRoomsFrom([{ id: 'x', name: 'X', mute: { muted: true, until: null } }], NOW)).toHaveLength(1)
    for (const bad of [null, undefined, 'x', {}, { groups: 'no' }]) expect(mutedRoomsFrom(bad, NOW)).toEqual([])
  })
})

describe('hasMorePages', () => {
  it('is only what the server says', () => {
    expect(hasMorePages({ pagination: { hasMore: true } })).toBe(true)
    for (const no of [{ pagination: { hasMore: false } }, { pagination: {} }, {}, null, [], { pagination: { hasMore: 'yes' } }]) expect(hasMorePages(no)).toBe(false)
  })
})

describe('the words', () => {
  it('says when a mute ends, and "until you turn it back on" for no end', () => {
    expect(muteEnds({ muted: true, until: null }, NOW)).toBe('until you turn it back on')
    expect(muteEnds({ muted: true, until: later(3) }, NOW)).toMatch(/^until \d/)
    expect(muteEnds({ muted: false, until: null }, NOW)).toBe('')
  })

  it('Settings says the count when there is one, else On or Off, else nothing while unknown', () => {
    expect(notificationsHint(2, true)).toBe('2 rooms muted')
    expect(notificationsHint(1, true)).toBe('1 room muted')
    expect(notificationsHint(0, true)).toBe('On')
    expect(notificationsHint(0, false)).toBe('Off')
    expect(notificationsHint(0, null)).toBeUndefined()
  })

  it('says "N+" when the count is only what was read so far', () => {
    expect(notificationsHint(3, true, true)).toBe('3+ rooms muted')
    expect(notificationsHint(1, true, true)).toBe('1+ rooms muted')
  })
})

describe('mutedRoomRoute', () => {
  const mute = { muted: true, until: null }
  it('opens an event’s or a place’s room on its info, a crew on its page, a Blend on the room', () => {
    expect(mutedRoomRoute({ id: 'e1', title: 'Bass Thursday', kind: 'event', eventTitle: 'Bass Thursday', mute })).toEqual({
      pathname: '/chat-info/[id]',
      params: { id: 'e1', roomName: 'Bass Thursday', eventTitle: 'Bass Thursday' },
    })
    expect(mutedRoomRoute({ id: 'c1', title: 'Nebula', kind: 'crew', crewId: 'crew_1', mute })).toEqual({ pathname: '/crews/[crewId]', params: { crewId: 'crew_1' } })
    expect(mutedRoomRoute({ id: 'b1', title: 'Blend · A × B', kind: 'blend', blendId: 'bl_1', mute })).toEqual({
      pathname: '/chat/[id]',
      params: { id: 'b1', roomName: 'Blend · A × B', kind: 'blend', blendId: 'bl_1' },
    })
  })
  it('a crew with no crew id still opens, as its room', () => {
    expect(mutedRoomRoute({ id: 'c1', title: 'Nebula', kind: 'crew', mute }).pathname).toBe('/chat/[id]')
  })
})

describe('the server’s own read', () => {
  const mute = { muted: true, until: null }
  it('takes rows as a chat list’s, event rooms and crew and Blend rooms together', () => {
    const rows = mutedRoomsFromServer({ rooms: [{ id: 'e1', event: { title: 'Bass' }, mute }, { id: 'c1', kind: 'crew', name: 'Nebula', crewId: 'k1', mute }, { id: 'e2', event: { title: 'No' }, mute: { muted: false, until: null } }] })
    expect(rows?.map((r) => [r.id, r.kind])).toEqual([['e1', 'event'], ['c1', 'crew']])
  })
  it('an answer with no rooms list is not an answer, so the caller falls back', () => {
    for (const bad of [null, {}, { rooms: 'x' }]) expect(mutedRoomsFromServer(bad)).toBeNull()
  })
  it('reads the count the server puts on the notification preferences, and only a count', () => {
    expect(mutedCountFrom({ mutedRooms: 7 })).toBe(7)
    for (const bad of [null, {}, { mutedRooms: '7' }, { mutedRooms: -1 }]) expect(mutedCountFrom(bad)).toBeNull()
  })
})
