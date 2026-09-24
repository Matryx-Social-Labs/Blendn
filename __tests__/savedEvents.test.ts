import { savedEventRows } from '../lib/savedEvents'

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

  it("uses a clip's poster when the event has no cover", () => {
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
