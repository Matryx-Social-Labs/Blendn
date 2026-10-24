/** The 1 to 5 scale (Flow 3 `scale`): five equal 48 pt pills, digits in mono, the ends named, the chosen one lit in the hue. */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

import { CONTROL_FONT_CAP, HueProvider } from '../components/ds/shared'
import { ScaleSteps } from '../components/ds/ScaleSteps'
import { COLOR, SIZE, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { AX_XXXL, clipped, uncapped } from './helpers/ax'

const draw = (props: Partial<React.ComponentProps<typeof ScaleSteps>> = {}) =>
  render(
    <HueProvider value="rose">
      <ScaleSteps value={null} onChoose={jest.fn()} low="Not great" high="Loved it" subject="The night" testID="s" {...props} />
    </HueProvider>,
  )

it('is five equal-width pills of 48 pt, with Geist Mono digits', async () => {
  await draw()
  for (const n of [1, 2, 3, 4, 5]) {
    const step = StyleSheet.flatten(screen.getByTestId(`s-${n}`).props.style)
    expect(step).toMatchObject({ flex: 1, height: SIZE.control })
    expect(String(StyleSheet.flatten(screen.getByText(String(n)).props.style).fontFamily)).toMatch(/Mono/i)
  }
})

it('names the ends for a screen reader on 1 and 5, and says nothing twice', async () => {
  await draw()
  expect(screen.getByLabelText('The night: 1 out of 5, Not great')).toBeTruthy()
  expect(screen.getByLabelText('The night: 3 out of 5')).toBeTruthy()
  expect(screen.getByLabelText('The night: 5 out of 5, Loved it')).toBeTruthy()
  expect(screen.getByText('Not great', { includeHiddenElements: true })).toBeTruthy()
})

it('lights the chosen pill in the hue and never in white', async () => {
  await draw({ value: 4 })
  const on = StyleSheet.flatten(screen.getByTestId('s-4').props.style)
  const off = StyleSheet.flatten(screen.getByTestId('s-2').props.style)
  expect(on.backgroundColor).toBe(COLOR.selectionRoseFill)
  expect(on.borderColor).toBe(COLOR.brandRose)
  expect(on.backgroundColor).not.toBe(COLOR.textPrimary)
  expect(off.backgroundColor).not.toBe(on.backgroundColor)
  expect(screen.getByTestId('s-4').props.accessibilityState).toMatchObject({ selected: true })
})

it('a press chooses, with the selection haptic; disabled does neither', async () => {
  const select = jest.spyOn(H, 'select').mockImplementation(() => {})
  const onChoose = jest.fn()
  await draw({ onChoose })
  await fireEvent.press(screen.getByTestId('s-5'))
  expect(onChoose).toHaveBeenCalledWith(5)
  expect(select).toHaveBeenCalledTimes(1)
  await draw({ onChoose, disabled: true })
  await fireEvent.press(screen.getByTestId('s-3'))
  expect(onChoose).toHaveBeenCalledTimes(1)
})

describe('at AX XXXL (B-S1: the two anchors ran into each other)', () => {
  const window = Dimensions.get('window')
  afterEach(() => Dimensions.set({ window, screen: window }))

  it('the anchors label a control: capped at its cap, each at most half the row with a gap, the high one right-aligned; they may wrap', async () => {
    await act(async () => Dimensions.set({ window: { ...window, fontScale: AX_XXXL }, screen: { ...window, fontScale: AX_XXXL } }))
    await draw({ low: 'Not for me at all', high: 'Best night in ages' })
    const low = screen.getByText('Not for me at all', { includeHiddenElements: true })
    const high = screen.getByText('Best night in ages', { includeHiddenElements: true })
    for (const end of [low, high]) {
      expect(end.props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
      expect(end.props.numberOfLines).toBeUndefined()
      expect(StyleSheet.flatten(end.props.style)).toMatchObject({ flexShrink: 1, maxWidth: '50%' })
    }
    expect(StyleSheet.flatten(high.props.style).textAlign).toBe('right')
    expect(StyleSheet.flatten(low.props.style).textAlign ?? 'left').toBe('left')
    expect(StyleSheet.flatten(low.parent?.props.style)).toMatchObject({ gap: SPACE.sm, justifyContent: 'space-between' })
    expect(uncapped(screen.toJSON())).toEqual([])
    expect(clipped(screen.toJSON())).toEqual([])
  })
})
