/**
 * The accessibility text-size harness, shared by every suite that renders at the largest size.
 *
 * `AX_XXXL` is React Native's own multiplier for iOS AX XXXL (`RCTAccessibilityManager.mm`,
 * `UIContentSizeCategoryAccessibilityExtraExtraExtraLarge: @3.571`), not body's 53/17 (3.1): RN scales every text by the
 * category's multiplier, so the screen draws at 3.571 (FIX-ROUND-FINAL DS-01).
 */
import { StyleSheet } from 'react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'

import { CONTROL_FONT_CAP } from '../../components/ds/shared'

export const AX_XXXL = 3.571

type Node = ReactTestRendererJSON
type Tree = Node | Node[] | null
const kids = (n: Node): Node[] => (n.children ?? []).filter((c): c is Node => typeof c === 'object')
const roots = (tree: Tree): Node[] => (Array.isArray(tree) ? tree : tree ? [tree] : [])

/**
 * Every Text the scale reaches (no cap, or a cap above CONTROL_FONT_CAP) that sits inside a box of fixed `height`: at
 * AX XXXL its glyphs outgrow the box and are sliced. A `minHeight` grows; a `height` does not.
 */
export function clipped(tree: Tree): string[] {
  const found: string[] = []
  const walk = (n: Node, fixed: boolean) => {
    const style = StyleSheet.flatten(n.props.style as never) as { height?: unknown } | undefined
    const boxed = fixed || typeof style?.height === 'number'
    if (n.type === 'Text') {
      const cap = n.props.maxFontSizeMultiplier as number | undefined
      const grows = cap === undefined || cap === 0 || cap > CONTROL_FONT_CAP
      if (boxed && grows) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach((c) => walk(c, boxed))
  }
  roots(tree).forEach((n) => walk(n, false))
  return found
}

/** Every Text with no cap at all: at AX XXXL it draws at 3.571x, past every role's MAX_FONT_SCALE. */
export function uncapped(tree: Tree): string[] {
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

/** Reading text clamped to a single line at AX sizes: a word and an ellipsis ("Finish your pro…"). */
export function oneLiners(tree: Tree, ignoreCapped = true): string[] {
  const found: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'Text') {
      const cap = n.props.maxFontSizeMultiplier as number | undefined
      if (ignoreCapped && cap !== undefined && cap <= CONTROL_FONT_CAP) return
      if (n.props.numberOfLines === 1) found.push(JSON.stringify(n.children))
      return
    }
    kids(n).forEach(walk)
  }
  roots(tree).forEach(walk)
  return found
}
