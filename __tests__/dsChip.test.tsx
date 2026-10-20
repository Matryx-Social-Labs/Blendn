/*
 * <Chip> and <InterestChip> (guidelines/components/Chip.html): one 32 pt
 * capsule for every pick-from-a-set; white with ink when on; dimmed at a cap,
 * never hidden; × on a filter; H.select on every change and nothing else.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'

import { Chip, InterestChip } from '../components/ds/Chip'
import { COLOR, MATERIAL, RADIUS, SIZE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { OPACITY } from '../lib/theme'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const on = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true })

let select: jest.SpyInstance
beforeEach(() => {
  on('ios')
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

const draw = (props: Partial<React.ComponentProps<typeof Chip>> = {}) =>
  render(<Chip label="Live music" onPress={jest.fn()} testID="c" {...props} />)

describe('<Chip>', () => {
  it('off: a 32 pt surface capsule with a 0.5 pt hairline and white type', async () => {
    await draw()
    expect(flat('c')).toMatchObject({ height: SIZE.tag, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface })
    expect(flat('c-edge')).toMatchObject({ borderWidth: 0.5, borderColor: COLOR.hairline })
    expect(StyleSheet.flatten(screen.getByText('Live music').props.style).color).toBe(COLOR.textPrimary)
  })

  it('on: white with ink type, the one selection colour', async () => {
    await draw({ selected: true })
    expect(flat('c').backgroundColor).toBe(COLOR.selectionFill)
    expect(StyleSheet.flatten(screen.getByText('Live music').props.style).color).toBe(COLOR.selectionInk)
  })

  it('reads “Live music, selected, button”', async () => {
    await draw({ selected: true })
    const chip = screen.getByRole('button', { name: 'Live music' })
    expect(chip.props.accessibilityState).toMatchObject({ selected: true })
  })

  it('plays H.select on a change and calls back', async () => {
    const onPress = jest.fn()
    await draw({ onPress })
    await fireEvent.press(screen.getByTestId('c'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('dimmed at the cap: 45%, does nothing, plays nothing, and says why', async () => {
    const onPress = jest.fn()
    await draw({ dimmed: true, capHint: 'Up to 10', onPress })
    expect(flat('c').opacity).toBe(OPACITY.disabled)
    const chip = screen.getByTestId('c')
    expect(chip.props.accessibilityHint).toBe('Up to 10')
    await fireEvent.press(chip)
    expect(onPress).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('a filter carries × and removes itself, with H.select', async () => {
    const onRemove = jest.fn()
    await render(<Chip label="This weekend" selected onRemove={onRemove} testID="c" />)
    await fireEvent.press(screen.getByRole('button', { name: 'This weekend, remove filter' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('reaches the 44 pt target around a 32 pt chip', async () => {
    await draw()
    expect(screen.getByTestId('c').props.hitSlop).toMatchObject({ top: 6, bottom: 6 })
    on('android')
    await draw()
    expect(screen.getByTestId('c').props.hitSlop).toMatchObject({ top: 8, bottom: 8 })
  })

  it('Android pressed: the corner squares to 8 dp, and back on release', async () => {
    on('android')
    await draw()
    await fireEvent(screen.getByTestId('c'), 'pressIn')
    expect(flat('c').borderRadius).toBe(RADIUS.thumb)
    await fireEvent(screen.getByTestId('c'), 'pressOut')
    expect(flat('c').borderRadius).toBe(RADIUS.capsule)
  })

  it('caps the label at 1.3× inside 32 pt', async () => {
    await draw()
    expect(screen.getByText('Live music').props.maxFontSizeMultiplier).toBe(1.3)
  })

  it('focused draws the ring', async () => {
    await draw({ previewState: 'focused' })
    expect(screen.getByTestId('c-focus')).toBeTruthy()
  })
})

describe('<InterestChip>', () => {
  it('is read-only; a shared interest takes a 1 pt white outline and says so', async () => {
    await render(<InterestChip label="Vinyl" shared testID="c" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: COLOR.textPrimary })
    expect(screen.getByLabelText('Vinyl, shared')).toBeTruthy()
  })
})

describe('Increase Contrast', () => {
  it('the off hairline goes to 1 pt at 50%', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true)
    await draw()
    await act(async () => {})
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: MATERIAL.hairlineIncreaseContrast })
  })
})

describe('the fill crosses over quick (DS Flow 10, 10.2: "fill 0 → 1 on quick")', () => {
  /** Reanimated's jest build keeps a CSS transition only in the inline style it was given (as CountTicks' test reads it). */
  const transition = (id: string) => String(StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.jestInlineStyle).transition)

  it('the pressable carries a CSS transition on its fill: 160 ms on the gentle curve', async () => {
    await draw()
    expect(transition('c')).toBe('background-color 160ms cubic-bezier(0.33, 1, 0.68, 1)')
  })

  it('the hairline fades out as the fill comes in: always drawn, at 0 opacity once selected', async () => {
    await draw({ selected: true })
    expect(flat('c-edge')).toMatchObject({ opacity: 0 })
    expect(transition('c-edge')).toBe('opacity 160ms cubic-bezier(0.33, 1, 0.68, 1)')
    await screen.rerender(<Chip label="Live music" onPress={jest.fn()} testID="c" selected={false} />)
    // Back on: the edge it had (whichever the system’s contrast setting makes it).
    expect(flat('c-edge').opacity).toBe(1)
    expect(flat('c-edge').borderWidth).toBeGreaterThan(0)
  })

  it('a shared (outlined) interest keeps its edge whatever', async () => {
    await render(<Chip label="Jazz" shared testID="c" />)
    expect(flat('c-edge')).toMatchObject({ borderWidth: 1, borderColor: COLOR.textPrimary, opacity: 1 })
  })

  it('has no Reduce Motion branch: a colour change is not movement', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/ds/Chip.tsx'), 'utf8')
    expect(src).not.toMatch(/useReducedMotion|reduceMotion/)
  })
})
