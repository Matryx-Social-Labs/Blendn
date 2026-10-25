import { FOLD_GHOST, heroFoldHeight } from '../lib/profileFold'

/*
 * r7 M2: at first view "Interests" showed ~30% through the dock's fade with its chips under the tray. Numbers from the r8 shot
 * (402 × 874 pt, the hero W × 1.3 = 523): the note card at canvas y 9, Interests at 124, the dock's solid foot at 681.
 */
const W = 402
const DESIGN = 523
const FADE = 48

describe('the first view ends on a section top, never on a ghosted heading (r7 M2)', () => {
  it('moves the hero so a heading that would show through the fade starts under the solid foot', () => {
    // At 523 Interests' top is 647: inside the fade (633..681). At 557 it is at 681, under the foot.
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 681, fade: FADE, tops: [124] })).toBe(557)
  })

  it('a taller dock (Add friend over Connect) is measured, not guessed: the same section fits a different hero', () => {
    // 56 pt more dock: Interests at 647 is already under the foot at 625, so the hero stays as drawn.
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 625, fade: FADE, tops: [124] })).toBe(DESIGN)
    // A heading ghosting in the taller dock's fade (top 600, fade 577..625) moves under it.
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 625, fade: FADE, tops: [77] })).toBe(548)
  })

  it('keeps the drawn hero when no heading lands in the fade', () => {
    // Interests at 523 + 300 = 823, far under the foot; nothing in the fade.
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 681, fade: FADE, tops: [300] })).toBe(DESIGN)
  })

  it('never goes past the bounds the hero can take; out of reach, the drawn hero', () => {
    // 523 + 70 = 593 ghosts (the zone starts FOLD_GHOST above the fade), and hiding it needs 681 − 70 = 611 > W × 1.45 = 583.
    expect(523 + 70).toBeGreaterThan(681 - FADE - FOLD_GHOST)
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 681, fade: FADE, tops: [70] })).toBe(DESIGN)
  })

  it('a fit that hides one heading but ghosts the one above it is not a fit', () => {
    // 541 would hide the second (140 → 681) and put the first at 641, in the fade; 581 hides the first and the second with it.
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 681, fade: FADE, tops: [100, 140] })).toBe(581)
  })

  it('unmeasured (no dock, no sections), the drawn hero', () => {
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 0, fade: FADE, tops: [124] })).toBe(DESIGN)
    expect(heroFoldHeight({ width: W, design: DESIGN, dockTop: 681, fade: FADE, tops: [] })).toBe(DESIGN)
  })
})
