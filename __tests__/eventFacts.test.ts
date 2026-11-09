/**
 * The event page's words (Flow 4 E-B, `flow-4/screens.js`): the date stamp, the guide rows' lines, and the dock's state
 * and one action per attendance state. Pure, so every branch is pinned here; the screen test checks they are drawn.
 */
import { dateStamp, eventDock, shortDistance, untilWords, whoLine } from '../lib/eventFacts'
import { WORST } from './helpers/longText'

const IST = 'Asia/Kolkata'
// Tue 11 Nov 2025, 8 AM in Bengaluru.
const TUE_8AM = '2025-11-11T02:30:00Z'

describe('dateStamp: weekday, day and month in capitals, and the words a screen reader says', () => {
  it('is the event city’s day, not the phone’s', () => {
    expect(dateStamp(TUE_8AM, IST)).toEqual({ dow: 'TUE', dd: '11', mon: 'NOV', spoken: 'Tuesday 11 November' })
    // 2:30 UTC is still Monday in Toronto.
    expect(dateStamp(TUE_8AM, 'America/Toronto')?.dow).toBe('MON')
  })
  it('is null for a date it cannot read (control: a real date is not)', () => {
    expect(dateStamp('', IST)).toBeNull()
    expect(dateStamp('not a date', IST)).toBeNull()
    expect(dateStamp(TUE_8AM, IST)).not.toBeNull()
  })
})

describe('untilWords: when it ends, in the event city’s clock, never a zone label', () => {
  it('says midnight rather than 12 AM', () => {
    expect(untilWords('2025-11-08T18:30:00Z', IST)).toBe('Till midnight')
  })
  it('says the clock otherwise', () => {
    expect(untilWords('2025-11-11T04:30:00Z', IST)).toBe('Till 10 AM')
    expect(untilWords('2025-11-11T05:00:00Z', IST)).toBe('Till 10:30 AM')
  })
  it('is null with no end', () => {
    expect(untilWords(null, IST)).toBeNull()
    expect(untilWords('', IST)).toBeNull()
  })
})

describe('shortDistance: the Where row’s "4.3 km"', () => {
  it('metres under one kilometre, one decimal under ten, whole above', () => {
    expect(shortDistance(0.42)).toBe('420 m')
    expect(shortDistance(4.31)).toBe('4.3 km')
    expect(shortDistance(12.4)).toBe('12 km')
  })
  it('is null with no fix', () => {
    expect(shortDistance(null)).toBeNull()
    expect(shortDistance(Number.NaN)).toBeNull()
  })
})

describe('whoLine: a count, not a list; the exact number, because a page row is not a compact surface', () => {
  it('prints five and up, grouped, with the word for the hour', () => {
    expect(whoLine({ count: WORST.count, word: 'going', minAge: 18 })).toEqual({ count: '12,480', word: 'going', facts: ['18+'], first: false })
    expect(whoLine({ count: 23, word: 'here now', minAge: null })).toEqual({ count: '23', word: 'here now', facts: [], first: false })
  })
  it('the entry facts follow, each its own segment: the age, the door, how full', () => {
    expect(whoLine({ count: 42, word: 'going', minAge: 21, door: 'Guest list', spots: '8 spots left' }).facts).toEqual(['21+', 'Guest list', '8 spots left'])
  })
  it('under five there is no number: the age alone, or "Be one of the first"', () => {
    expect(whoLine({ count: 4, word: 'going', minAge: 21 })).toEqual({ count: null, word: 'going', facts: ['21+'], first: false })
    expect(whoLine({ count: 0, word: 'going', minAge: null })).toEqual({ count: null, word: 'going', facts: [], first: true })
  })
})

describe('eventDock: state on the left in its own slot, one action on the right', () => {
  const base = { when: 'Sat 8 Nov · 6 PM', roomOpen: false, canInvite: true, between: null, alone: false }
  const dock = (o: Partial<Parameters<typeof eventDock>[0]> & { cta: Parameters<typeof eventDock>[0]['cta'] }) => eventDock({ ...base, ...o })!
  it('free, before the doors: "Free", the date, and the gradient I’m going', () => {
    expect(eventDock({ ...base, cta: 'rsvp' })).toEqual({
      state: 'Free',
      sub: 'Sat 8 Nov · 6 PM',
      action: { label: 'I’m going', kind: 'primary', does: 'rsvp' },
    })
  })
  it('going, before the doors: "You’re going", Change, and a lit Invite (the system share sheet)', () => {
    expect(eventDock({ ...base, cta: 'rsvpd' })).toEqual({
      state: 'You’re going',
      sub: 'Change',
      change: true,
      action: { label: 'Invite', kind: 'lit', icon: 'share', does: 'invite' },
    })
  })
  it('an event that may not be shared has no Invite (hidden, never disabled)', () => {
    expect(dock({ cta: 'rsvpd', canInvite: false }).action).toBeUndefined()
  })
  it('between the days of a run the next door is said where Change was; the state still changes the RSVP', () => {
    const d = dock({ cta: 'rsvpd', between: 'Day 3 starts Tue 29 Sep, 9 PM' })
    expect(d.sub).toBe('Day 3 starts Tue 29 Sep, 9 PM')
    expect(d.change).toBe(true)
  })
  it('the room is open: "The room is open" and Open the room, which is the primary', () => {
    expect(eventDock({ ...base, cta: 'rsvpd', roomOpen: true })).toEqual({
      state: 'You’re going',
      sub: 'The room is open',
      change: true,
      action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'openRoom' },
    })
  })
  it('between days with the room open, the next door is still what the state says; the room is the action', () => {
    const d = dock({ cta: 'rsvpd', roomOpen: true, between: 'Day 3 starts Tue 29 Sep, 9 PM' })
    expect(d.sub).toBe('Day 3 starts Tue 29 Sep, 9 PM')
    expect(d.action?.does).toBe('openRoom')
  })
  it('waitlisted is never "You’re going", and asks nobody else to a full night', () => {
    const d = dock({ cta: 'waitlisted' })
    expect(d.state).toBe('On the waitlist')
    expect(d.change).toBe(true)
    expect(d.action).toBeUndefined()
  })
  it('checked in: the room, and the way out under the state as its own link (option A, SCRUM-1035)', () => {
    expect(eventDock({ ...base, cta: 'going' })).toEqual({
      state: 'You’re in',
      sub: 'Check out',
      checkOut: true,
      action: { label: 'Open the room', kind: 'primary', icon: 'door-open', does: 'room' },
    })
  })
  it('only checked in carries the check-out link', () => {
    for (const cta of ['rsvp', 'rsvpd', 'waitlisted', 'rate', 'ended', 'cancelled'] as const) expect(dock({ cta }).checkOut).toBeUndefined()
  })
  it('after it: rate who you met, or the night when nobody else came; tonight for somebody who was not there', () => {
    expect(dock({ cta: 'rate' }).action).toEqual({ label: 'Rate who you met', kind: 'primary', icon: 'star', does: 'rate' })
    expect(dock({ cta: 'rate', alone: true }).action?.label).toBe('Rate the night')
    expect(eventDock({ ...base, cta: 'ended' })).toEqual({
      state: 'Ended',
      sub: 'Sat 8 Nov · 6 PM',
      action: { label: 'See what’s on tonight', kind: 'lit', icon: 'arrow-up-right', does: 'tonight' },
    })
  })
  it('cancelled: the state and nothing to press', () => {
    expect(eventDock({ ...base, cta: 'cancelled' })).toEqual({ state: 'Cancelled', sub: 'Sat 8 Nov · 6 PM' })
  })
  it('at the doors the hold is the dock (null here)', () => {
    expect(eventDock({ ...base, cta: 'join' })).toBeNull()
  })
})
