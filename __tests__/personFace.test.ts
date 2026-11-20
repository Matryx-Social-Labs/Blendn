import { initialOf, metInLine, personFace } from '../lib/personFace'

describe('personFace: one identity rule for every Banter face (F1 B, owner 2026-11-12)', () => {
  test('an anonymous person is their creature, seeded on the pseudonym', () => {
    expect(personFace({ named: false, name: 'Rustic Lark', photo: null })).toEqual({ kind: 'creature', pseudonym: 'Rustic Lark' })
  })

  test('an anonymous person never shows a photo, even if one arrives', () => {
    expect(personFace({ named: false, name: 'Rustic Lark', photo: 'https://x/p.jpg' })).toEqual({ kind: 'creature', pseudonym: 'Rustic Lark' })
  })

  test('a named person with no photo is their initial, never a creature', () => {
    expect(personFace({ named: true, name: 'Audit Host 09', photo: null })).toEqual({ kind: 'initial', name: 'Audit Host 09' })
    expect(personFace({ named: true, name: 'Kavya Raman', photo: '  ' })).toEqual({ kind: 'initial', name: 'Kavya Raman' })
  })

  test('a named person with a photo is that photo', () => {
    expect(personFace({ named: true, name: 'Aditi Verma', photo: 'https://x/a.jpg' })).toEqual({ kind: 'photo', uri: 'https://x/a.jpg' })
  })

  test('a host is never drawn as a person: the creature, whatever else is known', () => {
    expect(personFace({ named: true, name: 'Toit Brewpub', photo: 'https://x/h.jpg', host: true })).toEqual({ kind: 'creature', pseudonym: 'Toit Brewpub' })
  })
})

describe('initialOf', () => {
  test.each([
    ['Audit Host 09', 'A'],
    ['émile durand', 'É'],
    ['😀 Sam Rao', 'S'],
    ['प्रियंका शर्मा', 'प'],
    ['9to5 Collective', '9'],
    ['  zoë', 'Z'],
    ['李小龙', '李'],
  ])('%s → %s', (name, expected) => {
    expect(initialOf(name)).toBe(expected)
  })

  test('a name with no letter or digit falls back to its first character, and an empty one to "?"', () => {
    expect(initialOf('😀')).toBe('😀')
    expect(initialOf('   ')).toBe('?')
  })
})

describe('metInLine: where you met, from the server (admin #935)', () => {
  test('an event room', () => {
    expect(metInLine({ kind: 'event', name: 'Bengaluru Design Festival 2026' })).toBe('Met in the room at Bengaluru Design Festival 2026')
  })

  test("a venue day's room is named for the venue", () => {
    expect(metInLine({ kind: 'venue_day', name: 'Toit' })).toBe('Met in the room at Toit')
  })

  test('no origin, an unknown kind or a blank name says nothing', () => {
    expect(metInLine(null)).toBeNull()
    expect(metInLine(undefined)).toBeNull()
    expect(metInLine({ kind: 'crew' as never, name: 'Your ride' })).toBeNull()
    expect(metInLine({ kind: 'event', name: '   ' })).toBeNull()
  })
})

describe("requestFrom carries the server's metIn, validated at the boundary", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requestFrom } = require('../lib/useBanterInbox') as typeof import('../lib/useBanterInbox')
  const base = { id: 'r1', senderId: 'u1', sender: { id: 'u1', name: 'Kavya Raman', avatar: null }, message: 'Hi', createdAt: '2026-11-14T00:00:00Z' }

  test('an event origin is kept', () => {
    expect(requestFrom({ ...base, metIn: { kind: 'event', name: 'Bengaluru Design Festival 2026' } }).met_in).toEqual({ kind: 'event', name: 'Bengaluru Design Festival 2026' })
  })

  test('a Lobby origin is kept, with what the post is about (admin #991)', () => {
    expect(requestFrom({ ...base, metIn: { kind: 'board_post', name: 'Rooftop Sundowner', subKind: 'ride', yours: true } }).met_in).toEqual({
      kind: 'board_post',
      name: 'Rooftop Sundowner',
      subKind: 'ride',
      yours: true,
    })
    expect(requestFrom({ ...base, metIn: { kind: 'board_post', name: 'X', subKind: 'yacht', yours: 'yes' } }).met_in).toEqual({
      kind: 'board_post',
      name: 'X',
      subKind: null,
      yours: false,
    })
  })

  test('absent, null or malformed is null (an older server, a raw id, a gone room)', () => {
    expect(requestFrom(base).met_in).toBeNull()
    expect(requestFrom({ ...base, metIn: null }).met_in).toBeNull()
    expect(requestFrom({ ...base, metIn: { kind: 'event', name: 42 } }).met_in).toBeNull()
    expect(requestFrom({ ...base, metIn: { kind: 'lobby', name: 'Your ride' } }).met_in).toBeNull()
  })
})
