import { feedClip, feedPlaylist, feedPoster, type EventMediaItem , clipFirst } from '../lib/feedMedia'

/*
 * Which asset a feed card draws.
 *
 * The rule worth testing is the refusal: a clip with no poster is not returned
 * at all, because a card whose video is buffering shows its poster, and a null
 * poster is a black rectangle for the length of a round trip. We would rather
 * show a still event than a broken-looking one — and that decision is invisible
 * in a screenshot taken on a warm cache, which is every screenshot anyone takes.
 */

const video = (over: Partial<EventMediaItem> = {}): EventMediaItem => ({
  id: 'm1',
  url: 'https://cdn.example/clip.mp4',
  thumbnail_url: 'https://cdn.example/poster.jpg',
  type: 'video',
  order: 0,
  ...over,
})

const image = (over: Partial<EventMediaItem> = {}): EventMediaItem => ({
  id: 'm2',
  url: 'https://cdn.example/photo.jpg',
  thumbnail_url: null,
  type: 'image',
  order: 1,
  ...over,
})

describe('feedClip', () => {
  it('plays the first video, with its own thumbnail as the poster', () => {
    expect(feedClip([image(), video()], null)).toEqual({
      videoUrl: 'https://cdn.example/clip.mp4',
      posterUrl: 'https://cdn.example/poster.jpg',
    })
  })

  it('falls back to the event cover when the clip has no thumbnail', () => {
    expect(feedClip([video({ thumbnail_url: null })], 'https://cdn.example/cover.jpg')).toEqual({
      videoUrl: 'https://cdn.example/clip.mp4',
      posterUrl: 'https://cdn.example/cover.jpg',
    })
  })

  it('refuses a clip it cannot poster', () => {
    // The whole point. Returning the clip here would paint black until the
    // first frame decodes, on a card that would have looked finished as a still.
    expect(feedClip([video({ thumbnail_url: null })], null)).toBeNull()
  })

  it('obeys `order`, not array position', () => {
    const late = video({ id: 'a', url: 'https://cdn.example/second.mp4', order: 5 })
    const early = video({ id: 'b', url: 'https://cdn.example/first.mp4', order: 1 })
    expect(feedClip([late, early], null)?.videoUrl).toBe('https://cdn.example/first.mp4')
  })

  it('ignores documents and images', () => {
    expect(feedClip([image(), { type: 'document', url: 'x.pdf' }], 'c.jpg')).toBeNull()
  })

  it('survives the shapes the API can actually return', () => {
    // `eventFromApi` defaults `media` to `[]`, but an older build in the field
    // can send undefined and a malformed row can carry a null url.
    expect(feedClip(undefined, 'c.jpg')).toBeNull()
    expect(feedClip(null, 'c.jpg')).toBeNull()
    expect(feedClip([{ type: 'video', url: null }], 'c.jpg')).toBeNull()
    expect(feedClip([{ type: 'video', url: '' }], 'c.jpg')).toBeNull()
  })
})

describe('feedPoster', () => {
  it('prefers the event cover', () => {
    expect(feedPoster([image()], 'https://cdn.example/cover.jpg')).toBe(
      'https://cdn.example/cover.jpg'
    )
  })

  it('falls back to the first image by order', () => {
    expect(feedPoster([image({ order: 3, url: 'b.jpg' }), image({ order: 1, url: 'a.jpg' })], null))
      .toBe('a.jpg')
  })

  it("uses a video's thumbnail when there is no image at all", () => {
    // An event whose only upload is a clip still has something to draw while
    // the player warms up.
    expect(feedPoster([video()], null)).toBe('https://cdn.example/poster.jpg')
  })

  it('returns null rather than a broken url', () => {
    expect(feedPoster([], null)).toBeNull()
    expect(feedPoster(undefined, null)).toBeNull()
  })
})

describe('feedPlaylist', () => {
  it('opens with the cover', () => {
    const p = feedPlaylist([video()], 'https://cdn.example/cover.jpg')
    expect(p[0]).toEqual({ kind: 'image', url: 'https://cdn.example/cover.jpg' })
  })

  it('never shows the cover twice', () => {
    /*
     * The dashboard keeps `cover_image_url` and `event_media` as separate
     * fields, so an organiser uploading the same photograph to both is the
     * normal case, not a mistake. A playlist that then showed it twice in a row
     * reads as a stuck carousel rather than a loop.
     */
    const cover = 'https://cdn.example/cover.jpg'
    const p = feedPlaylist([image({ url: cover }), video()], cover)
    expect(p.filter((i) => i.url === cover)).toHaveLength(1)
  })

  it('walks in `order`, not array position', () => {
    const p = feedPlaylist(
      [image({ url: 'b.jpg', order: 9 }), image({ url: 'a.jpg', order: 1 })],
      null
    )
    expect(p.map((i) => i.url)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('drops a video it cannot poster rather than leaving a gap', () => {
    // A black rectangle mid-loop is worse than on a static card: it arrives
    // while somebody is already watching.
    const p = feedPlaylist([video({ thumbnail_url: null })], null)
    expect(p).toEqual([])
  })

  it('never includes a document', () => {
    // `event_media.type` allows it — a menu or a floor plan. It has no business
    // in a card that autoplays.
    const p = feedPlaylist([{ type: 'document', url: 'menu.pdf', order: 0 }], 'c.jpg')
    expect(p.map((i) => i.kind)).toEqual(['image'])
  })

  it('carries each video its own poster', () => {
    const p = feedPlaylist([video()], 'https://cdn.example/cover.jpg')
    const v = p.find((i) => i.kind === 'video')
    expect(v).toEqual({
      kind: 'video',
      url: 'https://cdn.example/clip.mp4',
      posterUrl: 'https://cdn.example/poster.jpg',
    })
  })

  it('is empty when there is nothing at all, rather than throwing', () => {
    expect(feedPlaylist(undefined, null)).toEqual([])
    expect(feedPlaylist([], null)).toEqual([])
  })
})

describe('clipFirst', () => {
  const img = (url: string) => ({ kind: 'image' as const, url })
  const vid = (url: string) => ({ kind: 'video' as const, url, posterUrl: 'p.jpg' })

  it('promotes the first clip to the front', () => {
    const out = clipFirst([img('a'), img('b'), vid('v'), img('c')])
    expect(out.map((i) => i.url)).toEqual(['v', 'a', 'b', 'c'])
  })

  it('leaves the rest in their original order', () => {
    // The organiser's arrangement is theirs; exactly one thing moves.
    const out = clipFirst([img('a'), img('b'), vid('v')])
    expect(out.map((i) => i.url)).toEqual(['v', 'a', 'b'])
  })

  it('changes nothing when the clip is already first', () => {
    const out = clipFirst([vid('v'), img('a')])
    expect(out.map((i) => i.url)).toEqual(['v', 'a'])
  })

  it('changes nothing when there is no clip', () => {
    const out = clipFirst([img('a'), img('b')])
    expect(out.map((i) => i.url)).toEqual(['a', 'b'])
  })

  it('promotes only the first clip when there are several', () => {
    const out = clipFirst([img('a'), vid('v1'), vid('v2')])
    expect(out.map((i) => i.url)).toEqual(['v1', 'a', 'v2'])
  })

  it('handles an empty playlist', () => {
    expect(clipFirst([])).toEqual([])
  })
})
