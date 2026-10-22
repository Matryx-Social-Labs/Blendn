import { opensInLabel, opensInSpoken, roomOpensAt } from '../lib/preEventRoom'

const HOUR = 60 * 60 * 1000
const start = '2026-10-24T20:00:00.000Z'
const opens = Date.parse(start) - 24 * HOUR

describe('the pre-event room countdown', () => {
  it('opens a day before doors', () => {
    expect(roomOpensAt(start)).toBe(opens)
  })

  it('says hours and minutes, as the frame does', () => {
    expect(opensInLabel(start, opens - (3 * 60 + 20) * 60 * 1000)).toBe('3h 20m')
  })

  it('rounds up so it never reads 0m while the room is shut', () => {
    expect(opensInLabel(start, opens - 1000)).toBe('1m')
    expect(opensInLabel(start, opens - 59 * 60 * 1000 - 1)).toBe('1h')
  })

  it('says days past a day', () => {
    expect(opensInLabel(start, opens - 52 * HOUR)).toBe('2d 4h')
    expect(opensInLabel(start, opens - 48 * HOUR)).toBe('2d')
  })

  it('says nothing once the room is open, or when the start is not known', () => {
    expect(opensInLabel(start, opens)).toBeNull()
    expect(opensInLabel(start, opens + HOUR)).toBeNull()
    expect(opensInLabel(null, opens - HOUR)).toBeNull()
    expect(opensInLabel('not a date', opens - HOUR)).toBeNull()
  })

  it('reads the label aloud in words', () => {
    expect(opensInSpoken('3h 20m')).toBe('3 hours 20 minutes')
    expect(opensInSpoken('1h')).toBe('1 hour')
    expect(opensInSpoken('2d 4h')).toBe('2 days 4 hours')
    expect(opensInSpoken('1m')).toBe('1 minute')
  })
})
