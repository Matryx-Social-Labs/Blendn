/*
 * The Pulse map, Option 3 "You and what's near" (pulse-map 05–10, owner 2026-11-17): the rules under the map. Where you
 * are (the violet mark and its states), the one line about other places, the piles, and the focus never in a pile.
 */
import {
  bubbleRadius,
  CLUSTER,
  moreLine,
  placeLine,
  STALE_AFTER_MS,
  splitFocus,
  youMark,
} from '../lib/mapPresence'

const NOW = Date.parse('2026-11-17T20:00:00Z')
const fix = (over: object = {}) => ({ latitude: 12.97, longitude: 77.64, accuracy: 18, timestamp: NOW - 5_000, ...over })

describe('youMark: where you are, and what the map says about it', () => {
  it('precise: the dot, its halo the real accuracy', () => {
    expect(youMark({ sharing: true, permission: 'granted', fix: fix(), now: NOW })).toEqual({ kind: 'precise', haloM: 18, line: null })
  })

  it('iOS Precise off: a soft circle, no dot, one ask', () => {
    expect(youMark({ sharing: true, permission: 'granted', fix: fix({ approximate: true, accuracy: 3000 }), now: NOW })).toEqual({
      kind: 'approximate',
      haloM: 3000,
      line: 'Approximate · Use precise',
    })
  })

  it('stale past 10 minutes: grey, and says when', () => {
    expect(STALE_AFTER_MS).toBe(10 * 60_000)
    expect(youMark({ sharing: true, permission: 'granted', fix: fix({ timestamp: NOW - 25 * 60_000 }), now: NOW })).toEqual({
      kind: 'stale',
      haloM: 18,
      line: 'Last seen here 25 min ago · updating',
    })
    // The control: ten minutes exactly is still live.
    expect(youMark({ sharing: true, permission: 'granted', fix: fix({ timestamp: NOW - STALE_AFTER_MS }), now: NOW }).kind).toBe('precise')
  })

  it('denied: no dot, and one quiet line to Settings; never a guessed position', () => {
    expect(youMark({ sharing: true, permission: 'denied', fix: fix(), now: NOW })).toEqual({ kind: 'denied', haloM: null, line: 'See what’s near you' })
  })

  it('off in Blend’n: nothing at all, nothing asks (SCRUM-908)', () => {
    expect(youMark({ sharing: false, permission: 'granted', fix: fix(), now: NOW })).toEqual({ kind: 'off', haloM: null, line: null })
  })

  it('granted, no fix yet: no dot and no line', () => {
    expect(youMark({ sharing: true, permission: 'granted', fix: null, now: NOW })).toEqual({ kind: 'none', haloM: null, line: null })
  })
})

describe('placeLine: one line about other places, with the way back', () => {
  it('a city from the picker', () => {
    expect(placeLine({ city: 'Toronto', home: 'Bengaluru', browsingHere: false, travelling: false, nothingNear: false })).toEqual({
      text: 'Browsing Toronto',
      back: 'Back to you',
    })
  })

  it('travel mode', () => {
    expect(placeLine({ city: 'Toronto', home: 'Bengaluru', browsingHere: false, travelling: true, nothingNear: false })).toEqual({
      text: 'Visiting Toronto',
      back: 'Back to Bengaluru',
    })
  })

  it('nothing near you: says so, and offers the switch', () => {
    expect(placeLine({ city: 'Bengaluru', home: 'Bengaluru', browsingHere: true, travelling: false, nothingNear: true })).toEqual({
      text: 'Nothing near you yet',
      switch: ['Near you', 'In Bengaluru'],
    })
  })

  it('home, with something near: no line', () => {
    expect(placeLine({ city: 'Bengaluru', home: 'Bengaluru', browsingHere: true, travelling: false, nothingNear: false })).toBeNull()
  })

  it('never a time-zone word, never a distance', () => {
    const lines = [
      placeLine({ city: 'Toronto', home: 'Bengaluru', browsingHere: false, travelling: true, nothingNear: false }),
      placeLine({ city: 'Toronto', home: 'Bengaluru', browsingHere: false, travelling: false, nothingNear: false }),
    ]
    for (const l of lines) expect(JSON.stringify(l)).not.toMatch(/IST|EST|EDT|UTC|time|km|\bm\b/)
  })
})

describe('the piles, and the focus never inside one', () => {
  it('MapLibre’s own clustering: radius 46, numbers up to z13, every event a dot from z14', () => {
    expect(CLUSTER).toEqual({ radius: 46, maxZoom: 13 })
  })

  it('bubble sizes 15 / 18 / 21 pt at 1 / 10 / 25+', () => {
    expect([bubbleRadius(2), bubbleRadius(9), bubbleRadius(10), bubbleRadius(24), bubbleRadius(25), bubbleRadius(2000)]).toEqual([15, 15, 18, 18, 21, 21])
  })

  it('the focused event is drawn from its own source: out of the clustered pins, and still on the map', () => {
    const pins = [{ id: 'a' }, { id: 'lit' }, { id: 'b' }]
    expect(splitFocus(pins, 'lit')).toEqual({ piled: [{ id: 'a' }, { id: 'b' }], focus: { id: 'lit' } })
    // The control: no focus, every pin can pile.
    expect(splitFocus(pins, null)).toEqual({ piled: pins, focus: null })
  })

  it('a focus not among the loaded pins is still drawn (it never disappears)', () => {
    expect(splitFocus([{ id: 'a' }], 'far', { id: 'far' })).toEqual({ piled: [{ id: 'a' }], focus: { id: 'far' } })
  })

  it('no total from the server: no count claim; with one, "+130 more · zoom in"', () => {
    expect(moreLine(null, 50)).toBeNull()
    expect(moreLine(50, 50)).toBeNull()
    expect(moreLine(180, 50)).toBe('+130 more · zoom in')
  })
})

/* Option 3 opens framed on you and the six nearest events (pulse-map 05: zoom 14.6–16). */
import { FRAME_NEAREST, FRAME_ZOOM, frameOnYou } from '../lib/mapPresence'

describe('frameOnYou: you and the six nearest, in the map you can see', () => {
  const you = { latitude: 12.9719, longitude: 77.6087 }
  const view = { width: 393, height: 300 }
  const at = (id: string, dLat: number, dLon: number) => ({ id, latitude: you.latitude + dLat, longitude: you.longitude + dLon })

  it('frames the six nearest (not the far ones) with you in it, between z14.6 and z16', () => {
    expect(FRAME_NEAREST).toBe(6)
    expect(FRAME_ZOOM).toEqual({ min: 14.6, max: 16 })
    const near = [1, 2, 3, 4, 5, 6].map((i) => at(`n${i}`, 0.001 * i, 0.001 * i))
    const far = at('far', 0.3, 0.3)
    const f = frameOnYou(you, [far, ...near], view)
    expect(f).not.toBeNull()
    expect(f!.zoom).toBeGreaterThanOrEqual(14.6)
    expect(f!.zoom).toBeLessThanOrEqual(16)
    // The far one did not pull the frame out to it.
    expect(Math.abs(f!.center[1] - you.latitude)).toBeLessThan(0.01)
  })

  it('a tight cluster stops at z16; a spread one at z14.6', () => {
    expect(frameOnYou(you, [at('a', 0.00005, 0.00005)], view)!.zoom).toBe(16)
    expect(frameOnYou(you, [at('a', 0.05, 0.05)], view)!.zoom).toBe(14.6)
  })

  it('no fix: no frame (the map opens on the city, as today)', () => {
    expect(frameOnYou(null, [at('a', 0.001, 0.001)], view)).toBeNull()
  })

  it('no events near: on you, at the street zoom', () => {
    expect(frameOnYou(you, [], view)).toEqual({ center: [you.longitude, you.latitude], zoom: 16 })
  })
})
