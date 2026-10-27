/**
 * The onboarding frame at the accessibility sizes (FIX-ROUND-FINAL GO-01, audit A1/A32): the lock note under the dock is a
 * sentence, so it is set as one: Satoshi meta in sentence case, capped at meta's role cap and in textSecondary (≥ 4.5:1 on
 * ink). As ALL-CAPS 11 pt mono with no cap it grew to 3.571x and pushed the headline off the screen.
 */
import { act, render, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import type { ReactTestRendererJSON } from 'react-test-renderer'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }))

/* eslint-disable import/first */
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { COLOR, MAX_FONT_SCALE, TYPE } from '../lib/design/tokens'
/* eslint-enable import/first */

/** iOS AX XXXL (RCTAccessibilityManager.mm). */
const AX_XXXL = 3.571
const window = Dimensions.get('window')
const atScale = (fontScale: number) => act(async () => Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } }))
afterEach(() => atScale(2))

type Node = ReactTestRendererJSON
function uncapped(tree: Node | Node[] | null): string[] {
  const found: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'Text') {
      if (!n.props.maxFontSizeMultiplier) found.push(JSON.stringify(n.children))
      return
    }
    ;(n.children ?? []).forEach((c) => typeof c === 'object' && walk(c))
  }
  ;(Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk)
  return found
}

const NOTE = 'Your precise location is never shared with strangers.'

it('sets the lock note as a capped sentence in meta, secondary grey, at AX XXXL', async () => {
  await atScale(AX_XXXL)
  await render(
    <OnboardingScreen step="location" title="Where you are" ctaLabel="Allow location" onContinue={jest.fn()} secondaryLabel="Maybe later" onSecondary={jest.fn()} footerNote={NOTE} />
  )
  const note = screen.getByText(NOTE)
  expect(screen.queryByText(NOTE.toUpperCase())).toBeNull()
  expect(note.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  const style = StyleSheet.flatten(note.props.style)
  expect(style.fontFamily).toBe(TYPE.meta.fontFamily)
  expect(style.fontSize).toBe(TYPE.meta.fontSize)
  expect(style.color).toBe(COLOR.textSecondary)
  expect(uncapped(screen.toJSON())).toEqual([])
  expect(screen.getByTestId('onboarding-title')).toBeTruthy()
})
