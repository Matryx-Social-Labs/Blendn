/*
 * <RollingNumber> (guidelines/components/RollingNumber.html; motion #24, #26,
 * which set its timing): a count that rolls on M.snap, only the digit that
 * changes (old up and out, new in from below), in Geist Mono 700, tabular, so
 * nothing shifts. Reduce Motion: the number changes instantly. Never a tween
 * through the values between; no haptic; read as the value.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { RollingNumber } from '../components/ds/RollingNumber'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPRING, TYPE } from '../lib/design/tokens'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const all = (t: string) => screen.queryAllByText(t, { includeHiddenElements: true })
const animated = (id: string) => Reanimated.getAnimatedStyle(screen.getByTestId(id, { includeHiddenElements: true }))

beforeEach(() => reduceMotion.mockReturnValue(false))
afterEach(() => jest.useRealTimers())

it('is Geist Mono 700, tabular, at the Room’s 40 by default; the recap tile and the inline count are smaller roles', async () => {
  await render(<RollingNumber value={14} />)
  expect(StyleSheet.flatten(all('1')[0].props.style)).toMatchObject({
    fontFamily: FONT_FAMILY.mono[700],
    fontSize: TYPE.numericDisplay.fontSize,
    letterSpacing: TYPE.numericDisplay.letterSpacing,
    fontVariant: ['tabular-nums'],
    color: COLOR.textPrimary,
  })
  await render(<RollingNumber value={2} role="title" />)
  expect(StyleSheet.flatten(all('2')[0].props.style).fontSize).toBe(TYPE.title.fontSize)
  await render(<RollingNumber value={14} role="bodyStrong" color={COLOR.textSecondary} />)
  expect(StyleSheet.flatten(all('4')[0].props.style)).toMatchObject({ fontSize: TYPE.bodyStrong.fontSize, color: COLOR.textSecondary })
})

it('is read as its value, never as a live region', async () => {
  await render(<RollingNumber value={14} testID="n" />)
  const n = screen.getByLabelText('14')
  expect(n.props.accessibilityLiveRegion).toBeUndefined()
})

it('14 → 15: only the changing digit rolls, on M.snap (#24); the 1 holds still', async () => {
  await render(<RollingNumber value={14} testID="n" />)
  jest.mocked(Reanimated.withSpring).mockClear()
  await screen.rerender(<RollingNumber value={15} testID="n" />)
  expect(Reanimated.withSpring).toHaveBeenCalledTimes(1)
  expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))
  expect(all('1')).toHaveLength(1)
  expect(all('4')).toHaveLength(1)
  expect(all('5')).toHaveLength(1)
})

it('the new digit lands in place; the old one has left upward', async () => {
  jest.useFakeTimers()
  await render(<RollingNumber value={14} testID="n" />)
  await screen.rerender(<RollingNumber value={15} testID="n" />)
  await act(async () => jest.advanceTimersByTime(1000))
  expect(animated('n-0-in').transform).toEqual([{ translateY: 0 }])
  expect(animated('n-0-out').opacity).toBe(0)
  expect((animated('n-0-out').transform as { translateY: number }[])[0].translateY).toBeLessThan(0)
})

it('99 → 100: the width grows, the new column rolls in', async () => {
  await render(<RollingNumber value={99} testID="n" />)
  jest.mocked(Reanimated.withSpring).mockClear()
  await screen.rerender(<RollingNumber value={100} testID="n" />)
  expect(screen.getByTestId('n-2-in', { includeHiddenElements: true })).toBeTruthy()
  expect(Reanimated.withSpring).toHaveBeenCalledTimes(3)
})

it('Reduce Motion (#24): the number changes instantly, nothing travels or fades', async () => {
  reduceMotion.mockReturnValue(true)
  jest.useFakeTimers()
  await render(<RollingNumber value={14} testID="n" />)
  jest.mocked(Reanimated.withSpring).mockClear()
  jest.mocked(Reanimated.withTiming).mockClear()
  await screen.rerender(<RollingNumber value={15} testID="n" />)
  expect(Reanimated.withSpring).not.toHaveBeenCalled()
  expect(Reanimated.withTiming).not.toHaveBeenCalled()
  await act(async () => jest.advanceTimersByTime(16))
  expect(animated('n-0-in')).toMatchObject({ opacity: 1 })
  expect(animated('n-0-in').transform).toBeUndefined()
  expect(animated('n-0-out').opacity).toBe(0)
})

it('the gallery draws a mid-roll frame', async () => {
  await render(<RollingNumber value={15} preview={{ from: 14, q: 0.5 }} testID="n" />)
  expect(animated('n-0-out').opacity).toBe(0.5)
  expect(all('4')).toHaveLength(1)
})

it('at large text the digits stop at their role’s cap, so the column never clips them', async () => {
  await render(<RollingNumber value={14} testID="n" />)
  for (const id of ['n-0-in', 'n-1-in']) {
    expect(screen.getByTestId(id, { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.numericDisplay)
  }
  await render(<RollingNumber value={15} preview={{ from: 14, q: 0.5 }} testID="n" />)
  expect(screen.getByTestId('n-0-out', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.numericDisplay)
})

describe('the button role and grouping (the filter sheet’s "Show 6,422 places")', () => {
  it('role="button" is the button’s own Satoshi 700 at 16/20, tabular, capped with the control (a mono count sat larger and higher beside the label)', async () => {
    await render(<RollingNumber value={42} role="button" />)
    expect(StyleSheet.flatten(all('4')[0].props.style)).toMatchObject({ fontFamily: FONT_FAMILY.brand[700], fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] })
    expect(all('4')[0].props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('grouping puts a static comma every three digits from the right, read as "6,422"', async () => {
    await render(<RollingNumber value={6422} role="button" grouping testID="n" />)
    expect(screen.getByTestId('n-comma-3', { includeHiddenElements: true })).toBeTruthy()
    expect(all(',')).toHaveLength(1)
    expect(screen.getByLabelText('6,422')).toBeTruthy()
  })

  it('the comma comes AFTER the thousands digit, never before the first ("Show 1,533 places", not "Show ,1533")', async () => {
    const order = async (value: number) => {
      await render(<RollingNumber value={value} grouping testID="n" />)
      return screen.getAllByText(/^[0-9,]$/, { includeHiddenElements: true }).map((n) => n.props.children).join('')
    }
    expect(await order(1533)).toBe('1,533')
    expect(await order(6422)).toBe('6,422')
    expect(await order(12345)).toBe('12,345')
    expect(await order(123456)).toBe('123,456')
    expect(await order(1234567)).toBe('1,234,567')
    expect(await order(999)).toBe('999')
  })

  it('grouping adds nothing under four digits, and two commas at seven', async () => {
    await render(<RollingNumber value={422} grouping />)
    expect(all(',')).toHaveLength(0)
    await render(<RollingNumber value={1234567} grouping />)
    expect(all(',')).toHaveLength(2)
  })

  it('the comma never rolls: a changed digit rolls beside it and the comma stays', async () => {
    await render(<RollingNumber value={6422} grouping testID="n" />)
    await screen.rerender(<RollingNumber value={6423} grouping testID="n" />)
    expect(screen.queryByTestId('n-comma-3-out', { includeHiddenElements: true })).toBeNull()
    expect(all(',')).toHaveLength(1)
  })
})
