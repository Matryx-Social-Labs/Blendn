import { clampOffset, clampZoom, coverScale, cropRect, MAX_ZOOM, maxOffset, maxZoomFor, MIN_CROP_PX, pinchOffset } from '../lib/photoCrop'

const FRAME = { width: 400, height: 520 } // the hero's 1 : 1.3

describe('covering the frame', () => {
  it('a landscape photo is scaled to the frame’s height, a portrait one to its width', () => {
    expect(coverScale({ width: 4000, height: 3000 }, FRAME)).toBeCloseTo(520 / 3000)
    expect(coverScale({ width: 1000, height: 4000 }, FRAME)).toBeCloseTo(400 / 1000)
  })

  it('at 1× a photo covers the frame exactly on one axis: it can only move along the other', () => {
    const landscape = maxOffset({ width: 4000, height: 3000 }, FRAME, 1)
    expect(landscape.y).toBeCloseTo(0)
    expect(landscape.x).toBeGreaterThan(0)
    const portrait = maxOffset({ width: 1000, height: 4000 }, FRAME, 1)
    expect(portrait.x).toBeCloseTo(0)
    expect(portrait.y).toBeGreaterThan(0)
  })

  it('zooming widens how far it can move, on both axes', () => {
    const image = { width: 4000, height: 3000 }
    expect(maxOffset(image, FRAME, 2).y).toBeGreaterThan(maxOffset(image, FRAME, 1).y)
    expect(maxOffset(image, FRAME, 2).x).toBeGreaterThan(maxOffset(image, FRAME, 1).x)
  })
})

describe('what the frame keeps', () => {
  const image = { width: 4000, height: 3000 }

  it('untouched, it keeps the middle of the photo at the frame’s shape', () => {
    const rect = cropRect(image, FRAME, 1, { x: 0, y: 0 })
    expect(rect.height).toBe(3000)
    expect(rect.width / rect.height).toBeCloseTo(400 / 520, 2)
    expect(rect.originX + rect.width / 2).toBeCloseTo(2000, -1)
    expect(rect.originY).toBe(0)
  })

  it('dragging the photo right makes the frame look at the left of it', () => {
    const max = maxOffset(image, FRAME, 1).x
    const rect = cropRect(image, FRAME, 1, { x: max, y: 0 })
    expect(rect.originX).toBe(0)
    const other = cropRect(image, FRAME, 1, { x: -max, y: 0 })
    expect(other.originX + other.width).toBe(4000)
  })

  it('a drag past the edge keeps the frame inside the photo (never a blank margin)', () => {
    const rect = cropRect(image, FRAME, 1, { x: 99999, y: 99999 })
    expect(rect.originX).toBeGreaterThanOrEqual(0)
    expect(rect.originY).toBeGreaterThanOrEqual(0)
    expect(rect.originX + rect.width).toBeLessThanOrEqual(4000)
    expect(rect.originY + rect.height).toBeLessThanOrEqual(3000)
  })

  it('zoomed in 2×, it keeps half the area of the width it kept at 1×', () => {
    const one = cropRect(image, FRAME, 1, { x: 0, y: 0 })
    const two = cropRect(image, FRAME, 2, { x: 0, y: 0 })
    expect(two.width).toBeCloseTo(one.width / 2, -1)
    expect(two.height).toBeCloseTo(one.height / 2, -1)
  })

  it('a zoom outside 1 to 4 is held inside it', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
    expect(cropRect(image, FRAME, 9, { x: 0, y: 0 })).toEqual(cropRect(image, FRAME, MAX_ZOOM, { x: 0, y: 0 }))
  })

  it('a photo already at the frame’s shape is kept whole', () => {
    expect(cropRect({ width: 800, height: 1040 }, FRAME, 1, { x: 0, y: 0 })).toEqual({ originX: 0, originY: 0, width: 800, height: 1040 })
  })

  it('a photo smaller than the frame is still a valid crop, inside itself', () => {
    const rect = cropRect({ width: 300, height: 300 }, FRAME, 1, { x: 0, y: 0 })
    expect(rect.originX).toBeGreaterThanOrEqual(0)
    expect(rect.width).toBeLessThanOrEqual(300)
    expect(rect.height).toBeLessThanOrEqual(300)
  })

  it('clampOffset leaves a legal offset alone', () => {
    const o = { x: 10, y: 0 }
    expect(clampOffset(image, FRAME, 1, o)).toEqual(o)
  })
})

describe('how far a photo may be zoomed (maxZoomFor)', () => {
  it('a 200 × 200 photo is not zoomed at all: the crop already keeps fewer than 540 pixels', () => {
    expect(maxZoomFor({ width: 200, height: 200 }, FRAME)).toBe(1)
  })

  it('1080 × 1440 may be zoomed to 2×: 1080 across at 1×, 540 across at 2×', () => {
    expect(maxZoomFor({ width: 1080, height: 1440 }, FRAME)).toBeCloseTo(2, 1)
    const rect = cropRect({ width: 1080, height: 1440 }, FRAME, 9, { x: 0, y: 0 })
    expect(rect.width).toBeGreaterThanOrEqual(MIN_CROP_PX - 1)
  })

  it('a 48 MP photo (8000 × 6000) reaches the plain ceiling of 4×', () => {
    expect(maxZoomFor({ width: 8000, height: 6000 }, FRAME)).toBe(MAX_ZOOM)
  })

  it('clampZoom holds a zoom inside 1 and the photo’s own maximum', () => {
    expect(clampZoom(3, 2)).toBe(2)
    expect(clampZoom(0.5, 2)).toBe(1)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
  })

  it('a landscape photo is limited by its height covering the frame, not its width', () => {
    const image = { width: 4000, height: 1800 }
    expect(maxZoomFor(image, FRAME)).toBeCloseTo(FRAME.width / (coverScale(image, FRAME) * MIN_CROP_PX), 5)
  })
})

describe('where a pinch puts the photo (pinchOffset)', () => {
  it('with the fingers still and the ratio 1, nothing moves', () => {
    expect(pinchOffset({ x: 30, y: -10 }, { x: 30, y: -10 }, { x: 12, y: 7 }, 1)).toEqual({ x: 12, y: 7 })
  })

  it('zooming about the middle of the frame keeps the photo centred', () => {
    expect(pinchOffset({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({ x: 0, y: 0 })
  })

  it('zooming 2× about a point away from the middle moves the photo so that point stays under the fingers', () => {
    // The point at (40, 0) from the middle: after 2× the photo has moved 40 the other way.
    expect(pinchOffset({ x: 40, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({ x: -40, y: 0 })
  })

  it('fingers that travel while they zoom carry the photo with them', () => {
    const at = pinchOffset({ x: 70, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 0 }, 2)
    expect(at.x).toBe(70 - 40 * 2)
  })

  it('a pan that was in progress is kept as the starting offset', () => {
    expect(pinchOffset({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 25, y: 5 }, 1.5)).toEqual({ x: 0 - (0 - 25) * 1.5, y: 0 - (0 - 5) * 1.5 })
  })
})
