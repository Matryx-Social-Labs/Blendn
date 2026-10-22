/*
 * <Toggle> (guidelines/components/Toggle.html; foundations C part 2): on is a
 * track in the screen's hue edge under a white thumb, off is #959090 under the same white thumb; iOS's 51 × 31,
 * Android's Material 52 × 32 with the outlined off track and the 16 → 24 → 28
 * thumb; H.toggle as it changes; M.snap travel that Reduce Motion drops.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { HueProvider, SELECTION } from '../components/ds/shared'
import { Toggle } from '../components/ds/Toggle'
import { COLOR, MATERIAL, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const animated = (id: string) => Reanimated.getAnimatedStyle(screen.getByTestId(id, { includeHiddenElements: true }))
/** One frame: a jump has landed by then, a spring has not. */
const FRAME = 16
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let toggle: jest.SpyInstance
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  toggle = jest.spyOn(H, 'toggle').mockImplementation(() => {})
})

const draw = (props: Partial<React.ComponentProps<typeof Toggle>> = {}) =>
  render(<Toggle value={false} onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" {...props} />)

describe('<Toggle>', () => {
  it('iOS: 51 × 31; off is the #959090 track with a 27 pt white thumb', async () => {
    await draw()
    expect(flat('t-track')).toMatchObject({ width: 51, height: 31, backgroundColor: COLOR.switchOffTrack })
    expect(flat('t-thumb')).toMatchObject({ width: 27, height: 27, backgroundColor: COLOR.textPrimary })
  })

  it('on: the hue’s edge track under the white thumb, at the far end (violet in Settings)', async () => {
    await render(
      <HueProvider value="violet">
        <Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />
      </HueProvider>
    )
    expect(animated('t-on').opacity).toBe(1)
    expect(flat('t-on').backgroundColor).toBe(SELECTION.violet.edge)
    expect(flat('t-on').backgroundColor).toBe(COLOR.brandViolet)
    expect(flat('t-thumb').backgroundColor).toBe(COLOR.textPrimary)
    expect(screen.queryByTestId('t-thumb-ink', { includeHiddenElements: true })).toBeNull()
    expect(animated('t-thumb').left).toBe(51 - 27 - 2)
  })

  it.each(['ember', 'rose', 'violet'] as const)('on under %s: the track is that hue’s edge; off is unchanged', async (hue) => {
    await render(
      <HueProvider value={hue}>
        <Toggle value onValueChange={jest.fn()} accessibilityLabel="x" testID="t" />
      </HueProvider>
    )
    expect(flat('t-on').backgroundColor).toBe(SELECTION[hue].edge)
    expect(flat('t-track').backgroundColor).toBe(COLOR.switchOffTrack)
  })

  it('Android: Material’s 52 × 32, an outlined off track and a 16 thumb; 24 when on', async () => {
    on('android')
    await draw()
    expect(flat('t-track')).toMatchObject({ width: 52, height: 32, backgroundColor: 'transparent', borderWidth: 2, borderColor: COLOR.switchOffTrack })
    expect(flat('t-thumb')).toMatchObject({ width: 16, height: 16 })
    await draw({ value: true })
    expect(flat('t-thumb')).toMatchObject({ width: 24, height: 24 })
    expect(animated('t-thumb').left).toBe(52 - 24 - 4)
  })

  it('pressed: iOS widens the thumb, Android grows it to 28', async () => {
    await draw({ previewState: 'pressed' })
    expect(flat('t-thumb').width).toBe(32)
    on('android')
    await draw({ previewState: 'pressed' })
    expect(flat('t-thumb')).toMatchObject({ width: 28, height: 28 })
  })

  it('is a switch: a tap flips it and plays H.toggle with the new state', async () => {
    const onValueChange = jest.fn()
    await draw({ onValueChange })
    const sw = screen.getByRole('switch', { name: 'Event updates' })
    expect(sw.props.accessibilityState).toMatchObject({ checked: false })
    await fireEvent.press(sw)
    expect(onValueChange).toHaveBeenCalledWith(true)
    expect(toggle).toHaveBeenCalledWith(true)
  })

  it('the thumb travels on M.snap; Reduce Motion jumps it', async () => {
    await draw()
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))

    jest.mocked(Reanimated.withSpring).mockClear()
    reduceMotion.mockReturnValue(true)
    await draw()
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('lands at the far end, and back when the value flips back mid-travel', async () => {
    jest.useFakeTimers()
    await draw()
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(animated('t-thumb').left).toBe(51 - 27 - 2)
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    await screen.rerender(<Toggle value={false} onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(animated('t-thumb').left).toBe(2)
    expect(animated('t-on').opacity).toBe(0)
    jest.useRealTimers()
  })

  it('Reduce Motion: the thumb is at the far end on the next frame; with motion it is still travelling', async () => {
    jest.useFakeTimers()
    await draw()
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    await act(async () => jest.advanceTimersByTime(FRAME))
    expect(animated('t-thumb').left).toBeLessThan(51 - 27 - 2)

    reduceMotion.mockReturnValue(true)
    await draw()
    await screen.rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Event updates" testID="t" />)
    await act(async () => jest.advanceTimersByTime(FRAME))
    expect(animated('t-thumb').left).toBe(51 - 27 - 2)
    jest.useRealTimers()
  })

  it('drawn by its row (no onValueChange): not focusable, silent', async () => {
    await render(<Toggle value testID="t" />)
    expect(screen.getByTestId('t').props.focusable).toBe(false)
    await fireEvent.press(screen.getByTestId('t'))
    expect(toggle).not.toHaveBeenCalled()
  })

  it('disabled: 45%, does nothing', async () => {
    const onValueChange = jest.fn()
    await draw({ disabled: true, onValueChange })
    expect(flat('t').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByTestId('t'))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(toggle).not.toHaveBeenCalled()
  })

  it('reaches the 44 pt target', async () => {
    await draw()
    expect(screen.getByTestId('t').props.hitSlop).toMatchObject({ top: 7, bottom: 7 })
  })

  it('focused draws the ring', async () => {
    await draw({ previewState: 'focused' })
    expect(screen.getByTestId('t-focus')).toBeTruthy()
  })

  it('Increase Contrast outlines the iOS off track at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('t-track')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})
