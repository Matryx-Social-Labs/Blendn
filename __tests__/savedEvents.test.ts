import { savedEventRows, goingItems, rsvpEventRows, withPendingSaves, changedTag, pastEventRows, ratingsToRead, stayLabel } from '../lib/savedEvents'

/**
 * The Going tab read the favourites payload as an array and showed "No saved
 * events yet" to everyone with saves (SCRUM-175). This is the real shape the
 * server sends, taken from staging on 2026-09-18.
 */
const payload = {
  events: [
    {
      id: 'e6d7db85-089d-4b91-9494-1728abb85d2b',
      slug: 'design-week-bengaluru',
      title: 'Design Week Bengaluru',
      venueName: 'QA Circle Venue',
      address: null,
      startTime: '2026-09-17T16:32:06.550Z',
      endTime: '2026-09-18T22:32:06.551Z',
      coverImageUrl: 'https://example.test/cover.jpg',
      latitude: 12.9716,
      longitude: 77.5946,
      status: 'published' as const,
      favoriteCount: 1,
      isFavorited: true,
    },
    {
      id: '9593a4ff-bbba-4625-a022-8ccb47d8810b',
      slug: 'pottery',
      title: 'Pottery Morning',
      venueName: null,
      startTime: '2026-09-20T15:39:18.031Z',
      endTime: '2026-09-20T18:39:18.031Z',
      coverImageUrl: null,
      status: 'cancelled' as const,
    },
  ],
  timeFilter: 'upcoming',
  pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1, hasMore: false },
}

describe('savedEventRows', () => {
  it('reads the rows out of the envelope the server actually sends', () => {
    const rows = savedEventRows(payload)
    expect(rows.map((r) => r.id)).toEqual([payload.events[0].id, payload.events[1].id])
    expect(rows[0]).toMatchObject({
      title: 'Design Week Bengaluru',
      venue_name: 'QA Circle Venue',
      address: '',
      start_time: '2026-09-17T16:32:06.550Z',
      cover_image_url: 'https://example.test/cover.jpg',
      latitude: 12.9716,
      status: 'published',
    })
  })

  it('carries status so a cancelled card can say so', () => {
    expect(savedEventRows(payload)[1]).toMatchObject({ status: 'cancelled', venue_name: '', cover_image_url: null })
  })

  it('is empty, not a crash, for no payload or the old array shape', () => {
    expect(savedEventRows(undefined)).toEqual([])
    expect(savedEventRows(null)).toEqual([])
    // What the screen used to assume — a bare array — is not the envelope.
    expect(savedEventRows([] as unknown as typeof payload)).toEqual([])
  })
})

describe('the Going tab', () => {
  it('reloads on focus, not once per mount', () => {
    // Driven on iOS: save from the Pulse, return to Going — still empty until a
    // cold launch, because the only load was a mount effect (SCRUM-175).
    const { readFileSync } = require('fs') as typeof import('fs')
    const { join } = require('path') as typeof import('path')
    const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
    expect(src).toContain('useFocusEffect(')
    expect(src).not.toMatch(/useEffect\(\(\) => \{\s*if \(authUser\) \{\s*loadInterestedEvents\(\)/)
  })
})

/*
 * SCRUM-286. A Going card with no cover was an empty dark block, while the
 * event detail for the same event showed its clip — the favourites route sends
 * the first media item as `coverImage`, and the mapper dropped it. The card
 * now falls back the way the Pulse does (`feedPoster`): the cover, then an
 * image in the media, then a clip's poster.
 */
describe('the Going card poster', () => {
  const base = {
    id: 'x', title: 'No Cover Night', startTime: '2026-09-26T12:00:00Z', endTime: '2026-09-26T15:00:00Z',
    status: 'published' as const, coverImageUrl: null,
  }
  const poster = (coverImage: unknown) =>
    savedEventRows({ events: [{ ...base, coverImage } as never] })[0].cover_image_url

  it("uses a clip’s poster when the event has no cover", () => {
    expect(poster({ type: 'video', url: 'https://x.test/c.mp4', thumbnail_url: 'https://x.test/c.jpg', order: 0 })).toBe(
      'https://x.test/c.jpg'
    )
  })

  it('uses an image from the media when the event has no cover', () => {
    expect(poster({ type: 'image', url: 'https://x.test/i.jpg', order: 0 })).toBe('https://x.test/i.jpg')
  })

  it('is null — the placeholder — when there is nothing to show', () => {
    expect(poster(null)).toBeNull()
    expect(poster({ type: 'document', url: 'https://x.test/menu.pdf', order: 0 })).toBeNull()
  })
})

describe('the Going tab sections', () => {
  const api = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Event ${id}`,
    venueName: 'Venue',
    address: 'Somewhere',
    startTime: '2026-10-01T18:00:00.000Z',
    endTime: '2026-10-01T22:00:00.000Z',
    coverImageUrl: null,
    status: 'published' as const,
    ...extra,
  })
  const NOW = Date.parse('2026-09-27T12:00:00.000Z')
  const attended = (id: string, end: string) => ({
    id,
    title: `Past ${id}`,
    cover_image_url: null,
    start_time: '2026-09-01T18:00:00.000Z',
    end_time: end,
    venue_name: null,
    city: null,
    attendedAt: '2026-09-01T18:05:00.000Z',
  })

  it('keeps each RSVP status on its row', () => {
    const rows = rsvpEventRows({
      events: [api('a', { rsvpStatus: 'going' }), api('b', { rsvpStatus: 'waitlisted' })] as never,
    })
    expect(rows.map((r) => [r.id, r.rsvpStatus])).toEqual([
      ['a', 'going'],
      ['b', 'waitlisted'],
    ])
  })

  it('leads with the next RSVP, then Saved without the ones already going, then Past', () => {
    const going = rsvpEventRows({ events: [api('a', { rsvpStatus: 'going' })] as never })
    const saved = savedEventRows({ events: [api('a'), api('b')] })
    const items = goingItems(going, saved, [attended('p', '2026-09-02T01:00:00.000Z')], NOW)
    // No "Going" heading: the screen's title already says it.
    expect(items.map((i) => i.key)).toEqual(['n:a', 'h:saved', 's:b', 'h:past', 'p:p'])
  })

  it('files the RSVPs after the first under day headings, in the order given', () => {
    const local = (d: number, h: number) => new Date(2026, 8, d, h).toISOString()
    const going = rsvpEventRows({
      events: [
        api('a', { rsvpStatus: 'going', startTime: local(28, 19) }),
        api('b', { rsvpStatus: 'going', startTime: local(28, 21) }),
        api('c', { rsvpStatus: 'waitlisted', startTime: local(28, 22) }),
        api('d', { rsvpStatus: 'going', startTime: local(30, 19) }),
      ] as never,
    })
    const items = goingItems(going, [], [], new Date(2026, 8, 27, 12).getTime())
    expect(items.map((i) => (i.kind === 'day' ? `day:${i.title}` : i.key))).toEqual([
      'n:a',
      'day:Tomorrow',
      'g:b',
      'g:c',
      'day:Sep 30',
      'g:d',
    ])
  })

  it('carries the city, the place a row falls back to without a venue', () => {
    expect(savedEventRows({ events: [api('a', { venueName: null, city: 'Bengaluru' })] })[0]).toMatchObject({
      venue_name: '',
      city: 'Bengaluru',
    })
    expect(savedEventRows({ events: [api('b')] })[0].city).toBeNull()
  })

  it('leaves Past to events that have ended', () => {
    // Checked in tonight is attendance, but there is nobody to rate until it is over.
    const items = goingItems([], [], [attended('now', '2026-09-27T23:00:00.000Z')], NOW)
    expect(items).toEqual([])
  })

  it('drops an empty section, header and all', () => {
    const saved = savedEventRows({ events: [api('b')] })
    expect(goingItems([], saved, [], NOW).map((i) => i.key)).toEqual(['h:saved', 's:b'])
  })
})

describe('withPendingSaves: a read never undoes what Going just did (PR #401 review)', () => {
  const row = (id: string) => ({ id, title: id }) as never

  it('keeps a removed row gone against a read that began before its DELETE settled', () => {
    const pending = new Map([['a', { saved: false, row: row('a'), settledAt: 3 }]])
    expect(withPendingSaves([row('a'), row('b')], pending, 3).map((r: { id: string }) => r.id)).toEqual(['b'])
    expect(pending.size).toBe(1)
  })

  it('keeps an Undo-restored row against a read that began before its POST, and while it is out', () => {
    const inFlight = new Map([['a', { saved: true, row: row('a'), settledAt: Infinity }]])
    expect(withPendingSaves([row('b')], inFlight, 9).map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
  })

  it('lets a read that began after the request settled be the truth, and forgets the entry', () => {
    const pending = new Map([['a', { saved: false, row: row('a'), settledAt: 3 }]])
    expect(withPendingSaves([row('a')], pending, 4).map((r: { id: string }) => r.id)).toEqual(['a'])
    expect(pending.size).toBe(0)
  })
})

describe('Going: the newest read wins', () => {
  it('drops an answer a later load has overtaken', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8') as string
    expect(src).toMatch(/const id = \+\+loadId\.current[\s\S]*?if \(id !== loadId\.current\) return/)
    expect(src).toContain('withPendingSaves(rows, pendingSaves.current, id)')
  })
})

describe('a night that moved (Flow 3 · 3.1 frame 03)', () => {
  const ev = { id: 'e', title: 'T', startTime: '2031-01-01T19:00:00Z', endTime: '2031-01-01T22:00:00Z', status: 'published' as const }
  const tag = (extra: object, status: 'published' | 'cancelled' = 'published') => changedTag(savedEventRows({ events: [{ ...ev, status, ...extra }] })[0])

  it('is "New time" for a time that moved, and "New venue" when only the place did', () => {
    expect(tag({ changedFields: ['time'] })).toBe('New time')
    expect(tag({ changedFields: ['venue'] })).toBe('New venue')
    expect(tag({ changedFields: ['venue', 'time'] })).toBe('New time')
  })

  it('is no tag from a server that does not send it (the list routes today), a cancel, or a field this build does not know', () => {
    expect(tag({})).toBeNull()
    expect(tag({ changedFields: null })).toBeNull()
    expect(tag({ changedFields: ['organiser'] })).toBeNull()
    // A cancel is the row's own "Cancelled".
    expect(tag({ changedFields: ['cancelled', 'time'] }, 'cancelled')).toBeNull()
    expect(tag({ changedFields: ['cancelled'] })).toBeNull()
  })
})

describe('Past: the places you went live at (Flow 4 · Past venues, frame 01)', () => {
  const NOW = Date.parse('2026-10-22T12:00:00Z')
  const row = (over: object) => ({
    id: 'v1',
    title: 'Venue day · 2026-09-28 · bookkeeping',
    cover_image_url: null,
    start_time: '2026-09-28T00:00:00Z',
    end_time: '2026-09-28T23:59:00Z',
    venue_name: 'Toit',
    city: 'Bengaluru',
    attendedAt: '2026-09-28T17:00:00Z',
    ...over,
  })

  it('names the visit for the place, never for the venue day\'s bookkeeping title', () => {
    const [visit] = pastEventRows([row({ kind: 'venue_day' })], NOW)
    expect(visit.title).toBe('Toit')
    expect(visit.visit).toEqual({ attendedAt: '2026-09-28T17:00:00Z', stayMinutes: null, venueId: null, venueType: null })
  })

  it('reads how long and which place when the server says (both are absent from the route today)', () => {
    const [visit] = pastEventRows([row({ kind: 'venue_day', stay_minutes: 100, venue_id: 'v-toit' })], NOW)
    expect(visit.visit).toEqual({ attendedAt: '2026-09-28T17:00:00Z', stayMinutes: 100, venueId: 'v-toit', venueType: null })
  })

  it('an event keeps its own title and has no visit', () => {
    const [event] = pastEventRows([row({ kind: 'event', title: 'Vinyl Night' })], NOW)
    expect(event.title).toBe('Vinyl Night')
    expect(event.visit).toBeUndefined()
    expect(pastEventRows([row({ title: 'Older server' })], NOW)[0].visit).toBeUndefined()
  })

  it('a visit with no place name keeps its title rather than an empty row', () => {
    expect(pastEventRows([row({ kind: 'venue_day', venue_name: null, title: 'A place' })], NOW)[0].title).toBe('A place')
  })

  it('says a stay in the shortest honest words', () => {
    expect([stayLabel(40), stayLabel(100), stayLabel(120), stayLabel(0), stayLabel(null), stayLabel(NaN)]).toEqual(['40m', '1h 40m', '2h', null, null, null])
  })
})

describe('which past nights to ask about', () => {
  const night = (id: string, extra: object = {}) => ({ id, title: id, cover_image_url: null, start_time: 'a', end_time: 'b', venue_name: null, city: null, attendedAt: 'a', ...extra })
  const none = new Set<string>()

  it('believes the list when it says (`ratedAt` a time: rated; null: not), and asks nothing about those', () => {
    const r = ratingsToRead([night('a', { ratedAt: '2026-09-01T00:00:00Z' }), night('b', { ratedAt: null })], 10, () => false, none)
    expect(r).toEqual({ rated: ['a'], ask: [] })
  })

  it('asks about the rest, the first few only, never a visit, a night known rated, or one already asked', () => {
    const nights = [night('v', { kind: 'venue_day' }), night('k'), night('x'), night('y'), night('z')]
    const r = ratingsToRead(nights, 2, (id) => id === 'k', new Set(['x']))
    expect(r.ask).toEqual(['y', 'z'])
    expect(ratingsToRead(nights, 1, () => false, none).ask).toEqual(['k'])
  })
})
