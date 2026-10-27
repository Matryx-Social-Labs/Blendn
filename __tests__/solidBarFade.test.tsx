/**
 * SolidBarFade (Going-out hand-off 2): the fade into a solid colour, down onto a bar (the default, as before) or sideways
 * to a rail's edge (the onboarding prompts rail, which used a CSS gradient meanwhile).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { SolidBarFade } from '../components/ui/GradientFill'
import { COLOR } from '../lib/design/tokens'
import { tint } from '../lib/theme'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View testID="g" {...props} /> }
})

const g = () => screen.getByTestId('g', { includeHiddenElements: true }).props

it('by default fades down onto the bar, clear to the colour, as before', async () => {
  await render(<SolidBarFade color={COLOR.ink} />)
  expect(g().colors).toEqual([tint(COLOR.ink, 0), COLOR.ink])
  expect(g().start).toBeUndefined()
  expect(g().end).toBeUndefined()
})

it.each([
  ['right', { x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
  ['left', { x: 1, y: 0.5 }, { x: 0, y: 0.5 }],
] as const)('toward="%s" fades sideways into the colour at that edge', async (toward, start, end) => {
  await render(<SolidBarFade color={COLOR.ink} toward={toward} />)
  expect(g()).toMatchObject({ colors: [tint(COLOR.ink, 0), COLOR.ink], start, end })
})
