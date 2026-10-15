/*
 * <Toggle> (guidelines/components/Toggle.html; ROUND3 F1): on is a white
 * track with an ink thumb, off is #959090 with a white thumb; iOS's 51 × 31,
 * Android's Material 52 × 32 with the outlined off track and the 16 → 24 → 28
 * thumb; H.toggle as it changes; M.snap travel that Reduce Motion drops.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

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

  it('on: the white track and the ink thumb (F1), at the far end', async () => {
    await draw({ value: true })
    expect(animated('t-on').opacity).toBe(1)
    expect(flat('t-on').backgroundColor).toBe(COLOR.selectionFill)
    expect(flat('t-thumb-ink').backgroundColor).toBe(COLOR.selectionInk)
    expect(animated('t-thumb').left).toBe(51 - 27 - 2)
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
