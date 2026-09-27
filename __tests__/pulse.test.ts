import {
  dayGroupLabel,
  featuredDateLabel,
  groupByDay,
  joinedCount,
  nextUpLabel,
  placeLabel,
  timeLabel,
} from '../lib/pulse'

/**
 * The labels on a Pulse card.
 *
 * Every one of these is a rule somebody can disagree with, which is exactly why
 * none of them live inside a `<Text>`. The one worth reading closely is
 * "Today", which is the one that can be wrong in a way that sends somebody out
 * on the wrong night.
 */

// A fixed local date, so these never depend on when they are run. October has
// 31 days, which is what makes the month-boundary cases below reachable.
const NOW = new Date(2026, 9, 24, 18, 0, 0) // Sat 24 Oct 2026, 6pm local

const at = (y: number, m: number, d: number, h = 20) => new Date(y, m, d, h).toISOString()

describe('dayGroupLabel', () => {
  it('says Today and Tomorrow, with the weekday beside them', () => {
    expect(dayGroupLabel(at(2026, 9, 24, 21), NOW)).toEqual({ title: 'Today', weekday: 'Saturday' })
    expect(dayGroupLabel(at(2026, 9, 25, 9), NOW)).toEqual({ title: 'Tomorrow', weekday: 'Sunday' })
  })

  it('names any later day by its date', () => {
    expect(dayGroupLabel(at(2026, 10, 2), NOW)).toEqual({ title: 'Nov 2', weekday: 'Monday' })
  })

  it('adds the year only when it is not this one', () => {
    expect(dayGroupLabel(at(2027, 0, 3), NOW)?.title).toBe('Jan 3, 2027')
  })

  it('returns null for a date it cannot read rather than "Invalid Date"', () => {
    expect(dayGroupLabel('not a date', NOW)).toBeNull()
    expect(dayGroupLabel('', NOW)).toBeNull()
  })
})

describe('groupByDay', () => {
  const ev = (id: string, start: string) => ({ id, start_time: start })

  it('splits a sorted list into runs of one calendar day, keeping the order', () => {
    const groups = groupByDay(
      [
        ev('a', at(2026, 9, 24, 19)),
        ev('b', at(2026, 9, 24, 22)),
        ev('c', at(2026, 9, 25, 9)),
        ev('d', at(2026, 10, 2)),
      ],
      NOW
    )
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Tomorrow', ['c']],
      ['Nov 2', ['d']],
    ])
  })

  it('leaves out an event it cannot date rather than inventing a day for it', () => {
    expect(groupByDay([ev('x', 'nope'), ev('y', at(2026, 9, 24))], NOW).map((g) => g.items.length)).toEqual([1])
  })

  it('is empty for nothing', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })
})

describe('timeLabel', () => {
  it('shows the local start time with minutes', () => {
    expect(timeLabel(new Date(2026, 9, 24, 19, 0).toISOString())).toMatch(/7:00/)
    expect(timeLabel(new Date(2026, 9, 24, 9, 30).toISOString())).toMatch(/9:30/)
  })

  it('returns empty for a date it cannot read', () => {
    expect(timeLabel('nope')).toBe('')
  })
})

describe('featuredDateLabel', () => {
  it('says Today and Tomorrow', () => {
    expect(featuredDateLabel(at(2026, 9, 24, 21), NOW)).toBe('Today')
    expect(featuredDateLabel(at(2026, 9, 25, 9), NOW)).toBe('Tomorrow')
  })

  it('counts calendar days, not elapsed hours', () => {
    /*
     * The failure this exists for. At 6pm, a 9am start tomorrow is 15 hours
     * away — under 24 — so subtracting timestamps and dividing calls it 0 and
     * prints "Today", on a card telling somebody where to be tonight.
     *
     * The reverse matters too: 11pm tonight is five hours away and genuinely is
     * today.
     */
    expect(featuredDateLabel(at(2026, 9, 25, 9), NOW)).toBe('Tomorrow')
    expect(featuredDateLabel(at(2026, 9, 24, 23), NOW)).toBe('Today')
  })

  it('falls back to a short date past tomorrow', () => {
    // "In 3 days" stops being useful around two and starts being vague.
    expect(featuredDateLabel(at(2026, 9, 27), NOW)).toBe('Oct 27')
    expect(featuredDateLabel(at(2026, 10, 2), NOW)).toBe('Nov 2')
  })

  it('carries the year across a new year', () => {
    expect(featuredDateLabel(at(2027, 0, 1), NOW)).toBe('Jan 1, 2027')
  })

  it('is empty for an unreadable date', () => {
    expect(featuredDateLabel('nope', NOW)).toBe('')
  })
})

describe('placeLabel', () => {
  it('prefers the venue and falls back to the city', () => {
    expect(placeLabel({ venue_name: 'The Humming Tree', city: 'Bengaluru' })).toBe(
      'The Humming Tree'
    )
    expect(placeLabel({ venue_name: '', city: 'Bengaluru' })).toBe('Bengaluru')
    expect(placeLabel({ venue_name: '   ', city: 'Bengaluru' })).toBe('Bengaluru')
  })

  it('says nothing rather than "Venue to be announced"', () => {
    /*
     * The old featured card printed that string, and it is a claim rather than
     * a blank: it tells the reader the organiser has not picked a venue yet,
     * when what actually happened is that this response did not carry the
     * field. Absent data has no honest sentence.
     */
    expect(placeLabel({ venue_name: null, city: null })).toBeNull()
    expect(placeLabel({})).toBeNull()
  })
})

describe('joinedCount', () => {
  it('reads a real count', () => {
    expect(joinedCount({ current_capacity: 142 })).toBe(142)
  })

  it('treats zero as nothing to say', () => {
    // "0 joined" reads as a verdict on the event, and every event is 0 for a
    // while — including the first one anybody sees after we launch in a city.
    expect(joinedCount({ current_capacity: 0 })).toBeNull()
  })

  it('ignores values that are not counts', () => {
    expect(joinedCount({ current_capacity: null })).toBeNull()
    expect(joinedCount({ current_capacity: -3 })).toBeNull()
    expect(joinedCount({ current_capacity: Number.NaN })).toBeNull()
    expect(joinedCount({})).toBeNull()
  })
})

describe('nextUpLabel', () => {
  // NOW is Sat 24 Oct 2026, 6pm. The time half is the phone's own format, so
  // it is compared through `timeLabel` rather than spelled out.
  const end = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString()

  it('says Happening now between the start and the end', () => {
    expect(nextUpLabel(at(2026, 9, 24, 17), end(2026, 9, 24, 23), NOW)).toBe('Happening now')
  })

  it('is not Happening now once it has ended, or when the end is unknown', () => {
    expect(nextUpLabel(at(2026, 9, 24, 10), end(2026, 9, 24, 12), NOW)).toBe(
      `Today · ${timeLabel(at(2026, 9, 24, 10))}`
    )
    expect(nextUpLabel(at(2026, 9, 24, 17), null, NOW)).toBe(`Tonight · ${timeLabel(at(2026, 9, 24, 17))}`)
  })

  it('says Tonight from 5pm today, Today before it', () => {
    const tonight = at(2026, 9, 24, 21)
    expect(nextUpLabel(tonight, end(2026, 9, 24, 23), NOW)).toBe(`Tonight · ${timeLabel(tonight)}`)
    const morning = new Date(2026, 9, 24, 10)
    const earlyNow = new Date(2026, 9, 24, 8)
    expect(nextUpLabel(morning.toISOString(), end(2026, 9, 24, 12), earlyNow)).toBe(
      `Today · ${timeLabel(morning.toISOString())}`
    )
  })

  it('says Tomorrow by calendar day, not by hours away', () => {
    // 9am tomorrow is 15 hours from 6pm — still Tomorrow, never Today.
    const t = at(2026, 9, 25, 9)
    expect(nextUpLabel(t, end(2026, 9, 25, 12), NOW)).toBe(`Tomorrow · ${timeLabel(t)}`)
  })

  it('names a later day by weekday and date, with the year only when it differs', () => {
    const t = at(2026, 10, 7, 19)
    expect(nextUpLabel(t, end(2026, 10, 7, 23), NOW)).toBe(`Sat, Nov 7 · ${timeLabel(t)}`)
    const next = at(2027, 0, 2, 19)
    expect(nextUpLabel(next, end(2027, 0, 2, 23), NOW)).toBe(`Sat, Jan 2, 2027 · ${timeLabel(next)}`)
  })

  it('is empty for a start it cannot read', () => {
    expect(nextUpLabel('not a date', null, NOW)).toBe('')
  })
})
