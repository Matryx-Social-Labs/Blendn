/**
 * The AX helpers the Together screens' tests share (FIX-ROUND-FINAL P-TOG). A copy of the P-DS harness's
 * (`__tests__/axTextSize.test.tsx`) at the real multiplier: fold into `__tests__/helpers/ax.ts` once P-DS lands it.
 */
import { act } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'

import { CONTROL_FONT_CAP } from '../../components/ds/shared'

/** iOS AX XXXL (`RCTAccessibilityManager.mm`): 3.571, not 3.1. */
export const AX_XXXL = 3.571

const window = Dimensions.get('window')
/** The text size (and, given, the width) every component reads from `Dimensions`. */
export const atScale = (fontScale: number, width = window.width) =>
  act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
export const resetScale = () => Dimensions.set({ window, screen: window })

type Node = ReactTestRendererJSON
const kids = (n: Node): Node[] => (n.children ?? []).filter((c): c is Node => typeof c === 'object')
const roots = (tree: Node | Node[] | null): Node[] => (Array.isArray(tree) ? tree : tree ? [tree] : [])

/** Every Text with no cap at all: at AX XXXL it draws at 3.571x, past every role's MAX_FONT_SCALE. */
export function uncapped(tree: Node | Node[] | null): string[] {
  const found: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'Text') {
      if (!n.props.maxFontSizeMultiplier) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach(walk)
  }
  roots(tree).forEach(walk)
  return found
}

/** Every Text that grows past the control cap inside a box of fixed `height`: at AX its glyphs outgrow the box. */
export function clipped(tree: Node | Node[] | null): string[] {
  const found: string[] = []
  const walk = (n: Node, fixed: boolean) => {
    const style = StyleSheet.flatten(n.props.style as never) as { height?: unknown } | undefined
    const boxed = fixed || typeof style?.height === 'number'
    if (n.type === 'Text') {
      const cap = n.props.maxFontSizeMultiplier as number | undefined
      if (boxed && (cap === undefined || cap === 0 || cap > CONTROL_FONT_CAP)) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach((c) => walk(c, boxed))
  }
  roots(tree).forEach((n) => walk(n, false))
  return found
}

/** The rendered node with this testID, to scope a check to what a screen owns (not the DS components inside it). */
export function subtree(tree: Node | Node[] | null, testID: string): Node | null {
  for (const n of roots(tree)) {
    if (n.props.testID === testID) return n
    const found = subtree(kids(n), testID)
    if (found) return found
  }
  return null
}

/** Every rendered Text node, nested ones included. */
export function textNodes(tree: Node | Node[] | null): Node[] {
  return roots(tree).flatMap((n) => (n.type === 'Text' ? [n, ...textNodes(kids(n))] : textNodes(kids(n))))
}
