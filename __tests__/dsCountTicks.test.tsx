/*
 * <CountTicks> (guidelines/components/CountTicks.html, Flow 10): a crew is a
 * count, never people. N identical 12 × 4 ticks, the ones here now filled
 * white; past eight they shrink to fit, never wrap; read as one element.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { CountTicks, tickWidth } from '../components/ds/CountTicks'
import { COLOR, SPACE } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
const reduceMotion = Reanimated.useReducedMotion as jest.Mock

const tick = (i: number) => StyleSheet.flatten(screen.getByTestId(`t-${i}`, { includeHiddenElements: true }).props.style)
/** Reanimated's jest build keeps a CSS transition only in the inline style it was given. */
const transition = (i: number) => StyleSheet.flatten(screen.getByTestId(`t-${i}`, { includeHiddenElements: true }).props.jestInlineStyle).transition

beforeEach(() => reduceMotion.mockReturnValue(false))

describe('tickWidth', () => {
  it('is 12 up to eight ticks, then shrinks so the row keeps eight ticks’ width', () => {
    expect(tickWidth(2)).toBe(12)
    expect(tickWidth(8)).toBe(12)
    const twelve = tickWidth(12)
    expect(twelve).toBeLessThan(12)
    expect(12 * twelve + 11 * SPACE.xs).toBeCloseTo(8 * 12 + 7 * SPACE.xs)
  })
})

describe('<CountTicks>', () => {
  it('draws one tick per member, the here-now ones white', async () => {
    await render(<CountTicks size={4} here={2} testID="t" />)
    expect(tick(0)).toMatchObject({ width: 12, height: SPACE.xs, backgroundColor: COLOR.textPrimary })
    expect(tick(1).backgroundColor).toBe(COLOR.textPrimary)
    expect(tick(2).backgroundColor).not.toBe(COLOR.textPrimary)
    expect(screen.queryByTestId('t-4', { includeHiddenElements: true })).toBeNull()
  })

  it('is one element: “{here} of {size} here”', async () => {
    await render(<CountTicks size={6} here={3} testID="t" />)
    expect(screen.getByLabelText('3 of 6 here')).toBeTruthy()
  })

  it('never says more are here than the crew has', async () => {
    await render(<CountTicks size={4} here={9} testID="t" />)
    expect(screen.getByLabelText('4 of 4 here')).toBeTruthy()
  })

  it('a tick fills over base; under Reduce Motion it swaps', async () => {
    await render(<CountTicks size={4} here={1} testID="t" />)
    expect(String(transition(0))).toContain('220ms')
    reduceMotion.mockReturnValue(true)
    await render(<CountTicks size={4} here={1} testID="t" />)
    expect(transition(0)).toBeUndefined()
  })
})
