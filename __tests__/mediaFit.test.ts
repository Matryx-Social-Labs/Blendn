/*
 * The server's media facts on the phone (task 21, SCRUM-1066): where a crop sits (the organizer's focal point, or the
 * default the dashboard previews with), which copy of a clip plays, and how long a clip's pip fills.
 *
 * The focus vectors are the dashboard's own (`blendn-admin/__tests__/media-fit.test.ts`): a phone that crops differently
 * from the preview the organizer composed to is worse than none.
 */
import { clipLength, clipSource, DEFAULT_FOCUS, focusPosition, focusStyle, mediaFocus, mediaSize, videoFrame } from '../lib/mediaFit'

describe('focusPosition (the dashboard vectors, unchanged)', () => {
  const frame = { width: 100, height: 100 }
  const wide = { width: 200, height: 100 }

  it('centres the point when there is room', () => {
    expect(focusPosition(wide, frame, { x: 0.5, y: 0.5 }).x).toBeCloseTo(50)
    expect(focusPosition(wide, frame, { x: 0.62, y: 0.5 }).x).toBeCloseTo(74)
  })

  it('stops at the edge rather than showing past the picture', () => {
    expect(focusPosition(wide, frame, { x: 0.95, y: 0.5 }).x).toBe(100)
    expect(focusPosition(wide, frame, { x: 0, y: 0.5 }).x).toBe(0)
  })

  it('is the centre on an axis with nothing to crop', () => {
    expect(focusPosition(wide, frame, { x: 0.62, y: 0.1 }).y).toBe(50)
  })

  it("falls back to the default focus, 50% across and 40% down (today's COVER_FOCUS)", () => {
    expect(DEFAULT_FOCUS).toEqual({ x: 0.5, y: 0.4 })
    expect(focusPosition({ width: 100, height: 200 }, frame, null).y).toBeCloseTo(30)
  })
})

describe('focusStyle (expo-image contentPosition)', () => {
  it('is the same percentages as strings', () => {
    expect(focusStyle({ width: 200, height: 100 }, { width: 100, height: 100 }, { x: 0.62, y: 0.5 })).toEqual({ left: '74%', top: '50%' })
  })
})

describe('videoFrame (the player, drawn whole and shifted, since VideoView has no content position)', () => {
  it('draws a 9:16 clip at the card width and lifts it so the point sits as near the centre as it can', () => {
    // 1080×1920 into 345×256: scale 345/1080, drawn 345 × 613.3, overflow 357.3; y 0.2 → (122.7 − 128) / 357.3 < 0 → 0.
    const top = videoFrame({ width: 1080, height: 1920 }, { width: 345, height: 256 }, { x: 0.5, y: 0.2 })
    expect(top.width).toBeCloseTo(345)
    expect(top.height).toBeCloseTo(613.33, 1)
    expect(top.left).toBeCloseTo(0)
    expect(top.top).toBeCloseTo(0)
    // y 0.8 → (490.7 − 128) / 357.3 = 1.015 → 1: the bottom edge on the card's.
    const bottom = videoFrame({ width: 1080, height: 1920 }, { width: 345, height: 256 }, { x: 0.5, y: 0.8 })
    expect(bottom.top).toBeCloseTo(256 - 613.33, 1)
  })

  it('with no point, the default focus (the dashboard preview), not the centre', () => {
    const f = videoFrame({ width: 1080, height: 1920 }, { width: 345, height: 256 }, null)
    // (0.4 × 613.3 − 128) / 357.3 = 0.3284 of the overflow.
    expect(f.top).toBeCloseTo(-0.3284 * 357.33, 0)
  })

  it('a clip at the card ratio is not shifted', () => {
    expect(videoFrame({ width: 1080, height: 1080 }, { width: 345, height: 345 }, { x: 0.9, y: 0.9 })).toEqual({ width: 345, height: 345, left: 0, top: 0 })
  })
})

describe('mediaSize / mediaFocus (both spellings, both or neither)', () => {
  it('reads a size only when both sides are positive', () => {
    expect(mediaSize({ width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 })
    expect(mediaSize({ width: 1080, height: null })).toBeNull()
    expect(mediaSize({ width: 0, height: 10 })).toBeNull()
    expect(mediaSize({})).toBeNull()
  })

  it('reads the list (snake) and detail (camel) focal point, else null', () => {
    expect(mediaFocus({ focal_x: 0.2, focal_y: 0.7 })).toEqual({ x: 0.2, y: 0.7 })
    expect(mediaFocus({ focalX: 0, focalY: 1 })).toEqual({ x: 0, y: 1 })
    expect(mediaFocus({ focal_x: 0.2, focal_y: null })).toBeNull()
    expect(mediaFocus({ focal_x: 1.4, focal_y: 0.5 })).toBeNull()
    expect(mediaFocus({})).toBeNull()
  })
})

describe('clipSource (which copy plays, per advisor 2026-11-25)', () => {
  const small = { url: 'https://cdn/540.mp4', width: 540, height: 960, bytes: 2_000_000 }
  const large = { url: 'https://cdn/1080.mp4', width: 1080, height: 1920, bytes: 9_000_000 }
  // Out of order on purpose: chosen by bytes, not position.
  const clip = { url: 'https://organizer/clip.mov', renditions: [large, small] }
  const lead = { width: 345, height: 256 }

  it('no copies: the organizer’s own URL, everywhere', () => {
    expect(clipSource({ url: 'u', renditions: null }, { sound: true })).toBe('u')
    expect(clipSource({ url: 'u' }, { frame: lead, density: 3, saver: false })).toBe('u')
  })

  it('the viewer has sound: the largest copy, the only one with it', () => {
    expect(clipSource(clip, { sound: true })).toBe(large.url)
  })

  it('a muted card on cellular or Low Power: the smallest', () => {
    expect(clipSource(clip, { frame: lead, density: 3, saver: true })).toBe(small.url)
  })

  it('a muted card on Wi-Fi: the smallest whose short side covers the card at 0.75 of the screen density', () => {
    // 256 × 3 × 0.75 = 576 > 540 → the 1080.
    expect(clipSource(clip, { frame: lead, density: 3, saver: false })).toBe(large.url)
    // 256 × 2 × 0.75 = 384 ≤ 540 → the 540.
    expect(clipSource(clip, { frame: lead, density: 2, saver: false })).toBe(small.url)
    // 256 × 2.5 = 640 > 540, but × 0.75 = 480: the slack keeps the small copy.
    expect(clipSource(clip, { frame: lead, density: 2.5, saver: false })).toBe(small.url)
  })
})

describe('clipLength (how long a clip’s pip fills)', () => {
  it('the server’s length when it has one, from mount, kept to 1–15.5 s', () => {
    expect(clipLength(15200, null)).toBe(15200)
    expect(clipLength(15200, 3)).toBe(15200)
    expect(clipLength(400, null)).toBe(1000)
    expect(clipLength(99_000, null)).toBe(15500)
  })

  it('else what the player learned, when it is a real number', () => {
    expect(clipLength(null, 12.5)).toBe(12500)
    expect(clipLength(null, 0)).toBeNull()
    expect(clipLength(null, Number.NaN)).toBeNull()
    expect(clipLength(null, null)).toBeNull()
  })
})
