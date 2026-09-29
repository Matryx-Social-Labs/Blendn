import { readFileSync } from 'fs'
import { join } from 'path'

import { failedSections, goingSections, isLiveNow, newFailure } from '../lib/goingSections'
import type { RsvpEventRow, SavedEventRow } from '../lib/savedEvents'

/** Local wall-clock times, so the day headings match the machine running the test. */
const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).toISOString()

const rsvp = (id: string, start: string, end: string, extra: Partial<RsvpEventRow> = {}): RsvpEventRow => ({
  id,
  title: id,
  venue_name: '',
  city: null,
  address: '',
  start_time: start,
  end_time: end,
  cover_image_url: null,
  latitude: NaN,
  longitude: NaN,
  status: 'published',
  rsvpStatus: 'going',
  ...extra,
})

const labels = (items: ReturnType<typeof goingSections>) =>
  items.map((i) => (i.kind === 'day' ? `day:${i.title}` : i.kind === 'header' ? `h:${i.title}` : i.key))

describe('goingSections: live events after midnight', () => {
  // 00:30 on the 29th.
  const NOW = new Date(2026, 8, 29, 0, 30).getTime()

  it('leads with an event still running from last night, not under yesterday', () => {
    const lateNight = rsvp('late', local(28, 21, 30), local(29, 1, 30))
    const tonight = rsvp('tonight', local(29, 20), local(29, 23))
    // The server sorts by start, so last night's event came first — and a
    // second one from last night would have sat under "Yesterday"/"Sep 28".
    const items = goingSections([lateNight, tonight], [], [], NOW)
    expect(labels(items)).toEqual(['n:late', 'day:Today', 'g:tonight'])
  })

  it('puts other live RSVPs under "Happening now", ahead of any day', () => {
    const a = rsvp('a', local(28, 21), local(29, 2))
    const b = rsvp('b', local(28, 22), local(29, 3))
    const c = rsvp('c', local(30, 19), local(30, 23))
    const items = goingSections([a, b, c], [], [], NOW)
    expect(labels(items)).toEqual(['n:a', 'day:Happening now', 'g:b', 'day:Tomorrow', 'g:c'])
  })

  it('prefers a live event for the hero over an earlier-listed one that has not started', () => {
    const soon = rsvp('soon', local(29, 9), local(29, 11))
    const live = rsvp('live', local(28, 23), local(29, 2))
    expect(labels(goingSections([soon, live], [], [], NOW))[0]).toBe('n:live')
  })

  it("files a multi-day run by today's day, not the day the run began", () => {
    const hero = rsvp('hero', local(29, 10), local(29, 12))
    const festival = rsvp('fest', local(27, 18), local(30, 23), {
      session: { start_time: local(29, 18), end_time: local(29, 23) },
    })
    expect(labels(goingSections([hero, festival], [], [], NOW))).toEqual(['n:hero', 'day:Today', 'g:fest'])
  })

  it('files a run that is over (the rest cancelled) last, under Ended — not under its past day', () => {
    // Staging, blr-design-festival: day 2 ended at 05:30, day 3 cancelled, so
    // the server's window is day 2 — which sat under "Sep 28" in the upcoming list.
    const hero = rsvp('hero', local(29, 10), local(29, 12))
    const tomorrow = rsvp('tmrw', local(30, 19), local(30, 23))
    const festival = rsvp('fest', local(27, 21, 30), local(30, 5, 30), {
      session: { start_time: local(28, 21, 30), end_time: local(29, 0, 15) },
    })
    expect(labels(goingSections([festival, hero, tomorrow], [], [], NOW))).toEqual([
      'n:hero',
      'day:Tomorrow',
      'g:tmrw',
      'day:Ended',
      'g:fest',
    ])
  })

  it('never leads with a run that is over while anything else is ahead', () => {
    const over = rsvp('over', local(27, 21), local(30, 5), {
      session: { start_time: local(28, 18), end_time: local(28, 23) },
    })
    const later = rsvp('later', local(30, 19), local(30, 23))
    expect(labels(goingSections([over, later], [], [], NOW))[0]).toBe('n:later')
  })

  it('keeps Saved (minus RSVPs) and Past as goingItems draws them', () => {
    const a = rsvp('a', local(29, 20), local(29, 23))
    const saved: SavedEventRow[] = [
      { ...a, rsvpStatus: undefined } as unknown as SavedEventRow,
      { ...rsvp('s', local(30, 20), local(30, 23)) } as unknown as SavedEventRow,
    ]
    expect(labels(goingSections([a], saved, [], NOW))).toEqual(['n:a', 'h:Saved', 's:s'])
  })
})

describe('isLiveNow', () => {
  const NOW = new Date(2026, 8, 29, 0, 30).getTime()
  it('is started and not over, by the live window', () => {
    expect(isLiveNow(rsvp('x', local(28, 21), local(29, 1)), NOW)).toBe(true)
    expect(isLiveNow(rsvp('x', local(28, 21), local(29, 0)), NOW)).toBe(false)
    expect(isLiveNow(rsvp('x', local(29, 1), local(29, 3)), NOW)).toBe(false)
  })
  it('does not guess an open-ended event is on', () => {
    expect(isLiveNow({ start_time: local(28, 21), end_time: null }, NOW)).toBe(false)
  })
  it('is not live on a day that was cancelled', () => {
    expect(isLiveNow({ start_time: local(28, 21), end_time: local(30, 1), session: null }, NOW)).toBe(false)
  })
})

describe('the Going tab after a partial failure', () => {
  it('names the sections whose request failed', () => {
    expect(
      failedSections({ saved: { success: true }, going: { success: false }, past: { success: false } })
    ).toEqual(['going', 'past'])
  })

  it('tells somebody once, when a failure appears, not on every focus while it lasts', () => {
    expect(newFailure([], ['past'])).toBe(true)
    expect(newFailure(['past'], ['past'])).toBe(false)
    expect(newFailure(['past'], ['past', 'saved'])).toBe(true)
    expect(newFailure(['past'], [])).toBe(false)
  })

  const GOING = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')

  it('keeps each section’s last good rows and toasts with a Try again', () => {
    // A section only updates when its own request succeeds.
    expect(GOING).toMatch(/if \(saved\.success && saved\.data\) setEvents/)
    expect(GOING).toMatch(/if \(rsvps\.success && rsvps\.data\) setGoing/)
    expect(GOING).toMatch(/if \(past\.success && past\.data\) setAttended/)
    expect(GOING).toMatch(/newFailure\(failedRef\.current, failed\)/)
    expect(GOING).toMatch(/action: \{ label: 'Try again'/)
  })

  it('draws the tab from goingSections, so live events never sit under a past day', () => {
    expect(GOING).toContain('goingSections(going, events, attended)')
  })
})
