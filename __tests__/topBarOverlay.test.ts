/** The pinned bar's height, from the TopBar page: the top inset, 8, the back circle (44 · 48), 8. */
import { topBarHeight } from '../lib/useTopBarState'

it('is the inset, 8, the circle and 8 on iOS (59 pt inset: the frame’s 119, content at 127)', () => {
  expect(topBarHeight(59, false)).toBe(59 + 8 + 44 + 8)
})

it('uses the 48 dp circle on Android', () => {
  expect(topBarHeight(24, true)).toBe(24 + 8 + 48 + 8)
})
