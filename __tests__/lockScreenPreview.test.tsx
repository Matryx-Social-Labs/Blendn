/*
 * The push ask's lock screen (SCRUM-1006, FLOW-WALK § 2.x): three of our own sample notifications, lit by the brand's two
 * lights, dropping in about 380 ms apart, once. Reduce Motion: the stack is already there. One screen-reader label for it.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'
import * as Reanimated from 'react-native-reanimated'

import { LockScreenPreview, SAMPLE_STAGGER_MS } from '../components/ds/LockScreenPreview'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withDelay: jest.fn(actual.withDelay), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const withDelay = Reanimated.withDelay as jest.Mock
const hidden = { includeHiddenElements: true }

const SAMPLES = [
  { title: 'A very long event title that would never fit on one line of a lock screen', body: 'New time: 7 PM. Same place.' },
  { title: 'It’s mutual', body: 'Someone at Rooftop Sundowner liked you back.' },
  { title: 'Your crew is heading out', body: '3 going tonight.' },
] as const

beforeEach(() => {
  jest.clearAllMocks()
  reduceMotion.mockReturnValue(false)
})

describe('LockScreenPreview', () => {
  it('is one element to a screen reader, saying what the samples are', async () => {
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    const frame = screen.getByTestId('lock')
    expect(frame.props.accessible).toBe(true)
    expect(frame.props.accessibilityLabel).toBe(
      'Sample notifications. A very long event title that would never fit on one line of a lock screen. New time: 7 PM. Same place. It’s mutual. Someone at Rooftop Sundowner liked you back. Your crew is heading out. 3 going tonight.'
    )
  })

  it('a long event title is cut to one line inside its sample, never wrapped into the question below', async () => {
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    const title = screen.getByText(SAMPLES[0].title, hidden)
    expect(title.props.numberOfLines).toBe(1)
    // A body keeps two lines, so "liked you back" survives a long title in it.
    expect(screen.getByText(SAMPLES[1].body, hidden).props.numberOfLines).toBe(2)
  })

  it('the samples spring in one by one, about 380 ms apart, once', async () => {
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    const delays = withDelay.mock.calls.map(([ms]) => ms as number)
    expect(delays).toHaveLength(SAMPLES.length)
    expect(SAMPLE_STAGGER_MS).toBe(380)
    expect(delays[1] - delays[0]).toBe(SAMPLE_STAGGER_MS)
    expect(delays[2] - delays[1]).toBe(SAMPLE_STAGGER_MS)
  })

  const rest = (i: number) => {
    const style = Reanimated.getAnimatedStyle(screen.getByTestId(`lock-sample-${i}`, hidden)) as unknown as { opacity: number; transform: Record<string, number>[] }
    return { opacity: style.opacity, translateY: style.transform[0].translateY, scale: style.transform[1].scale }
  }

  it('Reduce Motion: the stack is already there, nothing moves or fades', async () => {
    reduceMotion.mockReturnValue(true)
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    expect(withDelay).not.toHaveBeenCalled()
    SAMPLES.forEach((_s, i) => expect(rest(i)).toEqual({ opacity: 1, translateY: 0, scale: 1 }))
  })

  it('Reduce Motion turned on mid-drop: every sample goes straight to rest, none is left hidden', async () => {
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    expect(rest(2).opacity).toBe(0)
    reduceMotion.mockReturnValue(true)
    await screen.rerender(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    SAMPLES.forEach((_s, i) => expect(rest(i)).toEqual({ opacity: 1, translateY: 0, scale: 1 }))
  })

  it('a re-render does not replay the drop', async () => {
    await render(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    await screen.rerender(<LockScreenPreview samples={SAMPLES} testID="lock" />)
    expect(withDelay).toHaveBeenCalledTimes(SAMPLES.length)
  })
})
