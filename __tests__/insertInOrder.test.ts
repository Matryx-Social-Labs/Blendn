import { insertInOrder } from '../lib/insertInOrder'

type M = { id: string; at: string }
const t = (s: number) => `2026-10-15T19:06:0${s}.000Z`
const put = (list: M[], item: M) => insertInOrder(list, item, (m) => m.at, (m) => m.id, (m) => m.id.startsWith('temp-')).map((m) => m.id)

describe('insertInOrder (SCRUM-1168)', () => {
  const held: M[] = [
    { id: 'a', at: t(1) },
    { id: 'b', at: t(2) },
    { id: 'd', at: t(4) },
    { id: 'e', at: t(5) },
  ]

  it('puts a late arrival between its neighbours and leaves the list as it was', () => {
    expect(put(held, { id: 'c', at: t(3) })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(held.map((m) => m.id)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('goes first, last, or into an empty list', () => {
    expect(put(held, { id: 'z', at: t(0) })).toEqual(['z', 'a', 'b', 'd', 'e'])
    expect(put(held, { id: 'f', at: t(6) })).toEqual(['a', 'b', 'd', 'e', 'f'])
    expect(put([], { id: 'a', at: t(1) })).toEqual(['a'])
  })

  it('breaks a tie by id, and puts a time that does not parse last', () => {
    expect(put(held, { id: 'c', at: t(2) })).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(put(held, { id: 'x', at: 'not a time' })).toEqual(['a', 'b', 'd', 'e', 'x'])
  })

  it('goes above what only this phone holds, whatever its clock says', () => {
    // A send in flight stamped by a phone clock ahead of the server's, and one behind it.
    expect(put([...held, { id: 'temp-1', at: t(9) }], { id: 'f', at: t(6) })).toEqual(['a', 'b', 'd', 'e', 'f', 'temp-1'])
    expect(put([...held, { id: 'temp-1', at: t(0) }], { id: 'f', at: t(6) })).toEqual(['a', 'b', 'd', 'e', 'f', 'temp-1'])
  })
})
