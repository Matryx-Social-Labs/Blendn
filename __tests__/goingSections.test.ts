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
    expect(labels(items)).toEqual(['n:late', 'day:Tonight', 'g:tonight'])
  })

  it('puts other live RSVPs under "Happening now", ahead of any day', () => {
    const a = rsvp('a', local(28, 21), local(29, 2))
    const b = rsvp('b', local(28, 22), local(29, 3))
    const c = rsvp('c', local(30, 19), local(30, 23))
    const items = goingSections([a, b, c], [], [], NOW)
    expect(labels(items)).toEqual(['n:a', 'day:Happening now', 'g:b', 'day:This week', 'g:c'])
  })

  it('prefers a live event for the hero over an earlier-listed one that has not started', () => {
    const soon = rsvp('soon', local(29, 9), local(29, 11))
    const live = rsvp('live', local(28, 23), local(29, 2))
    expect(labels(goingSections([soon, live], [], [], NOW))[0]).toBe('n:live')
  })

  it("files a multi-day run by today’s day, not the day the run began", () => {
    const hero = rsvp('hero', local(29, 10), local(29, 12))
    const festival = rsvp('fest', local(27, 18), local(30, 23), {
      session: { start_time: local(29, 18), end_time: local(29, 23) },
    })
    expect(labels(goingSections([hero, festival], [], [], NOW))).toEqual(['n:hero', 'day:Tonight', 'g:fest'])
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
      'day:This week',
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
    expect(GOING).toContain('if (saved.ok) setSavedPaged(saved.paged)')
    expect(GOING).toContain('if (rsvps.ok) setGoingPaged(rsvps.paged)')
    expect(GOING).toMatch(/if \(past\.ok\) \{\s*setPastPaged\(past\.paged\)/)
    expect(GOING).toMatch(/newFailure\(failedRef\.current, failed\)/)
    expect(GOING).toMatch(/say\("Couldn’t load all of your events\.", 'error', \{ label: 'Try again'/)
  })

  it('draws the tab from goingSections, so live events never sit under a past day', () => {
    expect(GOING).toContain('goingSections(going, events, attended, undefined, paging)')
  })
})

describe('Going’s Undo toast (drive 2: it came ~1 s late and covered the title on Android)', () => {
  const GOING = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
  const remove = GOING.slice(GOING.indexOf('const removeSave'), GOING.indexOf('const shareEvent'))

  it('is said as the row goes, before the server answers, and Undo waits for the DELETE', () => {
    expect(remove).not.toMatch(/await apiClient\.removeFavorite/)
    expect(remove.indexOf('say(`Removed ${event.title}`')).toBeLessThan(remove.indexOf('removed\n      .then(() => settleSave'))
    expect(remove).toMatch(/removed\s*\.catch\(\(\) => undefined\)\s*\.then\(\(\) => apiClient\.addFavorite/)
  })

  it('is the design’s Toast: a snackbar above the tab bar on Android', () => {
    expect(GOING).toMatch(/<Toast key=\{toast\.key\}[^>]*aboveTabBar/)
  })
})

describe('goingSections: the lists the server has more of (large data)', () => {
  const NOW = new Date(2026, 8, 29, 12, 0).getTime()
  const night = (n: number) => ({
    id: `p${n}`,
    title: `Night ${n}`,
    cover_image_url: null,
    start_time: local(1, 20),
    end_time: local(1, 23),
    venue_name: 'Toit',
    city: null,
    attendedAt: local(1, 20),
  })
  const nights = Array.from({ length: 10 }, (_, i) => night(i))

  it('says nothing of paging when the server has no more: no count, no row', () => {
    const items = goingSections([], [], nights, NOW, { past: { total: 10, hasMore: false } })
    expect(items.find((i) => i.kind === 'more')).toBeUndefined()
    expect(items.find((i) => i.kind === 'header')).toMatchObject({ title: 'Past' })
    expect(items.find((i) => i.kind === 'header')).not.toHaveProperty('count')
  })

  it('ends Past with the true remainder, and the header carries the server\'s total', () => {
    const items = goingSections([], [], nights, NOW, { past: { total: 312, hasMore: true } })
    expect(items[0]).toMatchObject({ kind: 'header', title: 'Past', count: 312 })
    expect(items[items.length - 1]).toMatchObject({ kind: 'more', section: 'past', remaining: 302, busy: false, failed: false })
  })

  it('carries what the request is doing: working, or failed', () => {
    expect(goingSections([], [], nights, NOW, { past: { total: 312, hasMore: true, busy: true } }).at(-1)).toMatchObject({ busy: true })
    expect(goingSections([], [], nights, NOW, { past: { total: 312, hasMore: true, failed: true } }).at(-1)).toMatchObject({ failed: true })
  })

  it('ends each section where it ends: RSVPs, then Saved, then Past, each with its own row', () => {
    const a = rsvp('a', local(30, 20), local(30, 23))
    const b = rsvp('b', local(30, 21), local(30, 23))
    const saved = [{ ...rsvp('s', local(30, 20), local(30, 23)) } as unknown as SavedEventRow]
    const items = goingSections([a, b], saved, nights, NOW, {
      going: { total: 80, hasMore: true },
      saved: { total: 41, hasMore: true },
      past: { total: 300, hasMore: true },
    })
    const kinds = items.map((i) => (i.kind === 'more' ? `more:${i.section}:${i.remaining}` : i.kind === 'header' ? `h:${i.title}` : i.kind))
    expect(kinds.filter((k) => k.startsWith('more'))).toEqual(['more:going:78', 'more:saved:40', 'more:past:290'])
    expect(kinds.indexOf('more:going:78')).toBeLessThan(kinds.indexOf('h:Saved'))
    expect(kinds.indexOf('more:saved:40')).toBeLessThan(kinds.indexOf('h:Past'))
  })

  it('a save already under Going is not counted twice in the header', () => {
    const a = rsvp('a', local(30, 20), local(30, 23))
    const saved = [{ ...a } as unknown as SavedEventRow, { ...rsvp('s', local(30, 20), local(30, 23)) } as unknown as SavedEventRow]
    const items = goingSections([a], saved, [], NOW, { saved: { total: 30, hasMore: true } })
    // 30 on the server, 2 held, one of them already above: 29 rows to be drawn once it is all read.
    expect(items.find((i) => i.kind === 'header')).toMatchObject({ title: 'Saved', count: 29 })
  })

  it('a section whose first page was all above still shows its heading and the way to more', () => {
    const a = rsvp('a', local(30, 20), local(30, 23))
    const items = goingSections([a], [{ ...a } as unknown as SavedEventRow], [], NOW, { saved: { total: 25, hasMore: true } })
    expect(items.map((i) => i.key)).toEqual(['n:a', 'h:saved', 'm:saved'])
  })
})

describe('goingSections: by week, not by day (GO-14, D30, audit C15)', () => {
  // Tue 29 Sep 2026, noon.
  const NOW = new Date(2026, 8, 29, 12).getTime()
  const at = (month: number, d: number, h: number) => new Date(2026, month, d, h).toISOString()
  const ends = (month: number, d: number, h: number) => new Date(2026, month, d, h + 2).toISOString()

  it('35 nights under five headings, not 35: Tonight, This week, Next week, then by month', () => {
    const rows: RsvpEventRow[] = [rsvp('hero', at(8, 29, 13), ends(8, 29, 13))]
    rows.push(rsvp('t1', at(8, 29, 20), ends(8, 29, 20)))
    for (let d = 30; d <= 30; d++) rows.push(rsvp(`w${d}`, at(8, d, 20), ends(8, d, 20)))
    for (let d = 1; d <= 4; d++) rows.push(rsvp(`w-oct${d}`, at(9, d, 20), ends(9, d, 20)))
    for (let d = 5; d <= 11; d++) rows.push(rsvp(`n${d}`, at(9, d, 20), ends(9, d, 20)))
    for (let d = 12; d <= 31; d++) rows.push(rsvp(`m${d}`, at(9, d, 20), ends(9, d, 20)))
    rows.push(rsvp('nov', at(10, 3, 20), ends(10, 3, 20)), rsvp('nov2', at(10, 4, 20), ends(10, 4, 20)))
    expect(rows).toHaveLength(36)
    const heads = goingSections(rows, [], [], NOW).filter((i) => i.kind === 'day').map((i) => (i as { title: string }).title)
    expect(heads).toEqual(['Tonight', 'This week', 'Next week', 'October', 'November'])
  })

  it('a morning today is "Today", never "Tonight" (a 10 AM start is not tonight)', () => {
    const early = new Date(2026, 8, 29, 6).getTime()
    const rows = [rsvp('hero', at(8, 29, 8), ends(8, 29, 8)), rsvp('am', at(8, 29, 10), ends(8, 29, 10))]
    expect(labels(goingSections(rows, [], [], early))).toEqual(['n:hero', 'day:Today', 'g:am'])
  })

  it('a later month says its year only when it is not this one', () => {
    const rows = [rsvp('hero', at(8, 29, 20), ends(8, 29, 20)), rsvp('jan', new Date(2027, 0, 8, 20).toISOString(), new Date(2027, 0, 8, 22).toISOString())]
    expect(labels(goingSections(rows, [], [], NOW))).toEqual(['n:hero', 'day:January 2027', 'g:jan'])
  })
})
