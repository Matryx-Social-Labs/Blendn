/*
 * <TypingIndicator> (guidelines/components/TypingIndicator.html, motion #14):
 * three dots in an inbound bubble with the typer's creature; past one person,
 * no face and "N people are typing"; read once, never a live region (§14);
 * the dots loop while it shows and hold at 40 · 70 · 100% under Reduce Motion.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { TypingIndicator } from '../components/ds/TypingIndicator'
import { H } from '../lib/haptics'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withRepeat: jest.fn(actual.withRepeat) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withRepeat = Reanimated.withRepeat as jest.Mock
const PANDA = { name: 'Cosmic Panda' }

beforeEach(() => reduceMotion.mockReturnValue(false))

describe('<TypingIndicator>', () => {
  it('one person: their creature, read once as “{name} is typing”, not a live region', async () => {
    await render(<TypingIndicator people={[PANDA]} testID="t" />)
    const row = screen.getByTestId('t')
    expect(row.props.accessibilityLabel).toBe('Cosmic Panda is typing')
    expect(row.props.accessibilityLiveRegion).toBeUndefined()
    expect(screen.getByTestId('t-avatar', { includeHiddenElements: true })).toBeTruthy()
  })

  it('more than one: no face, “3 people are typing” beside the bubble', async () => {
    await render(<TypingIndicator people={[PANDA, { name: 'Quiet Heron' }, { name: 'Slow Snail' }]} testID="t" />)
    expect(screen.getByText('3 people are typing', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('t-avatar', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('t').props.accessibilityLabel).toBe('3 people are typing')
  })

  it('nobody: nothing', async () => {
    await render(<TypingIndicator people={[]} testID="t" />)
    expect(screen.queryByTestId('t')).toBeNull()
  })

  it('the dots loop (one of the three allowed loops), and play nothing', async () => {
    const spies = Object.keys(H).map((k) => jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {}))
    await render(<TypingIndicator people={[PANDA]} />)
    expect(withRepeat).toHaveBeenCalled()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('Reduce Motion: no loop; the dots hold at 40 · 70 · 100%', async () => {
    withRepeat.mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<TypingIndicator people={[PANDA]} testID="t" />)
    expect(withRepeat).not.toHaveBeenCalled()
    const opacity = (i: number) => StyleSheet.flatten(screen.getByTestId(`t-dot-${i}`, { includeHiddenElements: true }).props.style).opacity
    expect([opacity(0), opacity(1), opacity(2)]).toEqual([0.4, 0.7, 1])
  })
})
