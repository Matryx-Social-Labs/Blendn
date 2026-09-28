import { endsAtMs, roomHasEnded, roomRecap, timeSpentLabel } from '../lib/roomRecap'

const END = '2026-09-28T23:00:00Z'
const endMs = Date.parse(END)
const event = { id: 'e1', title: 'Warehouse night', endsAt: END }

describe('roomHasEnded', () => {
  it('is over at the end time, not a minute after', () => {
    expect(roomHasEnded(END, endMs - 1)).toBe(false)
    expect(roomHasEnded(END, endMs)).toBe(true)
  })

  it('never closes a room on a missing or broken end time', () => {
    expect(roomHasEnded(undefined, endMs)).toBe(false)
    expect(roomHasEnded(null, endMs)).toBe(false)
    expect(roomHasEnded('not a date', endMs)).toBe(false)
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
      matched: 2,
    })
  })

  it('measures to the end of the event, not to the morning after', () => {
    const nextMorning = endMs + 10 * 60 * 60_000
    expect(roomRecap({ event, checkedInAt: '2026-09-28T22:00:00Z', people: [] }, nextMorning)?.timeSpent).toBe('1h')
  })

  it('leaves the time out rather than inventing one', () => {
    expect(roomRecap({ event, checkedInAt: null, people: [] }, endMs)?.timeSpent).toBeNull()
  })
})
