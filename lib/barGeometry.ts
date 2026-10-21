import { SIZE, SPACE } from './design/tokens'

/**
 * Where a pushed screen's top chrome sits, from the frames (guidelines/components/inputs.js `topBar`, flows 1, 3, 4, 6, 7):
 * the back circle and the right-hand actions start at the safe-area top (`top: 62` on the 62 pt-inset iPhone the frames are
 * drawn on), so the row's top is the inset itself, never the inset and a gap. Under the circles the glass bar reaches 10 pt
 * further (116 = 62 + 44 + 10), and a page's first row starts 8 pt below that (124). One place, so no bar sits 8 pt low.
 */
export const BAR_BOTTOM = SPACE.sm + SPACE.xxs

/** The circle's diameter: 44 pt iOS, 48 dp Android. */
export const barCircle = (android: boolean): number => (android ? SIZE.circleButtonAndroid : SIZE.circleButton)

/** Where the circle row starts. */
export const barTop = (insetTop: number): number => insetTop

/** The bar's height at rest: the inset, the circle, and the 10 pt under it. */
export const barHeight = (insetTop: number, android: boolean): number => barTop(insetTop) + barCircle(android) + BAR_BOTTOM

/** Where the circles end (the Me page's column, the hero's pips, are measured from here). */
export const barCircleBottom = (insetTop: number, android: boolean): number => barTop(insetTop) + barCircle(android)
