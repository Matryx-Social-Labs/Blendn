import { betweenDaysLine, parseEventDays, runRange } from '../lib/eventDays'

/**
 * Flow 3 · 3.2 frames 04 and 06: the hero's date range ("Sat 27 – Mon 29 Sep") and the between-days line ("Day 3 starts Tue
 * 29 Sep, 9 PM", the server's sentence for the door's refusal, which the Scene says before anybody asks, in the app's one date).
 */
const day = (date: string, cancelled = false) => ({ date, cancelled, cancelledAt: cancelled ? '2030-01-01T00:00:00Z' : null })
const run = (dates: string[], extra: Record<string, unknown> = {}) =>
  parseEventDays({ days: dates.map((d) => day(d)), dayCount: dates.length, daysFrom: 1, dayNumber: 2, ...extra })!

describe('the hero range of a run', () => {
  const noRun = { start_time: '2031-01-01T00:00:00Z', end_time: '2031-01-01T00:00:00Z' }

  it('is first day to last, the month said once when it is the same', () => {
    expect(runRange(run(['2026-09-26', '2026-09-27', '2026-09-28']), noRun, 'Asia/Kolkata')).toBe('Sat 26 – Mon 28 Sep')
  })

  it('says both months when the run crosses one', () => {
    expect(runRange(run(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']), noRun, 'Asia/Kolkata')).toBe('Tue 29 Sep – Fri 2 Oct')
  })

  it('is a calendar date, so no time zone moves it a day', () => {
    const days = run(['2026-09-26', '2026-09-27'])
    expect(runRange(days, noRun, 'America/Los_Angeles')).toBe(runRange(days, noRun, 'Asia/Kolkata'))
  })

  it('a long run listed as a window reads its ends from the run itself, in the event zone', () => {
    // 2026-09-26T19:00Z is already the 27th in Kolkata; the run ends 2026-12-24 evening local.
    const window = run(['2026-10-20', '2026-10-21'], { dayCount: 90, daysFrom: 25 })
    const range = runRange(window, { start_time: '2026-09-26T19:00:00Z', end_time: '2026-12-24T14:00:00Z' }, 'Asia/Kolkata')
    expect(range).toBe('Sun 27 Sep – Thu 24 Dec')
  })
})

describe('the between-days line', () => {
  // Day 3 opens 2026-09-29 21:00 IST = 15:30Z.
  const next = '2026-09-29T15:30:00Z'

  it('names the next day in the event zone, in the app\'s one date and clock', () => {
    expect(betweenDaysLine(run(['2026-09-27', '2026-09-28', '2026-09-29'], { dayNumber: 3 }), next, 'Asia/Kolkata')).toBe('Day 3 starts Tue 29 Sep, 9 PM')
  })

  it('names the next day going ahead, so a called-off day is skipped', () => {
    const days = parseEventDays({ days: [day('2026-09-27'), day('2026-09-28', true), day('2026-09-29')], dayCount: 3, daysFrom: 1, dayNumber: 3 })!
    expect(betweenDaysLine(days, next, 'Asia/Kolkata')).toBe('Day 3 starts Tue 29 Sep, 9 PM')
  })

  it('is nothing when every day is called off, or when the start is not a time', () => {
    expect(betweenDaysLine(run(['2026-09-27', '2026-09-28'], { dayNumber: null }), next, 'Asia/Kolkata')).toBeNull()
    expect(betweenDaysLine(run(['2026-09-27', '2026-09-28']), 'soon', 'Asia/Kolkata')).toBeNull()
  })

  it('an unknown zone falls back to the phone\'s, rather than throwing', () => {
    expect(betweenDaysLine(run(['2026-09-27', '2026-09-28']), next, 'Not/AZone')).toMatch(/^Day 2 starts /)
  })
})
