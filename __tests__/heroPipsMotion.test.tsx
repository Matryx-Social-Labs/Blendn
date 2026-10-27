/**
 * Audit L2 (a11y-motion 2026-10-24): the profile pager's pips grow with a Reanimated CSS transition, which Reanimated
 * 4.5 does not reduce itself. Under Reduce Motion the current pip changes at once.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { HeroPips } from '../components/profile/ProfileHeroPager'

let mockReduce = false
jest.mock('../lib/motion', () => ({ ...jest.requireActual('../lib/motion'), useReducedMotion: () => mockReduce }))

const durations = () =>
  screen
    .getByTestId('hero-pips', { includeHiddenElements: true })
    // Reanimated's jest renderer keeps a CSS transition on `jestInlineStyle`, not on the host style.
    .children.map((pip) => StyleSheet.flatten((pip as unknown as { props: { jestInlineStyle: object } }).props.jestInlineStyle) as { transitionDuration?: number })
    .map((s) => s.transitionDuration)

it('grows over 160 ms; under Reduce Motion at once', async () => {
  await render(<HeroPips count={3} page={0} top={0} />)
  expect(durations()).toEqual([160, 160, 160])
  mockReduce = true
  await render(<HeroPips count={3} page={0} top={0} />)
  expect(durations()).toEqual([0, 0, 0])
})
