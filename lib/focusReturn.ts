import { useEffect, type RefObject } from 'react'
import { AccessibilityInfo } from 'react-native'

import { DURATION } from './design/tokens'

/**
 * Where a screen reader's focus goes back to when an overlay closes (WCAG 2.4.3, a11y audit L6): the control that
 * opened it. React Native cannot ask which element has focus, so every DS control (ScalePress) notes itself when it is
 * pressed (a tap, or a screen reader's double-tap), and an overlay that opens in the moment after takes that as its
 * opener.
 *
 * ponytail: one module-level "last pressed"; an overlay opened later than OPENER_WINDOW_MS after the press (one that
 * waits on the network), or by a plain Pressable, gets no opener and focus stays where the platform puts it.
 */
const OPENER_WINDOW_MS = 1000

type Node = Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0]
let last: { node: Node; at: number } | null = null

/** A control was pressed: `event.currentTarget`, the host view. */
export function notePressed(node: unknown): void {
  if (node) last = { node: node as Node, at: Date.now() }
}

/** The control pressed a moment ago, if any: what an overlay opening now was opened by. */
export function openerNow(): Node | null {
  return last && Date.now() - last.at <= OPENER_WINDOW_MS ? last.node : null
}

/** Focus back on the opener, once the overlay has gone. */
export function returnFocus(node: Node | null): void {
  if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus')
}

/** How long an arrival is given to settle before focus is sent: iOS drops a focus sent before the view is on screen. */
export const FOCUS_SETTLE_MS = DURATION.quick

/**
 * Focus to `ref` each time `key` changes to a value (null, undefined or false: not yet): a heading that arrived with a new
 * screen or a new step, so a screen reader is told where it now is (motion audit M5).
 */
export function useFocusWhen(ref: RefObject<unknown>, key: unknown): void {
  useEffect(() => {
    if (key == null || key === false) return
    const timer = setTimeout(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current as Node, 'focus')
    }, FOCUS_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [ref, key])
}
