/**
 * The crop behind "Drag and pinch. This is how your main photo is cropped." (Flow 6 · 6.3 #08).
 *
 * The photo is laid over a frame of fixed shape, covering it (`coverScale`), then zoomed (`zoom`, 1 to `MAX_ZOOM`) and moved
 * (`offset`: how far the photo's centre is from the frame's centre, in frame points). What is inside the frame is the crop.
 * Pure, so the arithmetic that decides which pixels are kept is tested without a screen.
 *
 * Every function here is read from gesture callbacks on the UI thread, so each is a worklet (a plain function called from one
 * aborts a Release build: `__tests__/workletCallees.test.ts`).
 */

/** A pinch zooms to four times the covering size and no more … */
export const MAX_ZOOM = 4
/** … and never so far that the crop keeps fewer than this many pixels across: a zoom into a small photo is a blur, not a crop. */
export const MIN_CROP_PX = 540

export type Size = { width: number; height: number }
export type Offset = { x: number; y: number }
export type CropRect = { originX: number; originY: number; width: number; height: number }

/** Points per source pixel at which the photo just covers the frame. */
export function coverScale(image: Size, frame: Size): number {
  'worklet'
  return Math.max(frame.width / image.width, frame.height / image.height)
}

/** How far from centre the photo may be moved at `zoom` before the frame shows past its edge. */
export function maxOffset(image: Size, frame: Size, zoom: number): Offset {
  'worklet'
  const scale = coverScale(image, frame) * zoom
  return { x: Math.max(0, (image.width * scale - frame.width) / 2), y: Math.max(0, (image.height * scale - frame.height) / 2) }
}

const clamp = (v: number, lo: number, hi: number) => {
  'worklet'
  return Math.min(hi, Math.max(lo, v))
}

/**
 * The most this photo may be zoomed in this frame: `MAX_ZOOM`, or less where the crop would keep under `MIN_CROP_PX` pixels
 * across. Never under 1: a photo already smaller than that is cropped at 1× and not zoomed at all.
 */
export function maxZoomFor(image: Size, frame: Size): number {
  'worklet'
  const acrossAtOne = frame.width / coverScale(image, frame)
  return clamp(acrossAtOne / MIN_CROP_PX, 1, MAX_ZOOM)
}

/** A zoom held inside 1 and `max` (`maxZoomFor`). */
export function clampZoom(zoom: number, max: number = MAX_ZOOM): number {
  'worklet'
  return clamp(zoom, 1, max)
}

/**
 * Where a pinch puts the photo: the point that was under the fingers when it began stays under them, wherever they move.
 * All of it relative to the frame's centre. `ratio` is the zoom now over the zoom when the pinch began; `startOffset` is the
 * photo's offset then, and `startFocal` the fingers' midpoint then. Unbounded: the bound is `clampOffset`'s, at release.
 */
export function pinchOffset(focal: Offset, startFocal: Offset, startOffset: Offset, ratio: number): Offset {
  'worklet'
  return { x: focal.x - (startFocal.x - startOffset.x) * ratio, y: focal.y - (startFocal.y - startOffset.y) * ratio }
}

/** An offset held where the frame stays covered. */
export function clampOffset(image: Size, frame: Size, zoom: number, offset: Offset): Offset {
  'worklet'
  const max = maxOffset(image, frame, zoom)
  return { x: clamp(offset.x, -max.x, max.x), y: clamp(offset.y, -max.y, max.y) }
}

/**
 * The pixels of the source that sit inside the frame, whole numbers inside the image (what the image manipulator crops).
 * A positive offset moves the photo right/down, so the frame looks at the source's left/top.
 */
export function cropRect(image: Size, frame: Size, zoom: number, offset: Offset): CropRect {
  'worklet'
  const z = clampZoom(zoom, maxZoomFor(image, frame))
  const o = clampOffset(image, frame, z, offset)
  const scale = coverScale(image, frame) * z
  const width = Math.min(image.width, Math.round(frame.width / scale))
  const height = Math.min(image.height, Math.round(frame.height / scale))
  const originX = clamp(Math.round(image.width / 2 - o.x / scale - frame.width / 2 / scale), 0, image.width - width)
  const originY = clamp(Math.round(image.height / 2 - o.y / scale - frame.height / 2 / scale), 0, image.height - height)
  return { originX, originY, width, height }
}
