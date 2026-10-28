import { endsAtMs, recapPeopleOpen, roomRecap, timeSpentLabel } from '../lib/roomRecap'

const END = '2026-09-28T23:00:00Z'
const endMs = Date.parse(END)
const event = { id: 'e1', title: 'Warehouse night', endsAt: END }

describe('endsAtMs', () => {
  it('has no end time for a missing or broken one', () => {
    expect(endsAtMs(END)).toBe(endMs)
    expect(endsAtMs(undefined)).toBeNull()
    expect(endsAtMs(null)).toBeNull()
    expect(endsAtMs('not a date')).toBeNull()
    expect(endsAtMs('')).toBeNull()
  })
})

describe('timeSpentLabel', () => {
  it('reads as a duration, uncapped', () => {
    expect(timeSpentLabel(20_000)).toBe('Under a minute')
    expect(timeSpentLabel(45 * 60_000)).toBe('45 min')
    expect(timeSpentLabel(120 * 60_000)).toBe('2h')
    expect(timeSpentLabel(375 * 60_000)).toBe('6h 15m')
  })

  it('never goes negative', () => {
    expect(timeSpentLabel(-5000)).toBe('Under a minute')
  })
})

describe('roomRecap', () => {
  const people = [{ matched: true }, { matched: false }, { matched: true }]

  it('is null while the night is still going', () => {
    expect(roomRecap({ event, checkedInAt: '2026-09-28T20:00:00Z', people }, endMs - 60_000)).toBeNull()
  })

  it('counts matches and the time you were there', () => {
    expect(roomRecap({ event, checkedInAt: '2026-09-28T20:30:00Z', people }, endMs)).toEqual({
      eventId: 'e1',
      title: 'Warehouse night',
      timeSpent: '2h 30m',
      minutes: 150,
      matched: 2,
    })
  })

  it('measures to the end of the event, not to the morning after', () => {
    const nextMorning = endMs + 10 * 60 * 60_000
    expect(roomRecap({ event, checkedInAt: '2026-09-28T22:00:00Z', people: [] }, nextMorning)?.timeSpent).toBe('1h')
  })

  it('leaves the time out rather than inventing one', () => {
    expect(roomRecap({ event, checkedInAt: null, people: [] }, endMs)?.timeSpent).toBeNull()
    expect(roomRecap({ event, checkedInAt: null, people: [] }, endMs)?.minutes).toBeNull()
  })
})

describe('recapPeopleOpen (ROOM-06): People from tonight until the chat closes', () => {
  const DAY = 24 * 60 * 60_000
  it('offered from the end until 24 hours after, and not before or after', () => {
    expect(recapPeopleOpen(END, endMs - 1)).toBe(false)
    expect(recapPeopleOpen(END, endMs)).toBe(true)
    expect(recapPeopleOpen(END, endMs + DAY - 1)).toBe(true)
    expect(recapPeopleOpen(END, endMs + DAY)).toBe(false)
  })
  it('an unknown end is never offered', () => {
    expect(recapPeopleOpen(null, endMs)).toBe(false)
    expect(recapPeopleOpen('nope', endMs)).toBe(false)
  })
})

describe('recapPeopleOpen follows the door’s own closing time (L1)', () => {
  it('uses write.closesAt when the server sent it, in place of end + 24 h', () => {
    const closes = new Date(endMs + 3 * 60 * 60_000).toISOString()
    expect(recapPeopleOpen(END, endMs + 3 * 60 * 60_000 - 1, closes)).toBe(true)
    expect(recapPeopleOpen(END, endMs + 3 * 60 * 60_000, closes)).toBe(false)
  })
  it('an unreadable closesAt falls back to 24 h', () => {
    expect(recapPeopleOpen(END, endMs + 60_000, 'nope')).toBe(true)
  })
})
