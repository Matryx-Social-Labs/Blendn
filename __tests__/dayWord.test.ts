/*
 * The day word in the app's one time format (owner, 2026-11-06): "Tonight · 8:30 PM" for later today from 5 PM, "Today · 2 PM"
 * before it, "Tomorrow · 9 PM", then the boards' weekday ("Sun · 9 PM") and date. Always the event's own city's day and
 * clock, never a zone label. A row under a heading that already names the day keeps its bare clock, so it never reads
 * "Tonight · Tonight".
 * Fixtures: an event in Bengaluru (IST, UTC+5:30) seen on Friday 6 Nov 2026, and one in Toronto (EST, UTC−5).
 */
import type { BlendnEvent } from '../lib/api'
import { chipLine, chipSpeech } from '../lib/mapLit'
import { cardTime, dayAndClock, dayWord, homeCardProps, nextUpLabel, TONIGHT_FROM } from '../lib/pulse'
import { setRowLabel } from '../components/pulse/SetList'

const IST = 'Asia/Kolkata'
const TORONTO = 'America/Toronto'
/** An instant from a Bengaluru wall clock in November 2026. */
const ist = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, day, h, m) - 330 * 60_000)
/** An instant from a Toronto wall clock in November 2026 (EST from 1 Nov). */
const tor = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, day, h, m) + 300 * 60_000)
/** The way Going draws a line: one unbreakable unit. */
const nb = (line: string) => line.replace(/ /g, '\u00a0')
const ev = (start: Date, over: Partial<BlendnEvent> = {}) =>
  ({ id: 'e1', title: 'Vinyl Night', start_time: start.toISOString(), end_time: new Date(start.getTime() + 3 * 3600_000).toISOString(), timezone: IST, ...over }) as unknown as BlendnEvent
const card = (start: Date, now: Date, over: Partial<BlendnEvent> = {}) => cardTime(ev(start, over), now.getTime())
/** Anything that names a zone: "IST", "EST", "GMT+5:30", "UTC". */
const ZONE_LABEL = /\b(?:[A-Z]{2,4}T|GMT|UTC)\b/

describe('the day word, at the day’s boundaries, in the event’s city', () => {
  const morning = ist(6, 10)

  it('Tonight from 5 PM: 4:59 PM is still Today, 5 PM is Tonight', () => {
    expect(TONIGHT_FROM).toBe(17)
    expect(card(ist(6, 16, 59), morning)).toBe('Today · 4:59 PM')
    expect(card(ist(6, 17), morning)).toBe('Tonight · 5 PM')
    expect(card(ist(6, 20, 30), morning)).toBe('Tonight · 8:30 PM')
  })

  it('midnight: 11:59 PM is Tonight, 12 AM is Tomorrow, the night after is its weekday', () => {
    expect(card(ist(6, 23, 59), morning)).toBe('Tonight · 11:59 PM')
    expect(card(ist(7, 0), morning)).toBe('Tomorrow · 12 AM')
    expect(card(ist(7, 23, 30), morning)).toBe('Tomorrow · 11:30 PM')
    expect(card(ist(8, 0), morning)).toBe('Sun · 12 AM')
  })

  it('moves with the clock: ten to midnight, 12:10 AM is Tomorrow; five past, the same start is Today', () => {
    expect(card(ist(7, 0, 10), ist(6, 23, 50))).toBe('Tomorrow · 12:10 AM')
    expect(card(ist(7, 0, 10), ist(7, 0, 5))).toBe('Today · 12:10 AM')
  })

  it('keeps Live, the weekday within the week and the date past it (controls: the rows that had no day word before)', () => {
    expect(card(ist(6, 9), morning)).toBe('Live')
    expect(card(ist(10, 21), morning)).toBe('Tue · 9 PM')
    expect(card(ist(20, 21), morning)).toBe('Fri 20 Nov · 9 PM')
  })

  it('a multi-day event says the day of its next session, not of its first', () => {
    const festival = ev(ist(5, 18), { session: { start_time: ist(7, 18).toISOString(), end_time: ist(7, 23).toISOString() } } as Partial<BlendnEvent>)
    expect(cardTime(festival, morning.getTime())).toBe('Tomorrow · 6 PM')
    const tonightsSession = ev(ist(5, 18), { session: { start_time: ist(6, 18).toISOString(), end_time: ist(6, 23).toISOString() } } as Partial<BlendnEvent>)
    expect(cardTime(tonightsSession, morning.getTime())).toBe('Tonight · 6 PM')
  })

  it('is the city’s day and clock, never the phone’s, and never names the zone', () => {
    // 8:30 PM Friday in Toronto is 7 AM Saturday in Bengaluru: a phone's day would say "Tomorrow · 7 AM".
    const now = tor(6, 12)
    const label = cardTime(ev(tor(6, 20, 30), { timezone: TORONTO }), now.getTime())
    expect(label).toBe('Tonight · 8:30 PM')
    expect(label).not.toMatch(ZONE_LABEL)
    expect(dayWord(tor(6, 20, 30), now, TORONTO)).toBe('Tonight')
    expect(dayWord(tor(6, 20, 30), now, IST)).toBe('Tomorrow')
  })
})

describe('everywhere that tells a start without a heading', () => {
  const morning = ist(6, 10)

  it('the search result, the Nearby row and the peek: homeCardProps carries the word', () => {
    expect(homeCardProps(ev(ist(6, 21)), morning.getTime(), false).time).toBe('Tonight · 9 PM')
  })

  it('Going’s lines (the row sheet, a saved night, a called-off night inside its hours)', () => {
    expect(dayAndClock(ist(6, 21).toISOString(), morning, IST)).toBe(nb('Tonight · 9 PM'))
    expect(dayAndClock(ist(6, 14).toISOString(), morning, IST)).toBe(nb('Today · 2 PM'))
    expect(dayAndClock(ist(7, 21).toISOString(), morning, IST)).toBe(nb('Tomorrow · 9 PM'))
    expect(dayAndClock(ist(8, 21).toISOString(), morning, IST)).toBe(nb('8 Nov · 9 PM'))
  })

  it('Going’s lines never break inside the time: the row sheet wrapped "Today · 4:50" from "PM" (iOS drive)', () => {
    const line = dayAndClock(ist(6, 16, 50).toISOString(), morning, IST)
    expect(line.replace(/\u00a0/g, ' ')).toBe('Today · 4:50 PM')
    expect(line).not.toMatch(/ /)
  })

  it('the map chip and what it says aloud: the word for today and tomorrow, the weekday after', () => {
    const chip = (start: Date) => chipLine({ kind: 'event', live: false, startsAt: start.toISOString(), bucket: null, timeZone: IST }, morning.getTime())
    expect(chip(ist(6, 20))).toBe('Tonight · 8 PM')
    expect(chip(ist(6, 14))).toBe('Today · 2 PM')
    expect(chip(ist(7, 20))).toBe('Tomorrow · 8 PM')
    expect(chip(ist(9, 20))).toBe('Mon · 8 PM')
    expect(chipSpeech({ title: 'Jazz', kind: 'event', live: false, startsAt: ist(6, 20).toISOString(), bucket: null, timeZone: IST }, morning.getTime())).toBe('Jazz, starts Tonight 8 PM')
  })

  it('the Going hero still reads as before (control: it had the word already)', () => {
    expect(nextUpLabel(ist(6, 18, 30).toISOString(), null, morning, IST)).toBe('Tonight · 6:30 PM')
    expect(nextUpLabel(ist(7, 10).toISOString(), null, morning, IST)).toBe('Tomorrow · 10 AM')
  })
})

describe('under a heading that already names the day, the bare clock', () => {
  it('the Pulse’s Tonight set list says "9 PM", never "Tonight · 9 PM" under "Tonight"', () => {
    const label = setRowLabel(ev(ist(6, 21)), false)
    expect(label.startsWith('9 PM.')).toBe(true)
    expect(label).not.toMatch(/Tonight/)
  })
})
