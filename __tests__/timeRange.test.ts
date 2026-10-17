import { formatTimeRange } from '../lib/time'

describe('formatTimeRange', () => {
  it('dates an evening that runs past midnight by the day it starts', () => {
    // 29 Sep, 18:00 → 30 Sep, 00:00 in Kolkata: the 29th's event, not the 30th's.
    const label = formatTimeRange('2026-09-29T12:30:00.000Z', '2026-09-29T18:30:00.000Z', {
      includeDate: true,
      timezone: 'Asia/Kolkata',
    })
    expect(label).toMatch(/September 29$/)
    expect(label).not.toMatch(/30/)
  })

  it('leaves the date off unless asked', () => {
    const label = formatTimeRange('2026-09-29T12:30:00.000Z', '2026-09-29T18:30:00.000Z', { timezone: 'Asia/Kolkata' })
    expect(label).not.toMatch(/September/)
  })
})

describe('chatClock — one time format in every chat (Flow 5)', () => {
  const { chatClock } = jest.requireActual('../lib/time') as typeof import('../lib/time')
  const at = (h: number, m: number) => new Date(2026, 9, 15, h, m)
  it('says h:mm AM/PM, never the device locale', () => {
    expect(chatClock(at(21, 38))).toBe('9:38 PM')
    expect(chatClock(at(0, 5))).toBe('12:05 AM')
    expect(chatClock(at(12, 0))).toBe('12:00 PM')
    expect(chatClock(at(9, 7))).toBe('9:07 AM')
  })
  it('is empty for a time it cannot read', () => {
    expect(chatClock('not a date')).toBe('')
  })
})
