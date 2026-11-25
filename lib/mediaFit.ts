/**
 * What the server now knows about a picture or a clip, and what the phone does with it (task 21, SCRUM-1066).
 *
 * - **Size** (`width`/`height`, px as displayed): rule B's fit is known before the bytes land, so nothing reflows.
 * - **Focal point** (`focal_x`/`focal_y`, 0–1): where a crop sits. The math is the dashboard's `focusPosition`
 *   (`blendn-admin/lib/media-fit.ts`), unchanged, because an organizer composes to that preview; with no point, the
 *   default focus it previews with (50% across, 40% down).
 * - **Copies** (`renditions`, smallest first: a silent ~540 px one for cellular, a ≤1080 px one with sound).
 * - **Length** (`duration_ms`, ≤ 15.5 s): the Featured lead's pip fills over it.
 *
 * Rows from before 2026-11-24 and pasted URLs carry none of it: everything here falls back to what the app did before.
 */

export type Size = { width: number; height: number }
/** 0–1 of the picture from its left (`x`) and top (`y`) edge. */
export type Focus = { x: number; y: number }
export type Rendition = { url: string; width: number; height: number; bytes: number }

/** Where a crop sits with no point picked: faces sit high (the dashboard's `DEFAULT_FOCUS`). */
export const DEFAULT_FOCUS: Focus = { x: 0.5, y: 0.4 }

/** A server clip is ≤ 15.5 s, nominally 15 (task 20, per advisor): never assume ≤ 15 000. */
const CLIP_MS = { min: 1000, max: 15_500 } as const
/** A card's copy may be a little under the screen's pixels (advisor 2026-11-25): 2× phones get the small copy. */
const COPY_SLACK = 0.75

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const unit = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1

/** A row's size, when both sides are known. */
export function mediaSize(m: { width?: number | null; height?: number | null }): Size | null {
  return positive(m.width) && positive(m.height) ? { width: m.width, height: m.height } : null
}

/** A row's focal point, in the list's spelling or the detail's; both or neither. */
export function mediaFocus(m: { focal_x?: number | null; focal_y?: number | null; focalX?: number | null; focalY?: number | null }): Focus | null {
  const x = m.focal_x ?? m.focalX
  const y = m.focal_y ?? m.focalY
  return unit(x) && unit(y) ? { x, y } : null
}

/**
 * The `object-position` percentages that keep the point as near the frame's centre as the picture allows, for a cover
 * crop: `p%` lines up p% of the picture with p% of the frame; an axis with nothing to crop is 50.
 */
export function focusPosition(media: Size, frame: Size, focus: Focus | null): Focus {
  const f = focus ?? DEFAULT_FOCUS
  const scale = Math.max(frame.width / media.width, frame.height / media.height)
  const axis = (drawn: number, room: number, at: number) => {
    const overflow = drawn - room
    if (overflow <= 0.5) return 50
    return Math.min(100, Math.max(0, ((at * drawn - room / 2) / overflow) * 100))
  }
  return { x: axis(media.width * scale, frame.width, f.x), y: axis(media.height * scale, frame.height, f.y) }
}

/** The same, as expo-image's `contentPosition`. */
export function focusStyle(media: Size, frame: Size, focus: Focus | null): { left: `${number}%`; top: `${number}%` } {
  const p = focusPosition(media, frame, focus)
  return { left: `${p.x}%`, top: `${p.y}%` }
}

/**
 * Where a player is drawn so it crops as a poster with `focusStyle` does: the whole clip at the cover scale, shifted by
 * the same share of its overflow. `VideoView` has no content position, so the view itself moves inside a clipped card.
 */
export function videoFrame(media: Size, frame: Size, focus: Focus | null): { width: number; height: number; left: number; top: number } {
  const scale = Math.max(frame.width / media.width, frame.height / media.height)
  const width = media.width * scale
  const height = media.height * scale
  const p = focusPosition(media, frame, focus)
  // `(0 - x) || 0`: no overflow is a plain 0, not −0.
  return { width, height, left: -((width - frame.width) * p.x) / 100 || 0, top: -((height - frame.height) * p.y) / 100 || 0 }
}

/**
 * Which copy of a clip a player opens (advisor 2026-11-25). No copies: the organizer's own URL. The viewer, which has
 * sound: the largest (the small one is silent). A muted card on cellular or Low Power: the smallest. Otherwise the
 * smallest whose short side covers the card's at 0.75 of the screen's density, else the largest. By `bytes`, never by
 * position.
 */
export function clipSource(
  clip: { url: string; renditions?: readonly Rendition[] | null },
  want: { sound: true } | { frame: Size; density: number; saver: boolean }
): string {
  const copies = [...(clip.renditions ?? [])].filter((r) => r?.url).sort((a, b) => a.bytes - b.bytes)
  if (!copies.length) return clip.url
  const largest = copies[copies.length - 1].url
  if ('sound' in want) return largest
  if (want.saver) return copies[0].url
  const need = Math.min(want.frame.width, want.frame.height) * want.density * COPY_SLACK
  return copies.find((r) => Math.min(r.width, r.height) >= need)?.url ?? largest
}

/**
 * How long a clip's pip fills (advisor 2026-11-25): the server's length when it has one, kept to 1–15.5 s; else what
 * the player learned at ready, when it is a real number (Android sometimes says 0); else nothing, and the pip holds.
 */
export function clipLength(serverMs: number | null | undefined, playerSec: number | null | undefined): number | null {
  if (positive(serverMs)) return Math.min(CLIP_MS.max, Math.max(CLIP_MS.min, serverMs))
  return positive(playerSec) ? playerSec * 1000 : null
}
