/**
 * The pinned bar, from the TopBar page and every frame (a 59 pt status bar, circles at `top: 62`, glass to 116, a page at
 * 124): the circle row starts 2 pt under the safe-area top (a design exception: the nearest scale value to the frame's 3),
 * the glass reaches 10 pt under the circle, a page starts 8 pt below that.
 */
import { BAR_BOTTOM, BAR_TOP_GAP, barCircleBottom, barHeight, barTop } from '../lib/barGeometry'
import { topBarHeight } from '../lib/useTopBarState'

it('the row starts 2 pt under the inset: off the edge, never the old 8', () => {
  expect(BAR_TOP_GAP).toBe(2)
  expect(barTop(59)).toBe(61)
  // A device with no inset at all (a notch-less Android) still gets a small gap.
  expect(barTop(0)).toBe(2)
})

it('is the frame’s 115 under a 59 pt status bar (116 in the kit), and its page starts at 123 (124)', () => {
  expect(topBarHeight(59, false)).toBe(115)
  expect(topBarHeight(59, false) + 8).toBe(123)
  expect(BAR_BOTTOM).toBe(10)
})

it('Android: the 48 dp circle', () => {
  expect(topBarHeight(24, true)).toBe(24 + 2 + 48 + 10)
  expect(barHeight(59, true)).toBe(59 + 2 + 48 + 10)
})

it('the circles end a circle below the row’s top (the Me column and the hero’s pips are measured from here)', () => {
  expect(barCircleBottom(59, false)).toBe(105)
  expect(barCircleBottom(59, false) + 18).toBe(123)
})
