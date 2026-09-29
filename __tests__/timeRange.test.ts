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
