/*
 * <Loader> and <Spinner> (guidelines/components/Loader.html, motion #24 and
 * #48): the morph under 5 s, the wait named at 5 s, Try again at 10 s, the
 * static mark under Reduce Motion, and the spinner that keeps turning.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { Loader, Spinner } from '../components/ds/Loader'
import { COLOR } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
    cancelAnimation: jest.fn(actual.cancelAnimation),
  }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withRepeat = Reanimated.withRepeat as jest.Mock
const hidden = { includeHiddenElements: true }

beforeEach(() => {
  jest.useFakeTimers()
  reduceMotion.mockReturnValue(false)
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
})
afterEach(() => jest.useRealTimers())

const advance = (ms: number) => act(async () => jest.advanceTimersByTime(ms))

describe('<Spinner>', () => {
  it('is hidden from screen readers: the control’s busy state is what they hear', async () => {
    await render(<Spinner testID="s" />)
    expect(screen.queryByTestId('s')).toBeNull()
    expect(screen.getByTestId('s', hidden)).toBeTruthy()
  })

  it('draws white on dark, ink on a white (strong) button', async () => {
    await render(<Spinner testID="s" size={16} dark />)
    expect(StyleSheet.flatten(screen.getByTestId('s', hidden).props.style)).toMatchObject({
      width: 16,
      borderTopColor: COLOR.ink,
    })
  })

  it('keeps turning under Reduce Motion: it is state, not decoration', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<Spinner />)
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, false, undefined, Reanimated.ReduceMotion.Never)
  })
})

describe('<Loader>', () => {
  it('is one busy progress element named “Loading”', async () => {
    await render(<Loader />)
    const bar = screen.getByRole('progressbar', { name: 'Loading' })
    expect(bar.props.accessibilityState).toMatchObject({ busy: true })
  })

  it('morphs, with no line, under 5 s', async () => {
    await render(<Loader />)
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, true)
    expect(screen.queryByText(/loading/i)).toBeNull()
  })

  it('stops on the static mark at 5 s and names the wait, announced once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(<Loader waitLabel="Still loading the room…" onRetry={jest.fn()} />)
    await advance(5000)
    expect(Reanimated.cancelAnimation).toHaveBeenCalled()
    expect(screen.getByText('Still loading the room…')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('Still loading the room…')
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('offers Try again at 10 s, only when there is something to retry', async () => {
    const onRetry = jest.fn()
    await render(<Loader onRetry={onRetry} />)
    await advance(10000)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    await render(<Loader />)
    await advance(10000)
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('Reduce Motion: no morph, the static mark with “Loading…” from t0', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<Loader />)
    expect(withRepeat).not.toHaveBeenCalled()
    expect(screen.getByText('Loading…')).toBeTruthy()
  })
})
