/*
 * Two helpers every screen shares. The design system's tokens are `lib/design/tokens.ts` (generated from
 * design/tokens.json); the Liquid Ember palette, its type scale and its fonts that lived here were retired and deleted
 * (`__tests__/retiredDesign.test.ts` fails on any return).
 */

/**
 * A token colour at a given opacity, for tints behind a status (a success
 * toast, an offline banner). `tint(COLOR.destructive, 0.16)`.
 */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * Opacity for a control's two dimmed states, the same on every control.
 *
 * `pressed` is the feedback while a finger is down; `disabled` is "not yet"
 * (a form not finished), dimmed rather than greyed so it does not read as
 * broken. Before this the app used 0.4, 0.45, 0.5, 0.6, 0.7 and 0.86.
 */
export const OPACITY = {
  pressed: 0.85,
  disabled: 0.45,
} as const
