/*
 * <Stepper> and <ProgressBar> (guidelines/components/Stepper.html,
 * ProgressBar.html). The stepper: two 48 pt discs and a Geist Mono number,
 * one adjustable element, H.select per step and none at a bound. The bar: a
 * 4 pt track and a white fill that grows on M.settle after a 200 ms hold,
 * hidden from screen readers.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { HueProvider } from '../components/ds/shared'
import { ProgressBar } from '../components/ds/ProgressBar'
import { Stepper } from '../components/ds/Stepper'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withDelay: jest.fn(actual.withDelay),
  }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const HIDDEN = { includeHiddenElements: true }
/** One frame: a jump has landed by then, a spring or a held animation has not. */
const FRAME = 16
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const draw = (props: Partial<React.ComponentProps<typeof Stepper>> = {}) =>
  render(<Stepper label="Spaces" value={2} onChange={jest.fn()} testID="s" {...props} />)

describe('<Stepper>', () => {
  it('two 48 pt surfaceSunken discs around a Geist Mono number', async () => {
    await draw()
    expect(flat('s-minus')).toMatchObject({ width: SIZE.control, height: SIZE.control, backgroundColor: COLOR.surfaceSunken })
    const n = StyleSheet.flatten(screen.getByText('2', { includeHiddenElements: true }).props.style)
    expect(n).toMatchObject({ fontFamily: FONT_FAMILY.mono[700], fontVariant: ['tabular-nums'] })
  })

  it('on a glass sheet the discs are 8% white', async () => {
    await draw({ onGlass: true })
    expect(flat('s-plus').backgroundColor).toBe(MATERIAL.fillOnGlass)
  })

  it('steps by one with H.select', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    await fireEvent.press(screen.getByTestId('s-plus', HIDDEN))
    expect(onChange).toHaveBeenLastCalledWith(3)
    await fireEvent.press(screen.getByTestId('s-minus', HIDDEN))
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('a disc at its bound dims to 45% and does nothing; the number never goes red', async () => {
    const onChange = jest.fn()
    await draw({ value: 1, onChange })
    expect(flat('s-minus').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('s-minus', HIDDEN))
    expect(onChange).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(StyleSheet.flatten(screen.getByText('1', { includeHiddenElements: true }).props.style).color).toBe(COLOR.textPrimary)
    await draw({ value: 20, onChange })
    expect(flat('s-plus').opacity).toBe(OPACITY.disabled)
  })

  it('the discs are not separate elements on Android either', async () => {
    await draw()
    expect(screen.queryByTestId('s-plus')).toBeNull()
    expect(screen.getByTestId('s-plus', { includeHiddenElements: true })).toBeTruthy()
  })

  it('is one adjustable element: “Spaces, 2”, swiped up and down', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    const adj = screen.getByRole('adjustable', { name: 'Spaces' })
    // `text`, or iOS reads min/max/now as a percentage (“11%”).
    expect(adj.props.accessibilityValue).toMatchObject({ min: 1, max: 20, now: 2, text: '2' })
    await fireEvent(adj, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(onChange).toHaveBeenLastCalledWith(3)
    await fireEvent(adj, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('Android pressed: the ripple and the corner squared to 12 dp', async () => {
    on('android')
    await draw()
    await fireEvent(screen.getByTestId('s-plus', HIDDEN), 'pressIn')
    expect(flat('s-plus').borderRadius).toBe(RADIUS.pressedAndroid)
  })

  it('disabled (while posting): 45%, nothing steps', async () => {
    const onChange = jest.fn()
    await draw({ disabled: true, onChange })
    expect(flat('s').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('s-plus', HIDDEN))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('the number caps at 1.3×', async () => {
    await draw()
    expect(screen.getByText('2', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(1.3)
  })
})

describe('<ProgressBar>', () => {
  it('a 4 pt surfaceSunken track with a fill in the hue, hidden from screen readers', async () => {
    await render(<ProgressBar progress={0.25} testID="p" />)
    expect(flat('p')).toMatchObject({ height: 4, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surfaceSunken })
    expect(flat('p-fill').backgroundColor).toBe(COLOR.brandOrange)
    expect(screen.getByTestId('p', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('p-fill', { includeHiddenElements: true })).width).toBe('25%')
  })

  it('grows on M.settle after a 200 ms hold; Reduce Motion jumps', async () => {
    await render(<ProgressBar progress={0.25} testID="p" />)
    await screen.rerender(<ProgressBar progress={0.375} testID="p" />)
    expect(Reanimated.withDelay).toHaveBeenCalledWith(200, expect.anything(), expect.anything())
    expect(Reanimated.withSpring).toHaveBeenCalledWith(0.375, expect.objectContaining({ stiffness: SPRING.settle.stiffness }))

    jest.mocked(Reanimated.withSpring).mockClear()
    reduceMotion.mockReturnValue(true)
    await render(<ProgressBar progress={0.25} testID="p" />)
    await screen.rerender(<ProgressBar progress={0.5} testID="p" />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('lands where the last value says, even when it flips back during the hold', async () => {
    jest.useFakeTimers()
    await render(<ProgressBar progress={0.25} testID="p" />)
    await screen.rerender(<ProgressBar progress={0.5} testID="p" />)
    await screen.rerender(<ProgressBar progress={0.25} testID="p" />)
    await act(async () => jest.advanceTimersByTime(2000))
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('p-fill', { includeHiddenElements: true })).width).toBe('25%')
    jest.useRealTimers()
  })

  it('Reduce Motion: the new width on the next frame', async () => {
    jest.useFakeTimers()
    reduceMotion.mockReturnValue(true)
    await render(<ProgressBar progress={0.25} testID="p" />)
    await screen.rerender(<ProgressBar progress={0.5} testID="p" />)
    await act(async () => jest.advanceTimersByTime(FRAME))
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('p-fill', { includeHiddenElements: true })).width).toBe('50%')
    jest.useRealTimers()
  })

  it('clamps to 0–1', async () => {
    await render(<ProgressBar progress={1.4} testID="p" />)
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('p-fill', { includeHiddenElements: true })).width).toBe('100%')
  })
})

describe('Increase Contrast', () => {
  it('the stepper discs and the bar’s track take the 50% hairline', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('s-minus').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
    await render(<ProgressBar progress={0.5} testID="p" />)
    expect(flat('p').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})

describe('<ProgressBar> in a hue', () => {
  it.each([
    ['rose', COLOR.brandRose],
    ['violet', COLOR.brandViolet],
  ] as const)('the fill is %s’s edge colour', async (hue, color) => {
    await render(
      <HueProvider value={hue}>
        <ProgressBar progress={0.5} testID="p" />
      </HueProvider>
    )
    expect(flat('p-fill').backgroundColor).toBe(color)
  })
})
