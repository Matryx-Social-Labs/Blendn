import {
  featuredDateLabel,
  joinedCount,
  placeLabel,
  upcomingDayLabel,
} from '../lib/pulse'

/**
 * The labels on a Pulse card.
 *
 * Every one of these is a rule somebody can disagree with, which is exactly why
 * none of them live inside a `<Text>`. The two worth reading closely are the
 * month-dropping rule (a real reading of the frame, not three inconsistent
 * labels) and "Today", which is the one that can be wrong in a way that sends
 * somebody out on the wrong night.
 */

// A fixed local date, so these never depend on when they are run. October has
// 31 days, which is what makes the month-boundary cases below reachable.
const NOW = new Date(2026, 9, 24, 18, 0, 0) // Sat 24 Oct 2026, 6pm local

const at = (y: number, m: number, d: number, h = 20) => new Date(y, m, d, h).toISOString()

describe('upcomingDayLabel', () => {
  it('drops the month while it is the month you are already in', () => {
    // The frame's own rhythm: 28 / 30 / Nov 2. The heading says "Upcoming", so
    // repeating "Oct" down the column spends space on the part that is not
    // changing.
    expect(upcomingDayLabel(at(2026, 9, 28), NOW)).toBe('28')
    expect(upcomingDayLabel(at(2026, 9, 30), NOW)).toBe('30')
  })

  it('brings the month back the moment the list crosses into it', () => {
    expect(upcomingDayLabel(at(2026, 10, 2), NOW)).toBe('Nov 2')
  })

  it('adds the year only when it is not this one', () => {
    expect(upcomingDayLabel(at(2027, 0, 3), NOW)).toBe('Jan 3, 2027')
  })

  it('returns empty for a date it cannot read rather than "Invalid Date"', () => {
    expect(upcomingDayLabel('not a date', NOW)).toBe('')
    expect(upcomingDayLabel('', NOW)).toBe('')
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
