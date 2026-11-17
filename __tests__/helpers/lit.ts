import { processColor } from 'react-native'

import { GRADIENT } from '../../lib/design/tokens'

type Node = { props?: Record<string, unknown>; children?: readonly (Node | string)[] }

/** The tint's stops as a test sees them: as written where `expo-linear-gradient` is mocked, as processed colours where not. */
const LIT = new Set([JSON.stringify(GRADIENT.lit.colors), JSON.stringify(GRADIENT.lit.colors.map((c) => processColor(c)))])

/**
 * Whether a rendered DS control wears the positive look (buttons board C, owner 2026-11-17): the tinted gradient
 * (`GRADIENT.lit`) drawn inside it, the same on every screen whatever its hue. A hold's armed track and a selected
 * IconButton are lit the same way; the press pour (`litPressed`) is not the look at rest.
 */
export function isLitControl(node: Node | string): boolean {
  if (typeof node === 'string') return false
  if (LIT.has(JSON.stringify(node.props?.colors))) return true
  return (node.children ?? []).some(isLitControl)
}
