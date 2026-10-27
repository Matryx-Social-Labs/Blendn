import { SIZE, SPACE } from './design/tokens'

/**
 * Where a pushed screen's top chrome sits, from the frames (guidelines/components/inputs.js `topBar`, flows 1, 3, 4, 6, 7):
 * the back circle and the right-hand actions are drawn at `top: 62` under a 59 pt status bar, so they start just under the
 * safe-area top, not a gap (8 pt) below it. Under the circles the glass bar reaches 10 pt further (116 = 62 + 44 + 10),
 * and a page's first row starts 8 pt below that (124). One place, so no bar sits 8 pt low.
 */

/**
 * How far under the safe-area top the circle row starts.
 *
 * design-exception: the frame kit's status bar is 59 pt and its circles are at 62, 3 pt below it; 2 pt (`SPACE.xxs`) is the
 * nearest value on the scale, and it keeps the row off the edge on a device whose inset is 0 (a notch-less Android).
 */
export const BAR_TOP_GAP = SPACE.xxs

/** The glass reaches this far under the circle (116 = 62 + 44 + 10 in the frames). */
export const BAR_BOTTOM = SPACE.sm + SPACE.xxs

/** The circle's diameter: 44 pt iOS, 48 dp Android. */
export const barCircle = (android: boolean): number => (android ? SIZE.circleButtonAndroid : SIZE.circleButton)

/** Where the circle row starts. */
export const barTop = (insetTop: number): number => insetTop + BAR_TOP_GAP

/** The bar's height at rest: the row's top, the circle, and the 10 pt under it. */
export const barHeight = (insetTop: number, android: boolean): number => barTop(insetTop) + barCircle(android) + BAR_BOTTOM

/** Where the circles end (the Me page's column, the hero's pips are measured from here). */
export const barCircleBottom = (insetTop: number, android: boolean): number => barTop(insetTop) + barCircle(android)
