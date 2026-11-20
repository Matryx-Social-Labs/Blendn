/*
 * The Pulse map, Option 3 "You and what's near" (pulse-map 05–10, owner 2026-11-17): the rules under the map. Where you
 * are (the violet mark and its states), the one line about other places, the piles, and the focus never in a pile.
 */
import {
  bubbleRadius,
  CLUSTER,
  moreLine,
  placeLine,
  readingOf,
  STALE_AFTER_MS,
  splitFocus,
  youMark,
} from '../lib/mapPresence'

const NOW = Date.parse('2026-11-17T20:00:00Z')
const fix = (over: object = {}) => ({ latitude: 12.97, longitude: 77.64, accuracy: 18, timestamp: NOW - 5_000, ...over })

describe('readingOf: whether a distance from this fix is said exactly or "about" (SCRUM-1080)', () => {
  it('iOS Precise off or Android coarse says so; a radius over a kilometre is a guess at the district either way', () => {
    expect(readingOf(fix({ approximate: true }))).toBe('approximate')
    expect(readingOf(fix({ accuracy: 3000 }))).toBe('approximate')
  })
  it('a precise fix, or one with no accuracy given, is exact; no fix has no distance to read (the negative control)', () => {
    expect(readingOf(fix())).toBe('exact')
    expect(readingOf(fix({ accuracy: 1000 }))).toBe('exact')
    expect(readingOf(fix({ accuracy: null }))).toBe('exact')
    expect(readingOf(null)).toBe('exact')
  })
})

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

  it('no total from the server: no count claim; with one, "+130 more" and Zoom in (sheet 16, PICKED A)', () => {
    expect(moreLine(null, 50, true)).toBeNull()
    expect(moreLine(50, 50, true)).toBeNull()
    expect(moreLine(180, 50, true)).toEqual({ text: '+130 more', zoomIn: true, label: '130 more events in this view. Zoom in' })
  })

  it('counts are exact to 999, then 1.2k / 12k; the label carries the full number', () => {
    expect(moreLine(1049, 50, true)?.text).toBe('+999 more')
    expect(moreLine(1050, 50, true)?.text).toBe('+1k more')
    expect(moreLine(12_530, 50, true)).toEqual({ text: '+12k more', zoomIn: true, label: '12,480 more events in this view. Zoom in' })
    expect(moreLine(51, 50, true)?.label).toBe('1 more event in this view. Zoom in')
    expect(moreLine(52, 50, true, 'place')?.label).toBe('2 more places in this view. Zoom in')
  })

  it('at the map’s deepest zoom the count is plain text: no Zoom in', () => {
    expect(moreLine(180, 50, false)).toEqual({ text: '+130 more', zoomIn: false, label: '130 more events in this view' })
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

  /*
   * The drive (Android, Church Street): the six nearest were 0.7–3 km out, the box was clamped at z14.6 and centred on
   * them, so you sat on the screen's edge with one event in view. You stay in frame: the farthest drop out (they are the
   * edge markers' job), and with none close enough the map is on you at the widest zoom the frame allows.
   */
  it('six too spread for z14.6: you stay in frame, framed with the nearest that fit', () => {
    const close = [at('c1', 0.001, 0.001), at('c2', -0.0015, 0.001)]
    // All off to one side, as on the drive, so a box centred on them would leave you behind.
    const spread = [at('s1', 0.02, -0.02), at('s2', 0.025, -0.02), at('s3', 0.03, -0.03), at('s4', 0.03, -0.025)]
    const f = frameOnYou(you, [...spread, ...close], view)!
    expect(f.zoom).toBeGreaterThanOrEqual(14.6)
    expect(Math.abs(f.center[1] - you.latitude)).toBeLessThan(0.002)
    expect(Math.abs(f.center[0] - you.longitude)).toBeLessThan(0.002)
  })

  it('none close enough for z14.6: on you at z14.6, not at the street zoom', () => {
    expect(frameOnYou(you, [at('far1', 0.03, 0.03), at('far2', -0.04, 0.02)], view)).toEqual({ center: [you.longitude, you.latitude], zoom: 14.6 })
  })

  /*
   * Approximate (pulse-map 06, "iOS Precise off"): the map frames the ~3 km circle at city-district zoom. The Android drive
   * opened a 3 km fix at street zoom framed on "the six nearest" of a guess, the whole view one violet wash.
   */
  it('approximate: frames its own circle, on you, at city-district zoom (whatever is near)', () => {
    const near = [1, 2].map((i) => at(`n${i}`, 0.001 * i, 0.001 * i))
    const f = frameOnYou({ ...you, accuracy: 3000 }, near, view)!
    expect(f.center).toEqual([you.longitude, you.latitude])
    expect(f.zoom).toBeGreaterThan(11)
    expect(f.zoom).toBeLessThan(12.5)
  })

  it('a precise accuracy (the control) frames the nearest as before', () => {
    const near = [1, 2].map((i) => at(`n${i}`, 0.001 * i, 0.001 * i))
    expect(frameOnYou({ ...you, accuracy: 12 }, near, view)).toEqual(frameOnYou(you, near, view))
    // iOS says so itself (Precise off) even when the radius reads small.
    expect(frameOnYou({ ...you, accuracy: 400, approximate: true }, near, view)!.center).toEqual([you.longitude, you.latitude])
  })

  it('no fix: no frame (the map opens on the city, as today)', () => {
    expect(frameOnYou(null, [at('a', 0.001, 0.001)], view)).toBeNull()
  })

  it('no events near: on you, at the street zoom', () => {
    expect(frameOnYou(you, [], view)).toEqual({ center: [you.longitude, you.latitude], zoom: 16 })
  })
})

// eslint-disable-next-line import/first
import { edgeMarker, staleCalloutBelow, staleCalloutBox } from '../lib/mapPresence'

describe('edgeMarker (pulse-map 05: an off-frame lap venue gets a marker at the edge, pointing at it)', () => {
  const box = { left: 0, top: 100, right: 400, bottom: 500 } // centre (200, 300)
  const size = { width: 120, height: 32 }

  it('is nothing when the map you can see has no room for it (TalkBack drive: the full drawer left a strip, and it sat over the top bar)', () => {
    expect(edgeMarker([200, -400], { left: 0, top: 100, right: 400, bottom: 130 }, size)).toBeNull()
    expect(edgeMarker([200, -400], { left: 0, top: 100, right: 400, bottom: 40 }, size)).toBeNull()
  })

  it('is nothing while the venue is in the map you can see', () => {
    expect(edgeMarker([200, 300], box, size)).toBeNull()
    expect(edgeMarker([5, 105], box, size)).toBeNull()
  })

  it('sits inside the edge on the line from the centre, the arrow turned to the venue', () => {
    // Straight up, off the top: centred, under the top edge, arrow 0°.
    const up = edgeMarker([200, -400], box, size)
    expect(up).toEqual({ left: 140, top: 108, angle: 0 })
    // Off to the left and up (Kitty Ko, board 05 frame 3): pinned to the left edge, arrow up-left.
    const upLeft = edgeMarker([-800, -700], box, size)
    expect(upLeft?.left).toBe(8)
    expect(upLeft?.angle).toBeCloseTo(-45, 0)
    // Off the bottom right (Olive Beach, frame 6): arrow down-right, never past the box.
    const downRight = edgeMarker([900, 1000], box, size)
    expect(downRight?.angle).toBeCloseTo(135, 0)
    expect((downRight?.left ?? 0) + size.width).toBeLessThanOrEqual(box.right - 8)
    expect((downRight?.top ?? 0) + size.height).toBeLessThanOrEqual(box.bottom - 8)
  })
})

// eslint-disable-next-line import/first
import { mapSummary } from '../lib/mapPresence'

describe('mapSummary (pulse-map 10: the map is spoken, not only its numbers)', () => {
  const bounds: [number, number, number, number] = [77.5, 12.9, 77.7, 13.0]
  const pin = (lng: number, live = false) => ({ longitude: lng, latitude: 12.95, live })

  it('says how many events are on the map you see, how many are on now, where you are and what is off it', () => {
    expect(
      mapSummary({ bounds, pins: [pin(77.6, true), pin(77.61), pin(77.9)], you: 'precise', youLine: null, edge: { name: 'Kitty Ko', distance: '3.1 km' } })
    ).toBe('Map. 2 events here, 1 on now. You are on the map. Kitty Ko is off the map, 3.1 km away.')
  })

  it('says one event, none, and each state of you in its own words; never a distance it does not have', () => {
    expect(mapSummary({ bounds, pins: [pin(77.6)], you: 'none', youLine: null, edge: null })).toBe('Map. 1 event here.')
    expect(mapSummary({ bounds, pins: [], you: 'approximate', youLine: null, edge: null })).toBe('Map. No events here. Your location is approximate.')
    expect(mapSummary({ bounds, pins: [], you: 'stale', youLine: 'Last seen here 25 min ago · updating', edge: { name: 'Lupa', distance: null } })).toBe(
      'Map. No events here. Last seen here 25 min ago, updating. Lupa is off the map.'
    )
    expect(mapSummary({ bounds: null, pins: [pin(77.6)], you: 'precise', youLine: null, edge: null })).toBe('Map. You are on the map.')
  })
})

describe('staleCalloutBelow (pulse-map 06 "STALE": the callout over the grey dot, never under the edge marker)', () => {
  // The iOS drive, 2026-11-19: dot (206, 242), the callout 200 × 40 with 17 pt to the dot, the marker at the top-left edge.
  const callout = { width: 200, height: 40, gap: 17 }
  const topLeft = { left: 8, top: 156, width: 200, height: 44 }

  it('goes under the dot when, over it, it would meet the edge marker (it ran 3 pt under "High Ultra Lounge 6.7 km")', () => {
    expect(staleCalloutBelow([206, 242], callout, topLeft)).toBe(true)
  })

  it('stays over the dot, as the board draws it, with no marker or one clear of it', () => {
    expect(staleCalloutBelow([206, 242], callout, null)).toBe(false)
    // The marker at the bottom edge, and one at the top but past the callout's side.
    expect(staleCalloutBelow([206, 242], callout, { left: 100, top: 300, width: 200, height: 44 })).toBe(false)
    expect(staleCalloutBelow([360, 242], callout, topLeft)).toBe(false)
    // The marker well above the callout's top (185 − air).
    expect(staleCalloutBelow([206, 320], callout, topLeft)).toBe(false)
  })
})

describe('staleCalloutBelow with the marker beside the dot (Android re-drive: below, it ran under "Olive Beach 850 m")', () => {
  const callout = { width: 200, height: 40, gap: 17 }
  it('stays over the dot when the marker, as drawn, is level with the dot and clear of the box over it', () => {
    expect(staleCalloutBelow([202, 250], callout, { left: 258, top: 244, width: 138, height: 28 })).toBe(false)
  })
  it('takes the side it meets least when it would meet the marker on both', () => {
    expect(staleCalloutBelow([202, 250], callout, { left: 250, top: 225, width: 150, height: 44 })).toBe(true)
    expect(staleCalloutBelow([202, 250], callout, { left: 250, top: 240, width: 150, height: 44 })).toBe(false)
    // Over the dot it meets the marker less than under it: it stays over.
    expect(staleCalloutBelow([202, 250], callout, { left: 250, top: 215, width: 150, height: 110 })).toBe(false)
  })
})

describe('staleCalloutBox (the room the stale callout takes, so names keep out of it)', () => {
  const callout = { width: 200, height: 40, gap: 17 }
  it('is centred over the dot, its bottom the gap above, or hangs the gap below', () => {
    expect(staleCalloutBox([206, 242], callout, false)).toEqual({ left: 106, right: 306, top: 185, bottom: 225 })
    expect(staleCalloutBox([206, 242], callout, true)).toEqual({ left: 106, right: 306, top: 259, bottom: 299 })
  })
})

import { EDGE_MAX_KM, edgeGate } from '../lib/mapPresence'

/**
 * Owner bug 2026-11-20: in Saarbrücken (no served city) the map opened on the person and the edge marker read
 * "Olive Beach · 7,500 km". The marker is for a venue in the city the map shows, near where it looks.
 */
describe('edgeGate: when the lap venue gets an edge marker, and whether it says a distance', () => {
  const bengaluru = { latitude: 12.9716, longitude: 77.5946 }
  const oliveBeach: [number, number] = [77.6408, 12.9719]
  const saarbruecken = { latitude: 49.2354, longitude: 6.9965 }

  it('is none from Saarbrücken: the venue is on another continent from the map and the person', () => {
    expect(edgeGate({ at: oliveBeach, cityCentre: bengaluru, mapCentre: [saarbruecken.longitude, saarbruecken.latitude], fix: saarbruecken })).toBeNull()
  })

  it('browsing Bengaluru from Saarbrücken: the marker, but no distance (it would be from somewhere else entirely)', () => {
    expect(edgeGate({ at: oliveBeach, cityCentre: bengaluru, mapCentre: [77.59, 12.97], fix: saarbruecken })).toEqual({ distance: false })
  })

  it('in Bengaluru, looking at Bengaluru: the marker with the distance from you', () => {
    expect(edgeGate({ at: oliveBeach, cityCentre: bengaluru, mapCentre: [77.59, 12.97], fix: { latitude: 12.98, longitude: 77.6 } })).toEqual({ distance: true })
  })

  it('no fix: the marker, no distance', () => {
    expect(edgeGate({ at: oliveBeach, cityCentre: bengaluru, mapCentre: [77.59, 12.97], fix: null })).toEqual({ distance: false })
  })

  it(`is none for a venue past ${EDGE_MAX_KM} km of the map centre or outside the city shown, and none before either is known`, () => {
    expect(edgeGate({ at: [76.6394, 12.2958], cityCentre: bengaluru, mapCentre: [77.59, 12.97], fix: null })).toBeNull() // Mysuru, ~130 km
    expect(edgeGate({ at: oliveBeach, cityCentre: { latitude: 43.65, longitude: -79.38 }, mapCentre: [77.59, 12.97], fix: null })).toBeNull()
    expect(edgeGate({ at: oliveBeach, cityCentre: null, mapCentre: [77.59, 12.97], fix: null })).toBeNull()
    expect(edgeGate({ at: oliveBeach, cityCentre: bengaluru, mapCentre: null, fix: null })).toBeNull()
  })
})
