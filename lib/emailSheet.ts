import { makeMutable, type SharedValue } from 'react-native-reanimated'

import { BAR_TOP_GAP } from './barGeometry'
import { SIZE, SPACE } from './design/tokens'

/*
 * Flow 1c, option C (owner's pick, 2026-11-04): "the landing goes on". Email sign-in, sign-up and forgot-password are one
 * glass sheet over the landing, which keeps turning; the sheet grows out of the landing's Dock. This is the sheet's
 * geometry (the board: mockups/redesign-2026-11/email-sign-in, element-boxes.json) and the few values the landing and the
 * sheet share. Worklets, because the sheet's height is worked out every frame the keyboard moves.
 */

export const SHEET = {
  /** Over the sheet's stack, under its rounded edge. */
  padTop: SPACE.xl,
  /** Between the stack and the dock. */
  gap: SPACE.lg,
  /** Under the dock: over the home indicator at rest, over the keyboard when it is up. */
  foot: SPACE.sm,
  /** Between the back button's row and the tallest sheet. */
  headroom: SPACE.sm,
  /** Under the title, to the switch (the stack's own gap is 16; the title's 8 more). */
  titleGap: SPACE.xl,
  /** The lockup fades over this much of the sheet's approach. */
  fade: SPACE.xl,
} as const

/** The tallest the sheet may be: under the back button's row and 8 pt. */
export function sheetCeiling(insetTop: number, android: boolean): number {
  'worklet'
  // barTop and barCircle, inline: they are not worklets, and a worklet may only call worklets.
  return insetTop + BAR_TOP_GAP + (android ? SIZE.circleButtonAndroid : SIZE.circleButton) + SHEET.headroom
}

/**
 * The sheet's height: its stack, its dock and the board's spacing, on the keyboard (`lift`, pt) or over the home
 * indicator, never taller than the room under the back button.
 */
export function sheetHeight({ content, dock, lift, windowHeight, insetTop, insetBottom, android = false }: {
  content: number
  dock: number
  lift: number
  windowHeight: number
  insetTop: number
  insetBottom: number
  android?: boolean
}): number {
  'worklet'
  // The home indicator's room goes as the keyboard rises over it, so the foot never jumps.
  const foot = Math.max(0, insetBottom - lift) + SHEET.foot
  const want = SHEET.padTop + content + SHEET.gap + dock + foot
  return Math.min(want, windowHeight - lift - sheetCeiling(insetTop, android))
}

/**
 * Where the sheet's scroll goes so the focused field (`top`, `bottom` in the stack) shows in `visible` pt. If it has to
 * move at all it moves at least `floor` (the switch and its gap), so the switch is never left cut in half, unless that
 * would take the field's own label out of view.
 */
export function revealOffset(field: { top: number; bottom: number }, visible: number, content: number, floor: number): number {
  const most = Math.max(0, content - visible)
  const y = Math.min(most, Math.max(0, field.bottom - visible))
  if (y > 0 && y < floor && field.top >= floor) return Math.min(most, floor)
  return y
}

const ramp = (p: number, from: number, to: number) => {
  'worklet'
  return Math.min(1, Math.max(0, (p - from) / (to - from)))
}

/**
 * The handover, at progress `p` of the sheet's growth: the landing's tagline (gone by 50%) and Dock (by 40%) leave, then
 * the form (from 35%) and its actions (from 45%) arrive. In sequence, never the two at once.
 */
export function handover(p: number): { tagline: number; dock: number; form: number; actions: number } {
  'worklet'
  return { tagline: 1 - ramp(p, 0, 0.5), dock: 1 - ramp(p, 0, 0.4), form: ramp(p, 0.35, 1), actions: ramp(p, 0.45, 1) }
}

/** How much of the lockup shows with the sheet's edge at `sheetTop`: all of it until the edge is 24 pt away. */
export function lockupShown(sheetTop: number, lockupBottom: number): number {
  'worklet'
  return Math.min(1, Math.max(0, (sheetTop - lockupBottom) / SHEET.fade))
}

/** Off every screen: where a sheet's edge is when there is none. */
export const NO_SHEET = 1e6

type Shared = { progress: SharedValue<number>; top: SharedValue<number>; height: SharedValue<number> }
let shared: Shared | null = null
/**
 * What the landing and the sheets share: the handover's progress, the sheet's edge (for the lockup) and its height (a
 * sheet over a sheet grows from it). Made on first use, on the JS thread, so a test's Reanimated is the one it gets.
 */
export const emailSheet = (): Shared =>
  (shared ??= { progress: makeMutable(0), top: makeMutable(NO_SHEET), height: makeMutable(0) })

/** The landing, while it is mounted: its Dock's height (the sheet grows from it). Null when there is no landing under. */
let landing: { dockHeight: number } | null = null
export const landingUnder = () => landing
export const setLandingUnder = (next: { dockHeight: number } | null) => {
  landing = next
}
