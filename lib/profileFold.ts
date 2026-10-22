import { SPACE } from './design/tokens'

/** How far above the dock's fade a section's top still counts as ghosted: its heading shows, its first row does not. */
export const FOLD_GHOST = SPACE.xxxl
/** The hero is drawn W × 1.3 (Flow 6); to land the fold on a section's top it may take from W × 1.15 to W × 1.45. */
const HERO_FIT_MIN = 1.15
const HERO_FIT_MAX = 1.45

/**
 * The hero height for someone's profile at first view (r7 M2): the page must not end on a section heading half seen through
 * the dock's fade with its content under the tray. `dockTop` is where the dock's solid foot begins at rest, from the dock's
 * MEASURED height (Add friend over Connect makes it taller), and `tops` are the canvas's sections after the first, each
 * measured from the canvas's top.
 *
 * A heading in the ghost zone (from `FOLD_GHOST` above the fade down to the foot) moves under the foot, so the section above it
 * ends in the fade, which is what a fold looks like. Of the heights that do that without ghosting another heading, the one
 * nearest the drawn hero wins. Nothing measured, nothing ghosted, or no height in bounds: the drawn hero.
 * ponytail: hides the ghosted section rather than shrinking the hero to show it whole (that needs each section's bottom too).
 */
export function heroFoldHeight({ width, design, dockTop, fade, tops }: { width: number; design: number; dockTop: number; fade: number; tops: number[] }): number {
  if (!(dockTop > 0) || tops.length === 0) return design
  const ghosts = (hero: number) => tops.some((top) => hero + top > dockTop - fade - FOLD_GHOST && hero + top < dockTop)
  if (!ghosts(design)) return design
  const lo = Math.round(width * HERO_FIT_MIN)
  const hi = Math.round(width * HERO_FIT_MAX)
  const fits = tops.map((top) => Math.round(dockTop - top)).filter((hero) => hero >= lo && hero <= hi && !ghosts(hero))
  return fits.reduce((best, hero) => (Math.abs(hero - design) < Math.abs(best - design) ? hero : best), fits[0] ?? design)
}
