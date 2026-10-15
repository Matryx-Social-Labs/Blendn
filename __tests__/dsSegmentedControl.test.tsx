/*
 * <SegmentedControl> (guidelines/components/SegmentedControl.html; ROUND3 B10):
 * a 48 pt solid surface capsule, never on glass, with a white thumb that slides
 * on M.snap; H.select when it changes, none on the current segment; 45%
 * disabled.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'

import { SegmentedControl } from '../components/ds/SegmentedControl'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring) }
})

const reduceMotion = Reanimated.useReducedMotion as jest.Mock
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const text = (t: string) => StyleSheet.flatten(screen.getByText(t).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  reduceMotion.mockReturnValue(false)
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const ITEMS = ['Sign in', 'Create account']
const draw = (props: Partial<React.ComponentProps<typeof SegmentedControl>> = {}) =>
  render(<SegmentedControl items={ITEMS} selected={0} onChange={jest.fn()} testID="s" {...props} />)

describe('<SegmentedControl>', () => {
  it('is a 48 pt surface capsule with a white thumb, never glass', async () => {
    await draw()
    expect(flat('s')).toMatchObject({ height: SIZE.control, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface })
    expect(flat('s-thumb').backgroundColor).toBe(COLOR.selectionFill)
  })

  it('the selected label is ink at 700, the others white at 500', async () => {
    await draw()
    expect(text('Sign in')).toMatchObject({ color: COLOR.selectionInk, fontFamily: FONT_FAMILY.brand[700] })
    expect(text('Create account')).toMatchObject({ color: COLOR.textPrimary, fontFamily: FONT_FAMILY.brand[500] })
  })

  it('is a tab-like group: each segment a tab, the current one selected', async () => {
    await draw()
    // The list is not an element itself (that would hide the tabs inside it), only their container.
    expect(screen.getByTestId('s').props.accessibilityRole).toBe('tablist')
    expect(screen.getByRole('tab', { name: 'Sign in' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('a tap on another segment changes it and plays H.select; on the current one, nothing', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    await fireEvent.press(screen.getByRole('tab', { name: 'Sign in' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))
    expect(onChange).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('the thumb slides on M.snap; Reduce Motion jumps it', async () => {
    await draw()
    await screen.rerender(<SegmentedControl items={ITEMS} selected={1} onChange={jest.fn()} testID="s" />)
    expect(Reanimated.withSpring).toHaveBeenCalledWith(1, expect.objectContaining({ stiffness: SPRING.snap.stiffness }))

    jest.mocked(Reanimated.withSpring).mockClear()
    reduceMotion.mockReturnValue(true)
    await draw()
    await screen.rerender(<SegmentedControl items={ITEMS} selected={1} onChange={jest.fn()} testID="s" />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('the thumb is one segment wide and sits on the selected one, in percentages of the track', async () => {
    await draw({ selected: 1 })
    expect(flat('s-thumb').width).toBe('50%')
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('s-thumb')).left).toBe('50%')
    await render(<SegmentedControl items={['Tonight', 'This week', 'Later']} selected={2} onChange={jest.fn()} testID="s" />)
    expect(Reanimated.getAnimatedStyle(screen.getByTestId('s-thumb')).left).toBe(`${200 / 3}%`)
  })

  it('each 40 pt segment reaches the 48 pt target', async () => {
    await draw()
    expect(screen.getByTestId('s-0').props.hitSlop).toMatchObject({ top: 4, bottom: 4 })
  })

  it('pressed: the other segment dims before the thumb moves', async () => {
    await draw({ previewPressed: 1 })
    expect(flat('s-1').opacity).toBeLessThan(1)
  })

  it('disabled: 45% of the whole control, nothing changes', async () => {
    const onChange = jest.fn()
    await draw({ disabled: true, onChange })
    expect(flat('s').opacity).toBe(OPACITY.disabled)
    await fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('labels cap at 1.3×; past it Android wraps to two lines and iOS keeps one', async () => {
    await draw()
    expect(screen.getByText('Sign in').props.maxFontSizeMultiplier).toBe(1.3)
    expect(screen.getByText('Sign in').props.numberOfLines).toBe(1)
    on('android')
    await draw()
    expect(screen.getByText('Sign in').props.numberOfLines).toBe(2)
  })

  it('focused draws the ring', async () => {
    await draw({ previewState: 'focused' })
    expect(screen.getByTestId('s-focus')).toBeTruthy()
  })

  it('Increase Contrast adds the 50% hairline to the track', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('s').borderColor).toBe(MATERIAL.hairlineIncreaseContrast)
  })
})
