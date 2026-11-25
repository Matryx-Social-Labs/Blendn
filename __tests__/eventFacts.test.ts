/**
 * The event page's words (Flow 4 E-B, `flow-4/screens.js`): the date stamp, the guide rows' lines, and the dock's state
 * and one action per attendance state. Pure, so every branch is pinned here; the screen test checks they are drawn.
 */
import { holdUnder, dateStamp, eventDock, shortDistance, untilWords, whoLine } from '../lib/eventFacts'
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
    expect(shortDistance(0.42, 'exact')).toBe('420 m')
    expect(shortDistance(4.31, 'exact')).toBe('4.3 km')
    expect(shortDistance(12.4, 'exact')).toBe('12 km')
  })
  it('from an approximate fix, "about 4 km": the one rule every distance follows (SCRUM-1080)', () => {
    expect(shortDistance(0.42, 'approximate')).toBe('about 1 km')
    expect(shortDistance(4.31, 'approximate')).toBe('about 4 km')
    expect(shortDistance(null, 'approximate')).toBeNull()
  })
  it('is null with no fix', () => {
    expect(shortDistance(null, 'exact')).toBeNull()
    expect(shortDistance(Number.NaN, 'exact')).toBeNull()
  })
})

describe('whoLine: a count, not a list; the exact number, because a page row is not a compact surface', () => {
  it('prints five and up, grouped, with the word for the hour', () => {
    expect(whoLine({ count: WORST.count, word: 'going', minAge: 18 })).toEqual({ count: '12,480', word: 'going', facts: ['18+'], lead: null })
    expect(whoLine({ count: 23, word: 'here now', minAge: null })).toEqual({ count: '23', word: 'here now', facts: [], lead: null })
  })
  it('the entry facts follow, each its own segment: the age, the door, how full', () => {
    expect(whoLine({ count: 42, word: 'going', minAge: 21, door: 'Guest list', spots: '8 spots left' }).facts).toEqual(['21+', 'Guest list', '8 spots left'])
  })
  it('under five there is no number: the age alone, or "Be one of the first"', () => {
    expect(whoLine({ count: 4, word: 'going', minAge: 21 })).toEqual({ count: null, word: 'going', facts: ['21+'], lead: null })
    expect(whoLine({ count: 0, word: 'going', minAge: null })).toEqual({ count: null, word: 'going', facts: [], lead: 'Be one of the first' })
  })
})

// SCRUM-1057 copy A: under five, with no entry facts, the line says what is true from where you stand. It speaks to you
// only when the count is about you (checked in and the count is who is here, going and it is who is going); after the
// event it says nothing and the host line stands alone. No number is printed under five in any of them.
describe('whoLine under five, by your state (SCRUM-1057 A)', () => {
  const lead = (count: number, word: string, viewer?: 'here' | 'going' | null, ended?: boolean) => whoLine({ count, word, minAge: null, viewer, ended }).lead
  it.each([
    ['checked in, alone (the live count is you)', 1, 'here now', 'here', 'You’re the first here'],
    ['checked in, a count not yet caught up with you', 0, 'here now', 'here', 'You’re the first here'],
    ['checked in with 1–3 others', 2, 'here now', 'here', 'You’re one of the first here'],
    ['checked in with 3 others', 4, 'here now', 'here', 'You’re one of the first here'],
    ['going, under five going', 3, 'going', 'going', 'You’re one of the first going'],
    ['not going (control)', 2, 'going', null, 'Be one of the first'],
    ['going, but the live count is who is here, and you are not (control)', 2, 'here now', 'going', 'Be one of the first'],
  ] as const)('%s', (_, count, word, viewer, words) => {
    expect(lead(count, word, viewer)).toBe(words)
  })
  it('ended: no Who words at all, whoever you were (the host line alone)', () => {
    expect(lead(2, 'went', 'here', true)).toBeNull()
    expect(lead(0, 'went', null, true)).toBeNull()
    expect(whoLine({ count: 2, word: 'went', minAge: null, ended: true })).toEqual({ count: null, word: 'went', facts: [], lead: null })
  })
  it('five and up, the count as today, whoever you are (control)', () => {
    expect(whoLine({ count: 12480, word: 'going', minAge: null, viewer: 'going' })).toEqual({ count: '12,480', word: 'going', facts: [], lead: null })
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
      link: 'Change',
      change: true,
      action: { label: 'Invite', kind: 'lit', icon: 'share', does: 'invite' },
    })
  })
  it('an event that may not be shared has no Invite (hidden, never disabled)', () => {
    expect(dock({ cta: 'rsvpd', canInvite: false }).action).toBeUndefined()
  })
  it('between the days of a run the next door is said after Change, which stays drawn (SCRUM-1074)', () => {
    const d = dock({ cta: 'rsvpd', between: 'Day 3 starts Tue 29 Sep, 9 PM' })
    expect(d.link).toBe('Change')
    expect(d.sub).toBe('Day 3 starts Tue 29 Sep, 9 PM')
    expect(d.change).toBe(true)
  })
  it('the room is open: Change stays drawn before "The room is open", and Open the room is the primary (SCRUM-1074)', () => {
    expect(eventDock({ ...base, cta: 'rsvpd', roomOpen: true })).toEqual({
      state: 'You’re going',
      link: 'Change',
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
    expect(d.link).toBe('Change')
    expect(d.change).toBe(true)
    expect(d.action).toBeUndefined()
  })
  it('checked in: the room, and the way out under the state as its own link (option A, SCRUM-1035)', () => {
    expect(eventDock({ ...base, cta: 'going' })).toEqual({
      state: 'You’re in',
      link: 'Check out',
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
  it('live, after "Can’t make it": "Not going" and I’m going, which puts it back (SCRUM-1074 sheet 05)', () => {
    expect(eventDock({ ...base, cta: 'join', when: 'Live now · till 1:15 AM', leftTonight: true })).toEqual({
      state: 'Not going',
      sub: 'Live now · till 1:15 AM',
      action: { label: 'I’m going', kind: 'primary', does: 'rsvp' },
    })
  })
  it('only before the doors or live is anything a link: the others draw none', () => {
    for (const cta of ['rsvp', 'rate', 'ended', 'cancelled'] as const) expect(dock({ cta }).link).toBeUndefined()
  })
})

describe('holdUnder: the line under the hold once the doors are open (SCRUM-1074)', () => {
  it('going: who is here, and "Can’t make it"', () => {
    expect(holdUnder({ rsvpStatus: 'going', hereNow: 40 })).toEqual({ left: '40 here now', link: 'Can’t make it' })
  })
  it('a worst-case count is compact in its slot', () => {
    expect(holdUnder({ rsvpStatus: 'going', hereNow: 12480 })?.left).toBe('12k here now')
  })
  it('nobody here yet: the link alone', () => {
    expect(holdUnder({ rsvpStatus: 'going', hereNow: 0 })).toEqual({ left: null, link: 'Can’t make it' })
  })
  it('waitlisted: the list, and the way off it', () => {
    expect(holdUnder({ rsvpStatus: 'waitlisted', hereNow: 40 })).toEqual({ left: 'On the waitlist', link: 'Leave the waitlist' })
  })
  it('not going: nothing under the hold (control)', () => {
    expect(holdUnder({ rsvpStatus: null, hereNow: 40 })).toBeNull()
  })
})
