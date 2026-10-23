/*
 * <SegmentedControl> (guidelines/components/SegmentedControl.html; ROUND3 B10):
 * a 48 pt solid surface capsule, never on glass, with a hue thumb that slides
 * on M.snap; H.select when it changes, none on the current segment; 45%
 * disabled.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import { State } from 'react-native-gesture-handler'
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils'
import * as Reanimated from 'react-native-reanimated'

import { GroundProvider, HueProvider } from '../components/ds/shared'
import { landOn, rubberBand, SegmentedControl } from '../components/ds/SegmentedControl'
import { COLOR, FONT_FAMILY, MATERIAL, RADIUS, SIZE, SPRING } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false), withSpring: jest.fn(actual.withSpring), withTiming: jest.fn(actual.withTiming) }
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
type Props = React.ComponentProps<typeof SegmentedControl>
const draw = (props: Record<string, unknown> = {}) =>
  render(<SegmentedControl {...({ items: ITEMS, selected: 0, onChange: jest.fn(), testID: 's', ...props } as Props)} />)

describe('<SegmentedControl>', () => {
  it('is a 48 pt surface capsule with an ember thumb and a 1 pt rim, never glass', async () => {
    await draw()
    expect(flat('s')).toMatchObject({ height: SIZE.control, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface })
    expect(flat('s-thumb').backgroundColor).toBe(COLOR.selectionEmberFill)
    expect(flat('s-rim')).toMatchObject({ borderWidth: 1, borderColor: COLOR.brandOrange })
  })

  it('under a rose hue the thumb and its rim are rose', async () => {
    await render(
      <HueProvider value="rose">
        <SegmentedControl items={['Sign in', 'Create account']} selected={0} onChange={jest.fn()} testID="s" />
      </HueProvider>
    )
    expect(flat('s-thumb').backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(flat('s-rim').borderColor).toBe(COLOR.brandRose)
  })

  it('the labels are white at 500 on the track; white at 700 is inside the thumb', async () => {
    await draw()
    expect(text('Sign in')).toMatchObject({ color: COLOR.textPrimary, fontFamily: FONT_FAMILY.brand[500] })
    expect(text('Create account')).toMatchObject({ color: COLOR.textPrimary, fontFamily: FONT_FAMILY.brand[500] })
    const ink = within(screen.getByTestId('s-ink', { includeHiddenElements: true })).getAllByText(/./, { includeHiddenElements: true })
    expect(ink).toHaveLength(2)
    for (const label of ink) expect(StyleSheet.flatten(label.props.style)).toMatchObject({ color: COLOR.textPrimary, fontFamily: FONT_FAMILY.brand[700] })
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

  it('on Android the track grows with a two-line label instead of slicing it (RC drive 2 D-6: "Create account" at 360 dp, 1.3)', async () => {
    on('android')
    await draw()
    expect(flat('s')).toMatchObject({ minHeight: SIZE.control })
    expect(flat('s').height).toBeUndefined()
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

describe('the ink layer', () => {
  it('draws above the white labels, so the opaque thumb hides the label under it (no garbled double text)', async () => {
    await draw()
    const control = screen.getByTestId('s')
    const kids = React.Children.toArray(control.props.children) as React.ReactElement[]
    // The segments come first and the thumb's layer last: later siblings paint on top.
    const segmentAt = kids.findIndex((k) => (k.props as { testID?: string }).testID === 's-1')
    const thumbLayerAt = kids.findIndex((k) => (k.props as { pointerEvents?: string }).pointerEvents === 'none')
    expect(segmentAt).toBeGreaterThanOrEqual(0)
    expect(thumbLayerAt).toBeGreaterThan(segmentAt)
    // And it never takes a touch from the segments it covers.
    const onChange = jest.fn()
    await draw({ onChange })
    await act(async () => fireEvent.press(screen.getAllByRole('tab')[1]))
    expect(onChange).toHaveBeenCalledWith(1)
  })
  it('is a row inside the thumb, as wide as the control, that slides the other way', async () => {
    await draw({ selected: 1 })
    const ink = screen.getByTestId('s-ink', { includeHiddenElements: true })
    expect(StyleSheet.flatten(ink.props.style).width).toBe('200%')
    expect(Reanimated.getAnimatedStyle(ink).left).toBe('-100%')
    expect(flat('s-thumb').overflow).toBe('hidden')
    // It is read by nobody: the real labels are the track's.
    expect(ink.props.accessibilityElementsHidden).toBe(true)
  })
})

describe('a pair (this-or-that)', () => {
  const PAIR = ['Beach', 'Mountains']

  it('with nothing chosen draws no thumb, and the hairline between the two', async () => {
    await draw({ pair: true, items: PAIR, selected: null })
    expect(screen.queryByTestId('s-thumb')).toBeNull()
    expect(flat('s-divider')).toMatchObject({ width: 1, height: 20, backgroundColor: COLOR.hairlineStrong })
  })

  it('a first pick chooses it with H.select; the chosen side, pressed again, clears with H.select', async () => {
    const onChange = jest.fn()
    await draw({ pair: true, items: PAIR, selected: null, onChange })
    await fireEvent.press(screen.getByRole('radio', { name: 'Beach' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(select).toHaveBeenCalledTimes(1)
    await draw({ pair: true, items: PAIR, selected: 0, onChange })
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Beach' })[0])
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('is a radio group named by both sides, and the chosen one says how to clear it', async () => {
    await draw({ pair: true, items: PAIR, selected: 1 })
    expect(screen.getByLabelText('Beach or Mountains').props.accessibilityRole).toBe('radiogroup')
    const chosen = screen.getByRole('radio', { name: 'Mountains' })
    expect(chosen.props.accessibilityState).toMatchObject({ checked: true })
    expect(chosen.props.accessibilityHint).toBe('Double-tap to clear')
    expect(screen.getByRole('radio', { name: 'Beach' }).props.accessibilityHint).toBeUndefined()
  })

  it('the thumb fades in on the first pick instead of sliding, and out when cleared (Reduce Motion: the same, opacity only)', async () => {
    await draw({ pair: true, items: PAIR, selected: null })
    await screen.rerender(<SegmentedControl pair items={PAIR} selected={1} onChange={jest.fn()} testID="s" />)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 160 }))
    jest.mocked(Reanimated.withTiming).mockClear()
    await screen.rerender(<SegmentedControl pair items={PAIR} selected={null} onChange={jest.fn()} testID="s" />)
    expect(Reanimated.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 160 }))
  })
})

describe('badges', () => {
  it('a count is Geist Mono 500 and is spoken with the label; a dot is the live colour', async () => {
    await draw({ items: ['People', 'Crews'], badges: [14, 'dot'] })
    expect(StyleSheet.flatten(screen.getByText('14').props.style)).toMatchObject({ fontFamily: FONT_FAMILY.mono[500], color: COLOR.textSecondary })
    expect(screen.getByRole('tab', { name: 'People, 14' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Crews, someone’s live' })).toBeTruthy()
  })

  it('the count inside the thumb is secondary white', async () => {
    await draw({ items: ['People', 'Crews'], badges: [14, null] })
    const ink = within(screen.getByTestId('s-ink', { includeHiddenElements: true })).getByText('14', { includeHiddenElements: true })
    expect(StyleSheet.flatten(ink.props.style).color).toBe(COLOR.textSecondary)
  })
})

describe('semantics and ground', () => {
  it('radio semantics: a radio group of radios', async () => {
    await draw({ semantics: 'radio' })
    expect(screen.getByTestId('s').props.accessibilityRole).toBe('radiogroup')
    expect(screen.getByRole('radio', { name: 'Sign in' }).props.accessibilityState).toMatchObject({ checked: true })
  })

  it('on a surface card the track is the sunken surface', async () => {
    await render(
      <GroundProvider value="surface">
        <SegmentedControl items={ITEMS} selected={0} onChange={jest.fn()} testID="s" />
      </GroundProvider>
    )
    expect(flat('s').backgroundColor).toBe(COLOR.surfaceSunken)
  })

  it('on glass the track is still solid', async () => {
    await render(
      <GroundProvider value="glass">
        <SegmentedControl items={ITEMS} selected={0} onChange={jest.fn()} testID="s" />
      </GroundProvider>
    )
    expect(flat('s').backgroundColor).toBe(COLOR.surface)
  })
})

describe('the drag', () => {
  it('rubber-bands past an end: a unit of travel shows as a third of one', () => {
    expect(rubberBand(1)).toBeCloseTo(0.355, 3)
    expect(rubberBand(-1)).toBeCloseTo(-0.355, 3)
    expect(rubberBand(0)).toBe(0)
  })

  it('lands on the nearest segment, a flick adding its run, and never outside the control', () => {
    expect(landOn(0.6, 0, 160, 2)).toBe(1)
    expect(landOn(0.4, 0, 160, 2)).toBe(0)
    expect(landOn(0.2, 900, 160, 2)).toBe(1)
    expect(landOn(1.4, 2000, 160, 2)).toBe(1)
    expect(landOn(0.6, -2000, 160, 2)).toBe(0)
    expect(landOn(1.2, 900, 160, 3)).toBe(2)
  })

  const drag = (to: number) =>
    act(async () =>
      fireGestureHandler(getByGestureTestId('s-pan'), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: 0 },
        { translationX: to / 2, velocityX: 0 },
        { state: State.END, translationX: to, velocityX: 0 },
      ])
    )

  it('a drag past the middle changes the segment once, with one H.select, on release', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    // The control's layout gives each segment 100 pt.
    await act(async () => fireEvent(screen.getByTestId('s'), 'layout', { nativeEvent: { layout: { width: 208, height: 48 } } }))
    await drag(120)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('Reduce Motion: the thumb tracks the finger and lands with no spring', async () => {
    reduceMotion.mockReturnValue(true)
    const onChange = jest.fn()
    await draw({ onChange })
    await act(async () => fireEvent(screen.getByTestId('s'), 'layout', { nativeEvent: { layout: { width: 208, height: 48 } } }))
    jest.mocked(Reanimated.withSpring).mockClear()
    await drag(120)
    expect(onChange).toHaveBeenCalledWith(1)
    expect(Reanimated.withSpring).not.toHaveBeenCalled()
  })

  it('a short drag springs back and changes nothing', async () => {
    const onChange = jest.fn()
    await draw({ onChange })
    await act(async () => fireEvent(screen.getByTestId('s'), 'layout', { nativeEvent: { layout: { width: 208, height: 48 } } }))
    await drag(30)
    expect(onChange).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('a screen that asks for taps only never drags (the home switch)', async () => {
    const onChange = jest.fn()
    await draw({ onChange, draggable: false })
    await act(async () => fireEvent(screen.getByTestId('s'), 'layout', { nativeEvent: { layout: { width: 208, height: 48 } } }))
    await drag(120)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('a pair at large text (review L6, L7)', () => {
  const PAIR = ['Beach', 'Mountains']

  it('grows instead of clipping a two-line label: a pair has minHeight 48, a plain control a height of 48', async () => {
    await draw({ pair: true, items: PAIR, selected: null })
    expect(flat('s')).toMatchObject({ minHeight: SIZE.control })
    expect(flat('s').height).toBeUndefined()
    await screen.unmount()
    await draw()
    expect(flat('s').height).toBe(SIZE.control)
  })

  it('the divider is an animated view that carries the opacity transition, so it fades out as a side is chosen', async () => {
    await draw({ pair: true, items: PAIR, selected: null })
    const divider = screen.getByTestId('s-divider')
    expect(String(StyleSheet.flatten(divider.props.jestInlineStyle).transition)).toContain('opacity 160ms')
    expect(flat('s-divider').opacity).toBe(1)
    await screen.rerender(<SegmentedControl pair items={PAIR} selected={0} onChange={jest.fn()} testID="s" />)
    expect(flat('s-divider').opacity).toBe(0)
  })
})
