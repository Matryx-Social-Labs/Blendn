/**
 * The pinned bar, from the TopBar page and every frame: the back circle starts at the safe-area top (`top: 62` on the
 * 62 pt-inset iPhone), the glass reaches 10 pt under it (116), a page starts 8 pt below that (124).
 */
import { BAR_BOTTOM, barCircleBottom, barHeight, barTop } from '../lib/barGeometry'
import { topBarHeight } from '../lib/useTopBarState'

it('the row starts at the inset, with no gap above it', () => {
  expect(barTop(62)).toBe(62)
  expect(barTop(0)).toBe(0)
})

it('is the frame’s 116 on a 62 pt inset, and its page starts at 124', () => {
  expect(topBarHeight(62, false)).toBe(116)
  expect(topBarHeight(62, false) + 8).toBe(124)
  expect(BAR_BOTTOM).toBe(10)
})

it('Android: the 48 dp circle, 120 on a 62 inset (the frame’s 120)', () => {
  expect(topBarHeight(62, true)).toBe(120)
  expect(barHeight(24, true)).toBe(24 + 48 + 10)
})

it('the circles end a circle below the inset (the Me column and the hero’s pips are measured from here)', () => {
  expect(barCircleBottom(62, false)).toBe(106)
  expect(barCircleBottom(62, false) + 18).toBe(124)
})
