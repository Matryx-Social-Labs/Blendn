import { clampOffset, clampZoom, coverScale, CROP_ASPECT, cropRect, frameFor, MAX_ZOOM, maxOffset } from '../lib/photoCrop'

const FRAME = frameFor(400) // 400 × 520

describe('the frame', () => {
  it('is the full width and 1.3 tall', () => {
    expect(FRAME).toEqual({ width: 400, height: Math.round(400 * CROP_ASPECT) })
  })
})

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
